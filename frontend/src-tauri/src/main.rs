use cs2_core::core::AccountDetector;

fn main() {
    env_logger::init();

    println!("CS2 Control - Core Service");
    println!("Detecting Steam accounts...\n");

    match AccountDetector::detect_all_accounts() {
        result if result.success => {
            println!("✓ Found {} Steam accounts", result.total_found);
            for account in &result.accounts {
                println!(
                    "  - {} (ID: {}) - CS2: {}",
                    account.persona_name,
                    account.account_id,
                    if account.is_installed_cs2 { "✓" } else { "✗" }
                );
            }
        }
        result => {
            eprintln!("✗ Detection failed: {}", result.error_message.unwrap_or_default());
        }
    }
}
