use crate::gallery::{
    copy_to_export, create_thumbnail, delete_media_files, read_file_base64, GalleryFilters,
    GalleryItem,
};
use crate::inference::{get_engine_status, install_python_packages, EngineStatus};
use crate::jobs::JobRecord;
use crate::models::min_vram_gb;
use crate::models::{
    build_default_loaded_model, catalog_model_id, default_model_ready, default_video_dir,
    ensure_dir_on_drive, install_catalog_entry, install_hf_gguf_entry, list_catalog_json,
    list_hf_repo_gguf_impl, default_params, search_hf_gguf_repos_impl,
    list_pipeline_types, load_schema_by_id, validate_model_path, validate_params, LoadedModel,
    LoadedModelStore, ModelInfo, ModelSchema, PipelineType, suggest_schema_from_path,
    setup_default_video_model_download, DEFAULT_VIDEO_MODEL_ID,
};
use crate::logging::{log_error, log_info};
use crate::settings::{app_data_dir, database_path, default_output_dir, models_dir_default, AppSettings};
use crate::state::SharedState;
use rusqlite::Connection;
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

fn with_db<F, T>(state: &SharedState, f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    f(&conn)
}

fn load_settings(conn: &Connection) -> AppSettings {
    let mut settings = AppSettings::default();
    if let Ok(mut stmt) = conn.prepare("SELECT key, value FROM settings") {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }) {
            for row in rows.flatten() {
                match row.0.as_str() {
                    "models_directory" => settings.models_directory = row.1,
                    "output_directory" => settings.output_directory = row.1,
                    "theme" => settings.theme = row.1,
                    "setup_complete" => settings.setup_complete = row.1 == "true",
                    "comfyui_host" | "comfyui_port" => {}
                    _ => {}
                }
            }
        }
    }
    settings
}

