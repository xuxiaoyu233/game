use std::sync::Arc;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

mod save_commands;
mod save_repository;
mod storage_location;

const EXIT_REQUESTED_EVENT: &str = "zhujie-rescue-bureau://exit-requested";

fn restore_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    // The renderer calls this only after awaiting the durable-save barrier.
    app.exit(0);
}

fn fallback_tray_icon() -> Image<'static> {
    let mut pixels = vec![0_u8; 32 * 32 * 4];
    for y in 0..32 {
        for x in 0..32 {
            let index = (y * 32 + x) * 4;
            let is_flame = (11..22).contains(&x) && (8..24).contains(&y);
            let color = if is_flame {
                [251, 170, 84, 255]
            } else {
                [30, 27, 39, 255]
            };
            pixels[index..index + 4].copy_from_slice(&color);
        }
    }
    Image::new_owned(pixels, 32, 32)
}

pub fn run() {
    let mut builder = tauri::Builder::default();
    // Must be the first plugin; duplicate processes exit before setup or reads.
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            restore_window(app);
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let directory = if storage_location::portable_requested(std::env::args_os().skip(1)) {
                storage_location::save_directory(
                    storage_location::StorageLocation::PortableExecutable(&std::env::current_exe()?),
                    storage_location::SaveProfile::SkillPrototypeV1,
                    cfg!(debug_assertions),
                )?
            } else {
                storage_location::save_directory(
                    storage_location::StorageLocation::AppData(&app.path().app_data_dir()?),
                    storage_location::SaveProfile::SkillPrototypeV1,
                    cfg!(debug_assertions),
                )?
            };
            app.manage(Arc::new(save_repository::SaveRepository::new(directory)));

            let show = MenuItem::with_id(app, "show", "显示技能放置原型", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "exit", "保存并退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &exit])?;
            let icon = app
                .default_window_icon()
                .map(|icon| Image::new_owned(icon.rgba().to_vec(), icon.width(), icon.height()))
                .unwrap_or_else(fallback_tray_icon);
            TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .tooltip("技能放置原型")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => restore_window(app),
                    "exit" => {
                        // Keep the native process alive until the renderer has
                        // saved successfully; this event never directly exits.
                        restore_window(app);
                        let _ = app.emit_to("main", EXIT_REQUESTED_EVENT, ());
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } | TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        }
                    ) {
                        restore_window(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_commands::save_read,
            save_commands::save_read_backup,
            save_commands::save_write,
            save_commands::save_export_file,
            save_commands::save_import_file,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run 技能放置原型 desktop application");
}
