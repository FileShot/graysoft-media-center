use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryItem {
    pub id: String,
    pub media_type: String,
    pub model_id: String,
    pub prompt: String,
    pub negative_prompt: String,
    pub params_json: Value,
    pub file_path: String,
    pub thumb_path: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub duration: Option<f64>,
    pub seed: Option<i64>,
    pub created_at: String,
    pub job_id: Option<String>,
    pub status: String,
    pub collection_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GalleryFilters {
    pub media_type: Option<String>,
    pub model_id: Option<String>,
    pub search: Option<String>,
    pub collection_id: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

pub struct GalleryStore;

impl GalleryStore {
    pub fn new() -> Self {
        Self
    }

    pub fn insert(&self, conn: &Connection, item: &GalleryItem) -> Result<(), String> {
        conn.execute(
            "INSERT INTO gallery_items (id, media_type, model_id, prompt, negative_prompt, params_json, file_path, thumb_path, width, height, duration, seed, created_at, job_id, status, collection_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                item.id,
                item.media_type,
                item.model_id,
                item.prompt,
                item.negative_prompt,
                item.params_json.to_string(),
                item.file_path,
                item.thumb_path,
                item.width,
                item.height,
                item.duration,
                item.seed,
                item.created_at,
                item.job_id,
                item.status,
                item.collection_id,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list(&self, conn: &Connection, filters: &GalleryFilters) -> Result<Vec<GalleryItem>, String> {
        let limit = filters.limit.unwrap_or(100);
        let offset = filters.offset.unwrap_or(0);
        let mut query = String::from(
            "SELECT id, media_type, model_id, prompt, negative_prompt, params_json, file_path, thumb_path, width, height, duration, seed, created_at, job_id, status, collection_id FROM gallery_items WHERE 1=1",
        );
        let mut bind: Vec<String> = Vec::new();

        if let Some(t) = &filters.media_type {
            if !t.is_empty() && t != "all" {
                query.push_str(" AND media_type = ?");
                bind.push(t.clone());
            }
        }
        if let Some(m) = &filters.model_id {
            if !m.is_empty() && m != "all" {
                query.push_str(" AND model_id = ?");
                bind.push(m.clone());
            }
        }
        if let Some(s) = &filters.search {
            if !s.is_empty() {
                query.push_str(" AND prompt LIKE ?");
                bind.push(format!("%{s}%"));
            }
        }
        if let Some(c) = &filters.collection_id {
            if !c.is_empty() && c != "all" {
                query.push_str(" AND collection_id = ?");
                bind.push(c.clone());
            }
        }
        query.push_str(" ORDER BY created_at DESC LIMIT ? OFFSET ?");

        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        let rows = match bind.len() {
            0 => stmt.query_map(params![limit, offset], row_to_item),
            1 => stmt.query_map(params![bind[0].clone(), limit, offset], row_to_item),
            2 => stmt.query_map(params![bind[0].clone(), bind[1].clone(), limit, offset], row_to_item),
            3 => stmt.query_map(
                params![bind[0].clone(), bind[1].clone(), bind[2].clone(), limit, offset],
                row_to_item,
            ),
            _ => stmt.query_map(
                params![
                    bind[0].clone(),
                    bind[1].clone(),
                    bind[2].clone(),
                    bind[3].clone(),
                    limit,
                    offset
                ],
                row_to_item,
            ),
        }
        .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get(&self, conn: &Connection, id: &str) -> Result<Option<GalleryItem>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, media_type, model_id, prompt, negative_prompt, params_json, file_path, thumb_path, width, height, duration, seed, created_at, job_id, status, collection_id FROM gallery_items WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map(params![id], row_to_item).map_err(|e| e.to_string())?;
        Ok(rows.next().transpose().map_err(|e| e.to_string())?)
    }

    pub fn update_thumb(&self, conn: &Connection, id: &str, thumb_path: &str) -> Result<(), String> {
        conn.execute(
            "UPDATE gallery_items SET thumb_path = ?1 WHERE id = ?2",
            params![thumb_path, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete(&self, conn: &Connection, id: &str) -> Result<Option<GalleryItem>, String> {
        let item = self.get(conn, id)?;
        conn.execute("DELETE FROM gallery_items WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(item)
    }

    pub fn set_collection(
        &self,
        conn: &Connection,
        item_id: &str,
        collection_id: Option<&str>,
    ) -> Result<(), String> {
        conn.execute(
            "UPDATE gallery_items SET collection_id = ?1 WHERE id = ?2",
            params![collection_id, item_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_collections(&self, conn: &Connection) -> Result<Vec<Collection>, String> {
        let mut stmt = conn
            .prepare("SELECT id, name, created_at FROM collections ORDER BY created_at DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(Collection {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn create_collection(&self, conn: &Connection, name: &str) -> Result<Collection, String> {
        let collection = Collection {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        conn.execute(
            "INSERT INTO collections (id, name, created_at) VALUES (?1, ?2, ?3)",
            params![collection.id, collection.name, collection.created_at],
        )
        .map_err(|e| e.to_string())?;
        Ok(collection)
    }
}

fn row_to_item(row: &rusqlite::Row) -> rusqlite::Result<GalleryItem> {
    let params_str: String = row.get(5)?;
    Ok(GalleryItem {
        id: row.get(0)?,
        media_type: row.get(1)?,
        model_id: row.get(2)?,
        prompt: row.get(3)?,
        negative_prompt: row.get(4)?,
        params_json: serde_json::from_str(&params_str).unwrap_or(Value::Object(Default::default())),
        file_path: row.get(6)?,
        thumb_path: row.get(7)?,
        width: row.get(8)?,
        height: row.get(9)?,
        duration: row.get(10)?,
        seed: row.get(11)?,
        created_at: row.get(12)?,
        job_id: row.get(13)?,
        status: row.get(14)?,
        collection_id: row.get(15).ok(),
    })
}
