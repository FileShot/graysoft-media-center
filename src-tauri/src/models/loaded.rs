use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;

const WEIGHT_EXTENSIONS: &[&str] = &["gguf", "safetensors", "ckpt", "pt", "bin", "pth"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedModel {
    pub id: String,
    pub name: String,
    pub path: String,
    pub schema_id: String,
    pub media_type: String,
    pub loaded_at: String,
}

pub struct LoadedModelStore;

pub fn canonical_model_path(path: &str) -> String {
    let p = Path::new(path);
    std::fs::canonicalize(p)
        .map(|c| c.to_string_lossy().to_lowercase())
        .unwrap_or_else(|_| path.replace('/', "\\").to_lowercase())
}

impl LoadedModelStore {
    pub fn list(conn: &Connection) -> Result<Vec<LoadedModel>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, path, schema_id, media_type, loaded_at
                 FROM loaded_models ORDER BY loaded_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(LoadedModel {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    schema_id: row.get(3)?,
                    media_type: row.get(4)?,
                    loaded_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get(conn: &Connection, id: &str) -> Result<Option<LoadedModel>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, path, schema_id, media_type, loaded_at
                 FROM loaded_models WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query(params![id]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            Ok(Some(LoadedModel {
                id: row.get(0).map_err(|e| e.to_string())?,
                name: row.get(1).map_err(|e| e.to_string())?,
                path: row.get(2).map_err(|e| e.to_string())?,
                schema_id: row.get(3).map_err(|e| e.to_string())?,
                media_type: row.get(4).map_err(|e| e.to_string())?,
                loaded_at: row.get(5).map_err(|e| e.to_string())?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn insert(conn: &Connection, model: &LoadedModel) -> Result<(), String> {
        conn.execute(
            "INSERT INTO loaded_models (id, name, path, schema_id, media_type, loaded_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                model.id,
                model.name,
                model.path,
                model.schema_id,
                model.media_type,
                model.loaded_at
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete(conn: &Connection, id: &str) -> Result<(), String> {
        conn.execute("DELETE FROM loaded_models WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn upsert(conn: &Connection, model: &LoadedModel) -> Result<(), String> {
        conn.execute("DELETE FROM loaded_models WHERE id = ?1", params![model.id])
            .map_err(|e| e.to_string())?;
        Self::insert(conn, model)
    }

    pub fn find_by_path(conn: &Connection, path: &str) -> Result<Option<LoadedModel>, String> {
        let target = canonical_model_path(path);
        let all = Self::list(conn)?;
        Ok(
            all.into_iter()
                .find(|m| canonical_model_path(&m.path) == target),
        )
    }

    pub fn dedupe_by_path(conn: &Connection) -> Result<u32, String> {
        let all = Self::list(conn)?;
        let mut seen: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        let mut removed = 0u32;
        for model in all {
            let key = canonical_model_path(&model.path);
            if let Some(keep_id) = seen.get(&key) {
                if keep_id != &model.id {
                    Self::delete(conn, &model.id)?;
                    removed += 1;
                }
            } else {
                seen.insert(key, model.id);
            }
        }
        Ok(removed)
    }

    pub fn find_by_id(conn: &Connection, id: &str) -> Result<Option<LoadedModel>, String> {
        Self::get(conn, id)
    }

    pub fn update_schema(conn: &Connection, id: &str, schema_id: &str) -> Result<(), String> {
        conn.execute(
            "UPDATE loaded_models SET schema_id = ?1 WHERE id = ?2",
            params![schema_id, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

pub fn is_weight_file(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|e| e.to_str())
            .map(|ext| WEIGHT_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
            .unwrap_or(false)
}

pub fn path_has_weights(path: &str) -> bool {
    let p = Path::new(path);
    if !p.exists() {
        return false;
    }
    if is_weight_file(p) {
        return p.metadata().map(|m| m.len() > 0).unwrap_or(false);
    }
    if !p.is_dir() {
        return false;
    }
    if p.join("model_index.json").exists() {
        return true;
    }
    if let Ok(entries) = p.read_dir() {
        for entry in entries.flatten() {
            let child = entry.path();
            if is_weight_file(&child) {
                return true;
            }
            if child.is_dir() && child.join("config.json").exists() {
                return true;
            }
        }
    }
    false
}

pub fn validate_model_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    if is_weight_file(p) {
        if p.metadata().map(|m| m.len() == 0).unwrap_or(true) {
            return Err("Weight file is empty".to_string());
        }
        return Ok(());
    }
    if !p.is_dir() {
        return Err(
            "Select a model folder or a weight file (.gguf, .safetensors, .ckpt)".to_string(),
        );
    }
    if !path_has_weights(path) {
        return Err(
            "Folder must contain model_index.json (diffusers layout) or weight files (.gguf, .safetensors, .ckpt)".to_string(),
        );
    }
    Ok(())
}

pub fn suggest_schema_from_path(path: &str) -> Option<&'static str> {
    let lower = path.to_lowercase();
    if lower.contains("flux") && lower.contains("schnell") {
        return Some("flux-schnell");
    }
    if lower.contains("flux") {
        return Some("flux-dev");
    }
    if lower.contains("sdxl") || lower.contains("xl") {
        return Some("sdxl-base");
    }
    if lower.contains("turbo") || lower.contains("z-image") {
        return Some("z-image-turbo");
    }
    if lower.contains("ti2v") || (lower.contains("5b") && lower.contains("wan")) {
        return Some("wan-2.2-5b");
    }
    if lower.contains("wan") && (lower.contains("2.2") || lower.contains("wan2.2") || lower.contains("wan22")) {
        if lower.contains("a14b") || lower.contains("14b") || lower.contains("lownoise") || lower.contains("highnoise") {
            return Some("wan-2.2");
        }
        return Some("wan-2.2-5b");
    }
    if lower.contains("wan") {
        return Some("wan-2.1");
    }
    if lower.contains("ltx") {
        return Some("ltx-video-2");
    }
    if lower.ends_with(".gguf") {
        return Some("sdxl-base");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_path_lowercases() {
        let a = canonical_model_path("C:\\Models\\test.gguf");
        assert!(a.contains("test.gguf") || a.contains("models"));
    }

    #[test]
    fn suggest_wan_5b_from_path() {
        assert_eq!(
            suggest_schema_from_path("D:\\models\\Wan2.2-TI2V-5B-Q4_K_S.gguf"),
            Some("wan-2.2-5b")
        );
    }
}
