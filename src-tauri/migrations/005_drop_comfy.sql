CREATE TABLE IF NOT EXISTS jobs_clean (
    id TEXT PRIMARY KEY NOT NULL,
    model_id TEXT NOT NULL,
    status TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    prompt TEXT NOT NULL DEFAULT '',
    negative_prompt TEXT NOT NULL DEFAULT '',
    params_json TEXT NOT NULL DEFAULT '{}',
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO jobs_clean (id, model_id, status, progress, prompt, negative_prompt, params_json, error_message, created_at, updated_at)
SELECT id, model_id, status, progress, prompt, negative_prompt, params_json, error_message, created_at, updated_at
FROM jobs;

DROP TABLE jobs;
ALTER TABLE jobs_clean RENAME TO jobs;

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
