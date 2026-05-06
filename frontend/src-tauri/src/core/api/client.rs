use reqwest::{Client, StatusCode};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::env;
use crate::error::{CoreError, CoreResult};
use super::types::{BulkCreateAccountsRequest, BulkCreateAccountsResponse};

pub struct ApiClient {
    http: Client,
    base_url: String,
    access_token: Option<String>,
}

impl ApiClient {
    pub fn new(access_token: Option<String>) -> Self {
        let base_url = env::var("CS2_API_URL")
            .unwrap_or_else(|_| "http://localhost:8080".to_string());

        Self {
            http: Client::new(),
            base_url,
            access_token,
        }
    }

    pub async fn bulk_create_accounts(
        &self,
        payload: BulkCreateAccountsRequest,
    ) -> CoreResult<BulkCreateAccountsResponse> {
        self.post("/api/v1/accounts/bulk", &payload).await
    }

    async fn post<B, R>(&self, path: &str, body: &B) -> CoreResult<R>
    where
        B: Serialize,
        R: DeserializeOwned,
    {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self.http.post(&url).json(body);

        if let Some(token) = &self.access_token {
            req = req.header("Authorization", format!("Bearer {}", token));
        }

        let resp = req.send().await.map_err(|e| {
            CoreError::SyncError(format!("HTTP request failed: {}", e))
        })?;

        let status = resp.status();
        let text = resp.text().await.map_err(|e| {
            CoreError::SyncError(format!("Failed to read response body: {}", e))
        })?;

        if !status.is_success() {
            return Err(CoreError::SyncError(format!(
                "API returned {}: {}",
                status, text
            )));
        }

        if status == StatusCode::NO_CONTENT || text.is_empty() {
            return Err(CoreError::SyncError(
                "Expected JSON body but got empty response".to_string(),
            ));
        }

        serde_json::from_str::<R>(&text).map_err(|e| {
            CoreError::SyncError(format!("Failed to deserialize response: {}", e))
        })
    }
}
