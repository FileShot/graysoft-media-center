CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

ALTER TABLE gallery_items ADD COLUMN collection_id TEXT;

CREATE INDEX IF NOT EXISTS idx_gallery_collection ON gallery_items(collection_id);
