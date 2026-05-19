use std::time::Duration;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use crate::error::{CoreError, CoreResult};

const PRICEOVERVIEW_URL: &str = "https://steamcommunity.com/market/priceoverview/";
const CS2_APP_ID: &str = "730";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemPrice {
    pub hash_name: String,
    pub lowest_price: Option<f64>,
    pub median_price: Option<f64>,
    pub volume: Option<u32>,
    pub currency: String,
}

#[derive(Debug, Deserialize)]
struct PriceOverviewResponse {
    success: bool,
    lowest_price: Option<String>,
    median_price: Option<String>,
    volume: Option<String>,
}

pub struct SteamMarketClient {
    http: Client,
    currency: u32,
}

impl SteamMarketClient {
    pub fn new() -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("cs2-control/0.1")
            .build()
            .unwrap_or_else(|_| Client::new());
        Self { http, currency: 1 }
    }

    pub async fn fetch_price(&self, hash_name: &str) -> CoreResult<ItemPrice> {
        let resp = self
            .http
            .get(PRICEOVERVIEW_URL)
            .query(&[
                ("appid", CS2_APP_ID),
                ("currency", &self.currency.to_string()),
                ("market_hash_name", hash_name),
            ])
            .send()
            .await
            .map_err(|e| CoreError::SyncError(format!("Steam request failed: {}", e)))?;

        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(CoreError::SyncError("Steam rate limit reached".into()));
        }

        let body: PriceOverviewResponse = resp
            .json()
            .await
            .map_err(|e| CoreError::SyncError(format!("Bad Steam response: {}", e)))?;

        if !body.success {
            return Err(CoreError::SyncError(format!(
                "No market data for '{}'",
                hash_name
            )));
        }

        Ok(ItemPrice {
            hash_name: hash_name.to_string(),
            lowest_price: body.lowest_price.as_deref().and_then(parse_money),
            median_price: body.median_price.as_deref().and_then(parse_money),
            volume: body
                .volume
                .as_deref()
                .map(|v| v.replace(',', ""))
                .and_then(|v| v.parse().ok()),
            currency: "USD".to_string(),
        })
    }
}

impl Default for SteamMarketClient {
    fn default() -> Self {
        Self::new()
    }
}

fn parse_money(raw: &str) -> Option<f64> {
    let cleaned: String = raw
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == ',')
        .collect();
    let normalized = cleaned.replace(',', "");
    normalized.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_money() {
        assert_eq!(parse_money("$1.50"), Some(1.50));
        assert_eq!(parse_money("$1,234.56"), Some(1234.56));
        assert_eq!(parse_money("12,99 zł"), Some(1299.0));
        assert_eq!(parse_money("abc"), None);
    }
}
