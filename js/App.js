// 主要應用程式管理器 - 整合所有模組

console.log('[KemonoLens] App 加載');

class App {
    constructor() {
        this.messageManager = new MessageManager();
        this.statisticsManager = new StatisticsManager();
        this.tabManager = new TabManager();
        this.settingsManager = new SettingsManager(this.messageManager);
        this.blacklistManager = new BlacklistManager(this.statisticsManager, this.messageManager);
        this.favoritesManager = new FavoritesManager(this.statisticsManager, this.messageManager);
        
        this.init();
    }

    async init() {
        // 載入資料
        await this.settingsManager.loadSettings();
        await this.blacklistManager.loadBlacklist();
        await this.favoritesManager.loadFavorites();
        
        // 渲染初始狀態
        this.render();
    }

    render() {
        // 渲染黑名單（包含收藏標記）
        const favoritesSet = new Set(Object.keys(this.favoritesManager.favoritesData));
        this.blacklistManager.render(favoritesSet);
        
        // 渲染收藏
        this.favoritesManager.render();
    }

    // 當收藏資料更新時，重新渲染黑名單以顯示收藏標記
    onFavoritesUpdated() {
        const favoritesSet = new Set(Object.keys(this.favoritesManager.favoritesData));
        this.blacklistManager.render(favoritesSet);
    }

    // 當黑名單更新時，重新渲染收藏統計
    onBlacklistUpdated() {
        this.favoritesManager.render();
    }
}

// 當頁面載入完成時初始化應用程式
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});