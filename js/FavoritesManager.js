// 收藏管理器 - 專門處理收藏同步相關功能

console.log('[KemonoFriends] FavoritesManager 加載');

class FavoritesManager {
    constructor(statisticsManager, messageManager) {
        this.favoritesData = {}; // 改為物件格式以保持一致
        this.lastSynced = null;
        this.statisticsManager = statisticsManager;
        this.messageManager = messageManager;
        
        this.elements = {
            importFavoritesBtn: document.getElementById('import-favorites-btn'),
            manualImportSection: document.getElementById('manual-import-section'),
            manualJsonInput: document.getElementById('manual-json-input'),
            processJsonBtn: document.getElementById('process-json-btn'),
            clearJsonBtn: document.getElementById('clear-json-btn'),
            clearFavoritesBtn: document.getElementById('clear-favorites-btn'),
            favoritesContainer: document.getElementById('favorites-container')
        };
        
        this.setupEventListeners();
    }

    getUserUrl(platform, userId) {
        // 根據當前域名決定使用哪個網站 URL
        // 如果在選項頁面，預設使用 kemono.cr
        if (!window.location.hostname || window.location.hostname === '') {
            return `https://kemono.cr/${platform}/user/${userId}`;
        }
        const currentDomain = window.location.hostname;
        if (currentDomain.includes('coomer.st')) {
            return `https://coomer.st/${platform}/user/${userId}`;
        }
        return `https://kemono.cr/${platform}/user/${userId}`;
    }

    setupEventListeners() {
        if (this.elements.importFavoritesBtn) {
            this.elements.importFavoritesBtn.addEventListener('click', () => this.importKemonoFavorites());
        }
        if (this.elements.processJsonBtn) {
            this.elements.processJsonBtn.addEventListener('click', () => this.processManualJson());
        }
        if (this.elements.clearJsonBtn) {
            this.elements.clearJsonBtn.addEventListener('click', () => this.clearManualInput());
        }
        if (this.elements.clearFavoritesBtn) {
            this.elements.clearFavoritesBtn.addEventListener('click', () => this.clearAllFavorites());
        }
    }

