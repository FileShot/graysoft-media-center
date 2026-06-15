use crate::settings::app_data_dir;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

static LOG_MUTEX: Mutex<()> = Mutex::new(());

pub fn log_dir() -> PathBuf {
    app_data_dir().join("logs")
}

pub fn log_file() -> PathBuf {
    log_dir().join("graysoft.log")
}

pub fn init_logging() {
    let _ = std::fs::create_dir_all(log_dir());
    write_line("INFO", "Graysoft Media Center started");
}

fn write_line(level: &str, message: &str) {
    let _guard = LOG_MUTEX.lock().ok();
    let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let line = format!("[{timestamp}] [{level}] {message}\n");
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_file())
    {
        let _ = file.write_all(line.as_bytes());
    }
}

pub fn log_info(message: impl AsRef<str>) {
    write_line("INFO", message.as_ref());
}

pub fn log_warn(message: impl AsRef<str>) {
    write_line("WARN", message.as_ref());
}

pub fn log_error(message: impl AsRef<str>) {
    write_line("ERROR", message.as_ref());
}
