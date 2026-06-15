use crate::inference::with_python;
use crate::models::LoadedModel;
use pyo3::prelude::*;
use pyo3::types::PyDict;
use std::path::{Path, PathBuf};

pub const DEFAULT_VIDEO_MODEL_ID: &str = "catalog-wan-22-5b-video";
pub const DEFAULT_VIDEO_CATALOG_ID: &str = "wan-22-5b-video";
pub const DEFAULT_VIDEO_DIR: &str = "wan-22-5b-video";
pub const DEFAULT_VIDEO_GGUF: &str = "Wan2.2-TI2V-5B-Q4_K_S.gguf";
pub const DEFAULT_VIDEO_SCHEMA: &str = "wan-2.2-5b";
pub const DEFAULT_VIDEO_NAME: &str = "WAN 2.2 Video";

pub fn default_gguf_path(models_dir: &str) -> PathBuf {
    PathBuf::from(models_dir)
        .join(DEFAULT_VIDEO_DIR)
        .join(DEFAULT_VIDEO_GGUF)
}

pub fn default_model_ready(models_dir: &str) -> bool {
    let path = default_gguf_path(models_dir);
    path.is_file() && path.metadata().map(|m| m.len() > 0).unwrap_or(false)
}

pub fn setup_default_video_model_download(models_dir: &str) -> Result<String, String> {
    with_python(|py| {
        let setup = PyModule::import(py, "setup_model")?;
        let result = setup.call_method1("setup_default_video_model", (models_dir,))?;
        let dict = result.downcast::<PyDict>()?;
        dict.get_item("path")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing path"))?
            .extract::<String>()
    })
}

pub fn build_default_loaded_model(models_dir: &str) -> Result<LoadedModel, String> {
    let path = default_gguf_path(models_dir);
    if !default_model_ready(models_dir) {
        return Err(format!(
            "Default video model not found at {}",
            path.display()
        ));
    }
    Ok(LoadedModel {
        id: DEFAULT_VIDEO_MODEL_ID.to_string(),
        name: DEFAULT_VIDEO_NAME.to_string(),
        path: path.to_string_lossy().to_string(),
        schema_id: DEFAULT_VIDEO_SCHEMA.to_string(),
        media_type: "video".to_string(),
        loaded_at: chrono::Utc::now().to_rfc3339(),
    })
}

pub fn default_video_dir(models_dir: &str) -> PathBuf {
    PathBuf::from(models_dir).join(DEFAULT_VIDEO_DIR)
}

pub fn ensure_dir_on_drive(path: &Path) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| e.to_string())
}
