use serde::Serialize;
use crate::core::api::{
    ApiClient, BulkCreateAccountsRequest, BulkCreateAccountsResponse, CreateAccountPayload,
};

#[derive(Debug, Serialize)]
pub struct CloudAccountView {
    pub id: String,
    pub steam_id: String,
    pub account_name: String,
    pub persona_name: String,
    pub is_primary: bool,
    pub sync_status: String,
}

#[tauri::command]
pub async fn add_steam_account(
    access_token: String,
    steam_id: String,
    account_name: String,
    persona_name: String,
) -> Result<BulkCreateAccountsResponse, String> {
    let parsed: u64 = steam_id
        .trim()
        .parse()
        .map_err(|_| "SteamID должен быть числом (SteamID64, 17 цифр)".to_string())?;

    if account_name.trim().is_empty() {
        return Err("Имя аккаунта не может быть пустым".to_string());
    }

    let payload = BulkCreateAccountsRequest {
        accounts: vec![CreateAccountPayload {
            steam_id: parsed,
            account_name: account_name.trim().to_string(),
            persona_name: persona_name.trim().to_string(),
            is_primary: false,
            local_path: String::new(),
        }],
    };

    ApiClient::new(Some(access_token))
        .bulk_create_accounts(payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_cloud_accounts(access_token: String) -> Result<Vec<CloudAccountView>, String> {
    let resp = ApiClient::new(Some(access_token))
        .list_accounts()
        .await
        .map_err(|e| e.to_string())?;

    Ok(resp
        .accounts
        .into_iter()
        .map(|a| CloudAccountView {
            id: a.id,
            steam_id: a.steam_id.to_string(),
            account_name: a.account_name,
            persona_name: a.persona_name.unwrap_or_default(),
            is_primary: a.is_primary,
            sync_status: a.sync_status,
        })
        .collect())
}
