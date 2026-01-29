mod playwright;

use playwright::PlaywrightWorker;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Manager, State, WebviewWindowBuilder,
};
use tauri_plugin_notification::NotificationExt;

struct TrayState {
    tray: Mutex<Option<TrayIcon>>,
}

fn update_tray_title(app: &AppHandle, status: &str) {
    if let Some(state) = app.try_state::<TrayState>() {
        if let Ok(guard) = state.tray.lock() {
            if let Some(ref tray) = *guard {
                let _ = tray.set_title(Some(format!("👋 {}", status)));
            }
        }
    }
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}

fn handle_worker_action(
    app: AppHandle,
    cmd: &'static str,
    title: &'static str,
    tray_status: &'static str,
    default_msg: &'static str,
    check_url: bool,
) {
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let mut worker = state.worker.lock().unwrap();

        if check_url {
            match worker.send_command("getCompanyUrl", serde_json::json!({})) {
                Ok(url) if url.is_null() || url.as_str() == Some("") => {
                    notify(&app, "Hiworks", "먼저 설정에서 회사 URL을 입력해주세요");
                    drop(worker);
                    show_settings_window(&app);
                    return;
                }
                Err(e) => {
                    notify(&app, "Hiworks", &format!("오류: {}", e));
                    return;
                }
                _ => {}
            }
        }

        match worker.send_command(cmd, serde_json::json!({})) {
            Ok(result) => {
                let msg = result
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or(default_msg);
                update_tray_title(&app, tray_status);
                notify(&app, title, msg);
            }
            Err(e) => {
                notify(&app, "Hiworks", &format!("오류: {}", e));
            }
        }
    });
}

struct AppState {
    worker: Mutex<PlaywrightWorker>,
}

#[tauri::command]
async fn set_company_url(state: State<'_, AppState>, url: String) -> Result<String, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("setCompanyUrl", serde_json::json!({ "url": url }))
        .map_err(|e| e.to_string())?;

    Ok(result
        .as_str()
        .unwrap_or("URL이 설정되었습니다")
        .to_string())
}

#[tauri::command]
async fn get_company_url(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("getCompanyUrl", serde_json::json!({}))
        .map_err(|e| e.to_string())?;

    Ok(result.as_str().map(|s| s.to_string()))
}

#[tauri::command]
async fn set_username(state: State<'_, AppState>, username: String) -> Result<String, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("setUsername", serde_json::json!({ "username": username }))
        .map_err(|e| e.to_string())?;

    Ok(result
        .as_str()
        .unwrap_or("아이디가 저장되었습니다")
        .to_string())
}

#[tauri::command]
async fn get_username(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("getUsername", serde_json::json!({}))
        .map_err(|e| e.to_string())?;

    Ok(result.as_str().map(|s| s.to_string()))
}

#[tauri::command]
async fn set_password(state: State<'_, AppState>, password: String) -> Result<String, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("setPassword", serde_json::json!({ "password": password }))
        .map_err(|e| e.to_string())?;

    Ok(result
        .as_str()
        .unwrap_or("비밀번호가 저장되었습니다")
        .to_string())
}

#[tauri::command]
async fn has_password(state: State<'_, AppState>) -> Result<bool, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("hasPassword", serde_json::json!({}))
        .map_err(|e| e.to_string())?;

    Ok(result.as_bool().unwrap_or(false))
}

#[tauri::command]
async fn open_login(state: State<'_, AppState>) -> Result<String, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("openLogin", serde_json::json!({}))
        .map_err(|e| e.to_string())?;

    Ok(result
        .as_str()
        .unwrap_or("브라우저가 열렸습니다")
        .to_string())
}

#[tauri::command]
async fn check_in(state: State<'_, AppState>) -> Result<String, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("checkIn", serde_json::json!({}))
        .map_err(|e| e.to_string())?;

    if let Some(msg) = result.get("message").and_then(|m| m.as_str()) {
        return Ok(msg.to_string());
    }

    Ok(result
        .as_str()
        .unwrap_or("출근 처리됨")
        .to_string())
}

#[tauri::command]
async fn check_out(state: State<'_, AppState>) -> Result<String, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("checkOut", serde_json::json!({}))
        .map_err(|e| e.to_string())?;

    if let Some(msg) = result.get("message").and_then(|m| m.as_str()) {
        return Ok(msg.to_string());
    }

    Ok(result
        .as_str()
        .unwrap_or("퇴근 처리됨")
        .to_string())
}

#[tauri::command]
async fn set_work(state: State<'_, AppState>) -> Result<String, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("setWork", serde_json::json!({}))
        .map_err(|e| e.to_string())?;

    if let Some(msg) = result.get("message").and_then(|m| m.as_str()) {
        return Ok(msg.to_string());
    }

    Ok(result.as_str().unwrap_or("업무 상태로 변경됨").to_string())
}

#[tauri::command]
async fn go_out(state: State<'_, AppState>) -> Result<String, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("goOut", serde_json::json!({}))
        .map_err(|e| e.to_string())?;

    if let Some(msg) = result.get("message").and_then(|m| m.as_str()) {
        return Ok(msg.to_string());
    }

    Ok(result.as_str().unwrap_or("외출 처리됨").to_string())
}

