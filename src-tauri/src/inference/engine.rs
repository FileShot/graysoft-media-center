use crate::inference::model_manager::{hf_repo_for, EngineStatus};

use crate::inference::params::build_pipeline_params;

use crate::inference::python_runtime::{call_engine_status, import_engine_module, with_python};

use crate::logging::log_error;

use pyo3::prelude::*;

use pyo3::types::{PyCFunction, PyDict, PyTuple};

use serde_json::Value;

use std::path::PathBuf;

use std::sync::atomic::{AtomicBool, Ordering};

use std::sync::Arc;

use tauri::{AppHandle, Emitter};



#[derive(Debug, Clone)]

pub struct GenerateOutput {

    pub file_path: String,

    pub media_type: String,

    pub width: Option<i64>,

    pub height: Option<i64>,

    pub duration: Option<f64>,

    pub seed: Option<i64>,

}



pub fn get_engine_status() -> EngineStatus {

    let (cuda, message, torch_ready, packages_ready, device_name, vram_gb) =

        match with_python(call_engine_status) {

            Ok(v) => v,

            Err(e) => (

                false,

                e.clone(),

                false,

                false,

                String::new(),

                0.0,

            ),

        };



    let packages_ok = packages_ready && torch_ready;

    let ready = cuda && packages_ok;



    EngineStatus {

        ready,

        message: if ready {

            "Inference engine ready".to_string()

        } else {

            message

        },

        cuda_available: cuda,

        device_name,

        vram_gb,

        python_ready: true,

        site_packages_ready: packages_ok,

    }

}



pub fn run_generation(

    app: &AppHandle,

    job_id: &str,

    schema_id: &str,

    model_path: &str,

    prompt: &str,

    negative_prompt: &str,

    params: &Value,

    output_dir: &str,

    cancel_flag: Arc<AtomicBool>,

    on_progress: impl Fn(f64, &str, &str) -> Result<(), String>,

) -> Result<GenerateOutput, String> {

    if cancel_flag.load(Ordering::Relaxed) {

        return Err("Cancelled".to_string());

    }



    let pipeline_params = build_pipeline_params(schema_id, params, prompt, negative_prompt)?;

    let repo = hf_repo_for(schema_id).unwrap_or_default();

    let output = PathBuf::from(output_dir);

    std::fs::create_dir_all(&output).map_err(|e| e.to_string())?;



    on_progress(0.05, "running", "Starting generation")?;



    let app_handle = app.clone();

    let job_id_owned = job_id.to_string();

    let cancel_flag_py = Arc::clone(&cancel_flag);



    let result = with_python(|py| {

        let engine_mod = import_engine_module(py)?;

        let kwargs = PyDict::new(py);

        kwargs.set_item("model_id", schema_id)?;

        kwargs.set_item("hf_repo", repo)?;

        kwargs.set_item("model_dir", model_path)?;

        kwargs.set_item("models_root", model_path)?;

        kwargs.set_item("output_dir", output.to_string_lossy().to_string())?;

        kwargs.set_item("prompt", prompt)?;

        kwargs.set_item("negative_prompt", negative_prompt)?;

        kwargs.set_item("params_json", pipeline_params.to_string())?;



        let progress_app = app_handle.clone();

        let progress_job = job_id_owned.clone();

        let progress_cb = PyCFunction::new_closure(

            py,

            None,

            None,

            move |args: &Bound<'_, PyTuple>, _kwargs: Option<&Bound<'_, PyDict>>| -> PyResult<()> {

                let arg0 = args.get_item(0)?;
                let dict = arg0.downcast::<PyDict>()?;

                let progress: f64 = dict
                    .get_item("progress")?
                    .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing progress"))?
                    .extract()?;

                let message: String = dict

                    .get_item("message")?

                    .and_then(|v| v.extract().ok())

                    .unwrap_or_default();

                let phase: Option<String> = dict

                    .get_item("phase")?

                    .and_then(|v| v.extract().ok());

                let step: Option<i64> = dict.get_item("step")?.and_then(|v| v.extract().ok());

                let total_steps: Option<i64> = dict

                    .get_item("total_steps")?

                    .and_then(|v| v.extract().ok());

                let _ = emit_progress_ext(

                    &progress_app,

                    &progress_job,

                    progress,

                    "running",

                    &message,

                    phase.as_deref(),

                    step,

                    total_steps,

                );

                Ok(())

            },

        )?;

        kwargs.set_item("progress_callback", progress_cb)?;



        let cancel_flag_inner = Arc::clone(&cancel_flag_py);

        let cancel_cb = PyCFunction::new_closure(

            py,

            None,

            None,

            move |_args: &Bound<'_, PyTuple>, _kwargs: Option<&Bound<'_, PyDict>>| -> PyResult<bool> {

                Ok(cancel_flag_inner.load(Ordering::Relaxed))

            },

        )?;

        kwargs.set_item("cancel_check", cancel_cb)?;



        let result = engine_mod.call_method("generate", (), Some(&kwargs))?;

        parse_generate_result(&result)

    });



    if cancel_flag.load(Ordering::Relaxed) {

        return Err("Cancelled".to_string());

    }



    let result = match result {

        Ok(v) => v,

        Err(e) => {

            log_error(format!("Generation failed job={job_id}: {e}"));

            return Err(e);

        }

    };



    on_progress(1.0, "running", "Saving output")?;

    Ok(result)

}