fn save_settings_to_db(conn: &Connection, settings: &AppSettings) -> Result<(), String> {
    let pairs = [
        ("models_directory", settings.models_directory.clone()),
        ("output_directory", settings.output_directory.clone()),
        ("theme", settings.theme.clone()),
        ("setup_complete", settings.setup_complete.to_string()),
    ];
    for (k, v) in pairs {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
            rusqlite::params![k, v],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn init_database() -> Result<Connection, String> {
    let dir = app_data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(database_path()).map_err(|e| e.to_string())?;
    conn.execute_batch(include_str!("../migrations/001_init.sql"))
        .map_err(|e| e.to_string())?;
    conn.execute_batch(include_str!("../migrations/002_loaded_models.sql"))
        .map_err(|e| e.to_string())?;
    conn.execute_batch(include_str!("../migrations/003_schema_version.sql"))
        .map_err(|e| e.to_string())?;
    run_pending_migrations(&conn)?;
    Ok(conn)
}

fn run_pending_migrations(conn: &Connection) -> Result<(), String> {
    let current: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    const MIGRATIONS: &[(i64, &str)] = &[
        (1, "001_init"),
        (2, "002_loaded_models"),
        (3, "003_schema_version"),
        (4, "004_collections"),
        (5, "005_drop_comfy"),
    ];

    for (version, name) in MIGRATIONS {
        if *version > current {
            match version {
                4 => {
                    conn.execute_batch(include_str!("../migrations/004_collections.sql"))
                        .map_err(|e| e.to_string())?;
                }
                5 => {
                    conn.execute_batch(include_str!("../migrations/005_drop_comfy.sql"))
                        .map_err(|e| e.to_string())?;
                }
                _ => {}
            }
            let now = chrono::Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
                rusqlite::params![version, now],
            )
            .map_err(|e| e.to_string())?;
            log_info(format!("Applied migration {name} (v{version})"));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_settings(state: State<'_, SharedState>) -> Result<AppSettings, String> {
    Ok(state.settings.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, SharedState>,
    settings: AppSettings,
) -> Result<(), String> {
    std::fs::create_dir_all(PathBuf::from(&settings.output_directory))
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(PathBuf::from(&settings.models_directory))
        .map_err(|e| e.to_string())?;
    with_db(&state, |conn| save_settings_to_db(conn, &settings))?;
    *state.settings.lock().map_err(|e| e.to_string())? = settings;
    Ok(())
}

#[tauri::command]
pub fn get_engine_status_cmd() -> Result<EngineStatus, String> {
    Ok(get_engine_status())
}

fn loaded_model_info(model: &LoadedModel, engine: &EngineStatus) -> ModelInfo {
    let mut missing = Vec::new();
    if !engine.cuda_available {
        missing.push("CUDA GPU not available".to_string());
    }
    if !engine.python_ready {
        missing.push("Python runtime not initialized".to_string());
    }
    if !engine.site_packages_ready {
        missing.push(engine.message.clone());
    }
    if !crate::models::path_has_weights(&model.path) {
        missing.push(format!("Weights not found: {}", model.path));
    }

    ModelInfo {
        id: model.id.clone(),
        name: model.name.clone(),
        media_type: model.media_type.clone(),
        schema_id: model.schema_id.clone(),
        path: model.path.clone(),
        available: missing.is_empty(),
        missing_requirements: missing,
    }
}

#[tauri::command]
pub fn list_models(state: State<'_, SharedState>) -> Result<Vec<ModelInfo>, String> {
    let engine = get_engine_status();
    with_db(&state, |conn| {
        let removed = LoadedModelStore::dedupe_by_path(conn)?;
        if removed > 0 {
            log_info(format!("Removed {removed} duplicate loaded model(s)"));
        }
        let mut loaded = LoadedModelStore::list(conn)?;
        for model in &mut loaded {
            if let Some(suggested) = suggest_schema_from_path(&model.path) {
                if model.schema_id != suggested {
                    model.schema_id = suggested.to_string();
                    let _ = LoadedModelStore::update_schema(conn, &model.id, suggested);
                }
            }
        }
        Ok(loaded
            .iter()
            .map(|m| loaded_model_info(m, &engine))
            .collect())
    })
}

#[tauri::command]
pub fn list_pipeline_types_cmd() -> Result<Vec<PipelineType>, String> {
    list_pipeline_types()
}

#[tauri::command]
pub fn load_model(
    state: State<'_, SharedState>,
    path: String,
    schema_id: String,
    name: Option<String>,
) -> Result<ModelInfo, String> {
    validate_model_path(&path)?;
    let registry = list_pipeline_types()?;
    let pipeline = registry
        .iter()
        .find(|p| p.id == schema_id)
        .ok_or_else(|| format!("Unknown pipeline type: {schema_id}"))?;

    if let Some(existing) = with_db(&state, |conn| LoadedModelStore::find_by_path(conn, &path))? {
        log_info(format!("Model already loaded at {} — reusing entry", path));
        return Ok(loaded_model_info(&existing, &get_engine_status()));
    }

    let display_name = name.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| {
        std::path::Path::new(&path)
            .file_stem()
            .or_else(|| std::path::Path::new(&path).file_name())
            .and_then(|n| n.to_str())
            .unwrap_or("Model")
            .to_string()
    });

    let model = LoadedModel {
        id: uuid::Uuid::new_v4().to_string(),
        name: display_name,
        path,
        schema_id: schema_id.clone(),
        media_type: pipeline.media_type.clone(),
        loaded_at: chrono::Utc::now().to_rfc3339(),
    };

    with_db(&state, |conn| LoadedModelStore::insert(conn, &model))?;
    Ok(loaded_model_info(&model, &get_engine_status()))
}

#[tauri::command]
pub fn unload_model(state: State<'_, SharedState>, model_id: String) -> Result<(), String> {
    let model_path = with_db(&state, |conn| {
        LoadedModelStore::get(conn, &model_id)?
            .ok_or_else(|| "Model not found — load it first".to_string())
            .map(|m| m.path)
    })?;
    with_db(&state, |conn| LoadedModelStore::delete(conn, &model_id))?;
    if let Err(e) = crate::inference::release_inference_memory(Some(&model_path)) {
        log_error(format!("Failed to release inference memory for unload: {e}"));
    }
    Ok(())
}

#[tauri::command]
pub fn get_model_schema(
    state: State<'_, SharedState>,
    model_id: String,
) -> Result<ModelSchema, String> {
    let schema_id = with_db(&state, |conn| {
        LoadedModelStore::get(conn, &model_id)?
            .ok_or_else(|| "Model not found — load it first".to_string())
            .map(|m| m.schema_id)
    })?;
    load_schema_by_id(&schema_id)
}

#[tauri::command]
pub fn get_default_params(
    state: State<'_, SharedState>,
    model_id: String,
) -> Result<Value, String> {
    let schema_id = with_db(&state, |conn| {
        LoadedModelStore::get(conn, &model_id)?
            .ok_or_else(|| "Model not found — load it first".to_string())
            .map(|m| m.schema_id)
    })?;
    let schema = load_schema_by_id(&schema_id)?;
    let mut params = default_params(&schema);
    let engine = get_engine_status();
    if engine.vram_gb > 0.0 && engine.vram_gb <= 6.0 {
        if let Some(obj) = params.as_object_mut() {
            let min_vram = min_vram_gb(&schema_id);
            if min_vram <= 6.0 {
                if schema_id == "wan-2.2-5b" {
                    obj.insert("width".into(), Value::from(672));
                    obj.insert("height".into(), Value::from(384));
                    obj.insert("frame_count".into(), Value::from(33));
                    obj.insert("steps".into(), Value::from(16));
                } else if schema.media_type == "image" {
                    obj.insert("width".into(), Value::from(768));
                    obj.insert("height".into(), Value::from(768));
                    if obj.contains_key("steps") {
                        obj.insert("steps".into(), Value::from(20));
                    }
                }
            }
        }
    }
    Ok(params)
}

#[tauri::command]
pub fn submit_generation(
    app: AppHandle,
    state: State<'_, SharedState>,
    model_id: String,
    prompt: String,
    negative_prompt: String,
    params: Value,
) -> Result<String, String> {
    let schema_id = with_db(&state, |conn| {
        LoadedModelStore::get(conn, &model_id)?
            .ok_or_else(|| "Model not found — load it first".to_string())
            .map(|m| m.schema_id)
    })?;
    let schema = load_schema_by_id(&schema_id)?;
    validate_params(&schema, &params)?;

    let engine = get_engine_status();
    if !engine.cuda_available {
        return Err("CUDA GPU is required for generation".to_string());
    }

    let min_vram = min_vram_gb(&schema_id);
    if engine.vram_gb > 0.0 && engine.vram_gb < min_vram {
        return Err(format!(
            "This model needs at least {:.0} GB VRAM (detected {:.1} GB). Lower resolution or use a smaller quant.",
            min_vram, engine.vram_gb
        ));
    }

    let loaded = with_db(&state, |conn| {
        LoadedModelStore::get(conn, &model_id)?
            .ok_or_else(|| "Model not found — load it first".to_string())
    })?;

    let info = loaded_model_info(&loaded, &engine);
    if !info.available {
        return Err(info.missing_requirements.join("; "));
    }

    let job = with_db(&state, |conn| {
        state
            .jobs
            .create(conn, &model_id, &prompt, &negative_prompt, &params)
    })?;

    log_info(format!(
        "Queued job {} for model {} — {}",
        job.id,
        model_id,
        prompt.chars().take(60).collect::<String>()
    ));

    state.notify_job_queue();

    let _ = app.emit(
        "job-queued",
        serde_json::json!({
            "jobId": job.id,
            "modelId": model_id,
        }),
    );

    Ok(job.id)
}

#[tauri::command]
pub fn clear_queue(
    state: State<'_, SharedState>,
    dismiss_history: bool,
) -> Result<u32, String> {
    let cancelled = with_db(&state, |conn| state.jobs.cancel_all_pending(conn))?;
    let dismissed = if dismiss_history {
        with_db(&state, |conn| state.jobs.dismiss_finished(conn))?
    } else {
        0
    };
    log_info(format!(
        "Clear queue: cancelled {cancelled} pending, dismissed {dismissed} finished"
    ));
    Ok(cancelled + dismissed)
}

#[tauri::command]
pub fn cancel_job(state: State<'_, SharedState>, job_id: String) -> Result<(), String> {
    let was_pending = with_db(&state, |conn| state.jobs.cancel_pending(conn, &job_id))?;
    if was_pending {
        log_info(format!("Cancelled pending job {job_id}"));
        return Ok(());
    }
    state.cancel_job_flag(&job_id);
    with_db(&state, |conn| {
        state
            .jobs
            .update_status(conn, &job_id, "cancelled", 0.0, Some("Cancelled by user"))
    })?;
    log_info(format!("Cancel requested for running job {job_id}"));
    Ok(())
}

#[tauri::command]
pub fn install_python_environment() -> Result<String, String> {
    install_python_packages()
}

#[tauri::command]
pub fn list_jobs(state: State<'_, SharedState>, limit: Option<u32>) -> Result<Vec<JobRecord>, String> {
    with_db(&state, |conn| state.jobs.list(conn, limit.unwrap_or(50)))
}

#[tauri::command]
pub fn list_gallery(
    state: State<'_, SharedState>,
    filters: GalleryFilters,
) -> Result<Vec<GalleryItem>, String> {
    with_db(&state, |conn| {
        let mut items = state.gallery.list(conn, &filters)?;
        for item in &mut items {
            let needs_thumb = item.thumb_path.as_ref().map_or(true, |p| {
                let path = std::path::Path::new(p);
                !path.is_file() || path.metadata().map(|m| m.len() == 0).unwrap_or(true)
            });
            if needs_thumb {
                let source = std::path::Path::new(&item.file_path);
                if source.exists() {
                    if let Ok(Some(thumb)) =
                        create_thumbnail(source, &item.id, &item.media_type)
                    {
                        let thumb_str = thumb.to_string_lossy().to_string();
                        let _ = state.gallery.update_thumb(conn, &item.id, &thumb_str);
                        item.thumb_path = Some(thumb_str);
                    }
                }
            }
        }
        Ok(items)
    })
}

#[tauri::command]
pub fn delete_gallery_item(state: State<'_, SharedState>, id: String) -> Result<(), String> {
    let item = with_db(&state, |conn| state.gallery.delete(conn, &id))?;
    if let Some(item) = item {
        delete_media_files(&item)?;
    }
    Ok(())
}

#[tauri::command]
pub fn export_gallery_item(
    state: State<'_, SharedState>,
    id: String,
    dest_path: String,
) -> Result<(), String> {
    let item = with_db(&state, |conn| {
        state
            .gallery
            .get(conn, &id)?
            .ok_or_else(|| "Gallery item not found".to_string())
    })?;
    copy_to_export(
        std::path::Path::new(&item.file_path),
        std::path::Path::new(&dest_path),
    )
}

#[tauri::command]
pub fn get_media_data_uri(state: State<'_, SharedState>, id: String) -> Result<String, String> {
    let item = with_db(&state, |conn| {
        state
            .gallery
            .get(conn, &id)?
            .ok_or_else(|| "Gallery item not found".to_string())
    })?;

    let path = std::path::Path::new(&item.file_path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();

    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        _ => "image/png",
    };

    let b64 = read_file_base64(path)?;
    Ok(format!("data:{mime};base64,{b64}"))
}

#[tauri::command]
pub fn get_default_output_directory() -> String {
    default_output_dir().to_string_lossy().to_string()
}

#[tauri::command]
pub fn get_default_models_directory() -> String {
    models_dir_default().to_string_lossy().to_string()
}

#[tauri::command]
pub fn get_log_path() -> String {
    crate::logging::log_file().to_string_lossy().to_string()
}

fn emit_setup_progress(app: &AppHandle, message: &str, progress: f64) {
    let _ = app.emit(
        "setup-progress",
        serde_json::json!({ "message": message, "progress": progress }),
    );
}

fn register_default_video_model(state: &SharedState, models_dir: &str) -> Result<ModelInfo, String> {
    let model = build_default_loaded_model(models_dir)?;
    with_db(state, |conn| LoadedModelStore::upsert(conn, &model))?;
    Ok(loaded_model_info(&model, &get_engine_status()))
}

#[tauri::command]
pub fn list_model_catalog() -> Result<Value, String> {
    list_catalog_json()
}

#[tauri::command]
pub fn install_catalog_model(
    app: AppHandle,
    state: State<'_, SharedState>,
    entry_id: String,
    quant_id: Option<String>,
) -> Result<ModelInfo, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    let models_dir = settings.models_directory.clone();
    drop(settings);

    let engine = get_engine_status();
    if !engine.cuda_available {
        return Err(engine.message);
    }

    if !engine.site_packages_ready {
        emit_setup_progress(&app, "Installing AI packages (one time)…", 0.08);
        install_python_packages()?;
    }

    emit_setup_progress(&app, "Downloading model files…", 0.15);
    let result = install_catalog_entry(&entry_id, &models_dir, quant_id.as_deref(), Some(&app))?;

    emit_setup_progress(&app, "Registering model…", 0.92);
    let model = LoadedModel {
        id: catalog_model_id(&entry_id),
        name: result.name,
        path: result.path,
        schema_id: result.schema_id,
        media_type: result.media_type,
        loaded_at: chrono::Utc::now().to_rfc3339(),
    };
    with_db(&state, |conn| LoadedModelStore::upsert(conn, &model))?;

    emit_setup_progress(&app, "Model ready.", 1.0);
    log_info(&format!("Installed catalog model: {}", entry_id));
    Ok(loaded_model_info(&model, &get_engine_status()))
}

#[tauri::command]
pub fn search_hf_gguf_repos(query: String) -> Result<Value, String> {
    search_hf_gguf_repos_impl(&query)
}

#[tauri::command]
pub fn list_hf_repo_gguf(repo_id: String) -> Result<Value, String> {
    list_hf_repo_gguf_impl(&repo_id)
}

#[tauri::command]
pub fn install_hf_gguf_model(
    app: AppHandle,
    state: State<'_, SharedState>,
    repo_id: String,
    filename: String,
    schema_id: String,
    name: String,
) -> Result<ModelInfo, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    let models_dir = settings.models_directory.clone();
    drop(settings);

    let engine = get_engine_status();
    if !engine.cuda_available {
        return Err(engine.message);
    }

    if !engine.site_packages_ready {
        emit_setup_progress(&app, "Installing AI packages (one time)…", 0.08);
        install_python_packages()?;
    }

    emit_setup_progress(&app, "Downloading GGUF file…", 0.15);
    let result = install_hf_gguf_entry(&repo_id, &filename, &schema_id, &name, &models_dir, Some(&app))?;

    emit_setup_progress(&app, "Registering model…", 0.92);
    let entry_slug = repo_id.replace('/', "-");
    let model = LoadedModel {
        id: format!("hf-{entry_slug}-{}", filename.replace('.', "-")),
        name: result.name,
        path: result.path,
        schema_id: result.schema_id,
        media_type: result.media_type,
        loaded_at: chrono::Utc::now().to_rfc3339(),
    };
    with_db(&state, |conn| LoadedModelStore::upsert(conn, &model))?;

    emit_setup_progress(&app, "Model ready.", 1.0);
    log_info(&format!("Installed HF GGUF: {repo_id}/{filename}"));
    Ok(loaded_model_info(&model, &get_engine_status()))
}

#[tauri::command]
pub fn ensure_default_video_model(state: State<'_, SharedState>) -> Result<Option<ModelInfo>, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?.clone();
    let models_dir = settings.models_directory.clone();
    ensure_dir_on_drive(&default_video_dir(&models_dir))?;

    if !default_model_ready(&models_dir) {
        if settings.setup_complete {
            log_info("Default video model missing — downloading");
            setup_default_video_model_download(&models_dir)?;
        } else {
            return Ok(None);
        }
    }

    if let Some(existing) = with_db(&state, |conn| {
        LoadedModelStore::get(conn, DEFAULT_VIDEO_MODEL_ID)
    })? {
        return Ok(Some(loaded_model_info(&existing, &get_engine_status())));
    }

    register_default_video_model(&state, &models_dir).map(Some)
}

#[tauri::command]
pub fn run_initial_setup(
    app: AppHandle,
    state: State<'_, SharedState>,
    models_directory: String,
    output_directory: String,
) -> Result<ModelInfo, String> {
    emit_setup_progress(&app, "Saving preferences…", 0.05);

    let mut settings = state.settings.lock().map_err(|e| e.to_string())?;
    settings.models_directory = models_directory.clone();
    settings.output_directory = output_directory.clone();
    let mut settings_snapshot = settings.clone();
    drop(settings);

    ensure_dir_on_drive(std::path::Path::new(&output_directory))?;
    ensure_dir_on_drive(&default_video_dir(&models_directory))?;
    with_db(&state, |conn| save_settings_to_db(conn, &settings_snapshot))?;
    *state.settings.lock().map_err(|e| e.to_string())? = settings_snapshot.clone();

    emit_setup_progress(&app, "Checking GPU…", 0.1);
    let engine = get_engine_status();
    if !engine.cuda_available {
        return Err(engine.message);
    }

    if !engine.site_packages_ready {
        emit_setup_progress(&app, "Installing AI packages (one time)…", 0.15);
        install_python_packages()?;
    }

    if !default_model_ready(&models_directory) {
        emit_setup_progress(
            &app,
            "Downloading video model (~4 GB, one time only)…",
            0.35,
        );
        setup_default_video_model_download(&models_directory)?;
    } else {
        emit_setup_progress(&app, "Video model already on disk.", 0.7);
    }

    emit_setup_progress(&app, "Registering model…", 0.9);
    let model = register_default_video_model(&state, &models_directory)?;

    settings_snapshot.setup_complete = true;
    with_db(&state, |conn| save_settings_to_db(conn, &settings_snapshot))?;
    *state.settings.lock().map_err(|e| e.to_string())? = settings_snapshot;

    emit_setup_progress(&app, "Ready to generate.", 1.0);
    log_info("Initial setup complete — default video model ready");
    Ok(model)
}

#[tauri::command]
pub fn complete_setup(state: State<'_, SharedState>) -> Result<(), String> {
    let mut settings = state.settings.lock().map_err(|e| e.to_string())?;
    settings.setup_complete = true;
    let s = settings.clone();
    drop(settings);
    with_db(&state, |conn| save_settings_to_db(conn, &s))
}

pub fn bootstrap_settings(conn: &Connection) -> AppSettings {
    let settings = load_settings(conn);
    if conn
        .query_row(
            "SELECT COUNT(*) FROM settings",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        == 0
    {
        let _ = save_settings_to_db(conn, &settings);
    }
    settings
}

#[tauri::command]
pub fn ensure_gallery_thumb(state: State<'_, SharedState>, id: String) -> Result<String, String> {
    let item = with_db(&state, |conn| {
        state
            .gallery
            .get(conn, &id)?
            .ok_or_else(|| "Gallery item not found".to_string())
    })?;
    let source = std::path::Path::new(&item.file_path);
    if !source.exists() {
        return Err("Media file not found".to_string());
    }
    let thumb = create_thumbnail(source, &id, &item.media_type)?;
    let thumb_path = thumb
        .ok_or_else(|| "Could not generate thumbnail".to_string())?
        .to_string_lossy()
        .to_string();
    with_db(&state, |conn| state.gallery.update_thumb(conn, &id, &thumb_path))?;
    let b64 = read_file_base64(std::path::Path::new(&thumb_path))?;
    Ok(format!("data:image/jpeg;base64,{b64}"))
}

#[tauri::command]
pub fn list_collections(state: State<'_, SharedState>) -> Result<Vec<crate::gallery::Collection>, String> {
    with_db(&state, |conn| state.gallery.list_collections(conn))
}

#[tauri::command]
pub fn create_collection(
    state: State<'_, SharedState>,
    name: String,
) -> Result<crate::gallery::Collection, String> {
    with_db(&state, |conn| state.gallery.create_collection(conn, &name))
}

#[tauri::command]
pub fn set_gallery_collection(
    state: State<'_, SharedState>,
    item_id: String,
    collection_id: Option<String>,
) -> Result<(), String> {
    with_db(&state, |conn| {
        state
            .gallery
            .set_collection(conn, &item_id, collection_id.as_deref())
    })
}
