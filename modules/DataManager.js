/**
 * DataManager - Centralized state management replacing 33 global variables
 */
class DataManager {
  constructor(storage, logger = null) {
    this.storage = storage;
    this.logger = logger;

    // Inventory data
    this.inventoryData = {};
    this.lastMarketPrices = null;

    // UI state
    this.currentTab = 'inventory';
    this.currentSort = 'price';
    this.searchQuery = '';
    this.minProfitFilter = 0.5;
    this.onlyProfit = false;
    this.groupMode = 'none';
    this.collapsedGroups = {};

    // Scan state
    this.isScanning = false;
    this.nextScanTime = Date.now() + 300000;
    this.lastScanCompletedAt = null;

    // User settings
    this.currentSteamId = '76561198801899255';
    this.isIncognito = false;
    this.onboardingStep = 0;

    // Item tracking
    this.historyItems = [];
    this.profitHistory = [];
    this.priceHistory = {};
    this.newItemNames = new Set();
    this.missingNames = new Set();

    // Alerts & monitoring
    this.alerts = [];
    this.priceAlerts = [];
    this.marketInsights = [];
    this.watchlist = [];
    this.currentDetailItem = null;

    // Price queue
    this.priceQueue = [];
    this.priceQueueSet = new Set();
    this.priceWorkerActive = false;
    this.steamRateLimitedUntil = 0;

    // Price alerts settings
    this.alertProfitThreshold = 2;
    this.alertUpPercent = 5;
    this.alertDownPercent = 5;

    // Action lists
    this.actionSellList = [];
    this.actionBuyList = [];

    // AI settings
    this.aiMinScore = -10;
    this.aiPositiveTrendOnly = false;
    this.aiSort = 'score';
  }

  // ========== Inventory Management ==========

  getInventory() {
    return this.inventoryData;
  }

  setInventory(data) {
    this.inventoryData = data;
  }

  getInventoryItem(hashName) {
    return this.inventoryData[hashName] || null;
  }

  updateInventoryItem(hashName, updates) {
    if (!this.inventoryData[hashName]) {
      this.log('warn', 'Attempting to update non-existent item', { hashName });
      return false;
    }
    this.inventoryData[hashName] = {
      ...this.inventoryData[hashName],
      ...updates
    };
    return true;
  }

  // ========== History Management ==========

  getHistory() {
    return this.historyItems;
  }

  addHistoryItem(item) {
    this.historyItems.unshift({
      id: `${Date.now()}-${item.name}`,
      ...item,
      timestamp: new Date().toLocaleString()
    });
    // Keep only last 200
    if (this.historyItems.length > 200) {
      this.historyItems = this.historyItems.slice(0, 200);
    }
  }

  clearHistory() {
    this.historyItems = [];
  }

  // ========== Profit History ==========

  getProfitHistory() {
    return this.profitHistory;
  }

  addProfitEntry(totalProfit) {
    this.profitHistory.push({
      ts: Date.now(),
      totalProfit
    });
    // Keep only last 50
    if (this.profitHistory.length > 50) {
      this.profitHistory = this.profitHistory.slice(-50);
    }
  }

  clearProfitHistory() {
    this.profitHistory = [];
  }

  // ========== Price History ==========

  getPriceHistory() {
    return this.priceHistory;
  }

  getPriceHistoryForItem(hashName) {
    return this.priceHistory[hashName] || [];
  }

  addPriceHistoryEntry(hashName, priceData) {
    if (!this.priceHistory[hashName]) {
      this.priceHistory[hashName] = [];
    }
    this.priceHistory[hashName].push({
      ts: Date.now(),
      ...priceData
    });
    // Keep only last 200 entries per item
    if (this.priceHistory[hashName].length > 200) {
      this.priceHistory[hashName] = this.priceHistory[hashName].slice(-200);
    }
  }

  setPriceHistory(history) {
    this.priceHistory = history;
  }

