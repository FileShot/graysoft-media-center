use crate::gallery::GalleryStore;
use crate::jobs::JobQueue;
use crate::settings::AppSettings;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub db: Mutex<Connection>,
    pub settings: Mutex<AppSettings>,
    pub gallery: GalleryStore,
    pub jobs: JobQueue,
    pub cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub job_notify: Sender<()>,
}

impl AppState {
    pub fn new(db: Connection, settings: AppSettings, job_notify: Sender<()>) -> Self {
        Self {
            gallery: GalleryStore::new(),
            jobs: JobQueue::new(),
            db: Mutex::new(db),
            settings: Mutex::new(settings),
            cancel_flags: Mutex::new(HashMap::new()),
            job_notify,
        }
    }

    pub fn notify_job_queue(&self) {
        let _ = self.job_notify.send(());
    }

    pub fn register_cancel_flag(&self, job_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut map) = self.cancel_flags.lock() {
            map.insert(job_id.to_string(), flag.clone());
        }
        flag
    }

    pub fn cancel_job_flag(&self, job_id: &str) {
        if let Ok(map) = self.cancel_flags.lock() {
            if let Some(flag) = map.get(job_id) {
                flag.store(true, std::sync::atomic::Ordering::Relaxed);
            }
        }
    }

    pub fn clear_cancel_flag(&self, job_id: &str) {
        if let Ok(mut map) = self.cancel_flags.lock() {
            map.remove(job_id);
        }
    }
}

pub type SharedState = Arc<AppState>;