    async importKemonoFavorites() {
        const btn = this.elements.importFavoritesBtn;
        if (!btn) return;
        
        const originalText = btn.textContent;
        
        try {
            btn.disabled = true;
            btn.textContent = '⏳ 正在獲取收藏資料...';
            
            // 嘗試從兩個域名獲取收藏（優先使用 kemono.cr）
            const apiUrl = 'https://kemono.cr/api/v1/account/favorites?type=artist';
            const response = await fetch(apiUrl, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin'
                }
            });
            
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    throw new Error('無法存取 Kemono API，可能的原因：\n• 需要登入 Kemono 帳號\n• API 需要特殊權限\n• Kemono 限制了 API 存取\n\n請使用手動同步方式作為替代方案。');
                } else if (response.status === 404) {
                    throw new Error('API 端點不存在，Kemono 可能已更改 API 結構');
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}\n\nKemono API 存取失敗，請使用手動同步方式。`);
                }
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('回應不是有效的 JSON 格式');
            }
            
            const favoritesData = await response.json();
            
            btn.textContent = '⭐ 正在同步收藏標記...';
            await this.syncFavoritesDataFromAPI(favoritesData);
            
        } catch (error) {
            console.error('同步 Kemono 收藏時發生錯誤:', error);
            
            let errorMessage = '自動同步失敗：' + error.message;
            
            // 對於所有 API 相關錯誤，都顯示手動輸入選項
            if (error.message.includes('HTTP') || 
                error.message.includes('fetch') || 
                error.message.includes('無法存取') ||
                error.message.includes('驗證失敗') ||
                error.message.includes('API')) {
                errorMessage += '\n\n⬇️ 已自動顯示手動同步選項，請使用下方的備用方法。';
                this.messageManager.showError(errorMessage);
                this.showManualImportOption();
            } else {
                this.messageManager.showError(errorMessage);
            }
            
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    async syncFavoritesDataFromAPI(favoritesData) {
        console.log('API 返回的收藏資料:', favoritesData);
        
        let artistsArray = [];
        
        if (Array.isArray(favoritesData)) {
            artistsArray = favoritesData;
        } else if (favoritesData && favoritesData.artists && Array.isArray(favoritesData.artists)) {
            artistsArray = favoritesData.artists;
        } else if (favoritesData && favoritesData.data && Array.isArray(favoritesData.data)) {
            artistsArray = favoritesData.data;
        } else {
            throw new Error('無法識別的 API 資料格式');
        }

        if (artistsArray.length === 0) {
            this.messageManager.showError('API 返回的收藏清單為空');
            return;
        }

        let syncedCount = 0;
        let skippedCount = 0;
        const newFavorites = {};
        
        for (const artist of artistsArray) {
            try {
                const userId = artist.id || artist.user_id || artist.artist_id;
                const platform = artist.service || artist.platform || artist.site;
                const name = artist.name || `User ${userId}`;
                
                if (!userId || !platform) {
                    console.warn('跳過無效的創作者項目:', artist);
                    skippedCount++;
                    continue;
                }
                
                const favoriteKey = `${platform}-${userId}`;
                
                if (!this.favoritesData[favoriteKey]) {
                    syncedCount++;
                }
                
                newFavorites[favoriteKey] = {
                    id: userId,
                    name: name,
                    service: platform,
                    addedAt: Date.now()
                };
                
            } catch (error) {
                console.error('處理創作者項目時發生錯誤:', artist, error);
                skippedCount++;
            }
        }
        
        this.favoritesData = newFavorites;
        this.lastSynced = Date.now();
        
        await this.saveFavorites();
        this.render();
        
        const totalFavorites = Object.keys(this.favoritesData).length;
        let message = `⭐ 收藏同步完成！`;
        
        if (syncedCount > 0) {
            message += ` 新同步 ${syncedCount} 個收藏標記。`;
        }
        
        message += ` 目前共有 ${totalFavorites} 個收藏創作者`;
        
        if (skippedCount > 0) {
            message += `，跳過 ${skippedCount} 個無效項目`;
        }
        
        message += `（從 API 獲取 ${artistsArray.length} 個創作者）。`;
        
        this.messageManager.showSuccess(message);
    }

    async syncFavoritesData(favoritesData) {
        if (!favoritesData || typeof favoritesData !== 'object') {
            throw new Error('收藏資料格式不正確：應為 JSON 物件');
        }

        let artistsArray = [];
        
        // 首先嘗試使用 artists 陣列
        if (favoritesData.artists && Array.isArray(favoritesData.artists)) {
            artistsArray = favoritesData.artists;
            console.log('[Favorites] 使用 artists 陣列，數量:', artistsArray.length);
        }
        
        // 如果 artists 陣列為空或不存在，嘗試從 posts 中提取創作者
        if (artistsArray.length === 0 && favoritesData.posts && Array.isArray(favoritesData.posts)) {
            console.log('[Favorites] artists 陣列為空，嘗試從 posts 中提取創作者');
            const artistsMap = new Map();
            
            for (const post of favoritesData.posts) {
                if (post.user && post.service) {
                    const key = `${post.service}-${post.user}`;
                    if (!artistsMap.has(key)) {
                        artistsMap.set(key, {
                            id: post.user,
                            service: post.service,
                            name: `User ${post.user}` // 從 posts 無法獲取真實名稱
                        });
                    }
                }
            }
            
            artistsArray = Array.from(artistsMap.values());
            console.log('[Favorites] 從 posts 中提取到', artistsArray.length, '個創作者');
        }
        
        if (artistsArray.length === 0) {
            throw new Error('沒有找到有效的創作者資料（檢查了 artists 和 posts）');
        }

        let syncedCount = 0;
        let skippedCount = 0;
        const newFavorites = {};
        
        for (const artist of artistsArray) {
            try {
                const userId = artist.id;
                const platform = artist.service;
                const name = artist.name || `User ${userId}`;
                
                if (!userId || !platform) {
                    console.warn('跳過無效的創作者項目:', artist);
                    skippedCount++;
                    continue;
                }
                
                const favoriteKey = `${platform}-${userId}`;
                
                if (!this.favoritesData[favoriteKey]) {
                    syncedCount++;
                }
                
                newFavorites[favoriteKey] = {
                    id: userId,
                    name: name,
                    service: platform,
                    addedAt: Date.now()
                };
                
            } catch (error) {
                console.error('處理創作者項目時發生錯誤:', artist, error);
                skippedCount++;
            }
        }
        
        this.favoritesData = newFavorites;
        this.lastSynced = Date.now();
        
        await this.saveFavorites();
        this.render();
        
        const totalProcessed = artistsArray.length;
        const totalFavorites = Object.keys(this.favoritesData).length;
        let message = `⭐ 收藏同步完成！`;
        
        if (syncedCount > 0) {
            message += ` 新同步 ${syncedCount} 個收藏標記。`;
        }
        
        message += ` 目前共有 ${totalFavorites} 個收藏創作者`;
        
        if (skippedCount > 0) {
            message += `，跳過 ${skippedCount} 個無效項目`;
        }
        
        message += `（從 ${totalProcessed} 個創作者中處理）。`;
        
        this.messageManager.showSuccess(message);
    }

    showManualImportOption() {
        if (this.elements.manualImportSection) {
            this.elements.manualImportSection.style.display = 'block';
            this.elements.manualImportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        // 顯示額外的說明訊息
        setTimeout(() => {
            this.messageManager.showError(
                '⚠️ Kemono API 無法存取，已切換到手動模式。\n\n' +
                '請按照下方步驟操作：\n' +
                '1. 前往 Kemono 收藏匯出頁面\n' +
                '2. 點擊 Export 按鈕產生 JSON\n' +
                '3. 複製 JSON 並貼到下方文字框\n' +
                '4. 點擊「處理 JSON 資料」完成同步'
            );
        }, 500);
    }

    async processManualJson() {
        const btn = this.elements.processJsonBtn;
        if (!btn) return;
        
        const originalText = btn.textContent;
        const jsonInput = this.elements.manualJsonInput?.value.trim();
        
        if (!jsonInput) {
            this.messageManager.showError('請先貼上 JSON 資料');
            return;
        }
        
        try {
            btn.disabled = true;
            btn.textContent = '⏳ 處理中...';
            
            const favoritesData = JSON.parse(jsonInput);
            
            btn.textContent = '⭐ 正在同步收藏標記...';
            await this.syncFavoritesData(favoritesData);
            
            if (this.elements.manualImportSection) {
                this.elements.manualImportSection.style.display = 'none';
            }
            this.clearManualInput();
            
        } catch (error) {
            console.error('處理手動 JSON 時發生錯誤:', error);
            
            let errorMessage = '處理 JSON 資料時發生錯誤：';
            
            if (error instanceof SyntaxError) {
                errorMessage += '無效的 JSON 格式，請確認資料完整且格式正確。';
            } else {
                errorMessage += error.message;
            }
            
            this.messageManager.showError(errorMessage);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    clearManualInput() {
        if (this.elements.manualJsonInput) {
            this.elements.manualJsonInput.value = '';
        }
    }

    async clearAllFavorites() {
        const currentFavoritesCount = Object.keys(this.favoritesData).length;
        
        if (currentFavoritesCount === 0) {
            this.messageManager.showError('目前沒有任何收藏標記需要清除');
            return;
        }
        
        const confirmed = confirm(
            `確定要清除所有 ${currentFavoritesCount} 個收藏標記嗎？\n\n` +
            '此操作將：\n' +
            '• 移除擴充功能中所有收藏創作者的 ⭐ 標記\n' +
            '• 不會影響 Kemono 網站上的實際收藏\n' +
            '• 不會影響黑名單內容\n\n' +
            '此操作無法撤銷！'
        );
        
        if (!confirmed) return;
        
        const btn = this.elements.clearFavoritesBtn;
        if (!btn) return;
        
        const originalText = btn.textContent;
        
        try {
            btn.disabled = true;
            btn.textContent = '⏳ 清除中...';
            
            this.favoritesData = {};
            this.lastSynced = null;
            
            await this.saveFavorites();
            this.render();
            
            this.messageManager.showSuccess(`✅ 已清除 ${currentFavoritesCount} 個收藏標記！`);
            
        } catch (error) {
            console.error('清除收藏標記時發生錯誤:', error);
            this.messageManager.showError('清除收藏標記時發生錯誤：' + error.message);
            
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    render() {
        this.statisticsManager.updateFavoritesStatistics(this.favoritesData, this.lastSynced);
        
        if (!this.elements.favoritesContainer) {
            return;
        }
        
        const count = Object.keys(this.favoritesData).length;
        
        if (count === 0) {
            this.elements.favoritesContainer.innerHTML = '<div class="empty-message">尚未同步任何收藏</div>';
            return;
        }
        
        // 將收藏資料轉換為可顯示的格式
        const favoritesArray = Object.keys(this.favoritesData).sort();
        
        const html = favoritesArray.map(favoriteKey => {
            const [platform, userId] = favoriteKey.split('-');
            const favoriteData = this.favoritesData[favoriteKey];
            const displayName = favoriteData && favoriteData.name ? favoriteData.name : `User ${userId}`;
            
            return `
                <div class="favorite-item">
                    <div class="user-info">
                        <span class="favorite-star">⭐</span>
                        <strong>${displayName}</strong>
                        <span class="platform-info">(${platform})</span>
                        <a href="${this.getUserUrl(platform, userId)}" target="_blank" class="kemono-link">🔗</a>
                    </div>
                </div>
            `;
        }).join('');
        
        this.elements.favoritesContainer.innerHTML = html;
    }

    async saveFavorites() {
        return new Promise((resolve) => {
            chrome.storage.local.set({ 
                favoritesData: this.favoritesData, // 直接儲存物件
                lastSynced: this.lastSynced
            }, resolve);
        });
    }

    async loadFavorites() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['favoritesData', 'lastSynced'], (result) => {
                try {
                        console.log('[Favorites][loadFavorites] 讀到 favoritesData:', result.favoritesData);
                        if (result.favoritesData) {
                        // 檢查並處理不同的資料格式
                        if (Array.isArray(result.favoritesData)) {
                            // 轉換陣列格式為物件格式
                            this.favoritesData = {};
                            result.favoritesData.forEach(item => {
                                if (typeof item === 'string') {
                                    // 如果是字串格式的key
                                    this.favoritesData[item] = { addedAt: Date.now() };
                                } else if (item && item.service && item.id) {
                                    // 如果是完整的物件
                                    const key = `${item.service}-${item.id}`;
                                    this.favoritesData[key] = item;
                                }
                            });
                        } else if (typeof result.favoritesData === 'object' && result.favoritesData !== null) {
                            // 確保是有效的物件格式
                            this.favoritesData = result.favoritesData;
                        } else {
                            console.warn('[Favorites] 不支援的資料格式，重置為空物件:', typeof result.favoritesData);
                            this.favoritesData = {};
                        }
                    } else {
                        this.favoritesData = {};
                    }
                } catch (error) {
                    console.error('[Favorites] 載入收藏資料時發生錯誤:', error);
                    console.error('[Favorites] 原始資料:', result.favoritesData);
                    // 發生錯誤時重置為空物件，避免整個應用崩潰
                    this.favoritesData = {};
                }
                
                this.lastSynced = result.lastSynced || null;
                resolve();
            });
        });
    }
}