use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::task::JoinHandle;

use sha2::{Digest, Sha256};

use crate::core::api::client::ApiClient;
use crate::core::api::types::ConfigSyncRequest;
use crate::error::{CoreError, CoreResult};
use super::watcher::ConfigWatcher;

pub struct TokenState {
    pub access_token: String,
    pub refresh_token: String,
}

pub struct SyncEngine {
    pub token_state: Arc<Mutex<TokenState>>,
}

impl SyncEngine {
    pub fn new(access_token: String, refresh_token: String) -> Self {
        Self {
            token_state: Arc::new(Mutex::new(TokenState { access_token, refresh_token })),
        }
    }

    pub async fn start(
        self: Arc<Self>,
        watch_dirs: Vec<(String, PathBuf)>,
    ) -> CoreResult<JoinHandle<()>> {
        let dirs: Vec<PathBuf> = watch_dirs.iter().map(|(_, d)| d.clone()).collect();
        let mut watcher = ConfigWatcher::watch(&dirs)?;

        let dir_to_account: HashMap<PathBuf, String> =
            watch_dirs.into_iter().map(|(id, dir)| (dir, id)).collect();
        let engine = Arc::clone(&self);

        let handle = tokio::spawn(async move {
            let debounce = Duration::from_millis(500);
            let mut pending: HashMap<PathBuf, Instant> = HashMap::new();

            loop {
                let sleep_ms = pending
                    .values()
                    .map(|t| {
                        let elapsed = t.elapsed();
                        if elapsed >= debounce {
                            0u64
                        } else {
                            (debounce - elapsed).as_millis() as u64
                        }
                    })
                    .min()
                    .unwrap_or(60_000);

                tokio::select! {
                    Some(path) = watcher.events.recv() => {
                        pending.insert(path, Instant::now());
                    }
                    _ = tokio::time::sleep(Duration::from_millis(sleep_ms)), if !pending.is_empty() => {
                        let ready: Vec<PathBuf> = pending
                            .iter()
                            .filter(|(_, t)| t.elapsed() >= debounce)
                            .map(|(p, _)| p.clone())
                            .collect();

                        for path in ready {
                            pending.remove(&path);
                            let account_id = find_account(&path, &dir_to_account);
                            if let Some(id) = account_id {
                                engine.push_config(&id, &path).await;
                            }
                        }
                    }
                }
            }
        });

        Ok(handle)
    }

    async fn push_config(&self, account_id: &str, path: &Path) {
        let Ok(content) = tokio::fs::read_to_string(path).await else { return };

        let checksum = sha256_hex(content.as_bytes());
        let config_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let payload = ConfigSyncRequest {
            steam_account_id: account_id.to_string(),
            config_type: detect_config_type(&config_name),
            config_name,
            content: serde_json::json!({ "raw": content }),
            checksum,
        };

        let token = self.token_state.lock().unwrap().access_token.clone();
        let client = ApiClient::new(Some(token));

        match client.sync_config(payload.clone()).await {
            Ok(_) => {}
            Err(CoreError::Unauthorized) => {
                self.refresh_and_retry(payload).await;
            }
            Err(_) => {}
        }
    }

    async fn refresh_and_retry(&self, payload: ConfigSyncRequest) {
        let refresh_token = self.token_state.lock().unwrap().refresh_token.clone();
        let auth_client = ApiClient::new(None);

        if let Ok(tokens) = auth_client.refresh_access_token(&refresh_token).await {
            let access_token = {
                let mut state = self.token_state.lock().unwrap();
                state.access_token = tokens.access_token.clone();
                state.refresh_token = tokens.refresh_token;
                tokens.access_token
            };
            let _ = ApiClient::new(Some(access_token)).sync_config(payload).await;
        }
    }
}

fn find_account<'a>(path: &Path, dir_to_account: &'a HashMap<PathBuf, String>) -> Option<&'a str> {
    dir_to_account
        .iter()
        .find(|(dir, _)| path.starts_with(dir.as_path()))
        .map(|(_, id)| id.as_str())
}

fn detect_config_type(filename: &str) -> String {
    match filename {
        "autoexec.cfg" => "autoexec".to_string(),
        "config.cfg" => "viewmodel".to_string(),
        f if f.contains("crosshair") => "crosshair".to_string(),
        f if f.contains("bind") => "binds".to_string(),
        _ => "raw".to_string(),
    }
}

fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect()
}
