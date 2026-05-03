import DataManager from '../modules/DataManager.js';
import Logger from '../modules/Logger.js';

describe('DataManager', () => {
  let manager;
  let mockStorage;
  let mockLogger;

  beforeEach(() => {
    mockStorage = {
      load: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    };
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    manager = new DataManager(mockStorage, mockLogger);
  });

  describe('Inventory Management', () => {
    test('should get empty inventory by default', () => {
      expect(manager.getInventory()).toEqual({});
    });

    test('should set inventory data', () => {
      const inventory = {
        'Item A': { name: 'Item A', price: 10 },
        'Item B': { name: 'Item B', price: 20 }
      };
      manager.setInventory(inventory);
      expect(manager.getInventory()).toEqual(inventory);
    });

    test('should get specific inventory item', () => {
      const item = { name: 'Item A', price: 10 };
      manager.setInventory({ 'Item A': item });
      expect(manager.getInventoryItem('Item A')).toEqual(item);
    });

    test('should return null for non-existent item', () => {
      expect(manager.getInventoryItem('NonExistent')).toBeNull();
    });

    test('should update inventory item', () => {
      manager.setInventory({
        'Item A': { name: 'Item A', price: 10, count: 1 }
      });
      manager.updateInventoryItem('Item A', { price: 15, count: 2 });
      const item = manager.getInventoryItem('Item A');
      expect(item.price).toBe(15);
      expect(item.count).toBe(2);
      expect(item.name).toBe('Item A');
    });

    test('should warn when updating non-existent item', () => {
      manager.updateInventoryItem('NonExistent', { price: 10 });
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('History Management', () => {
    test('should get empty history by default', () => {
      expect(manager.getHistory()).toEqual([]);
    });

    test('should add history item', () => {
      manager.addHistoryItem({ name: 'Item A', count: 1 });
      const history = manager.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].name).toBe('Item A');
    });

    test('should prepend new items (LIFO)', () => {
      manager.addHistoryItem({ name: 'Item A', count: 1 });
      manager.addHistoryItem({ name: 'Item B', count: 2 });
      const history = manager.getHistory();
      expect(history[0].name).toBe('Item B');
      expect(history[1].name).toBe('Item A');
    });

    test('should limit history to 200 items', () => {
      for (let i = 0; i < 250; i++) {
        manager.addHistoryItem({ name: `Item ${i}`, count: 1 });
      }
      expect(manager.getHistory().length).toBe(200);
    });

    test('should clear history', () => {
      manager.addHistoryItem({ name: 'Item A', count: 1 });
      manager.clearHistory();
      expect(manager.getHistory()).toEqual([]);
    });
  });

  describe('Profit History', () => {
    test('should get empty profit history by default', () => {
      expect(manager.getProfitHistory()).toEqual([]);
    });

    test('should add profit entry', () => {
      manager.addProfitEntry(100);
      const history = manager.getProfitHistory();
      expect(history.length).toBe(1);
      expect(history[0].totalProfit).toBe(100);
    });

    test('should limit profit history to 50 entries', () => {
      for (let i = 0; i < 60; i++) {
        manager.addProfitEntry(i * 10);
      }
      const history = manager.getProfitHistory();
      expect(history.length).toBe(50);
      // Should keep the last 50
      expect(history[0].totalProfit).toBe(100);
      expect(history[49].totalProfit).toBe(590);
    });

    test('should clear profit history', () => {
      manager.addProfitEntry(100);
      manager.clearProfitHistory();
      expect(manager.getProfitHistory()).toEqual([]);
    });
  });

  describe('Price History', () => {
    test('should get empty price history by default', () => {
      expect(manager.getPriceHistory()).toEqual({});
    });

    test('should add price history entry for item', () => {
      manager.addPriceHistoryEntry('Item A', { sPrice: 10, mPrice: 8 });
      const history = manager.getPriceHistoryForItem('Item A');
      expect(history.length).toBe(1);
      expect(history[0].sPrice).toBe(10);
    });

    test('should limit price history to 200 per item', () => {
      for (let i = 0; i < 250; i++) {
        manager.addPriceHistoryEntry('Item A', { sPrice: i, mPrice: i - 1 });
      }
      const history = manager.getPriceHistoryForItem('Item A');
      expect(history.length).toBe(200);
    });

    test('should set entire price history', () => {
      const history = {
        'Item A': [{ ts: 100, sPrice: 10, mPrice: 8 }],
        'Item B': [{ ts: 200, sPrice: 20, mPrice: 18 }]
      };
      manager.setPriceHistory(history);
      expect(manager.getPriceHistory()).toEqual(history);
    });
  });

  describe('Alerts', () => {
    test('should get empty alerts by default', () => {
      expect(manager.getAlerts()).toEqual([]);
    });

    test('should add alert', () => {
      manager.addAlert({ name: 'Item A', count: 1 });
      const alerts = manager.getAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].name).toBe('Item A');
    });

    test('should limit alerts to 200', () => {
      for (let i = 0; i < 250; i++) {
        manager.addAlert({ name: `Item ${i}`, count: 1 });
      }
      expect(manager.getAlerts().length).toBe(200);
    });

    test('should clear alerts', () => {
      manager.addAlert({ name: 'Item A', count: 1 });
      manager.clearAlerts();
      expect(manager.getAlerts()).toEqual([]);
    });
  });

  describe('Price Alerts', () => {
    test('should get empty price alerts by default', () => {
      expect(manager.getPriceAlerts()).toEqual([]);
    });

    test('should add price alert', () => {
      manager.addPriceAlert({ name: 'Item A', message: 'Price up', value: '+10%' });
      const alerts = manager.getPriceAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].message).toBe('Price up');
    });

    test('should limit price alerts to 200', () => {
      for (let i = 0; i < 250; i++) {
        manager.addPriceAlert({ name: `Item ${i}`, message: 'Alert', value: '0' });
      }
      expect(manager.getPriceAlerts().length).toBe(200);
    });

    test('should clear price alerts', () => {
      manager.addPriceAlert({ name: 'Item A', message: 'Alert', value: '0' });
      manager.clearPriceAlerts();
      expect(manager.getPriceAlerts()).toEqual([]);
    });
  });

  describe('Watchlist', () => {
    test('should get empty watchlist by default', () => {
      expect(manager.getWatchlist()).toEqual([]);
    });

    test('should check if item is watched', () => {
      manager.addToWatchlist('Item A');
      expect(manager.isWatched('Item A')).toBe(true);
      expect(manager.isWatched('Item B')).toBe(false);
    });

    test('should toggle watch status', () => {
      const result1 = manager.toggleWatch('Item A');
      expect(result1).toBe(true);
      expect(manager.isWatched('Item A')).toBe(true);

      const result2 = manager.toggleWatch('Item A');
      expect(result2).toBe(false);
      expect(manager.isWatched('Item A')).toBe(false);
    });

    test('should add to watchlist', () => {
      manager.addToWatchlist('Item A');
      manager.addToWatchlist('Item B');
      expect(manager.getWatchlist()).toEqual(['Item A', 'Item B']);
    });

    test('should not add duplicate to watchlist', () => {
      manager.addToWatchlist('Item A');
      manager.addToWatchlist('Item A');
      expect(manager.getWatchlist().length).toBe(1);
    });

    test('should remove from watchlist', () => {
      manager.addToWatchlist('Item A');
      manager.addToWatchlist('Item B');
      manager.removeFromWatchlist('Item A');
      expect(manager.getWatchlist()).toEqual(['Item B']);
    });

    test('should clear watchlist', () => {
      manager.addToWatchlist('Item A');
      manager.addToWatchlist('Item B');
      manager.clearWatchlist();
      expect(manager.getWatchlist()).toEqual([]);
    });
  });

  describe('Market Insights', () => {
    test('should get empty market insights by default', () => {
      expect(manager.getMarketInsights()).toEqual([]);
    });

    test('should set market insights', () => {
      const insights = [
        { name: 'Item A', spread: 5 },
        { name: 'Item B', spread: 3 }
      ];
      manager.setMarketInsights(insights);
      expect(manager.getMarketInsights()).toEqual(insights);
    });

    test('should limit market insights to 200', () => {
      const insights = Array.from({ length: 250 }, (_, i) => ({
        name: `Item ${i}`,
        spread: i
      }));
      manager.setMarketInsights(insights);
      expect(manager.getMarketInsights().length).toBe(200);
    });

    test('should set last market prices', () => {
      const prices = { 'Item A': 10, 'Item B': 20 };
      manager.setLastMarketPrices(prices);
      expect(manager.getLastMarketPrices()).toEqual(prices);
    });
  });

  describe('Action Lists', () => {
    test('should get empty action lists by default', () => {
      expect(manager.getActionSellList()).toEqual([]);
      expect(manager.getActionBuyList()).toEqual([]);
    });

    test('should add to action sell list', () => {
      manager.addToActionSell('Item A');
      manager.addToActionSell('Item B');
      expect(manager.getActionSellList()).toEqual(['Item A', 'Item B']);
    });

    test('should add to action buy list', () => {
      manager.addToActionBuy('Item A');
      expect(manager.getActionBuyList()).toEqual(['Item A']);
    });

    test('should not add duplicates to action lists', () => {
      manager.addToActionSell('Item A');
      manager.addToActionSell('Item A');
      expect(manager.getActionSellList().length).toBe(1);
    });

    test('should remove from action lists', () => {
      manager.addToActionSell('Item A');
      manager.addToActionSell('Item B');
      manager.removeFromActionSell('Item A');
      expect(manager.getActionSellList()).toEqual(['Item B']);
    });

    test('should clear action lists', () => {
      manager.addToActionSell('Item A');
      manager.addToActionBuy('Item B');
      manager.clearActionLists();
      expect(manager.getActionSellList()).toEqual([]);
      expect(manager.getActionBuyList()).toEqual([]);
    });
  });

  describe('UI State', () => {
    test('should get/set current tab', () => {
      manager.setCurrentTab('signals');
      expect(manager.getCurrentTab()).toBe('signals');
    });

    test('should get/set current sort', () => {
      manager.setCurrentSort('profit');
      expect(manager.getCurrentSort()).toBe('profit');
    });

    test('should get/set search query', () => {
      manager.setSearchQuery('AK-47');
      expect(manager.getSearchQuery()).toBe('AK-47');
    });

    test('should get/set min profit filter', () => {
      manager.setMinProfitFilter(1.5);
      expect(manager.getMinProfitFilter()).toBe(1.5);
    });

    test('should get/set only profit flag', () => {
      manager.setOnlyProfit(true);
      expect(manager.getOnlyProfit()).toBe(true);
    });

    test('should get/set group mode', () => {
      manager.setGroupMode('category');
      expect(manager.getGroupMode()).toBe('category');
    });

    test('should toggle group collapsed state', () => {
      manager.toggleGroupCollapsed('Weapons');
      const groups = manager.getCollapsedGroups();
      expect(groups['Weapons']).toBe(true);

      manager.toggleGroupCollapsed('Weapons');
      expect(manager.getCollapsedGroups()['Weapons']).toBe(false);
    });
  });

  describe('Scan State', () => {
    test('should get/set scanning flag', () => {
      manager.setIsScanning(true);
      expect(manager.getIsScanning()).toBe(true);
    });

    test('should get/set next scan time', () => {
      const time = Date.now() + 300000;
      manager.setNextScanTime(time);
      expect(manager.getNextScanTime()).toBe(time);
    });

    test('should get/set last scan completed time', () => {
      const time = Date.now();
      manager.setLastScanCompletedAt(time);
      expect(manager.getLastScanCompletedAt()).toBe(time);
    });
  });

  describe('Price Queue', () => {
    test('should enqueue price', () => {
      manager.enqueuePrice('Item A');
      expect(manager.getPriceQueueSize()).toBe(1);
    });

    test('should not enqueue duplicate', () => {
      manager.enqueuePrice('Item A');
      manager.enqueuePrice('Item A');
      expect(manager.getPriceQueueSize()).toBe(1);
    });

    test('should dequeue prices', () => {
      manager.enqueuePrice('Item A');
      manager.enqueuePrice('Item B');
      manager.enqueuePrice('Item C');

      const batch = manager.dequeuePrices(2);
      expect(batch).toEqual(['Item A', 'Item B']);
      expect(manager.getPriceQueueSize()).toBe(1);
    });

    test('should clear price queue', () => {
      manager.enqueuePrice('Item A');
      manager.enqueuePrice('Item B');
      manager.clearPriceQueue();
      expect(manager.getPriceQueueSize()).toBe(0);
    });
  });

  describe('Rate Limiting', () => {
    test('should not be rate limited by default', () => {
      expect(manager.getIsSteamRateLimited()).toBe(false);
    });

    test('should set rate limit', () => {
      manager.setSteamRateLimited(1);
      expect(manager.getIsSteamRateLimited()).toBe(true);
    });

    test('should expire rate limit', async () => {
      manager.setSteamRateLimited(0.01); // ~600ms
      expect(manager.getIsSteamRateLimited()).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 700));
      expect(manager.getIsSteamRateLimited()).toBe(false);
    });
  });

  describe('Alert Settings', () => {
    test('should get default alert settings', () => {
      const settings = manager.getAlertSettings();
      expect(settings.alertProfitThreshold).toBe(2);
      expect(settings.alertUpPercent).toBe(5);
      expect(settings.alertDownPercent).toBe(5);
    });

    test('should set alert settings', () => {
      manager.setAlertSettings({
        alertProfitThreshold: 5,
        alertUpPercent: 10,
        alertDownPercent: 8
      });
      const settings = manager.getAlertSettings();
      expect(settings.alertProfitThreshold).toBe(5);
      expect(settings.alertUpPercent).toBe(10);
      expect(settings.alertDownPercent).toBe(8);
    });

    test('should partially update alert settings', () => {
      manager.setAlertSettings({ alertProfitThreshold: 3 });
      const settings = manager.getAlertSettings();
      expect(settings.alertProfitThreshold).toBe(3);
      expect(settings.alertUpPercent).toBe(5); // Unchanged
    });
  });

  describe('AI Settings', () => {
    test('should get default AI settings', () => {
      const settings = manager.getAISettings();
      expect(settings.aiMinScore).toBe(-10);
      expect(settings.aiPositiveTrendOnly).toBe(false);
      expect(settings.aiSort).toBe('score');
    });

    test('should set AI settings', () => {
      manager.setAISettings({
        aiMinScore: 0,
        aiPositiveTrendOnly: true,
        aiSort: 'profit'
      });
      const settings = manager.getAISettings();
      expect(settings.aiMinScore).toBe(0);
      expect(settings.aiPositiveTrendOnly).toBe(true);
      expect(settings.aiSort).toBe('profit');
    });
  });

  describe('Reset', () => {
    test('should reset all state to defaults', () => {
      manager.setInventory({ 'Item A': { name: 'Item A' } });
      manager.addHistoryItem({ name: 'Item B', count: 1 });
      manager.setCurrentTab('signals');
      manager.setCurrentSteamId('12345678901234567');

      manager.reset();

      expect(manager.getInventory()).toEqual({});
      expect(manager.getHistory()).toEqual([]);
      expect(manager.getCurrentTab()).toBe('inventory');
      expect(manager.getCurrentSteamId()).toBe('76561198801899255');
    });
  });

  describe('getAllState', () => {
    test('should return complete state summary', () => {
      manager.addHistoryItem({ name: 'Item A', count: 1 });
      manager.addProfitEntry(100);
      manager.addToWatchlist('Item A');

      const state = manager.getAllState();
      expect(state.historyItemsCount).toBe(1);
      expect(state.profitHistoryCount).toBe(1);
      expect(state.watchlistCount).toBe(1);
    });
  });
});
