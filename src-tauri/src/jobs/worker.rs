use crate::gallery::{create_thumbnail, GalleryItem};
use crate::inference::{report_progress, release_inference_memory, run_generation};
use crate::jobs::JobRecord;
use crate::logging::{log_error, log_info};
use crate::models::LoadedModelStore;
use crate::state::SharedState;
use std::path::PathBuf;
use std::sync::mpsc::Receiver;
use tauri::{AppHandle, Emitter};

pub fn spawn_worker(app: AppHandle, state: SharedState, notify_rx: Receiver<()>) {
    std::thread::spawn(move || {
        log_info("Job queue worker started");
        loop {
            while let Some(job) = take_next_pending(&state) {
                process_job(&app, &state, job);
            }

            if notify_rx.recv().is_err() {
                log_info("Job queue worker stopped");
                break;
            }
        }
    });
}

fn take_next_pending(state: &SharedState) -> Option<JobRecord> {
    let conn = state.db.lock().ok()?;
    state.jobs.next_pending(&conn).ok().flatten()
}

fn process_job(app: &AppHandle, state: &SharedState, job: JobRecord) {
    log_info(format!("Processing job {} model={}", job.id, job.model_id));

    let loaded = match with_db(state, |conn| {
        LoadedModelStore::get(conn, &job.model_id)?
            .ok_or_else(|| format!("Model not found for job {}", job.model_id))
    }) {
        Ok(m) => m,
        Err(e) => {
            log_error(&e);
            fail_job(app, state, &job.id, &e);
            return;
        }
    };

    let output_dir = match state.settings.lock() {
        Ok(s) => s.output_directory.clone(),
        Err(e) => {
            fail_job(app, state, &job.id, &e.to_string());
            return;
        }
    };

    let _ = with_db(state, |conn| {
        state.jobs.update_status(conn, &job.id, "running", 0.05, None)
    });

    let cancel_flag = state.register_cancel_flag(&job.id);
    let job_id = job.id.clone();
    let result = run_generation(
        app,
        &job.id,
        &loaded.schema_id,
        &loaded.path,
        &job.prompt,
        &job.negative_prompt,
        &job.params_json,
        &output_dir,
        cancel_flag.clone(),
        |progress, status, message| {
            report_progress(app, &job_id, progress, status, message)?;
            if status == "running" || status == "pending" {
                with_db(state, |conn| {
                    state
                        .jobs
                        .update_status(conn, &job_id, status, progress, None)
                })?;
            }
            Ok(())
        },
    );

    match result {
        Ok(output) => {
            log_info(format!("Job {} completed: {}", job.id, output.file_path));
            let item_id = uuid::Uuid::new_v4().to_string();
            let saved_path = PathBuf::from(&output.file_path);
            let thumb = create_thumbnail(&saved_path, &item_id, &output.media_type)
                .ok()
                .flatten();

            let item = GalleryItem {
                id: item_id.clone(),
                media_type: output.media_type,
                model_id: job.model_id.clone(),
                prompt: job.prompt.clone(),
                negative_prompt: job.negative_prompt.clone(),
                params_json: job.params_json.clone(),
                file_path: output.file_path,
                thumb_path: thumb.map(|p| p.to_string_lossy().to_string()),
                width: output.width,
                height: output.height,
                duration: output.duration,
                seed: output.seed,
                created_at: chrono::Utc::now().to_rfc3339(),
                job_id: Some(job.id.clone()),
                status: "complete".to_string(),
                collection_id: None,
            };

            let save_result = with_db(state, |conn| {
                state.gallery.insert(conn, &item)?;
                state
                    .jobs
                    .update_status(conn, &job.id, "complete", 1.0, None)
            });

            if save_result.is_ok() {
                let _ = app.emit(
                    "job-complete",
                    serde_json::json!({
                        "jobId": job.id,
                        "galleryItemId": item_id
                    }),
                );
            } else if let Err(e) = save_result {
                log_error(format!("Job {} gallery save failed: {}", job.id, e));
                fail_job(app, state, &job.id, &e);
            }
        }
        Err(e) => {
            log_error(format!("Job {} failed: {}", job.id, e));
            let status = if e == "Cancelled" { "cancelled" } else { "failed" };
            let _ = with_db(state, |conn| {
                state
                    .jobs
                    .update_status(conn, &job.id, status, 0.0, Some(&e))
            });
            if status == "cancelled" {
                let _ = app.emit(
                    "job-cancelled",
                    serde_json::json!({ "jobId": job.id }),
                );
            } else {
                let _ = app.emit(
                    "job-failed",
                    serde_json::json!({ "jobId": job.id, "error": e }),
                );
            }
        }
    }

    state.clear_cancel_flag(&job.id);

    let keep_loaded = match with_db(state, |conn| state.jobs.has_pending(conn)) {
        Ok(v) => v,
        Err(e) => {
            log_error(format!("Failed to check pending jobs after {}: {}", job.id, e));
            false
        }
    };
    if keep_loaded {
        log_info(format!(
            "Keeping WAN pipeline loaded for queued job(s) after {}",
            job.id
        ));
    } else if let Err(e) = release_inference_memory(None) {
        log_error(format!("Failed to release inference memory after {}: {}", job.id, e));
    } else {
        log_info(format!("Released inference memory after job {}", job.id));
    }
}

fn fail_job(app: &AppHandle, state: &SharedState, job_id: &str, error: &str) {
    let _ = with_db(state, |conn| {
        state
            .jobs
            .update_status(conn, job_id, "failed", 0.0, Some(error))
    });
    let _ = app.emit(
        "job-failed",
        serde_json::json!({ "jobId": job_id, "error": error }),
    );
}

fn with_db<F, T>(state: &SharedState, f: F) -> Result<T, String>
where
    F: FnOnce(&rusqlite::Connection) -> Result<T, String>,
{
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    f(&conn)
}
