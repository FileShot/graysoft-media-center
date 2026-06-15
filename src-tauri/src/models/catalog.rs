use crate::inference::with_python;
use pyo3::prelude::*;
use pyo3::types::{PyCFunction, PyDict, PyTuple};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

pub fn list_catalog_json() -> Result<Value, String> {
    let raw = include_str!("../../schemas/model_catalog.json");
    serde_json::from_str(raw).map_err(|e| format!("Failed to parse model catalog: {e}"))
}

pub fn install_catalog_entry(
    entry_id: &str,
    models_dir: &str,
    quant_id: Option<&str>,
    app: Option<&AppHandle>,
) -> Result<CatalogInstallResult, String> {
    with_python(|py| {
        let module = PyModule::import(py, "catalog_downloader")?;
        let progress_cb = if let Some(app_handle) = app {
            let app = app_handle.clone();
            Some(PyCFunction::new_closure(
                py,
                None,
                None,
                move |args: &Bound<'_, PyTuple>, _kwargs: Option<&Bound<'_, PyDict>>| -> PyResult<()> {
                    let message: String = args.get_item(0)?.extract()?;
                    let fraction: f64 = args.get_item(1)?.extract()?;
                    let _ = app.emit(
                        "setup-progress",
                        serde_json::json!({ "message": message, "progress": fraction }),
                    );
                    Ok(())
                },
            )?)
        } else {
            None
        };

        let result = if let Some(cb) = progress_cb {
            module.call_method1(
                "install_catalog_model",
                (entry_id, models_dir, quant_id, cb),
            )?
        } else {
            module.call_method1(
                "install_catalog_model",
                (entry_id, models_dir, quant_id, py.None()),
            )?
        };
        parse_install_result(&result)
    })
}

pub fn search_hf_gguf_repos_impl(query: &str) -> Result<Value, String> {
    with_python(|py| -> PyResult<Value> {
        let module = PyModule::import(py, "hf_catalog")?;
        let result = module.call_method1("search_gguf_repos", (query,))?;
        let json = py.import("json")?;
        let dumped = json.call_method1("dumps", (result,))?;
        let raw: String = dumped.extract()?;
        serde_json::from_str(&raw)
            .map_err(|e| pyo3::exceptions::PyValueError::new_err(e.to_string()))
    })
    .map_err(|e| e.to_string())
}

pub fn list_hf_repo_gguf_impl(repo_id: &str) -> Result<Value, String> {
    with_python(|py| -> PyResult<Value> {
        let module = PyModule::import(py, "hf_catalog")?;
        let result = module.call_method1("list_repo_gguf_files", (repo_id,))?;
        let json = py.import("json")?;
        let dumped = json.call_method1("dumps", (result,))?;
        let raw: String = dumped.extract()?;
        serde_json::from_str(&raw)
            .map_err(|e| pyo3::exceptions::PyValueError::new_err(e.to_string()))
    })
    .map_err(|e| e.to_string())
}

pub fn install_hf_gguf_entry(
    repo_id: &str,
    filename: &str,
    schema_id: &str,
    name: &str,
    models_dir: &str,
    app: Option<&AppHandle>,
) -> Result<CatalogInstallResult, String> {
    with_python(|py| {
        let module = PyModule::import(py, "hf_catalog")?;
        let progress_cb = if let Some(app_handle) = app {
            let app = app_handle.clone();
            Some(PyCFunction::new_closure(
                py,
                None,
                None,
                move |args: &Bound<'_, PyTuple>, _kwargs: Option<&Bound<'_, PyDict>>| -> PyResult<()> {
                    let message: String = args.get_item(0)?.extract()?;
                    let fraction: f64 = args.get_item(1)?.extract()?;
                    let _ = app.emit(
                        "setup-progress",
                        serde_json::json!({ "message": message, "progress": fraction }),
                    );
                    Ok(())
                },
            )?)
        } else {
            None
        };

        let result = if let Some(cb) = progress_cb {
            module.call_method1(
                "install_hf_gguf",
                (repo_id, filename, schema_id, name, models_dir, cb),
            )?
        } else {
            module.call_method1(
                "install_hf_gguf",
                (repo_id, filename, schema_id, name, models_dir, py.None()),
            )?
        };
        parse_install_result(&result)
    })
}

#[derive(Debug, Clone)]
pub struct CatalogInstallResult {
    pub path: String,
    pub schema_id: String,
    pub name: String,
    pub media_type: String,
    pub catalog_id: String,
}

fn parse_install_result(result: &Bound<'_, PyAny>) -> PyResult<CatalogInstallResult> {
    let dict = result.downcast::<PyDict>()?;
    Ok(CatalogInstallResult {
        path: dict
            .get_item("path")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing path"))?
            .extract()?,
        schema_id: dict.get_item("schema_id")?.unwrap().extract()?,
        name: dict.get_item("name")?.unwrap().extract()?,
        media_type: dict.get_item("media_type")?.unwrap().extract()?,
        catalog_id: dict
            .get_item("catalog_id")?
            .unwrap()
            .extract()
            .unwrap_or_default(),
    })
}

pub fn catalog_model_id(entry_id: &str) -> String {
    format!("catalog-{entry_id}")
}
