use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use thiserror::Error;

static REQUEST_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Error, Debug)]
pub enum PlaywrightError {
    #[error("워커 시작 실패: {0}")]
    SpawnError(#[from] std::io::Error),
    #[error("워커 응답 오류: {0}")]
    ResponseError(String),
    #[error("JSON 파싱 오류: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("워커가 실행중이 아닙니다")]
    NotRunning,
    #[error("스크립트를 찾을 수 없습니다")]
    ScriptNotFound,
}

#[derive(Serialize)]
struct WorkerCommand {
    id: u64,
    action: String,
    params: serde_json::Value,
}

#[derive(Deserialize, Debug)]
#[allow(dead_code)]
struct WorkerResponse {
    id: Option<u64>,
    success: Option<bool>,
    data: Option<serde_json::Value>,
    ready: Option<bool>,
    error: Option<String>,
}

pub struct PlaywrightWorker {
    process: Option<Child>,
    stdin: Option<std::process::ChildStdin>,
    stdout_reader: Option<BufReader<std::process::ChildStdout>>,
}

impl PlaywrightWorker {
    pub fn new() -> Self {
        Self {
            process: None,
            stdin: None,
            stdout_reader: None,
        }
    }

    fn find_script_and_workdir() -> Option<(PathBuf, PathBuf)> {
        let cwd = std::env::current_dir().ok()?;

        let exe_path = std::env::current_exe().ok()?;
        let exe_dir = exe_path.parent()?;

        if let Ok(script_path) = std::env::var("HIWORKS_WORKER_SCRIPT") {
            let path = PathBuf::from(&script_path);
            if path.exists() {
                let workdir = path.parent()?.parent()?.to_path_buf();
                return Some((path.canonicalize().ok()?, workdir.canonicalize().ok()?));
            }
        }

        let mut candidates = vec![
            (cwd.join("../scripts/playwright-worker.js"), cwd.join("..")),
            (cwd.join("scripts/playwright-worker.js"), cwd.clone()),
            (exe_dir.join("../Resources/scripts/playwright-worker.js"), exe_dir.join("../Resources")),
            (exe_dir.join("scripts/playwright-worker.js"), exe_dir.to_path_buf()),
        ];

        if let Ok(home) = std::env::var("HOME") {
            candidates.push((
                PathBuf::from(&home).join(".hiworks-commute/scripts/playwright-worker.js"),
                PathBuf::from(&home).join(".hiworks-commute"),
            ));
        }

        for (script, workdir) in candidates {
            if script.exists() {
                return Some((script.canonicalize().ok()?, workdir.canonicalize().ok()?));
            }
        }

        None
    }

    pub fn start(&mut self) -> Result<(), PlaywrightError> {
        if self.process.is_some() {
            return Ok(());
        }

        let (script_path, work_dir) =
            Self::find_script_and_workdir().ok_or(PlaywrightError::ScriptNotFound)?;

        let mut child = Command::new("node")
            .arg(&script_path)
            .current_dir(&work_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()?;

        let stdin = child.stdin.take().expect("Failed to get stdin");
        let stdout = child.stdout.take().expect("Failed to get stdout");

        self.stdin = Some(stdin);
        self.stdout_reader = Some(BufReader::new(stdout));
        self.process = Some(child);

        let mut line = String::new();
        if let Some(reader) = &mut self.stdout_reader {
            reader.read_line(&mut line)?;
            let response: WorkerResponse = serde_json::from_str(&line)?;
            if response.ready != Some(true) {
                return Err(PlaywrightError::ResponseError(
                    "워커 준비 실패".to_string(),
                ));
            }
        }

        Ok(())
    }

    pub fn send_command(
        &mut self,
        action: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, PlaywrightError> {
        self.start()?;

        let id = REQUEST_ID.fetch_add(1, Ordering::SeqCst);
        let cmd = WorkerCommand {
            id,
            action: action.to_string(),
            params,
        };

        let stdin = self.stdin.as_mut().ok_or(PlaywrightError::NotRunning)?;
        let reader = self
            .stdout_reader
            .as_mut()
            .ok_or(PlaywrightError::NotRunning)?;

        let cmd_json = serde_json::to_string(&cmd)?;
        writeln!(stdin, "{}", cmd_json)?;
        stdin.flush()?;

        let mut line = String::new();
        reader.read_line(&mut line)?;

        let response: WorkerResponse = serde_json::from_str(&line)?;

        if let Some(error) = response.error {
            return Err(PlaywrightError::ResponseError(error));
        }

        if response.success == Some(false) {
            let error_msg = response
                .data
                .and_then(|d| d.as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| "알 수 없는 오류".to_string());
            return Err(PlaywrightError::ResponseError(error_msg));
        }

        Ok(response
            .data
            .unwrap_or(serde_json::Value::String("성공".to_string())))
    }

    pub fn stop(&mut self) -> Result<(), PlaywrightError> {
        if let Some(mut process) = self.process.take() {
            let _ = process.kill();
            let _ = process.wait();
        }

        self.stdin = None;
        self.stdout_reader = None;
        self.process = None;
        Ok(())
    }
}

impl Drop for PlaywrightWorker {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}