fn parse_generate_result(result: &Bound<'_, PyAny>) -> PyResult<GenerateOutput> {

    let dict = result.downcast::<PyDict>()?;

    let file_path = dict

        .get_item("file_path")?

        .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing file_path"))?

        .extract::<String>()?;

    let media_type = dict

        .get_item("media_type")?

        .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing media_type"))?

        .extract::<String>()?;

    let width = dict

        .get_item("width")?

        .and_then(|v| v.extract::<i64>().ok());

    let height = dict

        .get_item("height")?

        .and_then(|v| v.extract::<i64>().ok());

    let duration = dict

        .get_item("duration")?

        .and_then(|v| v.extract::<f64>().ok());

    let seed = dict

        .get_item("seed")?

        .and_then(|v| v.extract::<i64>().ok());



    Ok(GenerateOutput {

        file_path,

        media_type,

        width,

        height,

        duration,

        seed,

    })

}



fn emit_progress(

    app: &AppHandle,

    job_id: &str,

    progress: f64,

    status: &str,

    message: &str,

) -> Result<(), String> {

    emit_progress_ext(app, job_id, progress, status, message, None, None, None)

}



pub fn emit_progress_ext(

    app: &AppHandle,

    job_id: &str,

    progress: f64,

    status: &str,

    message: &str,

    phase: Option<&str>,

    step: Option<i64>,

    total_steps: Option<i64>,

) -> Result<(), String> {

    let mut payload = serde_json::json!({

        "jobId": job_id,

        "progress": progress,

        "status": status,

        "message": message,

        "elapsedMs": chrono::Utc::now().timestamp_millis(),

    });

    if let Some(p) = phase {

        payload["phase"] = Value::String(p.to_string());

    }

    if let Some(s) = step {

        payload["step"] = Value::Number(s.into());

    }

    if let Some(t) = total_steps {

        payload["totalSteps"] = Value::Number(t.into());

    }

    app.emit("job-progress", payload)

        .map_err(|e| e.to_string())

}



pub fn report_progress(

    app: &AppHandle,

    job_id: &str,

    progress: f64,

    status: &str,

    message: &str,

) -> Result<(), String> {

    emit_progress(app, job_id, progress, status, message)

}



pub fn install_python_packages() -> Result<String, String> {

    with_python(|py| {

        let engine = import_engine_module(py)?;

        let result = engine.call_method0("install_packages")?;

        result.extract::<String>()

    })

}



pub fn release_inference_memory(model_dir: Option<&str>) -> Result<(), String> {

    with_python(|py| {

        let engine = import_engine_module(py)?;

        match model_dir {

            Some(path) => {

                engine.call_method1("release_inference_memory", (path,))?;

            }

            None => {

                engine.call_method1("release_inference_memory", (py.None(),))?;

            }

        }

        Ok(())

    })

}