  // ========== Alerts ==========

  getAlerts() {
    return this.alerts;
  }

  addAlert(alert) {
    this.alerts.unshift({
      id: `${Date.now()}-${alert.name}`,
      ...alert,
      timestamp: new Date().toLocaleString()
    });
    if (this.alerts.length > 200) {
      this.alerts = this.alerts.slice(0, 200);
    }
  }

  clearAlerts() {
    this.alerts = [];
  }

  // ========== Price Alerts ==========

  getPriceAlerts() {
    return this.priceAlerts;
  }

  addPriceAlert(alert) {
    this.priceAlerts.unshift({
      id: `${Date.now()}-${alert.name}-${alert.message}`,
      ...alert
    });
    if (this.priceAlerts.length > 200) {
      this.priceAlerts = this.priceAlerts.slice(0, 200);
    }
  }

  clearPriceAlerts() {
    this.priceAlerts = [];
  }

  // ========== Watchlist ==========

  getWatchlist() {
    return this.watchlist;
  }

  isWatched(hashName) {
    return this.watchlist.includes(hashName);
  }

  toggleWatch(hashName) {
    if (this.isWatched(hashName)) {
      this.watchlist = this.watchlist.filter(item => item !== hashName);
      return false;
    } else {
      this.watchlist.push(hashName);
      return true;
    }
  }

  addToWatchlist(hashName) {
    if (!this.isWatched(hashName)) {
      this.watchlist.push(hashName);
    }
  }

  removeFromWatchlist(hashName) {
    this.watchlist = this.watchlist.filter(item => item !== hashName);
  }

  clearWatchlist() {
    this.watchlist = [];
  }

  // ========== Market Insights ==========

  getMarketInsights() {
    return this.marketInsights;
  }

  setMarketInsights(insights) {
    this.marketInsights = insights.slice(0, 200);
  }

  setLastMarketPrices(prices) {
    this.lastMarketPrices = prices;
  }

  getLastMarketPrices() {
    return this.lastMarketPrices;
  }

  // ========== Action Lists ==========

  getActionSellList() {
    return this.actionSellList;
  }

  getActionBuyList() {
    return this.actionBuyList;
  }

  addToActionSell(hashName) {
    if (!this.actionSellList.includes(hashName)) {
      this.actionSellList.push(hashName);
    }
  }

  addToActionBuy(hashName) {
    if (!this.actionBuyList.includes(hashName)) {
      this.actionBuyList.push(hashName);
    }
  }

  removeFromActionSell(hashName) {
    this.actionSellList = this.actionSellList.filter(item => item !== hashName);
  }

  removeFromActionBuy(hashName) {
    this.actionBuyList = this.actionBuyList.filter(item => item !== hashName);
  }

  clearActionLists() {
    this.actionSellList = [];
    this.actionBuyList = [];
  }

  // ========== UI State ==========

  getCurrentTab() {
    return this.currentTab;
  }

  setCurrentTab(tab) {
    this.currentTab = tab;
  }

  getCurrentSort() {
    return this.currentSort;
  }

  setCurrentSort(sort) {
    this.currentSort = sort;
  }

  getSearchQuery() {
    return this.searchQuery;
  }

  setSearchQuery(query) {
    this.searchQuery = query;
  }

  getMinProfitFilter() {
    return this.minProfitFilter;
  }

  setMinProfitFilter(value) {
    this.minProfitFilter = value;
  }

  getOnlyProfit() {
    return this.onlyProfit;
  }

  setOnlyProfit(value) {
    this.onlyProfit = value;
  }

  getGroupMode() {
    return this.groupMode;
  }

  setGroupMode(mode) {
    this.groupMode = mode;
  }

  getCollapsedGroups() {
    return this.collapsedGroups;
  }

  toggleGroupCollapsed(groupName) {
    this.collapsedGroups[groupName] = !this.collapsedGroups[groupName];
  }

