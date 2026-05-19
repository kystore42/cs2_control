use std::time::Duration;
use serde::{Deserialize, Serialize};
use super::steam::SteamMarketClient;

const REQUEST_DELAY_MS: u64 = 1500;
const PROFIT_MARGIN_THRESHOLD: f64 = 0.15;
const MIN_VOLUME: u32 = 5;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValuedItem {
    pub hash_name: String,
    pub lowest_price: Option<f64>,
    pub median_price: Option<f64>,
    pub volume: Option<u32>,
    pub profit_margin: Option<f64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryValuation {
    pub items: Vec<ValuedItem>,
    pub profitable: Vec<ValuedItem>,
    pub total_value: f64,
    pub item_count: usize,
    pub priced_count: usize,
}

pub async fn valuate_inventory(hash_names: Vec<String>) -> InventoryValuation {
    let client = SteamMarketClient::new();
    let mut items: Vec<ValuedItem> = Vec::with_capacity(hash_names.len());
    let mut total_value = 0.0;
    let mut priced_count = 0;

    for (idx, hash_name) in hash_names.iter().enumerate() {
        if idx > 0 {
            tokio::time::sleep(Duration::from_millis(REQUEST_DELAY_MS)).await;
        }

        match client.fetch_price(hash_name).await {
            Ok(price) => {
                let margin = match (price.lowest_price, price.median_price) {
                    (Some(low), Some(med)) if low > 0.0 => Some((med - low) / low),
                    _ => None,
                };
                if let Some(low) = price.lowest_price {
                    total_value += low;
                    priced_count += 1;
                }
                items.push(ValuedItem {
                    hash_name: hash_name.clone(),
                    lowest_price: price.lowest_price,
                    median_price: price.median_price,
                    volume: price.volume,
                    profit_margin: margin,
                    error: None,
                });
            }
            Err(e) => items.push(ValuedItem {
                hash_name: hash_name.clone(),
                lowest_price: None,
                median_price: None,
                volume: None,
                profit_margin: None,
                error: Some(e.to_string()),
            }),
        }
    }

    let mut profitable: Vec<ValuedItem> = items
        .iter()
        .filter(|i| {
            i.profit_margin.map(|m| m >= PROFIT_MARGIN_THRESHOLD).unwrap_or(false)
                && i.volume.map(|v| v >= MIN_VOLUME).unwrap_or(false)
        })
        .cloned()
        .collect();
    profitable.sort_by(|a, b| {
        b.profit_margin
            .unwrap_or(0.0)
            .partial_cmp(&a.profit_margin.unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let item_count = items.len();
    InventoryValuation {
        items,
        profitable,
        total_value,
        item_count,
        priced_count,
    }
}
