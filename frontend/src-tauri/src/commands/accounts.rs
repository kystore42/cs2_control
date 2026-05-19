use crate::core::AccountDetector;
use crate::core::market::{valuate_inventory, InventoryValuation};
use serde_json::json;

#[tauri::command]
pub fn detect_steam_accounts() -> Result<serde_json::Value, String> {
    let result = AccountDetector::detect_all_accounts();
    Ok(json!({
        "success": result.success,
        "accounts": result.accounts,
        "total_found": result.total_found,
        "error": result.error_message
    }))
}

#[tauri::command]
pub fn get_account_inventory(account_id: u32) -> Result<serde_json::Value, String> {
    AccountDetector::read_inventory_json(account_id)
        .map_err(|e| format!("Failed to read inventory: {}", e))
}

#[tauri::command]
pub async fn valuate_account_inventory(account_id: u32) -> Result<InventoryValuation, String> {
    let raw = AccountDetector::read_inventory_json(account_id)
        .map_err(|e| format!("Failed to read inventory: {}", e))?;

    let hash_names = extract_hash_names(&raw);
    if hash_names.is_empty() {
        return Err("No market items found in inventory".to_string());
    }

    Ok(valuate_inventory(hash_names).await)
}

fn extract_hash_names(raw: &serde_json::Value) -> Vec<String> {
    let mut names = Vec::new();

    let candidates = raw
        .get("items")
        .or_else(|| raw.get("descriptions"))
        .or_else(|| raw.get("assets"))
        .and_then(|v| v.as_array())
        .cloned()
        .or_else(|| raw.as_array().cloned())
        .unwrap_or_default();

    for item in candidates {
        if let Some(name) = item
            .get("market_hash_name")
            .or_else(|| item.get("hash_name"))
            .or_else(|| item.get("name"))
            .and_then(|v| v.as_str())
        {
            names.push(name.to_string());
        }
    }

    names.sort();
    names.dedup();
    names
}
