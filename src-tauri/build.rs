fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "save_read",
            "save_read_backup",
            "save_write",
            "save_export_file",
            "save_import_file",
            "exit_app",
        ]),
    ))
    .expect("failed to generate Tauri build configuration");
}
