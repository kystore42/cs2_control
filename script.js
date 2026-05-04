import axios from 'axios';
import DataManager from './modules/DataManager.js';
import StorageManager from './modules/StorageManager.js';
import Logger from './modules/Logger.js';

// --- CONSTANTS ---
const DEFAULT_STEAM_ID = '76561198801899255';
const SCAN_INTERVAL = 300000; // 5 минут
const CACHE_TIME = 15 * 60 * 1000; // Кэш цен на 15 минут
const MIN_PROFIT_ALERT = 1.0;
const DEFAULT_MIN_PROFIT = 0.5;
const CONCURRENCY_LIMIT = 4;
const PRICE_DELAY_MS = 80;

// --- INITIALIZATION ---
const logger = new Logger({
  logToConsole: true,
  logToStorage: true,
  isDev: process.argv.includes('--dev')
});

const storage = new StorageManager(logger);
const dataManager = new DataManager(storage, logger);

// Load persisted data
dataManager.loadFromStorage();

// --- UI UTILITIES ---

function updateSteamIdDisplay() {
    const steamInput = document.getElementById('steam-id-input');
    if (!steamInput) return;

    const isIncognito = dataManager.getIsIncognito();
    const steamId = dataManager.getCurrentSteamId();
    steamInput.type = isIncognito ? 'password' : 'text';
    steamInput.value = steamId;
}

// --- PRICE CACHING & HELPERS ---

function getCachedSteamData(hashName) {
    try {
        const cachedData = localStorage.getItem(`price_${hashName}`);
        if (!cachedData) return null;
        return JSON.parse(cachedData);
    } catch {
        return null;
    }
}

function isCacheFresh(timestamp) {
    if (!timestamp) return false;
    return (Date.now() - timestamp) < CACHE_TIME;
}

function getSteamPriceCached(hashName) {
    const cached = getCachedSteamData(hashName);
    if (cached && isCacheFresh(cached.timestamp)) {
        return { price: cached.price || 0, hasMarket: cached.hasMarket !== false, pending: false };
    }

    // Enqueue price
    if (!dataManager.getIsSteamRateLimited()) {
        dataManager.enqueuePrice(hashName);
    }

    if (cached) {
        return { price: cached.price || 0, hasMarket: cached.hasMarket !== false, pending: true };
    }

    return { price: 0, hasMarket: false, pending: true };
}

async function processPriceQueue() {
    const queueSize = dataManager.getPriceQueueSize();
    if (dataManager.getIsPriceWorkerActive() || queueSize === 0 || dataManager.getIsSteamRateLimited()) {
        return;
    }

    dataManager.setIsPriceWorkerActive(true);
    const batch = dataManager.dequeuePrices(CONCURRENCY_LIMIT);
    const inventory = dataManager.getInventory();

    await Promise.all(batch.map(async (name) => {
        const data = await getSteamPrice(name, false);
        if (inventory[name]) {
            dataManager.updateInventoryItem(name, {
                sPrice: data.price || 0,
                hasMarket: data.hasMarket,
                pendingPrice: false
            });
        }
    }));

    dataManager.setIsPriceWorkerActive(false);
    render();
}

// --- NAME ID CACHE ---

let nameIdCache = storage.load('steam_nameid_cache', {});

function saveNameIdCache() {
    storage.save('steam_nameid_cache', nameIdCache);
}

// --- ASSET SNAPSHOT ---

function getAssetSnapshot() {
    return storage.load('inventory_assets_snapshot', []);
}

function saveAssetSnapshot(assetIds) {
    storage.save('inventory_assets_snapshot', assetIds);
}

function loadCountSnapshot() {
    return storage.load('inventory_count_snapshot', {});
}

function saveCountSnapshot(snapshot) {
    storage.save('inventory_count_snapshot', snapshot);
}

function updateAccountInfo(name, avatarUrl) {
    const accountEl = document.getElementById('account-name');
    const avatarEl = document.getElementById('account-avatar');
    if (accountEl) accountEl.innerText = `Инвентарь: ${name || '—'}`;
    if (avatarEl) avatarEl.src = avatarUrl || '';
}

async function fetchAccountInfo(steamId) {
    try {
        const res = await axios.get(`https://steamcommunity.com/profiles/${steamId}?xml=1`);
        const parser = new DOMParser();
        const xml = parser.parseFromString(res.data, 'text/xml');
        const name = xml.getElementsByTagName('steamID')[0]?.textContent?.trim();
        const avatar = xml.getElementsByTagName('avatarMedium')[0]?.textContent?.trim();
        return { name: name || null, avatar: avatar || null };
    } catch {
        return { name: null, avatar: null };
    }
}

function setStatus(text, isError = false) {
    const status = document.getElementById('status');
    status.innerText = text;
    status.classList.toggle('error', isError);
}

function formatCurrency(value) {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatPercent(value) {
    if (!Number.isFinite(value)) return '0%';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
}

function getCategory(name) {
    return name.includes('|') ? name.split('|')[0].trim() : 'Разное';
}

function renderSkeletons(count = 10) {
    return new Array(count).fill(null).map(() => `
        <div class="item-card skeleton">
            <div class="item-top">
                <span class="count-badge">&nbsp;</span>
                <span class="watch-btn">&nbsp;</span>
            </div>
            <div class="skeleton-thumb"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
            <div class="skeleton-line"></div>
        </div>
    `).join('');
}

async function getItemNameId(hashName) {
    const cache = loadNameIdCache();
    if (cache[hashName]) return cache[hashName];

    const url = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(hashName)}`;
    const res = await axios.get(url);
    const match = res.data.match(/Market_LoadOrderSpread\(\s*(\d+)\s*\)/);
    if (!match) return null;
    const nameId = match[1];
    cache[hashName] = nameId;
    saveNameIdCache(cache);
    return nameId;
}

async function getSteamLowest5Price(hashName) {
    try {
        const nameId = await getItemNameId(hashName);
        if (!nameId) return { price: 0, hasMarket: false };

        const url = `https://steamcommunity.com/market/itemordershistogram?country=RU&language=english&currency=1&item_nameid=${nameId}`;
        const res = await axios.get(url);
        const sellOrders = res.data?.sell_order_graph || [];
        if (!sellOrders.length) return { price: 0, hasMarket: false };

        let total = 0;
        let count = 0;
        for (const row of sellOrders) {
            const price = parseFloat(String(row[0]).replace(',', '.'));
            const quantity = parseInt(String(row[1]).replace(/[^0-9]/g, ''), 10) || 0;
            const take = Math.min(quantity, 5 - count);
            if (take > 0 && Number.isFinite(price)) {
                total += price * take;
                count += take;
            }
            if (count >= 5) break;
        }

        if (count === 0) return { price: 0, hasMarket: false };
        return { price: total / count, hasMarket: true };
    } catch {
        setSteamRateLimited(2);
        return { price: 0, hasMarket: false };
    }
}

