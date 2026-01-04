// 黑名單內容管理器 - 處理黑名單相關功能

class BlacklistContentManager {
    constructor(domManager) {
        this.blacklist = new Set();
        this.blacklistData = {};
        this.domManager = domManager;
        this.favoritesManager = null; // 將由主控制器設置
        this.visualSettings = {
            blacklistVisualEffects: true,
            favoritesVisualEffects: true,
            hideBlacklistedPosts: false
        };
        this.logger = window.KemonoLogger || { log: console.log, debug: console.log, warn: console.warn, error: console.error };
    }

    setFavoritesManager(favoritesManager) {
        this.favoritesManager = favoritesManager;
    }

    setVisualSettings(settings) {
        this.visualSettings = settings;
        // 如果是在 /posts 頁面，需要重新應用隱藏邏輯
        if (window.location.href.includes('/posts')) {
            this.applyHideBlacklistedPosts();
            this.updatePostCount();
        }
    }

    async loadBlacklist() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['blacklistData'], (result) => {
                if (result.blacklistData) {
                    // 新格式：{id: {name, platform, addedAt}}
                    this.blacklistData = result.blacklistData;
                    this.blacklist = new Set(Object.keys(this.blacklistData));
                } else {
                    // 向後兼容舊格式
                    chrome.storage.local.get(['blacklist'], (oldResult) => {
                        if (oldResult.blacklist) {
                            this.blacklist = new Set(oldResult.blacklist);
                            this.blacklistData = {};
                            // 轉換舊格式到新格式
                            oldResult.blacklist.forEach(id => {
                                this.blacklistData[id] = {
                                    name: `User ${id}`,
                                    platform: 'unknown',
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
                    return;
                }
                resolve();
            });
        });
    }

    async loadVisualSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['visualSettings'], (result) => {
                if (result.visualSettings) {
                    this.visualSettings = { ...this.visualSettings, ...result.visualSettings };
                }
                // 載入設定後，如果是 /posts 頁面，需要處理隱藏邏輯
                if (window.location.href.includes('/posts')) {
                    this.applyHideBlacklistedPosts();
                }
                resolve();
            });
        });
    }

    async saveBlacklist() {
        chrome.storage.local.set({ blacklistData: this.blacklistData });
    }

    isBlacklisted(userInfo) {
        return this.blacklist.has(userInfo.id);
    }

    createBlacklistButton(container, userInfo, cardLink) {
        // 檢查是否已被收藏，如果是收藏用戶則不顯示黑名單按鈕
        if (this.favoritesManager && this.favoritesManager.isFavorited(userInfo)) {
            return null;
        }

        const isAlreadyBlacklisted = this.blacklist.has(userInfo.id);
        
        // 檢查容器是否存在
        if (!container) {
            this.logger.error('[BlacklistManager] 容器不存在，無法創建按鈕');
            return null;
        }
        
        // 檢查是否已經有按鈕
        const existingButton = container.querySelector('.kemono-blacklist-btn');
        if (existingButton) {
            return existingButton;
        }
        
        const buttonOptions = {
            className: 'kemono-blacklist-btn',
            innerHTML: isAlreadyBlacklisted ? '✓' : '×',
            title: isAlreadyBlacklisted ? '從黑名單移除' : '加入黑名單',
            styles: `
                position: absolute;
                top: -12px;
                right: -12px;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                border: 3px solid white;
                background: ${isAlreadyBlacklisted ? '#666' : '#ff4444'};
                color: white;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                line-height: 1;
                box-shadow: 0 3px 8px rgba(0,0,0,0.4);
                transition: all 0.2s ease;
            `,
            onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleBlacklist(userInfo, cardLink, e.target);
            }
        };

        try {
            const blacklistBtn = this.domManager.createButton(buttonOptions);
            if (!blacklistBtn) {
                this.logger.error('[BlacklistManager] createButton 返回 null');
                return null;
            }
            
            container.appendChild(blacklistBtn);
            return blacklistBtn;
        } catch (error) {
            this.logger.error('[BlacklistManager] 創建黑名單按鈕時發生錯誤:', error);
            return null;
        }
    }

    async toggleBlacklist(userInfo, card, button) {
        // 標記當前卡片正在處理，避免在批量更新時重複處理
        card.dataset.currentlyProcessing = 'true';
        
        // 先保存原始狀態，以備失敗時恢復
        const originalButtonContent = button.innerHTML;
        const originalButtonTitle = button.title;
        const originalButtonBackground = button.style.background;
        const wasBlacklisted = this.blacklist.has(userInfo.id);
        
        try {
            // 顯示loading狀態
            button.innerHTML = '⏳';
            button.title = '處理中...';
            button.style.background = '#999';
            button.disabled = true;
            
            if (wasBlacklisted) {
                // 從黑名單移除
                this.blacklist.delete(userInfo.id);
                delete this.blacklistData[userInfo.id];
            } else {
                // 檢查是否已被收藏，如果是則不允許加入黑名單
                if (this.favoritesManager && this.favoritesManager.isFavorited(userInfo)) {
                    throw new Error('無法將收藏的創作者加入黑名單');
                }
                
                // 加入黑名單
                this.blacklist.add(userInfo.id);
                
                // 嘗試獲取創作者頭像
                const iconUrl = await this.domManager.extractUserIcon(card);
                
                this.blacklistData[userInfo.id] = {
                    name: userInfo.name,
                    platform: userInfo.platform,
                    iconUrl: iconUrl,
                    addedAt: Date.now()
                };
            }

            // 先保存到storage，確保保存成功
            await this.saveBlacklist();
            
            // 保存成功後更新當前按鈕UI
            button.disabled = false;
            if (wasBlacklisted) {
                // 移除黑名單後的UI狀態
                button.innerHTML = '×';
                button.title = '加入黑名單';
                button.style.background = '#ff4444';
                this.removeBlacklistStyle(card);
            } else {
                // 加入黑名單後的UI狀態
                button.innerHTML = '✓';
                button.title = '從黑名單移除';
                button.style.background = '#666';
                this.applyBlacklistStyle(card);
            }
            
            // 更新頁面上相同用戶的所有其他文章/卡片
            this.updateAllUserCardsOnPage(userInfo, wasBlacklisted);
            
            // 如果是 /posts 頁面，更新隱藏狀態和統計資訊
            if (window.location.href.includes('/posts')) {
                this.applyHideBlacklistedPosts();
                this.updatePostCount();
            }
            
        } catch (error) {
            console.error('[KemonoFriends] 黑名單操作失敗:', error);
            
            // 保存失敗，恢復原始狀態
            if (wasBlacklisted) {
                this.blacklist.add(userInfo.id);
                this.blacklistData[userInfo.id] = this.blacklistData[userInfo.id] || {
                    name: userInfo.name,
                    platform: userInfo.platform,
                    addedAt: Date.now()
                };
            } else {
                this.blacklist.delete(userInfo.id);
                delete this.blacklistData[userInfo.id];
            }
            
            // 恢復按鈕原始狀態
            button.innerHTML = originalButtonContent;
            button.title = originalButtonTitle;
            button.style.background = originalButtonBackground;
            button.disabled = false;
            
            // 根據錯誤類型顯示不同的提示
            if (error.message === '無法將收藏的創作者加入黑名單') {
                button.title = '收藏的創作者無法加入黑名單';
                button.style.background = '#ffa500'; // 橙色警告
                setTimeout(() => {
                    button.title = originalButtonTitle;
                    button.style.background = originalButtonBackground;
                }, 3000);
            } else {
                button.title = '操作失敗，請重試';
                setTimeout(() => {
                    button.title = originalButtonTitle;
                }, 3000);
            }
        } finally {
            // 清除處理標記
            delete card.dataset.currentlyProcessing;
        }
    }

    applyBlacklistStyle(card) {
        card.classList.add('kemono-blacklisted');
        
        // 只有在啟用視覺效果時才應用樣式
        if (this.visualSettings.blacklistVisualEffects) {
            // 檢查是否是文章卡片
            if (card.classList.contains('post-card')) {
                // 文章卡片樣式
                const headerElement = card.querySelector('.post-card__header');
                if (headerElement) {
                    headerElement.style.color = '#ff4444';
                }
                
                const imageElement = card.querySelector('.post-card__image');
                if (imageElement) {
                    imageElement.style.opacity = '0.5';
                }
                
                // 整個文章卡片變透明
                card.style.opacity = '0.7';
            } else {
                // 創作者卡片樣式（原有邏輯）
                const nameElement = card.querySelector('.user-card__name, [class*="name"]');
                if (nameElement) {
                    nameElement.style.color = '#ff4444';
                }

                const banner = card.querySelector('.user-card__banner, [class*="banner"], img');
                if (banner) {
                    banner.style.opacity = '0.5';
                }

                // 整個卡片也可以稍微變透明
                card.style.opacity = '0.7';
            }
        }
    }

    removeBlacklistStyle(card) {
        card.classList.remove('kemono-blacklisted');
        
        // 恢復原始樣式
        if (card.classList.contains('post-card')) {
            // 文章卡片樣式恢復
            const headerElement = card.querySelector('.post-card__header');
            if (headerElement) {
                headerElement.style.color = '';
            }
            
            const imageElement = card.querySelector('.post-card__image');
            if (imageElement) {
                imageElement.style.opacity = '';
            }
        } else {
            // 創作者卡片樣式恢復（原有邏輯）
            const nameElement = card.querySelector('.user-card__name, [class*="name"]');
            if (nameElement) {
                nameElement.style.color = '';
            }

            const banner = card.querySelector('.user-card__banner, [class*="banner"], img');
            if (banner) {
                banner.style.opacity = '';
            }
        }

        card.style.opacity = '';
    }

    // 更新頁面上相同用戶的所有文章/卡片
    updateAllUserCardsOnPage(userInfo, wasBlacklisted) {
        
        // 找到頁面上所有的卡片
        const allCards = this.domManager.findUserCards();
        
        allCards.forEach((card) => {
            // 跳過已經處理的當前卡片（避免重複處理）
            if (card.dataset.currentlyProcessing === 'true') {
                return;
            }
            
            let cardUserInfo = null;
            
            // 判斷是文章卡片還是創作者卡片，並提取用戶資訊
            if (card.classList.contains('post-card')) {
                // 文章卡片：使用 data-user 和 data-service 屬性
                cardUserInfo = this.domManager.extractUserInfoFromPostCard(card);
            } else {
                // 創作者卡片：使用連結和名稱元素
                const nameElement = card.querySelector('[class*="name"], h2, h3, .title');
                cardUserInfo = this.domManager.extractUserInfoFromLink(card.href, nameElement);
            }
            
            // 檢查是否是相同的用戶（相同ID和平台）
            if (cardUserInfo && 
                cardUserInfo.id === userInfo.id && 
                cardUserInfo.platform === userInfo.platform) {
                
                
                // 更新黑名單按鈕狀態
                const blacklistBtn = card.querySelector('.kemono-blacklist-btn');
                if (blacklistBtn) {
                    if (wasBlacklisted) {
                        // 從黑名單移除：更新按鈕為"加入黑名單"狀態
                        blacklistBtn.innerHTML = '×';
                        blacklistBtn.title = '加入黑名單';
                        blacklistBtn.style.background = '#ff4444';
                        this.removeBlacklistStyle(card);
                    } else {
                        // 加入黑名單：更新按鈕為"已在黑名單"狀態
                        blacklistBtn.innerHTML = '✓';
                        blacklistBtn.title = '從黑名單移除';
                        blacklistBtn.style.background = '#666';
                        this.applyBlacklistStyle(card);
                    }
                }
            }
        });
    }

    // 在 /posts 頁面隱藏被黑名單的項目
    applyHideBlacklistedPosts() {
        if (!window.location.href.includes('/posts')) {
            return;
        }

        const cards = this.domManager.findUserCards();
        let hiddenCount = 0;
        let shownCount = 0;

        cards.forEach((card) => {
            let userInfo = null;
            
            // 從文章卡片提取用戶資訊
            if (card.classList.contains('post-card')) {
                userInfo = this.domManager.extractUserInfoFromPostCard(card);
            }
            
            if (userInfo && this.isBlacklisted(userInfo)) {
                if (this.visualSettings.hideBlacklistedPosts) {
                    // 隱藏卡片
                    if (card.style.display !== 'none') {
                        card.style.display = 'none';
                        card.dataset.kemonoHidden = 'true';
                        hiddenCount++;
                    }
                } else {
                    // 顯示卡片
                    if (card.style.display === 'none' && card.dataset.kemonoHidden === 'true') {
                        card.style.display = '';
                        delete card.dataset.kemonoHidden;
                        shownCount++;
                    }
                }
            }
        });

    }

    // 更新文章數量統計資訊
    updatePostCount() {
        if (!window.location.href.includes('/posts')) {
            return;
        }

        // 找到統計資訊元素
        const paginatorTop = document.querySelector('#paginator-top');
        if (!paginatorTop) {
            return;
        }

        const countElement = paginatorTop.querySelector('small');
        if (!countElement) {
            return;
        }

        // 保存原始文字（如果還沒有保存）
        if (!countElement.dataset.originalText) {
            countElement.dataset.originalText = countElement.textContent.trim();
        }

        // 解析原始文字，例如 "Showing 51 - 100 of 2237"
        // 如果已經包含 "Hiding"，先提取原始部分
        const currentText = countElement.textContent.trim();
        const originalText = countElement.dataset.originalText || currentText;
        const match = originalText.match(/Showing\s+(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/i);
        
        if (!match) {
            return;
        }

        const startNum = parseInt(match[1]);
        const endNum = parseInt(match[2]);
        const totalNum = parseInt(match[3]);

        // 計算被隱藏的黑名單項目數量
        const cards = this.domManager.findUserCards();
        let hiddenCount = 0;
        
        cards.forEach((card) => {
            if (card.dataset.kemonoHidden === 'true') {
                hiddenCount++;
            }
        });

        // 更新文字
        if (this.visualSettings.hideBlacklistedPosts && hiddenCount > 0) {
            // 清除原有內容
            countElement.innerHTML = '';
            
            // 添加原始文字
            const showingText = document.createTextNode(`Showing ${startNum} - ${endNum} of ${totalNum}, `);
            countElement.appendChild(showingText);
            
            // 添加紅色隱藏文字
            const hidingSpan = document.createElement('span');
            hidingSpan.textContent = `Hiding ${hiddenCount}`;
            hidingSpan.style.color = 'red';
            countElement.appendChild(hidingSpan);
        } else {
            // 恢復原始文字
            countElement.textContent = originalText;
            delete countElement.dataset.originalText;
        }
    }
}