use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};

/// メインウィンドウを表示して前面に出す
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        // 2つ目を起動しようとしたら、新しく起動せず既存のウィンドウを前に出す
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        // OS ネイティブ通知
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // ---- システムトレイ（タスクバー右下 / メニューバー）に常駐 ----
            let show = MenuItem::with_id(app, "show", "Nexus を開く", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Nexus を終了", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &separator, &quit])?;

            let icon = app
                .default_window_icon()
                .cloned()
                .ok_or("アプリアイコンが見つかりません")?;

            TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .tooltip("Nexus")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // 左クリックでウィンドウを表示
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // ×ボタンでは終了せずトレイに隠す（通話や通知を受け続けるため）
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Nexus の起動に失敗しました");

    app.run(|app_handle, event| {
        // macOS: Dock のアイコンをクリックしたら隠したウィンドウを再表示
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            show_main_window(app_handle);
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app_handle, event);
    });
}
