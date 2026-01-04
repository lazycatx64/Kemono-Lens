// 統計管理器 - 處理黑名單和收藏統計

console.log('[KemonoFriends] StatisticsManager 加載');

class StatisticsManager {
    constructor() {
        this.blacklistElements = {
            totalCount: document.getElementById('blacklist-total-count'),
            platformCount: document.getElementById('blacklist-platform-count'),
            withAvatar: document.getElementById('blacklist-with-avatar'),
            recentAdded: document.getElementById('blacklist-recent-added'),
            platformBreakdown: document.getElementById('blacklist-platform-breakdown')
        };
        
        this.favoritesElements = {
            totalCount: document.getElementById('favorites-total-count'),
            platformCount: document.getElementById('favorites-platform-count'),
            lastSynced: document.getElementById('favorites-last-synced'),
            syncedThisWeek: document.getElementById('favorites-synced-week'),
            platformBreakdown: document.getElementById('favorites-platform-breakdown')
        };
    }

    updateBlacklistStatistics(blacklistData, favoritesData = new Set()) {
        const totalCount = Object.keys(blacklistData).length;
        
        // 計算平台統計
        const platformStats = {};
        let withAvatarCount = 0;
        let recentCount = 0;
        
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        
        Object.values(blacklistData).forEach(userData => {
            // 平台統計
            const platform = userData.platform || 'unknown';
            platformStats[platform] = (platformStats[platform] || 0) + 1;
            
            // 頭像統計
            if (userData.iconUrl) {
                withAvatarCount++;
            }
            
            // 最近新增統計
            if (userData.addedAt && userData.addedAt > oneWeekAgo) {
                recentCount++;
            }
        });
        
        const platformCount = Object.keys(platformStats).length;
        
        // 更新統計顯示
        if (this.blacklistElements.totalCount) {
            this.blacklistElements.totalCount.textContent = totalCount;
        }
        if (this.blacklistElements.platformCount) {
            this.blacklistElements.platformCount.textContent = platformCount;
        }
        if (this.blacklistElements.withAvatar) {
            this.blacklistElements.withAvatar.textContent = withAvatarCount;
        }
        if (this.blacklistElements.recentAdded) {
            this.blacklistElements.recentAdded.textContent = recentCount;
        }
        
        // 更新平台分布顯示
        if (this.blacklistElements.platformBreakdown) {
            const platformBreakdownHtml = Object.entries(platformStats)
                .sort(([,a], [,b]) => b - a)
                .map(([platform, count]) => 
                    `<span class="platform-item">${platform}: ${count}</span>`
                ).join('');
            
            this.blacklistElements.platformBreakdown.innerHTML = platformBreakdownHtml 
                ? `<strong>平台分布：</strong><br>${platformBreakdownHtml}`
                : '';
        }
    }

    updateFavoritesStatistics(favoritesData, lastSynced = null) {
        // 確保 favoritesData 是物件格式
        const favoriteKeys = Object.keys(favoritesData || {});
        const totalCount = favoriteKeys.length;
        
        // 解析收藏資料以獲取平台統計
        const platformStats = {};
        let syncedThisWeekCount = 0;
        
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        
        favoriteKeys.forEach(favoriteKey => {
            const [platform] = favoriteKey.split('-');
            platformStats[platform] = (platformStats[platform] || 0) + 1;
            
            // 如果有最後同步時間且在一週內，計入本週同步
            if (lastSynced && lastSynced > oneWeekAgo) {
                syncedThisWeekCount++;
            }
        });
        
        const platformCount = Object.keys(platformStats).length;
        
        // 更新統計顯示
        if (this.favoritesElements.totalCount) {
            this.favoritesElements.totalCount.textContent = totalCount;
        }
        if (this.favoritesElements.platformCount) {
            this.favoritesElements.platformCount.textContent = platformCount;
        }
        if (this.favoritesElements.lastSynced && lastSynced) {
            this.favoritesElements.lastSynced.textContent = new Date(lastSynced).toLocaleDateString('zh-TW');
        }
        if (this.favoritesElements.syncedThisWeek) {
            this.favoritesElements.syncedThisWeek.textContent = lastSynced && lastSynced > oneWeekAgo ? totalCount : 0;
        }
        
        // 更新平台分布顯示
        if (this.favoritesElements.platformBreakdown) {
            const platformBreakdownHtml = Object.entries(platformStats)
                .sort(([,a], [,b]) => b - a)
                .map(([platform, count]) => 
                    `<span class="platform-item">${platform}: ${count}</span>`
                ).join('');
            
            this.favoritesElements.platformBreakdown.innerHTML = platformBreakdownHtml 
                ? `<strong>平台分布：</strong><br>${platformBreakdownHtml}`
                : '';
        }
    }
}