function getCachedSteamPrice(hashName) {
    try {
        const cachedData = localStorage.getItem(`price_${hashName}`);
        if (!cachedData) return null;
        const { price } = JSON.parse(cachedData);
        return Number.isFinite(price) ? price : null;
    } catch {
        return null;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function mapWithConcurrency(items, limit, task, onProgress) {
    let index = 0;
    let completed = 0;
    const results = new Array(items.length);

    const workers = new Array(limit).fill(null).map(async () => {
        while (index < items.length) {
            const current = index++;
            results[current] = await task(items[current], current);
            completed += 1;
            if (onProgress) onProgress(completed, items.length);
        }
    });

    await Promise.all(workers);
    return results;
}

// --- ЛОГИКА ЦЕН И КЭША ---
function parseSteamPrice(priceStr) {
    if (!priceStr) return 0;
    let normalized = priceStr.replace(/[^0-9.,]/g, '');
    if (normalized.includes(',') && normalized.includes('.')) {
        normalized = normalized.replace(/,/g, '');
    } else if (normalized.includes(',') && !normalized.includes('.')) {
        normalized = normalized.replace(',', '.');
    }
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

async function getSteamPrice(hashName, forceRefresh = false) {
    if (isSteamRateLimited() && !forceRefresh) {
        const cached = getCachedSteamData(hashName);
        if (cached) return { price: cached.price || 0, hasMarket: cached.hasMarket !== false };
        return { price: 0, hasMarket: false };
    }
    const cacheKey = `price_${hashName}`;
    const cachedData = localStorage.getItem(cacheKey);
    const now = Date.now();

    if (!forceRefresh && cachedData) {
        const { price, timestamp, hasMarket } = JSON.parse(cachedData);
        if (now - timestamp < CACHE_TIME) return { price, hasMarket };
    }

    try {
        const { price, hasMarket } = await getSteamLowest5Price(hashName);
        localStorage.setItem(cacheKey, JSON.stringify({ price, timestamp: now, hasMarket }));
        return { price, hasMarket };
    } catch (e) {
        if (cachedData) {
            const { price, hasMarket } = JSON.parse(cachedData);
            return { price, hasMarket };
        }
        return { price: 0, hasMarket: false };
    }
}

// --- ОСНОВНОЙ СКАНЕР ---
async function scan(force = false) {
    const progressBar = document.getElementById('progress-line');
    
    try {
        dataManager.setIsScanning(true);
        setStatus("📡 Получение цен Маркета...");
        const mRes = await axios.get('https://market.csgo.com/api/v2/prices/USD.json');
        const marketPrices = {};
        mRes.data.items.forEach(i => marketPrices[i.market_hash_name] = parseFloat(i.price));
        dataManager.setLastMarketPrices(marketPrices);

        setStatus("📦 Загрузка инвентаря...");
        const steamId = dataManager.getCurrentSteamId();
        const accountInfo = await fetchAccountInfo(steamId);
        updateAccountInfo(accountInfo.name || 'Неизвестно', accountInfo.avatar || '');
        const invRes = await axios.get(`https://steamcommunity.com/inventory/${steamId}/730/2?l=english&count=2000`);
        const { descriptions, assets } = invRes.data;
        const currentAssetIds = assets.map(a => a.assetid);
        const previousAssetIds = new Set(getAssetSnapshot());
        const classCount = assets.reduce((acc, asset) => {
            acc[asset.classid] = (acc[asset.classid] || 0) + 1;
            return acc;
        }, {});
        const descByClass = descriptions.reduce((acc, desc) => {
            acc[desc.classid] = desc;
            return acc;
        }, {});

        const uniqueItems = descriptions.filter((v, i, a) => a.findIndex(t => t.classid === v.classid) === i);
        const totalItems = uniqueItems.length;
        const totalAssets = assets.length;
        let processed = 0;

        const newInventoryData = {};

        const tasks = await mapWithConcurrency(
            uniqueItems,
            CONCURRENCY_LIMIT,
            async (desc) => {
                const name = desc.market_hash_name;
                const steamData = getSteamPriceCached(name);
                const sPrice = steamData.price || 0;
                const hasMarket = steamData.hasMarket;
                const mPrice = marketPrices[name] || 0;
                const count = classCount[desc.classid] || 0;
                const profit = (sPrice * 0.87) - mPrice;

                if (!force) await sleep(PRICE_DELAY_MS);

                return { name, img: desc.icon_url, sPrice, mPrice, count, profit, hasMarket, pendingPrice: steamData.pending };
            },
            (done, total) => {
                processed = done;
                const percent = Math.round((processed / total) * 100);
                setStatus(`⚖️ Анализ уникальных: ${processed} из ${total} (${percent}%) | всего предметов: ${totalAssets}`);
                progressBar.style.width = `${percent}%`;
            }
        );

        tasks.forEach(item => {
            newInventoryData[item.name] = item;
        });

        const previousCounts = loadCountSnapshot();
        const currentCounts = Object.values(newInventoryData).reduce((acc, item) => {
            acc[item.name] = item.count;
            return acc;
        }, {});

        const missingNames = new Set();
        Object.keys(previousCounts).forEach(name => {
            const prev = previousCounts[name] || 0;
            const curr = currentCounts[name] || 0;
            if (curr < prev) {
                const diff = prev - curr;
                const ref = newInventoryData[name] || {};
                dataManager.addAlert({
                    name,
                    img: ref.img || '',
                    count: diff
                });
                missingNames.add(name);
            }
        });

        dataManager.setMissingNames(missingNames);
        saveCountSnapshot(currentCounts);

        const priceHistory = dataManager.getPriceHistory();
        const alertSettings = dataManager.getAlertSettings();
        const nowTs = Date.now();
        
        Object.values(newInventoryData).forEach(item => {
            if (!priceHistory[item.name]) priceHistory[item.name] = [];
            const prevEntry = priceHistory[item.name][priceHistory[item.name].length - 1];
            priceHistory[item.name].push({ ts: nowTs, sPrice: item.sPrice, mPrice: item.mPrice });
            if (priceHistory[item.name].length > 200) {
                priceHistory[item.name] = priceHistory[item.name].slice(-200);
            }

            if (prevEntry && prevEntry.sPrice > 0) {
                const changePct = ((item.sPrice - prevEntry.sPrice) / prevEntry.sPrice) * 100;
                if (changePct >= alertSettings.alertUpPercent) {
                    dataManager.addPriceAlert({
                        name: item.name,
                        message: 'Рост цены',
                        value: formatPercent(changePct)
                    });
                }
                if (changePct <= -alertSettings.alertDownPercent) {
                    dataManager.addPriceAlert({
                        name: item.name,
                        message: 'Падение цены',
                        value: formatPercent(changePct)
                    });
                }
            }

            if (item.profit >= alertSettings.alertProfitThreshold) {
                dataManager.addPriceAlert({
                    name: item.name,
                    message: 'Профит выше порога',
                    value: formatCurrency(item.profit)
                });
            }
        });
        dataManager.setPriceHistory(priceHistory);

        const newAssets = assets.filter(a => !previousAssetIds.has(a.assetid));
        const newItemNames = new Set();
        if (newAssets.length) {
            const grouped = newAssets.reduce((acc, asset) => {
                const desc = descByClass[asset.classid];
                if (!desc) return acc;
                const key = desc.market_hash_name;
                acc[key] = acc[key] || { name: desc.market_hash_name, img: desc.icon_url, count: 0 };
                acc[key].count += 1;
                return acc;
            }, {});

            newItemNames = new Set(Object.keys(grouped));
            dataManager.setNewItemNames(newItemNames);

            Object.values(grouped).forEach(item => {
                dataManager.addHistoryItem({
                    name: item.name,
                    img: item.img,
                    count: item.count
                });
            });
        }   

              saveHistory();
        }

        saveAssetSnapshot(currentAssetIds);

        dataManager.setInventory(newInventoryData);
        dataManager.setNextScanTime(Date.now() + SCAN_INTERVAL);
        dataManager.setLastScanCompletedAt(Date.now());
        
        render();
        buildMarketInsightsFromCache(marketPrices);
        setStatus(`✅ Обновлено в ${new Date().toLocaleTimeString()}`);
        setTimeout(() => progressBar.style.width = '0%', 2000);
        dataManager.setIsScanning(false);

    } catch (err) {
        dataManager.setIsScanning(false);
        progressBar.style.width = '0%';
        
        // Try to load last snapshot
        const inventorySnapshot = storage.load('inventory_snapshot', null);
        if (inventorySnapshot && inventorySnapshot.data) {
            dataManager.setInventory(inventorySnapshot.data);
            render();
            setStatus("⚠️ Показаны сохранённые данные", true);
        } else {
            setStatus("❌ Ошибка. Steam Rate Limit.", true);
        }
        
        dataManager.setSteamRateLimited(3);
        dataManager.setNextScanTime(Date.now() + SCAN_INTERVAL);
    }


// --- ОТРИСОВКА ИНТЕРФЕЙСА (ИСПРАВЛЕННЫЙ РАСЧЕТ) ---
function render() {
    const invView = document.getElementById('inventory-view');
    const sigView = document.getElementById('signals-view');
    const emptyState = document.getElementById('empty-state');
    const historyView = document.getElementById('history-view');
    const analyticsView = document.getElementById('analytics-view');
    const watchView = document.getElementById('watchlist-view');
    const aiView = document.getElementById('ai-view');
    const items = Object.values(inventoryData);

    if (isScanning && items.length === 0) {
        invView.innerHTML = renderSkeletons(12);
        sigView.innerHTML = '';
        watchView.innerHTML = '';
        emptyState.classList.add('hidden');
        return;
    }

    const totalVal = items.reduce((acc, item) => acc + (item.sPrice * item.count), 0);
    const totalItems = items.reduce((acc, item) => acc + item.count, 0);
    const signalsItems = items.filter(item => item.profit >= minProfitFilter);
    const avgProfit = items.length ? (items.reduce((acc, item) => acc + item.profit, 0) / items.length) : 0;
    const totalProfit = items.reduce((acc, item) => acc + (item.profit * item.count), 0);

    document.getElementById('total-val').innerText = formatCurrency(totalVal);
    document.getElementById('total-items').innerText = totalItems.toString();
    document.getElementById('signals-count').innerText = signalsItems.length.toString();
    document.getElementById('avg-profit').innerText = formatCurrency(avgProfit);

    profitHistory.push({ ts: Date.now(), totalProfit });
    profitHistory = profitHistory.slice(-50);
    saveProfitHistory();

    const sorter = (a, b) => {
        if (currentSort === 'price') return b.sPrice - a.sPrice;
        if (currentSort === 'count') return b.count - a.count;
        if (currentSort === 'profit') return b.profit - a.profit;
        return 0;
    };

    const matchesSearch = (item) => item.name.toLowerCase().includes(searchQuery);
    const passesProfit = (item) => item.profit >= minProfitFilter;

    const inventoryItems = items
        .filter(matchesSearch)
        .filter(item => (onlyProfit ? passesProfit(item) : true))
        .sort(sorter);

    const signalItems = items
        .filter(matchesSearch)
        .filter(passesProfit)
        .sort(sorter);

    const watchItems = items.filter(item => watchlist.includes(item.name)).sort(sorter);

    renderItemList(inventoryItems, invView);
    renderItemList(signalItems, sigView);
    renderItemList(watchItems, watchView);

    const activeList = currentTab === 'inventory' ? inventoryItems :
        currentTab === 'signals' ? signalItems :
        currentTab === 'watchlist' ? watchItems : [];
    emptyState.classList.toggle('hidden', activeList.length !== 0 || currentTab === 'ai' || currentTab === 'settings');

    renderHistory();
    renderAnalytics(items, totalProfit);
    renderAiPanel(items);
    historyView.style.display = currentTab === 'history' ? 'block' : 'none';
    analyticsView.style.display = currentTab === 'analytics' ? 'block' : 'none';
    const viewDisplay = groupMode === 'category' ? 'block' : 'grid';
    invView.style.display = currentTab === 'inventory' ? viewDisplay : 'none';
    sigView.style.display = currentTab === 'signals' ? viewDisplay : 'none';
    watchView.style.display = currentTab === 'watchlist' ? viewDisplay : 'none';
    aiView.style.display = currentTab === 'ai' ? 'block' : 'none';
    document.getElementById('settings-view').style.display = currentTab === 'settings' ? 'block' : 'none';
}

function renderItemList(items, container) {
    if (groupMode === 'category') {
        renderGroupedItems(items, container);
        return;
    }
    container.innerHTML = items.map(buildCard).join('');
}

function renderGroupedItems(items, container) {
    const groups = items.reduce((acc, item) => {
        const group = getCategory(item.name);
        acc[group] = acc[group] || [];
        acc[group].push(item);
        return acc;
    }, {});

    container.innerHTML = Object.entries(groups)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([groupName, groupItems]) => {
            const collapsed = collapsedGroups[groupName];
            return `
                <div class="group-section" data-group="${groupName}">
                    <div class="group-header">
                        <div class="group-title">${groupName} <span class="group-count">${groupItems.length}</span></div>
                        <button class="group-toggle" data-group="${groupName}">${collapsed ? '▶' : '▼'}</button>
                    </div>
                    <div class="group-grid ${collapsed ? 'hidden' : ''}">
                        ${groupItems.map(buildCard).join('')}
                    </div>
                </div>
            `;
        })
        .join('');
}

function buildCard(item) {
    const profitClass = item.profit >= 0 ? 'positive' : 'negative';
    const profitPrefix = item.profit >= 0 ? '+' : '-';
    const profitText = `${profitPrefix}${formatCurrency(Math.abs(item.profit))}`;
    const isStarred = watchlist.includes(item.name);
    const steamText = item.pendingPrice ? '⏳ Обновляется' : (item.hasMarket ? formatCurrency(item.sPrice) : 'Не продаётся');
    const steamClass = item.pendingPrice ? 'value pending' : (item.hasMarket ? 'value' : 'value market-off');
    const tags = [];

    if (item.profit > 0) tags.push({ label: 'Profit+' });
    if (!item.hasMarket) tags.push({ label: 'No Steam' });
    if (item.hasMarket && item.mPrice === 0) tags.push({ label: 'Steam Only' });
    if (newItemNames.has(item.name)) tags.push({ label: 'New' });
    if (missingNames.has(item.name)) tags.push({ label: 'Missing' });

    return `
        <div class="item-card" data-item="${item.name}">
            <div class="item-top">
                ${item.count > 1 ? `<span class="count-badge">x${item.count}</span>` : '<span></span>'}
                <button class="watch-btn ${isStarred ? 'active' : ''}" data-watch="${item.name}" aria-label="В избранное">★</button>
            </div>
            <div class="tag-row">
                ${tags.map(tag => `<span class="tag">${tag.label}</span>`).join('')}
            </div>
            <img alt="${item.name}" src="https://community.cloudflare.steamstatic.com/economy/image/${item.img}/200fx200f">
            <div class="name">${item.name}</div>
            <div class="price-row">
                <span>Steam</span>
                <span class="${steamClass}">${steamText}</span>
            </div>
            <div class="price-row muted">
                <span>Market</span>
                <span class="value">${formatCurrency(item.mPrice)}</span>
            </div>
            <div class="profit-pill ${profitClass}">${profitText}</div>
        </div>
    `;
}

function renderHistory() {
    const historyList = document.getElementById('history-list');
    const historyEmpty = document.getElementById('history-empty');
    const alertsList = document.getElementById('alerts-list');
    const alertsEmpty = document.getElementById('alerts-empty');
    const priceAlertsList = document.getElementById('price-alerts-list');
    const priceAlertsEmpty = document.getElementById('price-alerts-empty');
    if (!historyList || !historyEmpty) return;

    historyList.innerHTML = historyItems
        .map(item => `
            <div class="history-item">
                <img alt="${item.name}" src="https://community.cloudflare.steamstatic.com/economy/image/${item.img}/80fx80f">
                <div class="history-info">
                    <div class="history-name">${item.name}</div>
                    <div class="history-meta">${item.timestamp}</div>
                </div>
                <div class="history-count">x${item.count}</div>
            </div>
        `)
        .join('');

    historyEmpty.classList.toggle('hidden', historyItems.length !== 0);

    if (alertsList && alertsEmpty) {
        alertsList.innerHTML = alerts
            .map(item => `
                <div class="history-item">
                    <img alt="${item.name}" src="https://community.cloudflare.steamstatic.com/economy/image/${item.img}/80fx80f">
                    <div class="history-info">
                        <div class="history-name">${item.name}</div>
                        <div class="history-meta">${item.timestamp}</div>
                    </div>
                    <div class="history-count">−x${item.count}</div>
                </div>
            `)
            .join('');

        alertsEmpty.classList.toggle('hidden', alerts.length !== 0);
    }

    if (priceAlertsList && priceAlertsEmpty) {
        priceAlertsList.innerHTML = priceAlerts
            .map(item => `
                <div class="history-item">
                    <div class="history-info">
                        <div class="history-name">${item.name}</div>
                        <div class="history-meta">${item.message}</div>
                    </div>
                    <div class="history-count">${item.value}</div>
                </div>
            `)
            .join('');

        priceAlertsEmpty.classList.toggle('hidden', priceAlerts.length !== 0);
    }
}

function renderAnalytics(items, totalProfit) {
    const priceHistory = loadPriceHistory();
    const profitable = items.filter(item => item.profit >= minProfitFilter);
    const loss = items.filter(item => item.profit < 0);
    const topProfit = [...items].sort((a, b) => b.profit - a.profit)[0];
    const topLoss = [...items].sort((a, b) => a.profit - b.profit)[0];

    document.getElementById('analytics-profitable').innerText = profitable.length.toString();
    document.getElementById('analytics-loss').innerText = loss.length.toString();
    document.getElementById('analytics-top-profit').innerText = topProfit ? formatCurrency(topProfit.profit) : '$0.00';
    document.getElementById('analytics-top-profit-name').innerText = topProfit ? topProfit.name : '—';
    document.getElementById('analytics-top-loss').innerText = topLoss ? formatCurrency(topLoss.profit) : '$0.00';
    document.getElementById('analytics-top-loss-name').innerText = topLoss ? topLoss.name : '—';

    const topValue = [...items].sort((a, b) => (b.sPrice * b.count) - (a.sPrice * a.count)).slice(0, 6);
    const topProfitList = [...items].sort((a, b) => b.profit - a.profit).slice(0, 6);
    const topLossList = [...items].sort((a, b) => a.profit - b.profit).slice(0, 6);

    const categories = items.reduce((acc, item) => {
        const category = item.name.split('|')[0].trim();
        acc[category] = (acc[category] || 0) + (item.sPrice * item.count);
        return acc;
    }, {});
    const topCategories = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

    const renderList = (list) => list
        .map(item => `
            <div class="list-item">
                <div class="list-title">${item.name}</div>
                <div class="list-value">${formatCurrency(item.sPrice * item.count)}</div>
            </div>
        `)
        .join('');

    const renderProfitList = (list) => list
        .map(item => `
            <div class="list-item">
                <div class="list-title">${item.name}</div>
                <div class="list-value">${formatCurrency(item.profit)}</div>
            </div>
        `)
        .join('');

    const renderCategoryList = (list) => list
        .map(([name, value]) => `
            <div class="list-item">
                <div class="list-title">${name}</div>
                <div class="list-value">${formatCurrency(value)}</div>
            </div>
        `)
        .join('');

    document.getElementById('analytics-top-value').innerHTML = renderList(topValue);
    document.getElementById('analytics-top-profit-list').innerHTML = renderProfitList(topProfitList);
    document.getElementById('analytics-top-loss-list').innerHTML = renderProfitList(topLossList);
    document.getElementById('analytics-categories').innerHTML = renderCategoryList(topCategories);

    renderAiInsights(items, priceHistory);

    renderSparkline(totalProfit);
    renderPriceDistribution(items);
}

function buildMarketInsightsFromCache(marketPrices) {
    if (!marketPrices) return;
    const entries = Object.entries(marketPrices);
    const insights = [];

    entries.forEach(([name, mPrice]) => {
        const sPrice = getCachedSteamPrice(name);
        if (!sPrice || !mPrice) return;
        const spread = (sPrice * 0.87) - mPrice;
        const spreadPct = (spread / mPrice) * 100;
        insights.push({ name, mPrice, sPrice, spread, spreadPct });
    });

    marketInsights = insights
        .filter(item => Number.isFinite(item.spread))
        .sort((a, b) => b.spread - a.spread)
        .slice(0, 200);
    saveMarketInsights();
    renderMarketInsights();
}

async function scanMarketDeep(limit = 200) {
    if (!lastMarketPrices) return;
    setStatus('🧠 Скан рынка: обновление цен Steam...');
    const entries = Object.entries(lastMarketPrices)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);

    const results = await mapWithConcurrency(
        entries,
        CONCURRENCY_LIMIT,
        async ([name, mPrice]) => {
            const steamData = await getSteamPrice(name, false);
            const sPrice = steamData.price;
            if (!Number.isFinite(sPrice) || !mPrice) return null;
            const spread = (sPrice * 0.87) - mPrice;
            const spreadPct = (spread / mPrice) * 100;
            await sleep(PRICE_DELAY_MS);
            return { name, mPrice, sPrice, spread, spreadPct };
        }
    );

    marketInsights = results.filter(Boolean).sort((a, b) => b.spread - a.spread);
    saveMarketInsights();
    renderMarketInsights();
    setStatus('✅ Рынок обновлён');
}

function renderMarketInsights() {
    const buyList = document.getElementById('market-buy');
    const sellList = document.getElementById('market-sell');
    if (!buyList || !sellList) return;

    const buy = marketInsights.filter(i => i.spread > 0).slice(0, 8);
    const sell = [...marketInsights].sort((a, b) => a.spread - b.spread).slice(0, 8);

    const renderItem = (item) => `
        <div class="list-item">
            <div class="list-title">${item.name}</div>
            <div class="list-value">${formatCurrency(item.spread)} (${formatPercent(item.spreadPct)})</div>
        </div>
    `;

    buyList.innerHTML = buy.map(renderItem).join('');
    sellList.innerHTML = sell.map(renderItem).join('');
}

function getClosestHistoryPoint(history, daysAgo) {
    if (!history || !history.length) return null;
    const targetTs = Date.now() - (daysAgo * 24 * 60 * 60 * 1000);
    let closest = null;
    for (const point of history) {
        if (point.ts <= targetTs) closest = point;
    }
    return closest || history[0];
}

function getPriceChangePercent(history, daysAgo) {
    if (!history || history.length < 2) return 0;
    const latest = history[history.length - 1];
    const past = getClosestHistoryPoint(history, daysAgo);
    if (!past || past.sPrice === 0) return 0;
    return ((latest.sPrice - past.sPrice) / past.sPrice) * 100;
}

function getIdleDays(history) {
    if (!history || history.length < 2) return 0;
    let lastChangeTs = history[history.length - 1].ts;
    for (let i = history.length - 2; i >= 0; i--) {
        if (history[i].sPrice !== history[i + 1].sPrice) {
            lastChangeTs = history[i + 1].ts;
            break;
        }
    }
    const days = (Date.now() - lastChangeTs) / (24 * 60 * 60 * 1000);
    return Math.max(0, Math.floor(days));
}

function renderAiInsights(items, priceHistory) {
    const sellList = document.getElementById('ai-sell-list');
    const buyList = document.getElementById('ai-buy-list');
    const aiNote = document.getElementById('ai-note');
    if (!sellList || !buyList) return;

    const scored = items.map(item => {
        const history = priceHistory[item.name] || [];
        const change7 = getPriceChangePercent(history, 7);
        const change30 = getPriceChangePercent(history, 30);
        const change180 = getPriceChangePercent(history, 180);
        const idleDays = getIdleDays(history);

        const score = (item.profit * 2) + (change30 * 0.8) + (change180 * 0.4) - (idleDays * 0.15);
        return { item, change7, change30, change180, idleDays, score };
    });

    const sellCandidates = [...scored]
        .sort((a, b) => a.score - b.score)
        .slice(0, 6);

    const buyCandidates = [...scored]
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);

    const renderAiItem = (entry) => `
        <div class="list-item">
            <div class="list-title">${entry.item.name}</div>
            <div class="list-value">${formatPercent(entry.change30)} • ${entry.idleDays}д</div>
        </div>
    `;

    sellList.innerHTML = sellCandidates.map(renderAiItem).join('');
    buyList.innerHTML = buyCandidates.map(renderAiItem).join('');

    if (aiNote) {
        aiNote.innerText = 'ИИ (локально): тренд 7/30/180д, профит и "простой" предмета.';
    }
}

