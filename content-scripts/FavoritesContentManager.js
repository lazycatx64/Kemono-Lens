// 收藏內容管理器 - 處理收藏相關功能

console.log('[KemonoFriends] FavoritesContentManager 加載');

class FavoritesContentManager {
    constructor(domManager) {
        this.favorites = new Set();
        this.favoritesData = {};
        this.domManager = domManager;
        this.visualSettings = {
            blacklistVisualEffects: true,
            favoritesVisualEffects: true
        };
    }

    async loadFavorites() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['favoritesData'], (result) => {
                if (result.favoritesData && typeof result.favoritesData === 'object' && !Array.isArray(result.favoritesData)) {
                    this.favoritesData = result.favoritesData;
                    this.favorites = new Set(Object.keys(this.favoritesData));
                    
                    console.log('[Favorites] 載入收藏資料成功:', {
                        收藏總數: this.favorites.size,
                        收藏清單樣本: Array.from(this.favorites).slice(0, 5)
                    });
                } else {
                    this.favorites = new Set();
                    this.favoritesData = {};
                    console.log('[Favorites] 沒有有效的收藏資料，原始資料:', result.favoritesData);
                }
                resolve();
            });
        });
    }

    async saveFavorites() {
        chrome.storage.local.set({ favoritesData: this.favoritesData });
    }

    // 檢查用戶是否在收藏列表中
    isFavorited(userInfo) {
        const favoriteKey = `${userInfo.platform}-${userInfo.id}`;
        console.log('[Favorites] 檢查收藏狀態:', {
            userInfo,
            favoriteKey,
            存在於收藏: this.favorites.has(favoriteKey),
            收藏清單: Array.from(this.favorites).slice(0, 5) // 顯示前5個
        });
        return this.favorites.has(favoriteKey);
    }

    // 從數據中移除收藏（用於黑名單功能調用）
    removeFavoriteFromData(favoriteKey) {
        this.favorites.delete(favoriteKey);
        delete this.favoritesData[favoriteKey];
    }

    setVisualSettings(settings) {
        this.visualSettings = settings;
    }

    async loadVisualSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['visualSettings'], (result) => {
                if (result.visualSettings) {
                    this.visualSettings = { ...this.visualSettings, ...result.visualSettings };
                }
                resolve();
            });
        });
    }

    applyFavoriteStyle(card) {
        card.classList.add('kemono-favorited');
        // 只有在啟用視覺效果時才應用樣式
        if (this.visualSettings.favoritesVisualEffects) {
            // 為收藏的創作者添加金色邊框和光暈
            card.style.border = '3px solid #ffd700';
            card.style.borderRadius = '8px';
            card.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.6), inset 0 0 10px rgba(255, 215, 0, 0.1)';

            // 檢查是否是文章卡片
            if (card.classList.contains('post-card')) {
                // 僅在非 /posts 頁面才套用金色字
                if (!location.pathname.startsWith('/posts')) {
                    const headerElement = card.querySelector('.post-card__header');
                    if (headerElement) {
                        headerElement.style.color = '#ffd700';
                        headerElement.style.fontWeight = 'bold';
                        headerElement.style.textShadow = '0 0 5px rgba(255, 215, 0, 0.5)';
                    }
                }
            } else {
                // 創作者卡片：讓創作者名稱變成金色
                const nameElement = card.querySelector('.user-card__name, [class*="name"]');
                if (nameElement) {
                    nameElement.style.color = '#ffd700';
                    nameElement.style.fontWeight = 'bold';
                    nameElement.style.textShadow = '0 0 5px rgba(255, 215, 0, 0.5)';
                }
            }
        }
    }

    removeFavoriteStyle(card) {
        card.classList.remove('kemono-favorited');
        
        // 恢復原始樣式
        card.style.border = '';
        card.style.borderRadius = '';
        card.style.boxShadow = '';
        card.style.background = '';
        
        // 檢查是否是文章卡片
        if (card.classList.contains('post-card')) {
            // 文章卡片：重置標題樣式
            const headerElement = card.querySelector('.post-card__header');
            if (headerElement) {
                headerElement.style.color = '';
                headerElement.style.fontWeight = '';
                headerElement.style.textShadow = '';
            }
        } else {
            // 創作者卡片：重置創作者名稱樣式
            const nameElement = card.querySelector('.user-card__name, [class*="name"]');
            if (nameElement) {
                nameElement.style.color = '';
                nameElement.style.fontWeight = '';
                nameElement.style.textShadow = '';
            }
        }
    }

    // 同步收藏數據（從 options 頁面的收藏管理器調用）
    async syncFavoritesData(favoritesData) {
        this.favoritesData = favoritesData;
        this.favorites = new Set(Object.keys(favoritesData));
        await this.saveFavorites();
    }
}