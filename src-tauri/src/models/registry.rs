use crate::models::ModelSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRegistryEntry {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub media_type: String,
    pub description: String,
    pub hf_repo: String,
    pub schema: String,
    #[serde(default = "default_pipeline_module")]
    pub pipeline_module: String,
    #[serde(default = "default_min_vram")]
    pub min_vram_gb: f64,
    #[serde(default)]
    pub capabilities: Vec<String>,
}

fn default_pipeline_module() -> String {
    String::new()
}

fn default_min_vram() -> f64 {
    8.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelRegistry {
    pub models: Vec<ModelRegistryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub media_type: String,
    pub schema_id: String,
    pub path: String,
    pub available: bool,
    pub missing_requirements: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineType {
    pub id: String,
    pub name: String,
    pub media_type: String,
}

pub fn load_registry() -> Result<ModelRegistry, String> {
    let raw = include_str!("../../schemas/registry.json");
    serde_json::from_str(raw).map_err(|e| format!("Failed to parse model registry: {e}"))
}

pub fn hf_repo_for(schema_id: &str) -> Option<String> {
    load_registry()
        .ok()?
        .models
        .into_iter()
        .find(|m| m.id == schema_id)
        .map(|m| m.hf_repo)
}

pub fn min_vram_gb(schema_id: &str) -> f64 {
    load_registry()
        .ok()
        .and_then(|r| {
            r.models
                .iter()
                .find(|m| m.id == schema_id)
                .map(|m| m.min_vram_gb)
        })
        .unwrap_or(8.0)
}

pub fn load_schema(model_id: &str) -> Result<ModelSchema, String> {
    load_schema_by_id(model_id)
}

pub fn load_schema_by_id(schema_id: &str) -> Result<ModelSchema, String> {
    let registry = load_registry()?;
    let entry = registry
        .models
        .iter()
        .find(|m| m.id == schema_id)
        .ok_or_else(|| format!("Unknown pipeline type: {schema_id}"))?;

    let content = match entry.schema.as_str() {
        "flux-schnell.json" => include_str!("../../schemas/flux-schnell.json"),
        "flux-dev.json" => include_str!("../../schemas/flux-dev.json"),
        "z-image-turbo.json" => include_str!("../../schemas/z-image-turbo.json"),
        "sdxl-base.json" => include_str!("../../schemas/sdxl-base.json"),
        "wan-2.2-5b.json" => include_str!("../../schemas/wan-2.2-5b.json"),
        "wan-2.2.json" => include_str!("../../schemas/wan-2.2.json"),
        "wan-2.1.json" => include_str!("../../schemas/wan-2.1.json"),
        "ltx-video-2.json" => include_str!("../../schemas/ltx-video-2.json"),
        other => return Err(format!("Unknown schema file: {other}")),
    };

    serde_json::from_str(content).map_err(|e| format!("Failed to parse schema: {e}"))
}

pub fn list_pipeline_types() -> Result<Vec<PipelineType>, String> {
    let registry = load_registry()?;
    Ok(registry
        .models
        .into_iter()
        .map(|entry| PipelineType {
            id: entry.id,
            name: entry.name,
            media_type: entry.media_type,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_loads_all_models() {
        let registry = load_registry().expect("registry should parse");
        assert!(registry.models.len() >= 8);
        let ids: Vec<_> = registry.models.iter().map(|m| m.id.as_str()).collect();
        assert!(ids.contains(&"wan-2.2-5b"));
        assert!(ids.contains(&"flux-schnell"));
    }

    #[test]
    fn wan_schema_has_video_fields() {
        let schema = load_schema_by_id("wan-2.2-5b").expect("wan schema");
        assert_eq!(schema.media_type, "video");
        let field_ids: Vec<_> = schema
            .groups
            .iter()
            .flat_map(|g| g.fields.iter().map(|f| f.id.as_str()))
            .collect();
        assert!(field_ids.contains(&"frame_count"));
        assert!(field_ids.contains(&"steps"));
    }

    #[test]
    fn min_vram_wan_5b_is_four_gb() {
        assert!((min_vram_gb("wan-2.2-5b") - 4.0).abs() < 0.01);
    }

    #[test]
    fn hf_repo_lookup() {
        let repo = hf_repo_for("wan-2.2-5b").expect("hf repo");
        assert!(repo.contains("Wan"));
    }
}