function renderAiPanel(items) {
    const priceHistory = loadPriceHistory();
    const aiTopBuy = document.getElementById('ai-top-buy');
    const aiTopSell = document.getElementById('ai-top-sell');
    const aiIdle = document.getElementById('ai-idle');
    const aiDetail = document.getElementById('ai-detail');
    if (!aiTopBuy || !aiTopSell || !aiIdle || !aiDetail) return;

    const scored = items.map(item => {
        const history = priceHistory[item.name] || [];
        const change7 = getPriceChangePercent(history, 7);
        const change30 = getPriceChangePercent(history, 30);
        const change180 = getPriceChangePercent(history, 180);
        const idleDays = getIdleDays(history);
        const score = (item.profit * 2) + (change30 * 0.8) + (change180 * 0.4) - (idleDays * 0.15);
        return { item, change7, change30, change180, idleDays, score };
    });

    const filtered = scored
        .filter(entry => entry.score >= aiMinScore)
        .filter(entry => (aiPositiveTrendOnly ? entry.change30 > 0 : true));

    const sorted = [...filtered].sort((a, b) => {
        if (aiSort === 'trend30') return b.change30 - a.change30;
        if (aiSort === 'idle') return b.idleDays - a.idleDays;
        if (aiSort === 'profit') return b.item.profit - a.item.profit;
        return b.score - a.score;
    });

    const topBuy = sorted.slice(0, 6);
    const topSell = [...sorted].sort((a, b) => a.score - b.score).slice(0, 6);
    const topIdle = [...sorted].sort((a, b) => b.idleDays - a.idleDays).slice(0, 6);

    const renderEntry = (entry) => `
        <div class="list-item">
            <div class="list-title">${entry.item.name}</div>
            <div class="list-value">${formatPercent(entry.change30)} • ${entry.idleDays}д</div>
        </div>
    `;

    aiTopBuy.innerHTML = topBuy.map(renderEntry).join('');
    aiTopSell.innerHTML = topSell.map(renderEntry).join('');
    aiIdle.innerHTML = topIdle.map(renderEntry).join('');

    const detailItems = sorted.slice(0, 8);
    aiDetail.innerHTML = detailItems.map(entry => {
        return `
            <div class="ai-detail-item">
                <div class="ai-detail-title">${entry.item.name}</div>
                <div class="ai-metrics">
                    <span class="ai-badge">7д: ${formatPercent(entry.change7)}</span>
                    <span class="ai-badge">30д: ${formatPercent(entry.change30)}</span>
                    <span class="ai-badge">180д: ${formatPercent(entry.change180)}</span>
                    <span class="ai-badge">Простой: ${entry.idleDays}д</span>
                    <span class="ai-badge">Профит: ${formatCurrency(entry.item.profit)}</span>
                </div>
            </div>
        `;
    }).join('');

    renderMarketInsights();
    renderActionLists();
}

