use crate::core::AccountDetector;
use serde_json::json;

pub fn detect_steam_accounts() -> Result<serde_json::Value, String> {
    let result = AccountDetector::detect_all_accounts();
    Ok(json!({
        "success": result.success,
        "accounts": result.accounts,
        "total_found": result.total_found,
        "error": result.error_message
    }))
}

pub fn get_account_inventory(account_id: u32) -> Result<serde_json::Value, String> {
    AccountDetector::read_inventory_json(account_id)
        .map_err(|e| format!("Failed to read inventory: {}", e))
}

pub fn get_inventory_path(account_id: u32) -> Result<String, String> {
    AccountDetector::get_inventory_path(account_id)
        .map_err(|e| format!("Failed to get inventory path: {}", e))
}
