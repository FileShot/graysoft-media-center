CREATE TABLE IF NOT EXISTS loaded_models (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    schema_id TEXT NOT NULL,
    media_type TEXT NOT NULL,
    loaded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_loaded_models_media ON loaded_models(media_type);