function renderActionLists() {
    const sellList = document.getElementById('action-sell-list');
    const buyList = document.getElementById('action-buy-list');
    if (!sellList || !buyList) return;

    const renderItem = (name, type) => `
        <div class="list-item">
            <div class="list-title">${name}</div>
            <div class="list-actions">
                <button class="btn mini" data-action="remove" data-type="${type}" data-name="${name}">Удалить</button>
            </div>
        </div>
    `;

    sellList.innerHTML = actionSellList.map(name => renderItem(name, 'sell')).join('');
    buyList.innerHTML = actionBuyList.map(name => renderItem(name, 'buy')).join('');
}

function renderSparkline(totalProfit) {
    const container = document.getElementById('profit-sparkline');
    if (!container) return;

    if (profitHistory.length < 2) {
        container.innerHTML = '<div class="muted">Недостаточно данных</div>';
        return;
    }

    const values = profitHistory.map(p => p.totalProfit);
    const min = Math.min(...values);
    const max = Math.max(...values);
    container.title = `Мин: ${formatCurrency(min)} • Макс: ${formatCurrency(max)}`;
    const width = 320;
    const height = 90;

    const points = values.map((val, idx) => {
        const x = (idx / (values.length - 1)) * width;
        const y = max === min ? height / 2 : height - ((val - min) / (max - min)) * height;
        return `${x},${y}`;
    }).join(' ');

    const trend = values[values.length - 1] - values[0];
    const trendClass = trend >= 0 ? 'positive' : 'negative';

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            <polyline class="sparkline-path ${trendClass}" fill="none" stroke-width="2" points="${points}" />
        </svg>
        <div class="sparkline-meta ${trendClass}">Итого: ${formatCurrency(totalProfit)}</div>
    `;
}

function renderPriceDistribution(items) {
    const container = document.getElementById('price-distribution');
    if (!container) return;

    const buckets = [0, 1, 5, 10, 20, 50, 100, 200];
    const bucketCounts = buckets.map(() => 0);
    const lastIndex = buckets.length - 1;

    items.forEach(item => {
        const price = item.sPrice;
        let index = buckets.findIndex((b, i) => i < lastIndex && price >= b && price < buckets[i + 1]);
        if (index === -1) index = lastIndex;
        bucketCounts[index] += item.count;
    });

    const max = Math.max(...bucketCounts, 1);
    const labels = buckets.map((b, i) => (i === lastIndex ? `${b}+` : `${b}-${buckets[i + 1]}`));

    container.innerHTML = bucketCounts.map((count, i) => {
        const percent = Math.round((count / max) * 100);
        return `
            <div class="bar-row" title="${labels[i]}: ${count} шт.">
                <span>${labels[i]}</span>
                <div class="bar">
                    <div class="bar-fill" style="width:${percent}%"></div>
                </div>
                <span>${count}</span>
            </div>
        `;
    }).join('');
}

function renderItemSparkline(history, container) {
    if (!container) return;
    if (!history || history.length < 2) {
        container.innerHTML = '<div class="muted">Нет данных</div>';
        return;
    }
    const values = history.map(p => p.sPrice);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const width = 320;
    const height = 90;
    const points = values.map((val, idx) => {
        const x = (idx / (values.length - 1)) * width;
        const y = max === min ? height / 2 : height - ((val - min) / (max - min)) * height;
        return `${x},${y}`;
    }).join(' ');

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            <polyline class="sparkline-path" fill="none" stroke-width="2" points="${points}" />
        </svg>
    `;
}