  setCollapsedGroups(groups) {
    this.collapsedGroups = groups;
  }

  // ========== Scan State ==========

  getIsScanning() {
    return this.isScanning;
  }

  setIsScanning(value) {
    this.isScanning = value;
  }

  getNextScanTime() {
    return this.nextScanTime;
  }

  setNextScanTime(time) {
    this.nextScanTime = time;
  }

  getLastScanCompletedAt() {
    return this.lastScanCompletedAt;
  }

  setLastScanCompletedAt(time) {
    this.lastScanCompletedAt = time;
  }

  // ========== User Settings ==========

  getCurrentSteamId() {
    return this.currentSteamId;
  }

  setCurrentSteamId(steamId) {
    this.currentSteamId = steamId;
  }

  getIsIncognito() {
    return this.isIncognito;
  }

  setIsIncognito(value) {
    this.isIncognito = value;
  }

  getOnboardingStep() {
    return this.onboardingStep;
  }

  setOnboardingStep(step) {
    this.onboardingStep = step;
  }

  // ========== Detail Drawer ==========

  getCurrentDetailItem() {
    return this.currentDetailItem;
  }

  setCurrentDetailItem(hashName) {
    this.currentDetailItem = hashName;
  }

  // ========== Item Tracking ==========

  getNewItemNames() {
    return this.newItemNames;
  }

  setNewItemNames(names) {
    this.newItemNames = names instanceof Set ? names : new Set(names);
  }

  getMissingNames() {
    return this.missingNames;
  }

  setMissingNames(names) {
    this.missingNames = names instanceof Set ? names : new Set(names);
  }

  // ========== Price Queue ==========

  getPriceQueue() {
    return this.priceQueue;
  }

  enqueuePrice(hashName) {
    if (!this.priceQueueSet.has(hashName)) {
      this.priceQueue.push(hashName);
      this.priceQueueSet.add(hashName);
    }
  }

  dequeuePrices(count) {
    const batch = this.priceQueue.splice(0, count);
    batch.forEach(name => this.priceQueueSet.delete(name));
    return batch;
  }

  clearPriceQueue() {
    this.priceQueue = [];
    this.priceQueueSet.clear();
  }

  getPriceQueueSize() {
    return this.priceQueue.length;
  }

  // ========== Price Worker State ==========

  getIsPriceWorkerActive() {
    return this.priceWorkerActive;
  }

  setIsPriceWorkerActive(value) {
    this.priceWorkerActive = value;
  }

  getIsSteamRateLimited() {
    return Date.now() < this.steamRateLimitedUntil;
  }

  setSteamRateLimited(minutes = 2) {
    this.steamRateLimitedUntil = Date.now() + minutes * 60 * 1000;
  }

  // ========== Alert Settings ==========

  getAlertSettings() {
    return {
      alertProfitThreshold: this.alertProfitThreshold,
      alertUpPercent: this.alertUpPercent,
      alertDownPercent: this.alertDownPercent
    };
  }

  setAlertSettings(settings) {
    if (settings.alertProfitThreshold !== undefined) {
      this.alertProfitThreshold = settings.alertProfitThreshold;
    }
    if (settings.alertUpPercent !== undefined) {
      this.alertUpPercent = settings.alertUpPercent;
    }
    if (settings.alertDownPercent !== undefined) {
      this.alertDownPercent = settings.alertDownPercent;
    }
  }

  // ========== AI Settings ==========

  getAISettings() {
    return {
      aiMinScore: this.aiMinScore,
      aiPositiveTrendOnly: this.aiPositiveTrendOnly,
      aiSort: this.aiSort
    };
  }

  setAISettings(settings) {
    if (settings.aiMinScore !== undefined) {
      this.aiMinScore = settings.aiMinScore;
    }
    if (settings.aiPositiveTrendOnly !== undefined) {
      this.aiPositiveTrendOnly = settings.aiPositiveTrendOnly;
    }
    if (settings.aiSort !== undefined) {
      this.aiSort = settings.aiSort;
    }
  }

