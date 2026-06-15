mod commands;
mod gallery;
mod inference;
mod jobs;
mod logging;
mod models;
mod settings;
mod state;

use commands::{bootstrap_settings, init_database};
use inference::init_runtime;
use jobs::{spawn_worker, JobQueue};
use logging::init_logging;
use state::{AppState, SharedState};
use std::sync::mpsc;
use std::sync::Arc;
use tauri::Emitter;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            init_logging();
            let conn = init_database()?;
            let recovered = JobQueue::new().reset_stale_running(&conn)?;
            if recovered > 0 {
                let _ = app.emit(
                    "jobs-recovered",
                    serde_json::json!({ "count": recovered }),
                );
            }
            let settings = bootstrap_settings(&conn);
            std::fs::create_dir_all(&settings.output_directory).map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&settings.models_directory).map_err(|e| e.to_string())?;

            let resource_dir = app.path().resource_dir().ok();
            init_runtime(resource_dir)?;

            let (job_tx, job_rx) = mpsc::channel();
            let state: SharedState = Arc::new(AppState::new(conn, settings, job_tx.clone()));
            app.manage(Arc::clone(&state));

            spawn_worker(app.handle().clone(), Arc::clone(&state), job_rx);
            let _ = job_tx.send(());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::get_engine_status_cmd,
            commands::list_models,
            commands::list_pipeline_types_cmd,
            commands::load_model,
            commands::unload_model,
            commands::get_model_schema,
            commands::get_default_params,
            commands::submit_generation,
            commands::cancel_job,
            commands::clear_queue,
            commands::install_python_environment,
            commands::list_jobs,
            commands::list_gallery,
            commands::delete_gallery_item,
            commands::export_gallery_item,
            commands::get_media_data_uri,
            commands::get_default_output_directory,
            commands::get_default_models_directory,
            commands::complete_setup,
            commands::get_log_path,
            commands::run_initial_setup,
            commands::ensure_default_video_model,
            commands::list_model_catalog,
            commands::install_catalog_model,
            commands::search_hf_gguf_repos,
            commands::list_hf_repo_gguf,
            commands::install_hf_gguf_model,
            commands::list_collections,
            commands::create_collection,
            commands::set_gallery_collection,
            commands::ensure_gallery_thumb,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