function openDetailDrawer(itemName) {
    const drawer = document.getElementById('detail-drawer');
    const title = document.getElementById('detail-title');
    const tags = document.getElementById('detail-tags');
    const metrics = document.getElementById('detail-metrics');
    const sparkline = document.getElementById('detail-sparkline');
    const ai = document.getElementById('detail-ai');
    const summary = document.getElementById('detail-price-summary');
    if (!drawer || !itemName) return;

    const item = inventoryData[itemName];
    if (!item) return;

    currentDetailItem = itemName;
    title.innerText = item.name;

    const tagList = [];
    if (item.profit > 0) tagList.push('Profit+');
    if (!item.hasMarket) tagList.push('No Steam');
    if (item.hasMarket && item.mPrice === 0) tagList.push('Steam Only');
    if (newItemNames.has(item.name)) tagList.push('New');
    if (missingNames.has(item.name)) tagList.push('Missing');
    tags.innerHTML = tagList.map(label => `<span class="tag">${label}</span>`).join('');

    metrics.innerHTML = `
        <div class="detail-metric"><span>Steam</span><strong>${formatCurrency(item.sPrice)}</strong></div>
        <div class="detail-metric"><span>Market</span><strong>${formatCurrency(item.mPrice)}</strong></div>
        <div class="detail-metric"><span>Профит</span><strong>${formatCurrency(item.profit)}</strong></div>
        <div class="detail-metric"><span>Кол-во</span><strong>${item.count}</strong></div>
    `;

    const priceHistory = loadPriceHistory();
    renderItemSparkline(priceHistory[item.name] || [], sparkline);

    const historyPoints = priceHistory[item.name] || [];
    if (summary) {
        if (historyPoints.length) {
            const min = Math.min(...historyPoints.map(p => p.sPrice));
            const max = Math.max(...historyPoints.map(p => p.sPrice));
            const first = historyPoints[0];
            const last = historyPoints[historyPoints.length - 1];
            summary.innerHTML = `
                <div class="detail-metric"><span>Мин</span><strong>${formatCurrency(min)}</strong></div>
                <div class="detail-metric"><span>Макс</span><strong>${formatCurrency(max)}</strong></div>
                <div class="detail-metric"><span>С</span><strong>${new Date(first.ts).toLocaleDateString()}</strong></div>
                <div class="detail-metric"><span>По</span><strong>${new Date(last.ts).toLocaleDateString()}</strong></div>
            `;
        } else {
            summary.innerHTML = '<div class="muted">Нет истории цен</div>';
        }
    }

    const history = priceHistory[item.name] || [];
    const change7 = getPriceChangePercent(history, 7);
    const change30 = getPriceChangePercent(history, 30);
    const change180 = getPriceChangePercent(history, 180);
    const idleDays = getIdleDays(history);
    ai.innerHTML = `
        <div class="ai-metrics">
            <span class="ai-badge">7д: ${formatPercent(change7)}</span>
            <span class="ai-badge">30д: ${formatPercent(change30)}</span>
            <span class="ai-badge">180д: ${formatPercent(change180)}</span>
            <span class="ai-badge">Простой: ${idleDays}д</span>
        </div>
    `;

    drawer.classList.remove('hidden');
}