  // ========== Utility ==========

  /**
   * Get all state as object (for debugging)
   */
  getAllState() {
    return {
      inventoryData: this.inventoryData,
      lastMarketPrices: this.lastMarketPrices,
      currentTab: this.currentTab,
      currentSort: this.currentSort,
      searchQuery: this.searchQuery,
      minProfitFilter: this.minProfitFilter,
      onlyProfit: this.onlyProfit,
      groupMode: this.groupMode,
      collapsedGroups: this.collapsedGroups,
      isScanning: this.isScanning,
      nextScanTime: this.nextScanTime,
      lastScanCompletedAt: this.lastScanCompletedAt,
      currentSteamId: this.currentSteamId,
      isIncognito: this.isIncognito,
      onboardingStep: this.onboardingStep,
      historyItemsCount: this.historyItems.length,
      profitHistoryCount: this.profitHistory.length,
      priceHistoryItems: Object.keys(this.priceHistory).length,
      alertsCount: this.alerts.length,
      priceAlertsCount: this.priceAlerts.length,
      watchlistCount: this.watchlist.length,
      priceQueueSize: this.priceQueue.length,
      priceWorkerActive: this.priceWorkerActive,
      steamRateLimitedUntil: this.steamRateLimitedUntil
    };
  }

  /**
   * Reset all state to defaults
   */
  reset() {
    this.inventoryData = {};
    this.lastMarketPrices = null;
    this.currentTab = 'inventory';
    this.currentSort = 'price';
    this.searchQuery = '';
    this.minProfitFilter = 0.5;
    this.onlyProfit = false;
    this.groupMode = 'none';
    this.collapsedGroups = {};
    this.isScanning = false;
    this.nextScanTime = Date.now() + 300000;
    this.lastScanCompletedAt = null;
    this.historyItems = [];
    this.profitHistory = [];
    this.priceHistory = {};
    this.newItemNames = new Set();
    this.missingNames = new Set();
    this.alerts = [];
    this.priceAlerts = [];
    this.marketInsights = [];
    this.watchlist = [];
    this.currentDetailItem = null;
    this.priceQueue = [];
    this.priceQueueSet.clear();
    this.priceWorkerActive = false;
    this.steamRateLimitedUntil = 0;
    this.actionSellList = [];
    this.actionBuyList = [];
  }

  // ========== Persistence ==========

