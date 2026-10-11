use std::sync::Arc;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::save_repository::{export_json, read_optional, validate_json, SaveRepository};

type CommandResult<T> = Result<T, String>;

async fn blocking<T: Send + 'static>(
    operation: impl FnOnce() -> CommandResult<T> + Send + 'static,
) -> CommandResult<T> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn save_read(
    repository: State<'_, Arc<SaveRepository>>,
) -> CommandResult<Option<String>> {
    let repository = repository.inner().clone();
    blocking(move || repository.read(false).map_err(|error| error.to_string())).await
}

#[tauri::command]
pub async fn save_read_backup(
    repository: State<'_, Arc<SaveRepository>>,
) -> CommandResult<Option<String>> {
    let repository = repository.inner().clone();
    blocking(move || repository.read(true).map_err(|error| error.to_string())).await
}

#[tauri::command]
pub async fn save_write(
    repository: State<'_, Arc<SaveRepository>>,
    contents: String,
    preserve_backup: Option<bool>,
) -> CommandResult<()> {
    let repository = repository.inner().clone();
    blocking(move || {
        repository
            .write(&contents, preserve_backup.unwrap_or(false))
            .map_err(|error| error.to_string())
    })
    .await
}

#[tauri::command]
pub async fn save_export_file(app: AppHandle, contents: String) -> CommandResult<bool> {
    // Validation also occurs before asking the user to pick a destination.
    validate_json(&contents).map_err(|error| error.to_string())?;
    blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("导出诸界救援局存档")
            .set_file_name("zhujie-rescue-bureau-save.json")
            .add_filter("JSON 存档", &["json"])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(false);
        };
        let path = selected.into_path().map_err(|error| error.to_string())?;
        export_json(&path, &contents).map_err(|error| error.to_string())?;
        Ok(true)
    })
    .await
}

#[tauri::command]
pub async fn save_import_file(app: AppHandle) -> CommandResult<Option<String>> {
    blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("导入诸界救援局存档")
            .add_filter("JSON 存档", &["json"])
            .blocking_pick_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|error| error.to_string())?;
        let contents = read_optional(&path)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "所选存档文件已不存在，请重新选择。".to_string())?;
        validate_json(&contents).map_err(|error| error.to_string())?;
        // Do not commit an imported file here. TypeScript validates the game's
        // schema and asks for confirmation before applying or saving it.
        Ok(Some(contents))
    })
    .await
}