function closeDetailDrawer() {
    const drawer = document.getElementById('detail-drawer');
    if (!drawer) return;
    drawer.classList.add('hidden');
    currentDetailItem = null;
}

// --- УПРАВЛЕНИЕ ---
function switchTab(tab, btn) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const viewDisplay = groupMode === 'category' ? 'block' : 'grid';
    document.getElementById('inventory-view').style.display = tab === 'inventory' ? viewDisplay : 'none';
    document.getElementById('signals-view').style.display = tab === 'signals' ? viewDisplay : 'none';
    render();
}

function forceRefresh() {
    localStorage.clear();
    scan(true);
}

function setSort(type) {
    currentSort = type;
    document.querySelectorAll('.chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.sort === type);
    });
    render();
}

function initUI() {
    const refreshBtn = document.getElementById('refresh-btn');
    const restartBtn = document.getElementById('restart-btn');
    const searchInput = document.getElementById('search-input');
    const minProfitInput = document.getElementById('min-profit');
    const minProfitVal = document.getElementById('min-profit-val');
    const onlyProfitToggle = document.getElementById('only-profit');
    const clearHistoryBtn = document.getElementById('clear-history');
    const incognitoToggle = document.getElementById('incognito-toggle');
    const offlineBtn = document.getElementById('offline-btn');
    const steamIdInput = document.getElementById('steam-id-input');
    const applySteamIdBtn = document.getElementById('apply-steam-id');
    const openProfileBtn = document.getElementById('open-profile');
    const clearAlertsBtn = document.getElementById('clear-alerts');
    const inventoryView = document.getElementById('inventory-view');
    const signalsView = document.getElementById('signals-view');
    const watchlistView = document.getElementById('watchlist-view');
    const aiMinScoreInput = document.getElementById('ai-min-score');
    const aiMinScoreVal = document.getElementById('ai-min-score-val');
    const aiPositiveTrend = document.getElementById('ai-positive-trend');
    const aiSortSelect = document.getElementById('ai-sort');
    const marketScanBtn = document.getElementById('market-scan');
    const startOnboardingBtn = document.getElementById('start-onboarding');
    const onboarding = document.getElementById('onboarding');
    const onboardingCard = document.querySelector('.onboarding-card');
    const onboardingTitle = document.getElementById('onboarding-title');
    const onboardingText = document.getElementById('onboarding-text');
    const onboardingStepEl = document.getElementById('onboarding-step');
    const onboardingNext = document.getElementById('onboarding-next');
    const onboardingPrev = document.getElementById('onboarding-prev');
    const onboardingSkip = document.getElementById('onboarding-skip');
    const settingsBtn = document.getElementById('settings-btn');
    const groupModeSelect = document.getElementById('group-mode');
    const detailDrawer = document.getElementById('detail-drawer');
    const detailClose = document.getElementById('detail-close');
    const detailSellBtn = document.getElementById('detail-sell');
    const detailBuyBtn = document.getElementById('detail-buy');
    const clearPriceAlertsBtn = document.getElementById('clear-price-alerts');
    const alertProfitInput = document.getElementById('alert-profit');
    const alertUpInput = document.getElementById('alert-price-up');
    const alertDownInput = document.getElementById('alert-price-down');
    const moreBtn = document.getElementById('more-btn');
    const moreMenu = document.getElementById('more-menu');
    const collapseToggles = document.querySelectorAll('.collapse-toggle');

    refreshBtn.addEventListener('click', forceRefresh);

    restartBtn.addEventListener('click', () => {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('app:restart');
    });

    openProfileBtn.addEventListener('click', () => {
        const { shell } = require('electron');
        shell.openExternal(`https://steamcommunity.com/profiles/${currentSteamId}`);
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab, btn));
    });

    document.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', () => setSort(btn.dataset.sort));
    });

    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        render();
    });

    minProfitInput.addEventListener('input', (e) => {
        minProfitFilter = parseFloat(e.target.value || DEFAULT_MIN_PROFIT);
        minProfitVal.innerText = formatCurrency(minProfitFilter);
        render();
    });

    onlyProfitToggle.addEventListener('change', (e) => {
        onlyProfit = e.target.checked;
        render();
    });

    incognitoToggle.checked = isIncognito;
    incognitoToggle.addEventListener('change', (e) => {
        isIncognito = e.target.checked;
        saveIncognito();
        updateSteamIdDisplay();
    });

    const applySteamId = () => {
        const raw = steamIdInput.value.replace(/\s+/g, '');
        if (!/^\d{17}$/.test(raw)) {
            setStatus('❌ SteamID должен быть из 17 цифр', true);
            return;
        }
        currentSteamId = raw;
        saveSteamId();
        updateSteamIdDisplay();
        updateAccountInfo('—', '');
        setStatus('✅ SteamID применён');
        scan(true);
    };

    applySteamIdBtn.addEventListener('click', applySteamId);
    steamIdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applySteamId();
    });

    offlineBtn.addEventListener('click', () => {
        const snapshot = loadInventorySnapshot();
        if (snapshot && snapshot.data) {
            inventoryData = snapshot.data;
            setStatus('⚠️ Показаны сохранённые данные', true);
            render();
        }
    });

    clearHistoryBtn.addEventListener('click', () => {
        historyItems = [];
        saveHistory();
        renderHistory();
    });

    clearAlertsBtn.addEventListener('click', () => {
        alerts = [];
        saveAlerts();
        renderHistory();
    });

    clearPriceAlertsBtn.addEventListener('click', () => {
        priceAlerts = [];
        savePriceAlerts();
        renderHistory();
    });

    const handleWatchClick = (e) => {
        const target = e.target.closest('.watch-btn');
        if (!target) return;
        const name = target.dataset.watch;
        if (!name) return;
        if (watchlist.includes(name)) {
            watchlist = watchlist.filter(item => item !== name);
        } else {
            watchlist.push(name);
        }
        saveWatchlist();
        render();
    };

    inventoryView.addEventListener('click', handleWatchClick);
    signalsView.addEventListener('click', handleWatchClick);
    watchlistView.addEventListener('click', handleWatchClick);

    aiMinScoreInput.value = aiMinScore.toString();
    aiMinScoreVal.innerText = aiMinScore.toString();
    aiMinScoreInput.addEventListener('input', (e) => {
        aiMinScore = parseInt(e.target.value, 10);
        aiMinScoreVal.innerText = aiMinScore.toString();
        renderAiPanel(Object.values(inventoryData));
    });

    aiPositiveTrend.addEventListener('change', (e) => {
        aiPositiveTrendOnly = e.target.checked;
        renderAiPanel(Object.values(inventoryData));
    });

    aiSortSelect.value = aiSort;
    aiSortSelect.addEventListener('change', (e) => {
        aiSort = e.target.value;
        renderAiPanel(Object.values(inventoryData));
    });

    marketScanBtn.addEventListener('click', () => {
        scanMarketDeep(200);
    });

    settingsBtn.addEventListener('click', () => {
        switchTab('settings');
    });

    groupModeSelect.value = groupMode;
    groupModeSelect.addEventListener('change', (e) => {
        groupMode = e.target.value;
        saveGroupMode();
        render();
    });

    const handleCardClick = (e) => {
        if (e.target.closest('.watch-btn')) return;
        const card = e.target.closest('.item-card');
        if (!card) return;
        const name = card.dataset.item;
        if (name) openDetailDrawer(name);
    };

    inventoryView.addEventListener('click', handleCardClick);
    signalsView.addEventListener('click', handleCardClick);
    watchlistView.addEventListener('click', handleCardClick);

    detailClose.addEventListener('click', closeDetailDrawer);
    detailDrawer.addEventListener('click', (e) => {
        if (e.target.classList.contains('drawer-backdrop')) closeDetailDrawer();
    });

    document.addEventListener('click', (e) => {
        const toggle = e.target.closest('.group-toggle');
        if (!toggle) return;
        const group = toggle.dataset.group;
        collapsedGroups[group] = !collapsedGroups[group];
        saveCollapsedGroups();
        render();
    });

    detailSellBtn.addEventListener('click', () => {
        if (!currentDetailItem) return;
        if (!actionSellList.includes(currentDetailItem)) {
            actionSellList.push(currentDetailItem);
            saveActionLists();
            renderActionLists();
        }
    });

    detailBuyBtn.addEventListener('click', () => {
        if (!currentDetailItem) return;
        if (!actionBuyList.includes(currentDetailItem)) {
            actionBuyList.push(currentDetailItem);
            saveActionLists();
            renderActionLists();
        }
    });

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn.mini');
        if (!btn) return;
        const type = btn.dataset.type;
        const name = btn.dataset.name;
        if (type === 'sell') {
            actionSellList = actionSellList.filter(item => item !== name);
        } else {
            actionBuyList = actionBuyList.filter(item => item !== name);
        }
        saveActionLists();
        renderActionLists();
    });

    alertProfitInput.value = alertProfitThreshold;
    alertUpInput.value = alertUpPercent;
    alertDownInput.value = alertDownPercent;

    alertProfitInput.addEventListener('input', (e) => {
        alertProfitThreshold = parseFloat(e.target.value || 0);
        saveAlertSettings();
    });
    alertUpInput.addEventListener('input', (e) => {
        alertUpPercent = parseFloat(e.target.value || 0);
        saveAlertSettings();
    });
    alertDownInput.addEventListener('input', (e) => {
        alertDownPercent = parseFloat(e.target.value || 0);
        saveAlertSettings();
    });

    moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!moreMenu.classList.contains('hidden') && !e.target.closest('#more-menu')) {
            moreMenu.classList.add('hidden');
        }
    });

    moreMenu.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            moreMenu.classList.add('hidden');
            switchTab(btn.dataset.tab, btn);
        });
    });

    collapseToggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const targetSelector = toggle.dataset.target;
            const wrapper = document.querySelector(targetSelector);
            if (!wrapper) return;
            wrapper.classList.toggle('expanded');
            toggle.innerText = wrapper.classList.contains('expanded') ? 'Свернуть метрики' : 'Развернуть метрики';
        });
    });

    const steps = [
        {
            title: 'Добро пожаловать в CS2 Trade',
            text: 'Введите SteamID и нажмите "Применить", чтобы загрузить инвентарь.',
            selector: '#steam-id-input'
        },
        {
            title: 'Обновление данных',
            text: 'Кнопка обновляет цены и пересчитывает профит.',
            selector: '#refresh-btn'
        },
        {
            title: 'ИИ‑анализ',
            text: 'Откройте вкладку ИИ для рекомендаций и трендов.',
            selector: '.tab-btn[data-tab="ai"]'
        },
        {
            title: 'Настройки',
            text: 'Все настройки находятся здесь.',
            selector: '#settings-btn'
        }
    ];

    let currentHighlight = null;

    const clearHighlight = () => {
        if (currentHighlight) currentHighlight.classList.remove('onboarding-highlight');
        currentHighlight = null;
    };

    const renderOnboarding = () => {
        const step = steps[onboardingStep];
        onboardingTitle.innerText = step.title;
        onboardingText.innerText = step.text;
        onboardingStepEl.innerText = `${onboardingStep + 1}/${steps.length}`;
        onboardingPrev.disabled = onboardingStep === 0;
        onboardingNext.innerText = onboardingStep === steps.length - 1 ? 'Готово' : 'Далее';

        clearHighlight();
        const target = step.selector ? document.querySelector(step.selector) : null;
        if (target && onboardingCard) {
            currentHighlight = target;
            target.classList.add('onboarding-highlight');

            requestAnimationFrame(() => {
                const rect = target.getBoundingClientRect();
                const cardRect = onboardingCard.getBoundingClientRect();
                const padding = 12;
                let top = rect.bottom + 12;
                let left = Math.min(Math.max(rect.left, padding), window.innerWidth - cardRect.width - padding);
                let arrowDir = 'up';

                if (top + cardRect.height > window.innerHeight) {
                    top = rect.top - cardRect.height - 12;
                    arrowDir = 'down';
                }

                onboardingCard.style.top = `${Math.max(top, padding)}px`;
                onboardingCard.style.left = `${left}px`;
                onboardingCard.style.transform = 'none';
                onboardingCard.dataset.arrow = arrowDir;
            });
        } else if (onboardingCard) {
            onboardingCard.style.top = '50%';
            onboardingCard.style.left = '50%';
            onboardingCard.style.transform = 'translate(-50%, -50%)';
            onboardingCard.dataset.arrow = 'none';
        }
    };

    const openOnboarding = () => {
        onboarding.classList.remove('hidden');
        onboardingStep = 0;
        renderOnboarding();
    };

    const closeOnboarding = () => {
        onboarding.classList.add('hidden');
        localStorage.setItem(ONBOARDING_KEY, 'true');
        clearHighlight();
    };

    startOnboardingBtn.addEventListener('click', openOnboarding);
    onboardingNext.addEventListener('click', () => {
        if (onboardingStep < steps.length - 1) {
            onboardingStep += 1;
            renderOnboarding();
        } else {
            closeOnboarding();
        }
    });
    onboardingPrev.addEventListener('click', () => {
        if (onboardingStep > 0) {
            onboardingStep -= 1;
            renderOnboarding();
        }
    });
    onboardingSkip.addEventListener('click', closeOnboarding);

    onboarding.addEventListener('click', (e) => {
        if (e.target === onboarding) closeOnboarding();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !onboarding.classList.contains('hidden')) {
            closeOnboarding();
        }
    });

    if (localStorage.getItem(ONBOARDING_KEY) !== 'true') {
        openOnboarding();
    }

    minProfitVal.innerText = formatCurrency(minProfitFilter);
    updateSteamIdDisplay();
}

setInterval(() => {
    if (isScanning) return;
    if (document.getElementById('status').classList.contains('error')) return;
    const timeLeft = Math.round((nextScanTime - Date.now()) / 1000);
    if (timeLeft > 0) {
        setStatus(`⏳ Следующий скан через ${timeLeft} сек...`);
    } else if (lastScanCompletedAt) {
        setStatus(`✅ Ожидание следующего скана`);
    }
}, 1000);

setInterval(() => {
    processPriceQueue();
}, 1200);

loadHistory();
loadProfitHistory();
loadIncognito();
loadSteamId();
loadWatchlist();
loadAlerts();
loadPriceHistory();
loadMarketInsights();
loadGroupMode();
loadCollapsedGroups();
loadPriceAlerts();
loadActionLists();
loadAlertSettings();
initUI();
scan();
setInterval(() => scan(false), SCAN_INTERVAL);