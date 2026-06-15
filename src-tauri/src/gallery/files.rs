use crate::gallery::store::GalleryItem;
use crate::inference::with_python;
use crate::settings::thumbnails_dir;
use image::imageops::FilterType;
use image::GenericImageView;
use pyo3::prelude::*;
use pyo3::types::PyAnyMethods;
use std::fs;
use std::path::{Path, PathBuf};

pub fn ensure_dirs(output_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(output_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(thumbnails_dir()).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn save_output_bytes(
    output_dir: &Path,
    model_id: &str,
    filename: &str,
    bytes: &[u8],
) -> Result<PathBuf, String> {
    ensure_dirs(output_dir)?;
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let safe_name = format!(
        "{}_{}_{}",
        chrono::Utc::now().format("%Y%m%d_%H%M%S"),
        model_id,
        uuid::Uuid::new_v4()
    );
    let out_path = output_dir.join(format!("{safe_name}.{ext}"));
    fs::write(&out_path, bytes).map_err(|e| e.to_string())?;
    Ok(out_path)
}

pub fn create_thumbnail(source: &Path, item_id: &str, media_type: &str) -> Result<Option<PathBuf>, String> {
    ensure_dirs(&thumbnails_dir())?;
    let thumb_path = thumbnails_dir().join(format!("{item_id}.jpg"));

    if media_type == "image" {
        let img = image::open(source).map_err(|e| e.to_string())?;
        let (w, h) = img.dimensions();
        let max_dim = 320u32;
        let thumb = if w > max_dim || h > max_dim {
            img.resize(max_dim, max_dim, FilterType::Triangle)
        } else {
            img
        };
        thumb.save(&thumb_path).map_err(|e| e.to_string())?;
        return Ok(Some(thumb_path));
    }

    if media_type == "video" {
        if extract_video_frame_python(source, &thumb_path) {
            return Ok(Some(thumb_path));
        }
        if let Some(frame) = extract_video_frame_ffmpeg(source) {
            frame.save(&thumb_path).map_err(|e| e.to_string())?;
            return Ok(Some(thumb_path));
        }
    }

    Ok(None)
}

fn extract_video_frame_python(source: &Path, dest: &Path) -> bool {
    with_python(|py| {
        let module = py.import("thumb_util")?;
        let ok: bool = module
            .call_method1(
                "extract_video_thumbnail",
                (source.to_string_lossy().to_string(), dest.to_string_lossy().to_string()),
            )?
            .extract()?;
        Ok(ok)
    })
    .unwrap_or(false)
}

fn extract_video_frame_ffmpeg(source: &Path) -> Option<image::DynamicImage> {
    use std::process::Command;
    let temp_png = std::env::temp_dir().join(format!("gmc_thumb_{}.png", uuid::Uuid::new_v4()));
    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            &source.to_string_lossy(),
            "-vframes",
            "1",
            "-f",
            "image2",
            &temp_png.to_string_lossy(),
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let img = image::open(&temp_png).ok();
    let _ = fs::remove_file(&temp_png);
    img
}

pub fn delete_media_files(item: &GalleryItem) -> Result<(), String> {
    let path = Path::new(&item.file_path);
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    if let Some(thumb) = &item.thumb_path {
        let tp = Path::new(thumb);
        if tp.exists() {
            let _ = fs::remove_file(tp);
        }
    }
    Ok(())
}

pub fn copy_to_export(source: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(source, dest).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_file_base64(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        bytes,
    ))
}
