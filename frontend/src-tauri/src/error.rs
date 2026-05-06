use thiserror::Error;

#[derive(Error, Debug)]
pub enum CoreError {
    #[error("Steam installation not found")]
    SteamNotFound,

    #[error("Registry access failed: {0}")]
    RegistryError(String),

    #[error("Invalid Steam path: {0}")]
    InvalidPath(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("Inventory not found for account {0}")]
    InventoryNotFound(u32),

    #[error("Account not detected")]
    AccountDetectionFailed,

    #[error("Invalid account ID: {0}")]
    InvalidAccountId(String),

    #[error("Sync failed: {0}")]
    SyncError(String),

    #[error("Unauthorized: token expired or invalid")]
    Unauthorized,

    #[error("File watcher error: {0}")]
    WatcherError(String),

    #[error("Config error: {0}")]
    ConfigError(String),
}

impl From<notify::Error> for CoreError {
    fn from(e: notify::Error) -> Self {
        CoreError::WatcherError(e.to_string())
    }
}

pub type CoreResult<T> = Result<T, CoreError>;
