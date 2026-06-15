use crate::settings::{app_data_dir, python_env_dir, site_packages_dir};
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyModule};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

static RUNTIME: OnceLock<Mutex<PythonRuntime>> = OnceLock::new();

pub struct PythonRuntime {
    scripts_dir: PathBuf,
    initialized: bool,
}

pub fn init_runtime(resource_dir: Option<PathBuf>) -> Result<(), String> {
    ensure_windows_env();
    ensure_dirs()?;
    pyo3::prepare_freethreaded_python();

    let scripts_dir = resolve_python_scripts_dir(resource_dir.as_deref());
    if !scripts_dir.exists() {
        return Err(format!(
            "Python scripts directory not found: {}",
            scripts_dir.display()
        ));
    }

    Python::with_gil(|py| configure_python_paths(py, &scripts_dir)).map_err(|e| e.to_string())?;

    let runtime = PythonRuntime {
        scripts_dir,
        initialized: true,
    };

    RUNTIME
        .set(Mutex::new(runtime))
        .map_err(|_| "Python runtime already initialized".to_string())?;

    Ok(())
}

fn ensure_windows_env() {
    if std::env::var("APPDATA").is_err() {
        if let Some(data) = dirs::data_dir() {
            if let Some(appdata) = data.parent() {
                let _ = std::env::set_var("APPDATA", appdata);
            }
        }
    }
}

fn ensure_dirs() -> Result<(), String> {
    std::fs::create_dir_all(site_packages_dir()).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(python_env_dir()).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(app_data_dir()).map_err(|e| e.to_string())?;
    Ok(())
}

fn resolve_python_scripts_dir(resource_dir: Option<&std::path::Path>) -> PathBuf {
    if let Some(dir) = resource_dir {
        let bundled = dir.join("python");
        if bundled.exists() {
            return bundled;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("python")
}

fn configure_python_paths(py: Python<'_>, scripts_dir: &PathBuf) -> PyResult<()> {
    let sys = py.import("sys")?;
    let path: Bound<'_, PyAny> = sys.getattr("path")?;
    let scripts = scripts_dir.to_string_lossy().to_string();
    path.call_method1("insert", (0, scripts))?;

    let site = site_packages_dir();
    path.call_method1("insert", (0, site.to_string_lossy().to_string()))?;

    let env_dir = python_env_dir();
    path.call_method1("insert", (0, env_dir.to_string_lossy().to_string()))?;

    let _ = py.import("bootstrap")?;

    Ok(())
}

pub fn with_python<F, T>(f: F) -> Result<T, String>
where
    F: for<'py> FnOnce(Python<'py>) -> PyResult<T>,
{
    let lock = RUNTIME
        .get()
        .ok_or_else(|| "Python runtime not initialized".to_string())?
        .lock()
        .map_err(|e| e.to_string())?;

    if !lock.initialized {
        return Err("Python runtime not initialized".to_string());
    }

    let scripts_dir = lock.scripts_dir.clone();
    drop(lock);

    Python::with_gil(|py| {
        configure_python_paths(py, &scripts_dir)?;
        f(py)
    })
    .map_err(|e| e.to_string())
}

pub fn import_engine_module(py: Python<'_>) -> PyResult<Bound<'_, PyModule>> {
    PyModule::import(py, "engine")
}

pub fn call_engine_status(py: Python<'_>) -> PyResult<(bool, String, bool, bool, String, f64)> {
    let engine = import_engine_module(py)?;
    let result = engine.call_method0("get_engine_status")?;
    let dict = result.downcast::<PyDict>()?;

    let cuda = dict
        .get_item("cuda_available")?
        .and_then(|v| v.extract::<bool>().ok())
        .unwrap_or(false);
    let device = dict
        .get_item("device_name")?
        .and_then(|v| v.extract::<String>().ok())
        .unwrap_or_default();
    let vram = dict
        .get_item("vram_gb")?
        .and_then(|v| v.extract::<f64>().ok())
        .unwrap_or(0.0);
    let torch_ok = dict
        .get_item("torch_ready")?
        .and_then(|v| v.extract::<bool>().ok())
        .unwrap_or(false);
    let packages_ok = dict
        .get_item("packages_ready")?
        .and_then(|v| v.extract::<bool>().ok())
        .unwrap_or(torch_ok);
    let msg = dict
        .get_item("message")?
        .and_then(|v| v.extract::<String>().ok())
        .unwrap_or_else(|| "Unknown engine status".to_string());

    Ok((cuda, msg, torch_ok, packages_ok, device, vram))
}
