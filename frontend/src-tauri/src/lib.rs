pub mod core;
pub mod error;
pub mod commands;

pub use core::{AccountDetector, AccountDetectionResult, SteamPathDiscovery, SyncEngine, TokenState};
pub use error::{CoreError, CoreResult};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::accounts::detect_steam_accounts,
            commands::accounts::get_account_inventory,
            commands::accounts::valuate_account_inventory,
            commands::auth::login,
            commands::auth::register,
            commands::auth::valuate_hash_names,
            commands::cloud::add_steam_account,
            commands::cloud::list_cloud_accounts,
            commands::sync::sync_accounts_to_cloud,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CS2 Control");
}
