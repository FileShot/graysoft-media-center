fn main() {
    copy_schema("schemas/model_catalog.json", "python/model_catalog.json");
    copy_schema("schemas/registry.json", "python/model_registry.json");
    tauri_build::build()
}

fn copy_schema(src: &str, dst: &str) {
    let src_path = std::path::Path::new(src);
    if src_path.exists() {
        let _ = std::fs::copy(src_path, dst);
        println!("cargo:rerun-if-changed={src}");
    }
}
