use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub models_directory: String,
    pub output_directory: String,
    pub theme: String,
    pub setup_complete: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            models_directory: models_dir_default().to_string_lossy().to_string(),
            output_directory: default_output_dir().to_string_lossy().to_string(),
            theme: "dark".to_string(),
            setup_complete: false,
        }
    }
}

pub fn default_output_dir() -> PathBuf {
    if path_on_drive_exists("D:\\") {
        return PathBuf::from("D:\\GraysoftMediaCenter\\outputs");
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("GraysoftMediaCenter")
        .join("outputs")
}

pub fn models_dir_default() -> PathBuf {
    if path_on_drive_exists("D:\\") {
        return PathBuf::from("D:\\GraysoftMediaCenter\\models");
    }
    app_data_dir().join("models")
}

fn path_on_drive_exists(prefix: &str) -> bool {
    std::path::Path::new(prefix).exists()
}

pub fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("GraysoftMediaCenter")
}

pub fn database_path() -> PathBuf {
    app_data_dir().join("gallery.db")
}

pub fn thumbnails_dir() -> PathBuf {
    app_data_dir().join("thumbnails")
}

pub fn python_env_dir() -> PathBuf {
    app_data_dir().join("python-env")
}

pub fn site_packages_dir() -> PathBuf {
    python_env_dir().join("Lib").join("site-packages")
}
