use winreg::RegKey;
use winreg::enums::HKEY_CURRENT_USER;
use serde::{Deserialize, Serialize};
use crate::error::{CoreError, CoreResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryAccountInfo {
    pub account_id: u32,
    pub account_name: String,
    pub persona_name: String,
    pub most_recent: bool,
}

pub struct RegistryReader;

impl RegistryReader {
    const STEAM_REG_PATH: &'static str = r"Software\Valve\Steam\Accounts";

    pub fn read_all_accounts() -> CoreResult<Vec<RegistryAccountInfo>> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let accounts_key = hkcu.open_subkey(Self::STEAM_REG_PATH)
            .map_err(|e| CoreError::RegistryError(format!("Failed to open accounts key: {}", e)))?;

        let mut accounts = Vec::new();

        for subkey_name in accounts_key.enum_keys().flatten() {
            if let Ok(account_key) = accounts_key.open_subkey(&subkey_name) {
                if let Ok(account_id) = Self::parse_account_id(&subkey_name) {
                    if let (Ok(account_name), Ok(persona_name)) = (
                        account_key.get_value::<String, &str>("AccountName"),
                        account_key.get_value::<String, &str>("PersonaName"),
                    ) {
                        let most_recent: u32 = account_key
                            .get_value("MostRecent")
                            .unwrap_or(0);

                        accounts.push(RegistryAccountInfo {
                            account_id,
                            account_name,
                            persona_name,
                            most_recent: most_recent == 1,
                        });
                    }
                }
            }
        }

        Ok(accounts)
    }

    fn parse_account_id(subkey: &str) -> Result<u32, std::num::ParseIntError> {
        subkey.parse::<u32>()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_account_id_valid() {
        let result = RegistryReader::parse_account_id("22202");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 22202);
    }

    #[test]
    fn test_parse_account_id_invalid() {
        let result = RegistryReader::parse_account_id("not_a_number");
        assert!(result.is_err());
    }
}
