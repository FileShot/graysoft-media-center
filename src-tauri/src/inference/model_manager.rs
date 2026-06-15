use crate::models::{hf_repo_for as registry_hf_repo, load_registry, min_vram_gb as registry_min_vram};
use crate::settings::{app_data_dir, python_env_dir, site_packages_dir};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub ready: bool,
    pub message: String,
    pub cuda_available: bool,
    pub device_name: String,
    pub vram_gb: f64,
    pub python_ready: bool,
    pub site_packages_ready: bool,
}

#[derive(Debug, Clone)]
pub struct ModelDefinition {
    pub id: String,
    pub hf_repo: String,
    pub media_type: String,
}

pub fn model_definitions() -> Vec<ModelDefinition> {
    load_registry()
        .map(|r| {
            r.models
                .into_iter()
                .map(|e| ModelDefinition {
                    id: e.id,
                    hf_repo: e.hf_repo,
                    media_type: e.media_type,
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn models_dir() -> PathBuf {
    app_data_dir().join("models")
}

pub fn resolve_models_root(custom: Option<&str>) -> PathBuf {
    custom
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(models_dir)
}

pub fn model_path(model_id: &str) -> PathBuf {
    model_path_at(model_id, None)
}

pub fn model_path_at(model_id: &str, models_root: Option<&str>) -> PathBuf {
    resolve_models_root(models_root).join(model_id)
}

pub fn hf_repo_for(model_id: &str) -> Option<String> {
    registry_hf_repo(model_id)
}

pub fn min_vram_gb(model_id: &str) -> f64 {
    registry_min_vram(model_id)
}

pub fn is_model_installed(model_id: &str) -> bool {
    is_model_installed_at(model_id, None)
}

pub fn is_model_installed_at(model_id: &str, models_root: Option<&str>) -> bool {
    let path = model_path_at(model_id, models_root);
    path.is_dir() && path.read_dir().map(|mut d| d.next().is_some()).unwrap_or(false)
}

pub fn missing_model_requirements(
    model_id: &str,
    engine: &EngineStatus,
    models_root: Option<&str>,
) -> Vec<String> {
    let mut missing = Vec::new();
    if !engine.cuda_available {
        missing.push("CUDA GPU not available".to_string());
    }
    if !engine.python_ready {
        missing.push("Python runtime not initialized".to_string());
    }
    if !engine.site_packages_ready {
        missing.push("Run setup to install torch and diffusers".to_string());
    }
    if !is_model_installed_at(model_id, models_root) {
        missing.push(format!("Model not installed: {model_id}"));
    }
    let min_vram = min_vram_gb(model_id);
    if engine.vram_gb > 0.0 && engine.vram_gb < min_vram {
        missing.push(format!(
            "Requires {:.0} GB VRAM (detected {:.1} GB)",
            min_vram, engine.vram_gb
        ));
    }
    missing
}

pub fn ensure_python_env() -> Result<(), String> {
    let env_dir = python_env_dir();
    fs::create_dir_all(&env_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(site_packages_dir()).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn path_has_weights(path: &str) -> bool {
    let p = Path::new(path);
    if p.is_file() {
        return has_weight_extension(p);
    }
    if !p.is_dir() {
        return false;
    }
    walk_has_weights(p)
}

fn has_weight_extension(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            matches!(
                ext.to_lowercase().as_str(),
                "gguf" | "safetensors" | "ckpt" | "pt" | "bin" | "pth"
            )
        })
        .unwrap_or(false)
}

fn walk_has_weights(dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && has_weight_extension(&path) {
            return true;
        }
        if path.is_dir() && walk_has_weights(&path) {
            return true;
        }
    }
    false
}
