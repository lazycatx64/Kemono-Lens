// 黑名單管理器 - 專門處理黑名單相關功能

console.log('[KemonoFriends] BlacklistManager 加載');

class BlacklistManager {
    constructor(statisticsManager, messageManager) {
        this.blacklist = new Set();
        this.blacklistData = {};
        this.statisticsManager = statisticsManager;
        this.messageManager = messageManager;
        
        this.elements = {
            platformSelect: document.getElementById('platform-select'),
            userInput: document.getElementById('user-input'),
            addBtn: document.getElementById('add-btn'),
            clearAllBtn: document.getElementById('clear-all-btn'),
            exportBtn: document.getElementById('export-blacklist-btn'),
            importBtn: document.getElementById('import-blacklist-btn'),
            importFileInput: document.getElementById('import-blacklist-file'),
            importTextarea: document.getElementById('import-blacklist-text'),
            importPreview: document.getElementById('import-blacklist-preview'),
            blacklistContainer: document.getElementById('blacklist-container')
        };
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        if (this.elements.addBtn) {
            this.elements.addBtn.addEventListener('click', () => this.addToBlacklist());
        }
        if (this.elements.userInput) {
            this.elements.userInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addToBlacklist();
                }
            });
            this.elements.userInput.addEventListener('input', () => this.handleInputChange());
        }
        if (this.elements.clearAllBtn) {
            this.elements.clearAllBtn.addEventListener('click', () => this.clearAllBlacklist());
        }
        if (this.elements.exportBtn) {
            this.elements.exportBtn.addEventListener('click', () => this.exportBlacklist());
        }
        if (this.elements.importBtn) {
            this.elements.importBtn.addEventListener('click', () => this.handleImportClick());
        }
        if (this.elements.importFileInput) {
            this.elements.importFileInput.addEventListener('change', (e) => this.handleFileImport(e));
        }
        if (this.elements.importTextarea) {
            this.elements.importTextarea.addEventListener('input', () => this.handleTextareaImport());
        }
    }

    handleInputChange() {
        const input = this.elements.userInput.value.trim();
        // 如果輸入是URL，自動提取平台和ID，支援URL參數（支援 kemono.cr 和 coomer.st）
        const urlMatch = input.match(/(?:kemono\.cr|coomer\.st)\/(\w+)\/user\/(\d+)(?:\?.*)?(?:#.*)?/);
        if (urlMatch && this.elements.platformSelect) {
            const platform = urlMatch[1];
            // 自動設置平台選擇器
            this.elements.platformSelect.value = platform;
        }
    }

    async addToBlacklist() {
        const input = this.elements.userInput.value.trim();
        const platform = this.elements.platformSelect?.value || 'patreon';
        
        if (!input) {
            this.messageManager.showError('請輸入創作者ID或URL');
            return;
        }

        let userId, userPlatform, userName;

        // 檢查是否是完整URL，支援URL參數（支援 kemono.cr 和 coomer.st）
        const urlMatch = input.match(/(?:kemono\.cr|coomer\.st)\/(\w+)\/user\/(\d+)(?:\?.*)?(?:#.*)?/);
        if (urlMatch) {
            userPlatform = urlMatch[1];
            userId = urlMatch[2];
            userName = `User ${userId}`;
        } else {
            // 驗證ID格式（應該是數字）
            if (!/^\d+$/.test(input)) {
                this.messageManager.showError('創作者ID應該是純數字，或提供完整的 kemono.cr 或 coomer.st URL');
                return;
            }
            userId = input;
            userPlatform = platform;
            userName = `User ${userId}`;
        }

        if (this.blacklist.has(userId)) {
            this.messageManager.showError('這個創作者已經在黑名單中了');
            return;
        }

        // 嘗試從Kemono網站獲取頭像（如果輸入的是URL）
        let iconUrl = null;
        if (urlMatch) {
            iconUrl = await this.fetchUserIcon(userPlatform, userId);
        }

        // 添加到黑名單
        this.blacklist.add(userId);
        this.blacklistData[userId] = {
            name: userName,
            platform: userPlatform,
            iconUrl: iconUrl,
            addedAt: Date.now()
        };

        await this.saveBlacklist();
        
        if (this.elements.userInput) {
            this.elements.userInput.value = '';
        }
        this.render();
        
        const iconStatus = iconUrl ? '(含頭像)' : '';
        this.messageManager.showSuccess(`成功將創作者 ${userName} (${userPlatform}) 添加到黑名單 ${iconStatus}`);
    }

    async removeFromBlacklist(userId) {
        const userInfo = this.blacklistData[userId];
        const displayName = userInfo ? `${userInfo.name} (${userInfo.platform})` : userId;
        
        if (confirm(`確定要將創作者 ${displayName} 從黑名單中移除嗎？`)) {
            this.blacklist.delete(userId);
            delete this.blacklistData[userId];
            await this.saveBlacklist();
            this.render();
            this.messageManager.showSuccess(`成功將創作者 ${displayName} 從黑名單中移除`);
        }
    }

    async clearAllBlacklist() {
        if (confirm(`確定要清空所有黑名單嗎？這個操作無法復原！\n\n目前共有 ${this.blacklist.size} 個創作者在黑名單中。`)) {
            this.blacklist.clear();
            this.blacklistData = {};
            await this.saveBlacklist();
            this.render();
            this.messageManager.showSuccess('已清空所有黑名單');
        }
    }

    exportBlacklist() {
        if (this.blacklist.size === 0) {
            this.messageManager.showError('黑名單是空的，沒有資料可以匯出');
            return;
        }

        try {
            // 將 blacklistData 轉換為陣列格式，方便閱讀和使用
            const blacklistArray = Array.from(this.blacklist).map(userId => {
                const userInfo = this.blacklistData[userId];
                return {
                    id: userId,
                    platform: userInfo?.platform || 'patreon',
                    name: userInfo?.name || `User ${userId}`,
                    iconUrl: userInfo?.iconUrl || null,
                    addedAt: userInfo?.addedAt || null,
                    url: this.getUserUrl(userInfo?.platform || 'patreon', userId)
                };
            });

            // 建立匯出資料結構
            const exportData = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                exportedAtLocal: new Date().toLocaleString('zh-TW'),
                totalCount: blacklistArray.length,
                blacklist: blacklistArray
            };

            // 轉換為 JSON 字串
            const jsonString = JSON.stringify(exportData, null, 2);
            
            // 建立 Blob 並觸發下載
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kemono-blacklist-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.messageManager.showSuccess(`成功匯出 ${blacklistArray.length} 個黑名單項目！`);
        } catch (error) {
            console.error('匯出黑名單時發生錯誤:', error);
            this.messageManager.showError('匯出黑名單時發生錯誤：' + error.message);
        }
    }

    render(favoritesData = new Set()) {
        const count = this.blacklist.size;
        this.statisticsManager.updateBlacklistStatistics(this.blacklistData, favoritesData);

        if (!this.elements.blacklistContainer) {
            return;
        }

        if (count === 0) {
            this.elements.blacklistContainer.innerHTML = '<div class="empty-message">黑名單是空的</div>';
            if (this.elements.clearAllBtn) {
                this.elements.clearAllBtn.style.display = 'none';
            }
            return;
        }

        if (this.elements.clearAllBtn) {
            this.elements.clearAllBtn.style.display = 'block';
        }

        const blacklistArray = Array.from(this.blacklist).sort((a, b) => {
            const nameA = this.blacklistData[a]?.name || a;
            const nameB = this.blacklistData[b]?.name || b;
            return nameA.localeCompare(nameB);
        });
        
        const html = blacklistArray.map(userId => {
            const userInfo = this.blacklistData[userId];
            const name = userInfo?.name || `User ${userId}`;
            const platform = userInfo?.platform || 'patreon';
            const addedDate = userInfo?.addedAt ? new Date(userInfo.addedAt).toLocaleDateString('zh-TW') : '未知';
            const iconUrl = userInfo?.iconUrl;
            
            // 檢查是否為收藏項目（使用平台-ID格式）
            const favoriteKey = `${platform}-${userId}`;
            const isFavorite = favoritesData.has(favoriteKey);
            const favoriteClass = isFavorite ? 'favorite-item' : '';
            const favoriteIndicator = isFavorite ? '<span class="favorite-star">⭐</span>' : '';
            
            // 創建頭像HTML
            const avatarHtml = iconUrl 
                ? `<img src="${iconUrl}" alt="頭像" class="user-avatar" data-fallback="true">`
                : `<div class="user-avatar-placeholder no-avatar">❓</div>`;
            
            return `
                <div class="blacklist-item ${favoriteClass}">
                    <div class="user-avatar-container">
                        ${avatarHtml}
                    </div>
                    <div class="user-info">
                        <div class="user-id">
                            ${favoriteIndicator}創作者: ${name}
                        </div>
                        <div class="user-url">
                            平台: ${platform} | ID: ${userId} | 添加日期: ${addedDate}
                            ${isFavorite ? ' | <span class="favorite-label">已收藏</span>' : ''}
                            <br>
                            <a href="${this.getUserUrl(platform, userId)}" target="_blank">
                                ${this.getUserUrl(platform, userId)}
                            </a>
                        </div>
                    </div>
                    <button class="remove-btn" data-user-id="${userId}">
                        移除
                    </button>
                </div>
            `;
        }).join('');

        this.elements.blacklistContainer.innerHTML = html;
        
        // 為移除按鈕添加事件監聽器
        this.elements.blacklistContainer.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = e.target.getAttribute('data-user-id');
                this.removeFromBlacklist(userId);
            });
        });

        // 為頭像添加錯誤處理
        this.elements.blacklistContainer.querySelectorAll('.user-avatar[data-fallback]').forEach(img => {
            img.addEventListener('error', (e) => {
                const placeholder = document.createElement('div');
                placeholder.className = 'user-avatar-placeholder load-failed';
                placeholder.textContent = '❌';
                placeholder.title = '頭像載入失敗';
                e.target.parentNode.replaceChild(placeholder, e.target);
            });
        });
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

    async fetchUserIcon(platform, userId) {
        try {
            // 嘗試從兩個域名獲取頭像
            const domains = ['kemono.cr', 'coomer.st'];
            const possibleIconUrls = [];
            
            for (const domain of domains) {
                possibleIconUrls.push(
                    `https://${domain}/icons/${platform}/${userId}`,
                    `https://${domain}/thumbnail/${platform}/${userId}`,
                    `https://${domain}/banners/${platform}/${userId}`,
                    `https://${domain}/avatars/${platform}/${userId}`,
                    `https://${domain}/icons/${platform}/${userId}.jpg`,
                    `https://${domain}/icons/${platform}/${userId}.png`,
                    `https://${domain}/icons/${platform}/${userId}.webp`
                );
            }

            for (const iconUrl of possibleIconUrls) {
                try {
                    const isValid = await this.testImageUrl(iconUrl);
                    if (isValid) {
                        return iconUrl;
                    }
                } catch (error) {
                    continue;
                }
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    async testImageUrl(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
            setTimeout(() => resolve(false), 3000);
        });
    }

    async saveBlacklist() {
        return new Promise((resolve) => {
            chrome.storage.local.set({ blacklistData: this.blacklistData }, resolve);
        });
    }

    async loadBlacklist() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['blacklistData'], (result) => {
                if (result.blacklistData) {
                    this.blacklistData = result.blacklistData;
                    this.blacklist = new Set(Object.keys(this.blacklistData));
                    resolve();
                } else {
                    // 向後兼容舊格式
                    chrome.storage.local.get(['blacklist'], (oldResult) => {
                        if (oldResult.blacklist) {
                            this.blacklist = new Set(oldResult.blacklist);
                            this.blacklistData = {};
                            oldResult.blacklist.forEach(id => {
                                this.blacklistData[id] = {
                                    name: `User ${id}`,
                                    platform: 'patreon',
                                    addedAt: Date.now()
                                };
                            });
                            this.saveBlacklist();
                        } else {
                            this.blacklist = new Set();
                            this.blacklistData = {};
                        }
                        resolve();
                    });
                }
            });
        });
    }

    handleImportClick() {
        // 顯示/隱藏匯入區域
        const importSection = document.getElementById('import-blacklist-section');
        if (importSection) {
            const isVisible = importSection.style.display !== 'none';
            importSection.style.display = isVisible ? 'none' : 'block';
            
            // 如果顯示，預設顯示檔案選擇器
            if (!isVisible && this.elements.importFileInput && this.elements.importTextarea) {
                const fileSection = this.elements.importFileInput.closest('.import-section');
                const textSection = this.elements.importTextarea.closest('.import-section');
                if (fileSection && textSection) {
                    fileSection.style.display = 'block';
                    textSection.style.display = 'none';
                }
            }
        }
    }

    handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                this.importBlacklist(jsonData);
            } catch (error) {
                this.messageManager.showError('檔案格式錯誤：' + error.message);
            }
        };
        reader.onerror = () => {
            this.messageManager.showError('讀取檔案時發生錯誤');
        };
        reader.readAsText(file);
    }

    handleTextareaImport() {
        const text = this.elements.importTextarea.value.trim();
        if (!text) {
            if (this.elements.importPreview) {
                this.elements.importPreview.innerHTML = '';
            }
            return;
        }

        try {
            const jsonData = JSON.parse(text);
            this.showImportPreview(jsonData);
        } catch (error) {
            if (this.elements.importPreview) {
                this.elements.importPreview.innerHTML = `<div class="error-message">JSON 格式錯誤：${error.message}</div>`;
            }
        }
    }

    showImportPreview(jsonData) {
        if (!this.elements.importPreview) return;

        const preview = this.parseImportData(jsonData);
        if (preview.error) {
            this.elements.importPreview.innerHTML = `<div class="error-message">${preview.error}</div>`;
            return;
        }

        const { count, format } = preview;
        this.elements.importPreview.innerHTML = `
            <div class="import-preview-info">
                <strong>將匯入 ${count} 筆資料</strong>
                <br>
                <small>格式：${format}</small>
                <br>
                <button id="confirm-import-btn" class="confirm-import-btn">確認匯入</button>
            </div>
        `;

        const confirmBtn = document.getElementById('confirm-import-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.importBlacklist(jsonData);
            });
        }
    }

    parseImportData(jsonData) {
        // 標準格式（優先）
        if (jsonData.version && jsonData.blacklist && Array.isArray(jsonData.blacklist)) {
            return {
                count: jsonData.blacklist.length,
                format: '標準格式',
                data: jsonData.blacklist
            };
        }

        // 向後相容格式1：物件格式 { "userId": { ... } }
        if (typeof jsonData === 'object' && !Array.isArray(jsonData) && !jsonData.blacklist) {
            const keys = Object.keys(jsonData);
            if (keys.length > 0 && typeof jsonData[keys[0]] === 'object') {
                return {
                    count: keys.length,
                    format: '物件格式',
                    data: keys.map(userId => ({
                        id: userId,
                        platform: jsonData[userId].platform || 'patreon',
                        name: jsonData[userId].name || `User ${userId}`,
                        iconUrl: jsonData[userId].iconUrl || null,
                        addedAt: jsonData[userId].addedAt || Date.now(),
                        url: this.getUserUrl(jsonData[userId].platform || 'patreon', userId)
                    }))
                };
            }
        }

        // 向後相容格式2：陣列格式 ["userId1", "userId2", ...]
        if (Array.isArray(jsonData)) {
            return {
                count: jsonData.length,
                format: '陣列格式',
                data: jsonData.map(userId => ({
                    id: String(userId),
                    platform: 'patreon',
                    name: `User ${userId}`,
                    iconUrl: null,
                    addedAt: Date.now(),
                    url: this.getUserUrl('patreon', userId)
                }))
            };
        }

        return { error: '無法識別的資料格式' };
    }

    async importBlacklist(jsonData) {
        try {
            const preview = this.parseImportData(jsonData);
            if (preview.error) {
                this.messageManager.showError(preview.error);
                return;
            }

            const { data } = preview;
            let importedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;

            for (const item of data) {
                const userId = String(item.id);
                const platform = item.platform || 'patreon';
                const uniqueKey = `${platform}-${userId}`;

                // 檢查是否已存在（以 id+platform 為唯一鍵）
                const existingUser = this.blacklistData[userId];
                if (existingUser && existingUser.platform === platform) {
                    // 已存在，保留較新的 addedAt
                    if (item.addedAt && existingUser.addedAt && item.addedAt > existingUser.addedAt) {
                        this.blacklistData[userId] = {
                            id: userId,
                            platform: platform,
                            name: item.name || existingUser.name || `User ${userId}`,
                            iconUrl: item.iconUrl || existingUser.iconUrl || null,
                            addedAt: item.addedAt,
                            url: item.url || this.getUserUrl(platform, userId)
                        };
                        importedCount++;
                    } else {
                        skippedCount++;
                    }
                } else {
                    // 新項目，加入黑名單
                    this.blacklist.add(userId);
                    this.blacklistData[userId] = {
                        id: userId,
                        platform: platform,
                        name: item.name || `User ${userId}`,
                        iconUrl: item.iconUrl || null,
                        addedAt: item.addedAt || Date.now(),
                        url: item.url || this.getUserUrl(platform, userId)
                    };
                    importedCount++;
                }
            }

            await this.saveBlacklist();
            this.render();

            // 清空匯入區域
            if (this.elements.importTextarea) {
                this.elements.importTextarea.value = '';
            }
            if (this.elements.importFileInput) {
                this.elements.importFileInput.value = '';
            }
            if (this.elements.importPreview) {
                this.elements.importPreview.innerHTML = '';
            }

            const message = `匯入完成！成功：${importedCount} 筆，跳過：${skippedCount} 筆${errorCount > 0 ? '，錯誤：' + errorCount + ' 筆' : ''}`;
            this.messageManager.showSuccess(message);
        } catch (error) {
            console.error('匯入黑名單時發生錯誤:', error);
            this.messageManager.showError('匯入黑名單時發生錯誤：' + error.message);
        }
    }
}