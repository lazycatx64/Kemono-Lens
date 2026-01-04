// 主要入口檔案 - 載入並初始化應用程式
// 這個檔案只是為了向後兼容，實際邏輯都在 js/App.js 中

console.log('[Options] options.js 加載');

// 檢查所有必要的類別是否已載入
function waitForClasses() {
    return new Promise((resolve) => {
        const checkClasses = () => {
            if (typeof MessageManager !== 'undefined' &&
                typeof StatisticsManager !== 'undefined' &&
                typeof TabManager !== 'undefined' &&
                typeof SettingsManager !== 'undefined' &&
                typeof BlacklistManager !== 'undefined' &&
                typeof FavoritesManager !== 'undefined' &&
                typeof App !== 'undefined') {
                resolve();
            } else {
                setTimeout(checkClasses, 50);
            }
        };
        checkClasses();
    });
}

// 當所有類別載入完成後初始化應用程式
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await waitForClasses();
        console.log('所有類別已載入，初始化應用程式...');
        window.app = new App();
    } catch (error) {
        console.error('初始化應用程式時發生錯誤:', error);
    }
});