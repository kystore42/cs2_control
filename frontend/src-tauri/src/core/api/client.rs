use reqwest::{Client, StatusCode};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::env;
use crate::error::{CoreError, CoreResult};
use super::types::{
    BulkCreateAccountsRequest, BulkCreateAccountsResponse,
    ConfigSyncRequest, ConfigSyncResponse,
    RefreshTokenRequest, RefreshTokenResponse,
};

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

    pub async fn sync_config(
        &self,
        payload: ConfigSyncRequest,
    ) -> CoreResult<ConfigSyncResponse> {
        self.post("/api/v1/configs/sync", &payload).await
    }

    pub async fn refresh_access_token(&self, refresh_token: &str) -> CoreResult<String> {
        let payload = RefreshTokenRequest {
            refresh_token: refresh_token.to_string(),
        };
        let resp: RefreshTokenResponse = self.post("/api/v1/auth/refresh", &payload).await?;
        Ok(resp.access_token)
    }

    async fn post<B, R>(&self, path: &str, body: &B) -> CoreResult<R>
    where
        B: Serialize,
        R: DeserializeOwned,
    {
        self.request(reqwest::Method::POST, path, Some(body)).await
    }

    #[allow(dead_code)]
    async fn get<R>(&self, path: &str) -> CoreResult<R>
    where
        R: DeserializeOwned,
    {
        self.request::<(), R>(reqwest::Method::GET, path, None).await
    }

    async fn request<B, R>(&self, method: reqwest::Method, path: &str, body: Option<&B>) -> CoreResult<R>
    where
        B: Serialize,
        R: DeserializeOwned,
    {
        let url = format!("{}{}", self.base_url, path);
        let mut builder = self.http.request(method, &url);

        if let Some(token) = &self.access_token {
            builder = builder.header("Authorization", format!("Bearer {}", token));
        }

        if let Some(b) = body {
            builder = builder.json(b);
        }

        let resp = builder.send().await.map_err(|e| {
            CoreError::SyncError(format!("HTTP request failed: {}", e))
        })?;

        let status = resp.status();
        let text = resp.text().await.map_err(|e| {
            CoreError::SyncError(format!("Failed to read response body: {}", e))
        })?;

        if status == StatusCode::UNAUTHORIZED {
            return Err(CoreError::Unauthorized);
        }

        if !status.is_success() {
            return Err(CoreError::SyncError(format!(
                "API returned {}: {}",
                status, text
            )));
        }

        serde_json::from_str::<R>(&text).map_err(|e| {
            CoreError::SyncError(format!("Failed to deserialize response: {}", e))
        })
    }
}
