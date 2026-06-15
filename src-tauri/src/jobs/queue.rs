use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRecord {
    pub id: String,
    pub model_id: String,
    pub status: String,
    pub progress: f64,
    pub prompt: String,
    pub negative_prompt: String,
    pub params_json: Value,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct JobQueue;

impl JobQueue {
    pub fn new() -> Self {
        Self
    }

    pub fn create(
        &self,
        conn: &Connection,
        model_id: &str,
        prompt: &str,
        negative_prompt: &str,
        params: &Value,
    ) -> Result<JobRecord, String> {
        let now = chrono::Utc::now().to_rfc3339();
        let job = JobRecord {
            id: uuid::Uuid::new_v4().to_string(),
            model_id: model_id.to_string(),
            status: "pending".to_string(),
            progress: 0.0,
            prompt: prompt.to_string(),
            negative_prompt: negative_prompt.to_string(),
            params_json: params.clone(),
            error_message: None,
            created_at: now.clone(),
            updated_at: now,
        };

        conn.execute(
            "INSERT INTO jobs (id, model_id, status, progress, prompt, negative_prompt, params_json, error_message, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                job.id,
                job.model_id,
                job.status,
                job.progress,
                job.prompt,
                job.negative_prompt,
                job.params_json.to_string(),
                job.error_message,
                job.created_at,
                job.updated_at,
            ],
        )
        .map_err(|e| e.to_string())?;

        Ok(job)
    }

    pub fn update_status(
        &self,
        conn: &Connection,
        id: &str,
        status: &str,
        progress: f64,
        error: Option<&str>,
    ) -> Result<(), String> {
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE jobs SET status = ?1, progress = ?2, error_message = ?3, updated_at = ?4 WHERE id = ?5",
            params![status, progress, error, now, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list(&self, conn: &Connection, limit: u32) -> Result<Vec<JobRecord>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, model_id, status, progress, prompt, negative_prompt, params_json, error_message, created_at, updated_at
                 FROM jobs ORDER BY created_at DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limit], |row| {
                let params_str: String = row.get(6)?;
                Ok(JobRecord {
                    id: row.get(0)?,
                    model_id: row.get(1)?,
                    status: row.get(2)?,
                    progress: row.get(3)?,
                    prompt: row.get(4)?,
                    negative_prompt: row.get(5)?,
                    params_json: serde_json::from_str(&params_str)
                        .unwrap_or(Value::Object(Default::default())),
                    error_message: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn has_pending(&self, conn: &Connection) -> Result<bool, String> {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM jobs WHERE status = 'pending'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(count > 0)
    }

    pub fn next_pending(&self, conn: &Connection) -> Result<Option<JobRecord>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, model_id, status, progress, prompt, negative_prompt, params_json, error_message, created_at, updated_at
                 FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let params_str: String = row.get(6).map_err(|e| e.to_string())?;
            Ok(Some(JobRecord {
                id: row.get(0).map_err(|e| e.to_string())?,
                model_id: row.get(1).map_err(|e| e.to_string())?,
                status: row.get(2).map_err(|e| e.to_string())?,
                progress: row.get(3).map_err(|e| e.to_string())?,
                prompt: row.get(4).map_err(|e| e.to_string())?,
                negative_prompt: row.get(5).map_err(|e| e.to_string())?,
                params_json: serde_json::from_str(&params_str)
                    .unwrap_or(Value::Object(Default::default())),
                error_message: row.get(7).map_err(|e| e.to_string())?,
                created_at: row.get(8).map_err(|e| e.to_string())?,
                updated_at: row.get(9).map_err(|e| e.to_string())?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn cancel_pending(&self, conn: &Connection, id: &str) -> Result<bool, String> {
        let updated = conn
            .execute(
                "UPDATE jobs SET status = 'cancelled', error_message = 'Cancelled by user', updated_at = ?1
                 WHERE id = ?2 AND status = 'pending'",
                params![chrono::Utc::now().to_rfc3339(), id],
            )
            .map_err(|e| e.to_string())?;
        Ok(updated > 0)
    }

    pub fn cancel_all_pending(&self, conn: &Connection) -> Result<u32, String> {
        let now = chrono::Utc::now().to_rfc3339();
        let updated = conn
            .execute(
                "UPDATE jobs SET status = 'cancelled', error_message = 'Cancelled by user', updated_at = ?1
                 WHERE status = 'pending'",
                params![now],
            )
            .map_err(|e| e.to_string())?;
        Ok(updated as u32)
    }

    pub fn dismiss_finished(&self, conn: &Connection) -> Result<u32, String> {
        let updated = conn
            .execute(
                "DELETE FROM jobs WHERE status IN ('complete', 'failed', 'cancelled')",
                [],
            )
            .map_err(|e| e.to_string())?;
        Ok(updated as u32)
    }

    pub fn reset_stale_running(&self, conn: &Connection) -> Result<u32, String> {
        let now = chrono::Utc::now().to_rfc3339();
        let updated = conn
            .execute(
                "UPDATE jobs SET status = 'failed', progress = 0.0,
                 error_message = 'Interrupted — the app closed during generation',
                 updated_at = ?1
                 WHERE status = 'running'",
                params![now],
            )
            .map_err(|e| e.to_string())?;
        Ok(updated as u32)
    }

    pub fn get(&self, conn: &Connection, id: &str) -> Result<Option<JobRecord>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, model_id, status, progress, prompt, negative_prompt, params_json, error_message, created_at, updated_at
                 FROM jobs WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query_map(params![id], |row| {
                let params_str: String = row.get(6)?;
                Ok(JobRecord {
                    id: row.get(0)?,
                    model_id: row.get(1)?,
                    status: row.get(2)?,
                    progress: row.get(3)?,
                    prompt: row.get(4)?,
                    negative_prompt: row.get(5)?,
                    params_json: serde_json::from_str(&params_str)
                        .unwrap_or(Value::Object(Default::default())),
                    error_message: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?;
        Ok(rows.next().transpose().map_err(|e| e.to_string())?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../migrations/001_init.sql"))
            .unwrap();
        conn.execute_batch(include_str!("../../migrations/005_drop_comfy.sql"))
            .unwrap();
        conn
    }

    #[test]
    fn create_and_list_job() {
        let queue = JobQueue::new();
        let conn = test_conn();
        let job = queue
            .create(&conn, "model-1", "hello", "", &serde_json::json!({}))
            .unwrap();
        assert_eq!(job.status, "pending");
        let listed = queue.list(&conn, 10).unwrap();
        assert_eq!(listed.len(), 1);
    }
}
