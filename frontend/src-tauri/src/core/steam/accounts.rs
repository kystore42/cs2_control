use super::path::SteamPathDiscovery;
use super::registry::RegistryReader;
use serde::{Deserialize, Serialize};
use std::path::Path;
use crate::error::{CoreError, CoreResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedAccount {
    pub account_id: u32,
    pub account_name: String,
    pub persona_name: String,
    pub userdata_path: String,
    pub inventory_file: Option<String>,
    pub is_installed_cs2: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountDetectionResult {
    pub success: bool,
    pub accounts: Vec<DetectedAccount>,
    pub total_found: usize,
    pub error_message: Option<String>,
}

pub struct AccountDetector;

impl AccountDetector {
    const CS2_APP_ID: &'static str = "730";
    const INVENTORY_FILE: &'static str = "730\\2\\inventory.json";

    pub fn detect_all_accounts() -> AccountDetectionResult {
        match SteamPathDiscovery::discover() {
            Ok(paths) => {
                match RegistryReader::read_all_accounts() {
                    Ok(registry_accounts) => {
                        let detected = registry_accounts
                            .iter()
                            .filter_map(|reg_acc| {
                                Self::build_detected_account(&paths.userdata, reg_acc)
                            })
                            .collect::<Vec<_>>();

                        let total = detected.len();
                        AccountDetectionResult {
                            success: true,
                            accounts: detected,
                            total_found: total,
                            error_message: None,
                        }
                    }
                    Err(e) => AccountDetectionResult {
                        success: false,
                        accounts: vec![],
                        total_found: 0,
                        error_message: Some(format!("Registry read failed: {}", e)),
                    },
                }
            }
            Err(e) => AccountDetectionResult {
                success: false,
                accounts: vec![],
                total_found: 0,
                error_message: Some(format!("Steam path discovery failed: {}", e)),
            },
        }
    }

    pub fn get_inventory_path(account_id: u32) -> CoreResult<String> {
        let paths = SteamPathDiscovery::discover()?;
        let inventory_path = paths.userdata
            .join(account_id.to_string())
            .join(Self::INVENTORY_FILE);

        if inventory_path.exists() {
            Ok(inventory_path.to_string_lossy().to_string())
        } else {
            Err(CoreError::InventoryNotFound(account_id))
        }
    }

    pub fn read_inventory_json(account_id: u32) -> CoreResult<serde_json::Value> {
        let inventory_path = Self::get_inventory_path(account_id)?;
        let contents = std::fs::read_to_string(&inventory_path)?;
        Ok(serde_json::from_str(&contents)?)
    }

    fn build_detected_account(
        userdata_base: &Path,
        registry_account: &super::registry::RegistryAccountInfo,
    ) -> Option<DetectedAccount> {
        let userdata_path = userdata_base.join(registry_account.account_id.to_string());

        if !userdata_path.exists() {
            return None;
        }

        let cs2_path = userdata_path.join(Self::CS2_APP_ID);
        let is_installed = cs2_path.exists();

        let inventory_file = if is_installed {
            let inv_path = userdata_path.join(Self::INVENTORY_FILE);
            inv_path.exists().then(|| {
                inv_path.to_string_lossy().to_string()
            })
        } else {
            None
        };

        Some(DetectedAccount {
            account_id: registry_account.account_id,
            account_name: registry_account.account_name.clone(),
            persona_name: registry_account.persona_name.clone(),
            userdata_path: userdata_path.to_string_lossy().to_string(),
            inventory_file,
            is_installed_cs2: is_installed,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_accounts_returns_valid_result() {
        let result = AccountDetector::detect_all_accounts();
        assert!(result.success || result.error_message.is_some());
    }

    #[test]
    fn test_account_detection_total_matches_count() {
        let result = AccountDetector::detect_all_accounts();
        assert_eq!(result.total_found, result.accounts.len());
    }
}