  /**
   * Load all persisted data from storage
   */
  loadFromStorage() {
    const keys = {
      steamId: 'steam_id',
      history: 'inventory_history',
      profitHistory: 'profit_history',
      priceHistory: 'price_history',
      alerts: 'inventory_alerts',
      priceAlerts: 'price_alerts',
      watchlist: 'watchlist_items',
      marketInsights: 'market_insights',
      incognito: 'incognito_mode',
      groupMode: 'group_mode',
      collapsedGroups: 'group_collapsed',
      actionSell: 'action_sell',
      actionBuy: 'action_buy',
      alertSettings: 'alert_settings',
      aiSettings: 'ai_settings',
      inventorySnapshot: 'inventory_snapshot'
    };

    this.currentSteamId = this.storage.load(keys.steamId, this.currentSteamId);
    this.historyItems = this.storage.load(keys.history, []);
    this.profitHistory = this.storage.load(keys.profitHistory, []);
    this.priceHistory = this.storage.load(keys.priceHistory, {});
    this.alerts = this.storage.load(keys.alerts, []);
    this.priceAlerts = this.storage.load(keys.priceAlerts, []);
    this.watchlist = this.storage.load(keys.watchlist, []);
    this.marketInsights = this.storage.load(keys.marketInsights, []);
    this.isIncognito = this.storage.load(keys.incognito, false);
    this.groupMode = this.storage.load(keys.groupMode, 'none');
    this.collapsedGroups = this.storage.load(keys.collapsedGroups, {});
    this.actionSellList = this.storage.load(keys.actionSell, []);
    this.actionBuyList = this.storage.load(keys.actionBuy, []);
    
    const alertSettings = this.storage.load(keys.alertSettings, {});
    if (alertSettings.alertProfitThreshold !== undefined) {
      this.alertProfitThreshold = alertSettings.alertProfitThreshold;
    }
    if (alertSettings.alertUpPercent !== undefined) {
      this.alertUpPercent = alertSettings.alertUpPercent;
    }
    if (alertSettings.alertDownPercent !== undefined) {
      this.alertDownPercent = alertSettings.alertDownPercent;
    }

    const aiSettings = this.storage.load(keys.aiSettings, {});
    if (aiSettings.aiMinScore !== undefined) {
      this.aiMinScore = aiSettings.aiMinScore;
    }
    if (aiSettings.aiPositiveTrendOnly !== undefined) {
      this.aiPositiveTrendOnly = aiSettings.aiPositiveTrendOnly;
    }
    if (aiSettings.aiSort !== undefined) {
      this.aiSort = aiSettings.aiSort;
    }

    const inventorySnapshot = this.storage.load(keys.inventorySnapshot, null);
    if (inventorySnapshot && inventorySnapshot.data) {
      this.inventoryData = inventorySnapshot.data;
    }

    this.log('info', 'Loaded all persisted data from storage');
  }

  /**
   * Save all state to storage
   */
  saveToStorage() {
    const keys = {
      steamId: 'steam_id',
      history: 'inventory_history',
      profitHistory: 'profit_history',
      priceHistory: 'price_history',
      alerts: 'inventory_alerts',
      priceAlerts: 'price_alerts',
      watchlist: 'watchlist_items',
      marketInsights: 'market_insights',
      incognito: 'incognito_mode',
      groupMode: 'group_mode',
      collapsedGroups: 'group_collapsed',
      actionSell: 'action_sell',
      actionBuy: 'action_buy',
      alertSettings: 'alert_settings',
      aiSettings: 'ai_settings',
      inventorySnapshot: 'inventory_snapshot'
    };

    this.storage.save(keys.steamId, this.currentSteamId);
    this.storage.save(keys.history, this.historyItems.slice(0, 200));
    this.storage.save(keys.profitHistory, this.profitHistory.slice(-50));
    this.storage.save(keys.priceHistory, this.priceHistory);
    this.storage.save(keys.alerts, this.alerts.slice(0, 200));
    this.storage.save(keys.priceAlerts, this.priceAlerts.slice(0, 200));
    this.storage.save(keys.watchlist, this.watchlist);
    this.storage.save(keys.marketInsights, this.marketInsights.slice(0, 200));
    this.storage.save(keys.incognito, this.isIncognito);
    this.storage.save(keys.groupMode, this.groupMode);
    this.storage.save(keys.collapsedGroups, this.collapsedGroups);
    this.storage.save(keys.actionSell, this.actionSellList);
    this.storage.save(keys.actionBuy, this.actionBuyList);
    this.storage.save(keys.alertSettings, this.getAlertSettings());
    this.storage.save(keys.aiSettings, this.getAISettings());
    this.storage.save(keys.inventorySnapshot, {
      timestamp: Date.now(),
      data: this.inventoryData
    });
  }

  /**
   * Clear all persisted data
   */
  clearStorage() {
    this.storage.clear();
    this.reset();
    this.log('info', 'Cleared all storage');
  }

  /**
   * Internal logging
   * @private
   */
  log(level, message, context = {}) {
    if (this.logger) {
      this.logger[level](message, context);
    } else {
      console[level === 'error' ? 'error' : 'log'](message, context);
    }
  }
}

export default DataManager;