#[tauri::command]
async fn set_meeting(state: State<'_, AppState>) -> Result<String, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("setMeeting", serde_json::json!({}))
        .map_err(|e| e.to_string())?;

    if let Some(msg) = result.get("message").and_then(|m| m.as_str()) {
        return Ok(msg.to_string());
    }

    Ok(result.as_str().unwrap_or("회의 상태로 변경됨").to_string())
}

#[tauri::command]
async fn set_outwork(state: State<'_, AppState>) -> Result<String, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("setOutwork", serde_json::json!({}))
        .map_err(|e| e.to_string())?;

    if let Some(msg) = result.get("message").and_then(|m| m.as_str()) {
        return Ok(msg.to_string());
    }

    Ok(result.as_str().unwrap_or("외근 상태로 변경됨").to_string())
}

#[tauri::command]
async fn get_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("getStatus", serde_json::json!({}))
        .map_err(|e| e.to_string())?;

    Ok(result)
}

#[tauri::command]
async fn is_logged_in(state: State<'_, AppState>) -> Result<bool, String> {
    let mut worker = state.worker.lock().unwrap();
    let result = worker
        .send_command("isLoggedIn", serde_json::json!({}))
        .map_err(|e| e.to_string())?;

    Ok(result.as_bool().unwrap_or(false))
}

fn show_settings_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        match WebviewWindowBuilder::new(app, "settings", tauri::WebviewUrl::App("index.html".into()))
            .title("설정")
            .inner_size(450.0, 500.0)
            .resizable(false)
            .center()
            .always_on_top(true)
            .visible(true)
            .build()
        {
            Ok(w) => {
                let window_clone = w.clone();
                w.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
                let _ = w.show();
                let _ = w.set_focus();
            }
            Err(_) => {}
        }
    }
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let check_in_item = MenuItem::with_id(app, "check_in", "출근", true, None::<&str>)?;
    let check_out_item = MenuItem::with_id(app, "check_out", "퇴근", true, None::<&str>)?;

    let set_work_item = MenuItem::with_id(app, "set_work", "업무", true, None::<&str>)?;
    let go_out_item = MenuItem::with_id(app, "go_out", "외출", true, None::<&str>)?;
    let set_meeting_item = MenuItem::with_id(app, "set_meeting", "회의", true, None::<&str>)?;
    let set_outwork_item = MenuItem::with_id(app, "set_outwork", "외근", true, None::<&str>)?;

    let status_submenu = Submenu::with_items(
        app,
        "근무 상태",
        true,
        &[&set_work_item, &go_out_item, &set_meeting_item, &set_outwork_item],
    )?;

    let separator1 = PredefinedMenuItem::separator(app)?;
    let separator2 = PredefinedMenuItem::separator(app)?;

    let open_login_item = MenuItem::with_id(app, "open_login", "브라우저로 로그인", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "설정...", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &check_in_item,
            &check_out_item,
            &status_submenu,
            &separator1,
            &open_login_item,
            &settings_item,
            &separator2,
            &quit_item,
        ],
    )?;

    let tray = TrayIconBuilder::new()
        .title("👋")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
                "check_in" => handle_worker_action(
                    app.clone(), "checkIn", "Hiworks 출근", "근무중", "출근 완료", true
                ),
                "check_out" => handle_worker_action(
                    app.clone(), "checkOut", "Hiworks 퇴근", "퇴근", "퇴근 완료", false
                ),
                "set_work" => handle_worker_action(
                    app.clone(), "setWork", "Hiworks 업무", "업무중", "업무 상태로 변경됨", false
                ),
                "go_out" => handle_worker_action(
                    app.clone(), "goOut", "Hiworks 외출", "외출중", "외출 처리됨", false
                ),
                "set_meeting" => handle_worker_action(
                    app.clone(), "setMeeting", "Hiworks 회의", "회의중", "회의 상태로 변경됨", false
                ),
                "set_outwork" => handle_worker_action(
                    app.clone(), "setOutwork", "Hiworks 외근", "외근중", "외근 상태로 변경됨", false
                ),
                "open_login" => handle_worker_action(
                    app.clone(), "openLogin", "Hiworks", "👋", "브라우저가 열렸습니다. 로그인해주세요.", true
                ),
                "settings" => show_settings_window(app),
                "quit" => {
                    let state = app.state::<AppState>();
                    let mut worker = state.worker.lock().unwrap();
                    let _ = worker.stop();
                    app.exit(0);
                }
                _ => {}
            }
        })
        .build(app)?;

    if let Some(state) = app.try_state::<TrayState>() {
        if let Ok(mut guard) = state.tray.lock() {
            *guard = Some(tray);
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState {
            worker: Mutex::new(PlaywrightWorker::new()),
        })
        .manage(TrayState {
            tray: std::sync::Mutex::new(None),
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            setup_tray(app.handle())?;

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<AppState>();
                let mut worker = state.worker.lock().unwrap();

                if let Ok(url) = worker.send_command("getCompanyUrl", serde_json::json!({})) {
                    if url.is_null() || url.as_str() == Some("") {
                        drop(worker);
                        show_settings_window(&app_handle);
                    }
                } else {
                    drop(worker);
                    show_settings_window(&app_handle);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_company_url,
            get_company_url,
            set_username,
            get_username,
            set_password,
            has_password,
            open_login,
            check_in,
            set_work,
            go_out,
            set_meeting,
            set_outwork,
            check_out,
            get_status,
            is_logged_in,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
