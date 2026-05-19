use crate::core::api::{ApiClient, BulkCreateAccountsRequest, CreateAccountPayload};
use crate::core::AccountDetector;
use crate::core::steam::account_id_to_steamid64;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CloudSyncResult {
    pub detected: usize,
    pub synced: usize,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn sync_accounts_to_cloud(access_token: String) -> CloudSyncResult {
    let detection = AccountDetector::detect_all_accounts();

    if !detection.success {
        return CloudSyncResult {
            detected: 0,
            synced: 0,
            error: detection.error_message,
        };
    }

    let payloads: Vec<CreateAccountPayload> = detection
        .accounts
        .iter()
        .map(|a| CreateAccountPayload {
            steam_id: account_id_to_steamid64(a.account_id),
            account_name: a.account_name.clone(),
            persona_name: a.persona_name.clone(),
            is_primary: false,
            local_path: a.userdata_path.clone(),
        })
        .collect();

    let total = payloads.len();
    let client = ApiClient::new(Some(access_token));

    match client
        .bulk_create_accounts(BulkCreateAccountsRequest { accounts: payloads })
        .await
    {
        Ok(resp) => CloudSyncResult {
            detected: total,
            synced: resp.created,
            error: None,
        },
        Err(e) => CloudSyncResult {
            detected: total,
            synced: 0,
            error: Some(e.to_string()),
        },
    }
}
