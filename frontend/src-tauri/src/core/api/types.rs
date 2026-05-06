use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiUser {
    pub id: String,
    pub email: String,
    pub full_name: String,
    pub subscription_tier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub user: ApiUser,
    pub access_token: String,
    pub refresh_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateAccountPayload {
    pub steam_id: u64,
    pub account_name: String,
    pub persona_name: String,
    pub is_primary: bool,
    pub local_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulkCreateAccountsRequest {
    pub accounts: Vec<CreateAccountPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulkCreateAccountsResponse {
    pub created: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiError {
    pub message: String,
}
