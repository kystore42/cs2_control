use std::path::PathBuf;
use winreg::RegKey;
use winreg::enums::HKEY_LOCAL_MACHINE;
use serde::{Deserialize, Serialize};
use crate::error::{CoreError, CoreResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamPaths {
    pub root: PathBuf,
    pub userdata: PathBuf,
    pub libraryfolders: PathBuf,
    pub config: PathBuf,
}

pub struct SteamPathDiscovery;

impl SteamPathDiscovery {
    const STEAM_REG_PATH: &'static str = r"SOFTWARE\Valve\Steam";
    const STEAM_DEFAULT_WIN: &'static str = r"C:\Program Files (x86)\Steam";

    pub fn discover() -> CoreResult<SteamPaths> {
        Self::discover_from_registry()
            .or_else(|_| Self::discover_from_default())
    }

    fn discover_from_registry() -> CoreResult<SteamPaths> {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let steam_key = hklm
            .open_subkey(Self::STEAM_REG_PATH)
            .map_err(|_| CoreError::SteamNotFound)?;

        let install_path: String = steam_key
            .get_value("InstallPath")
            .map_err(|e| CoreError::RegistryError(format!("Failed to read InstallPath: {}", e)))?;

        Self::validate_and_build_paths(install_path)
    }

    fn discover_from_default() -> CoreResult<SteamPaths> {
        Self::validate_and_build_paths(Self::STEAM_DEFAULT_WIN.to_string())
    }

    fn validate_and_build_paths(root_str: String) -> CoreResult<SteamPaths> {
        let root = PathBuf::from(&root_str);

        if !root.exists() {
            return Err(CoreError::InvalidPath(format!(
                "Steam path does not exist: {}",
                root_str
            )));
        }

        let userdata = root.join("userdata");
        let libraryfolders = root.join("steamapps").join("libraryfolders.vdf");
        let config = root.join("config").join("loginusers.vdf");

        if !userdata.exists() {
            return Err(CoreError::InvalidPath(
                "userdata directory not found".to_string(),
            ));
        }

        Ok(SteamPaths {
            root,
            userdata,
            libraryfolders,
            config,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_paths_fails_on_missing_root() {
        let result = SteamPathDiscovery::validate_and_build_paths(
            "C:\\NonExistent\\Steam".to_string()
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_valid_paths_builds_correctly() {
        if let Ok(paths) = SteamPathDiscovery::discover() {
            assert!(paths.root.exists());
            assert!(paths.userdata.exists());
        }
    }
}
