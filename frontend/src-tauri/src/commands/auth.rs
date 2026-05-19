use crate::core::api::{ApiClient, AuthResponse, LoginRequest, RegisterRequest};
use crate::core::market::{valuate_inventory, InventoryValuation};

#[tauri::command]
pub async fn register(
    email: String,
    password: String,
    full_name: String,
) -> Result<AuthResponse, String> {
    ApiClient::new(None)
        .register(RegisterRequest { email, password, full_name })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn login(email: String, password: String) -> Result<AuthResponse, String> {
    ApiClient::new(None)
        .login(LoginRequest { email, password })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn valuate_hash_names(hash_names: Vec<String>) -> Result<InventoryValuation, String> {
    if hash_names.is_empty() {
        return Err("No item names provided".to_string());
    }
    Ok(valuate_inventory(hash_names).await)
}
