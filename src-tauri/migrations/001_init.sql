CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gallery_items (
    id TEXT PRIMARY KEY NOT NULL,
    media_type TEXT NOT NULL,
    model_id TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    negative_prompt TEXT NOT NULL DEFAULT '',
    params_json TEXT NOT NULL DEFAULT '{}',
    file_path TEXT NOT NULL,
    thumb_path TEXT,
    width INTEGER,
    height INTEGER,
    duration REAL,
    seed INTEGER,
    created_at TEXT NOT NULL,
    job_id TEXT,
    status TEXT NOT NULL DEFAULT 'complete'
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY NOT NULL,
    model_id TEXT NOT NULL,
    status TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    prompt TEXT NOT NULL DEFAULT '',
    negative_prompt TEXT NOT NULL DEFAULT '',
    params_json TEXT NOT NULL DEFAULT '{}',
    comfy_prompt_id TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gallery_created ON gallery_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_model ON gallery_items(model_id);
CREATE INDEX IF NOT EXISTS idx_gallery_type ON gallery_items(media_type);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
