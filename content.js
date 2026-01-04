// Kemono Friends Content Script - 主控制器
// 整合黑名單、收藏和懸停預覽功能

// 使用全域 logger 和工具
const logger = window.KemonoLogger;
const util = window.KemonoUtil;
const siteManager = window.KemonoSites;

// 懸停預覽相關變數
let currSite = window.location.href;
let currentHoveredElement = null;
let altKeyPressed = false;

// 黑名單和收藏管理器
class KemonoFriends {
    constructor() {
        this.isActive = true;
        this.domManager = new DOMManager();
        this.blacklistManager = new BlacklistContentManager(this.domManager);
        this.favoritesManager = new FavoritesContentManager(this.domManager);
        this.init();
    }

    async init() {
        // 檢查是否應該在當前頁面運行（黑名單/收藏功能）
        if (!this.domManager.shouldRunOnCurrentPage()) {
            this.isActive = false;
            // 即使不需要黑名單功能，仍需要初始化懸停預覽
            this.initHoverPreview();
            return;
        }
        
        // 設置管理器之間的引用
        this.blacklistManager.setFavoritesManager(this.favoritesManager);
        
        // 載入設定和資料
        await this.loadVisualSettings();
        await this.blacklistManager.loadBlacklist();
        await this.favoritesManager.loadFavorites();
        
        // 設置消息監聽器
        this.setupMessageListeners();
        
        // 等待頁面內容載入
        this.domManager.waitForContent(() => this.processUserCards());
        
        // 初始化懸停預覽功能
        this.initHoverPreview();
    }

    initHoverPreview() {
        logger.log('初始化懸停預覽功能');
        
        // 監聽設定變更
        window.addEventListener('kemonoSettingsChanged', function(e) {
            const { key, value } = e.detail;
            logger.log('Setting changed:', key, value);
        });

        // 監聽請求排隊設定變更
        window.addEventListener('kemonoRequestQueueSettingsChanged', function(e) {
            if (e.detail && e.detail.maxRequestsPerSecond !== undefined && window.KemonoRequestQueue) {
                window.KemonoRequestQueue.updateSettings(e.detail.maxRequestsPerSecond);
                logger.log('請求排隊設定已更新:', e.detail.maxRequestsPerSecond);
            }
        });

        // 監聽按鍵事件
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Alt') {
                altKeyPressed = true;
            }
            
            // 處理方向鍵導航
            if (window.KemonoSettings && window.KemonoSettings.settings && 
                window.KemonoSettings.settings.switchMode === 'keyboard' && 
                (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                if (!util || !util.getActivePreview) return;
                const preview = util.getActivePreview();
                if (preview && util.isLoadingImages && !util.isLoadingImages()) {
                    e.preventDefault();
                    const direction = e.key === 'ArrowRight' ? 1 : -1;
                    
                    // 如果有貼文圖片則導航，否則載入圖片
                    if (util._relatedImages && util._relatedImages.length > 0 && util.navigateImages) {
                        util.navigateImages(direction);
                    } else if (currentHoveredElement) {
                        const siteHandler = siteManager.getHandler(currSite);
                        const postUrl = siteHandler && siteHandler.getPostUrl ? siteHandler.getPostUrl(currentHoveredElement) : null;
                        if (postUrl) {
                            util.loadPostImagesAsync(postUrl, siteHandler);
                        }
                    }
                }
            }
        });

        document.addEventListener('keyup', function(e) {
            if (e.key === 'Alt') {
                altKeyPressed = false;
            }
        });

        // 頁面失去焦點時重置按鍵狀態
        window.addEventListener('blur', function() {
            altKeyPressed = false;
        });

        // 監聽點擊事件，當點擊貼文連結時立即清除預覽圖
        document.addEventListener('click', function(e) {
            const target = e.target;
            // 檢查是否點擊了貼文連結或貼文卡片
            const postLink = target.closest('a[href*="/post/"]') || 
                            (target.closest('.post-card') && target.closest('.post-card').querySelector('a[href*="/post/"]'));
            
            if (postLink) {
                // 立即清除預覽圖
                if (util && util.removeActivePreview) {
                    util.removeActivePreview();
                }
                currentHoveredElement = null;
                logger.log('點擊貼文連結，已清除預覽圖');
            }
        }, true); // 使用捕獲階段以確保在連結導航前執行

        // 監聽頁面卸載事件，確保在頁面切換時清除預覽圖
        window.addEventListener('beforeunload', function() {
            if (util && util.removeActivePreview) {
                util.removeActivePreview();
            }
            currentHoveredElement = null;
        });

        // 監聽頁面可見性變化，當頁面隱藏時清除預覽圖
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                if (util && util.removeActivePreview) {
                    util.removeActivePreview();
                }
                currentHoveredElement = null;
            }
        });

        // 使用事件委派處理所有 mouseover 事件
        document.addEventListener('mouseover', function(e) {
            const target = e.target;
            
            // 更新當前網站 URL（針對單頁應用程式）
            currSite = window.location.href;
            
            // 獲取適當的處理模組
            const siteHandler = siteManager.getHandler(currSite);
            if (!siteHandler) return;
            
            // 只在目錄頁面工作
            if (!siteHandler.isPostsDirectory || !siteHandler.isPostsDirectory(currSite)) {
                return;
            }
            
            // 檢查是否為可預覽的目標元素
            if (siteHandler.isTargetElement(target)) {
                // 處理預覽
                currentHoveredElement = target;
                createPreview(target, siteHandler, e);
            }
        });

        // 滾輪事件節流變數
        let lastWheelTime = 0;
        let wheelThrottleDelay = 50; // 最小間隔50ms，最多每秒20次切換
        
        // 使用事件委派處理所有 wheel 事件
        document.addEventListener('wheel', function(e) {
            if (!window.KemonoSettings || !window.KemonoSettings.settings) return;
            const settings = window.KemonoSettings.settings;
            if (!settings.enabled) return;
            
            // 檢查切換模式
            const shouldHandle = 
                (settings.switchMode === 'scroll') ||
                (settings.switchMode === 'alt_scroll' && altKeyPressed);
            
            if (!shouldHandle || !currentHoveredElement) return;
            
            if (!util || !util.getActivePreview) return;
            const preview = util.getActivePreview();
            if (!preview) return;
            
            // 節流處理：限制切換頻率
            const now = Date.now();
            if (now - lastWheelTime < wheelThrottleDelay) {
                return; // 忽略過於頻繁的滾輪事件
            }
            lastWheelTime = now;
            
            e.preventDefault();
            const siteHandler = siteManager.getHandler(currSite);
            if (!siteHandler || !currentHoveredElement) return;
            
            const postUrl = siteHandler.getPostUrl ? siteHandler.getPostUrl(currentHoveredElement) : null;
            
            // 滾輪事件處理邏輯
            if (postUrl && !util.isLoadingImages()) {
                // 檢查是否有任何可切換的圖片
                const hasImages = util._relatedImages.length > 0 || util._coverImage;
                
                if (!hasImages) {
                    // 如果還沒有圖片數據，觸發 API 讀取
                    logger.log('Wheel event triggered post images loading');
                    util.loadPostImagesAsync(postUrl, siteHandler);
                } else {
                    // 已有圖片數據，直接切換
                    logger.log('Wheel event triggered image navigation, direction:', e.deltaY > 0 ? 'down' : 'up');
                    util.navigateImages(e.deltaY > 0 ? 1 : -1);
                }
            }
        }, { passive: false });

        // 處理鼠標移動，更新預覽位置並檢測離開
        document.addEventListener('mousemove', function(e) {
            if (!util || !util.getActivePreview) return;
            
            const activePreview = util.getActivePreview();
            if (!activePreview) return;
            
            // 始終更新預覽位置，不論游標位於何處
            if (util.updatePreviewPosition) {
                util.updatePreviewPosition(e);
            }
            
            // 檢查游標是否在預覽圖上
            const isOverPreview = util.isMouseOverPreview ? util.isMouseOverPreview(e) : false;
            
            // 獲取當前游標下的元素
            const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
            if (!elementAtPoint) return;
            
            // 獲取處理模組
            const siteHandler = siteManager.getHandler(currSite);
            if (!siteHandler) return;
            
            // 只有當游標不在預覽圖上時，才檢查是否需要關閉預覽
            if (!isOverPreview) {
                // 檢查游標是否在目標元素或其祖先上
                let targetElement = elementAtPoint;
                let isOverTarget = false;
                
                // 檢查元素本身及其所有父元素
                while (targetElement && targetElement !== document.body) {
                    // 如果是圖片元素並且是目標元素
                    if (targetElement.tagName === 'IMG' && siteHandler.isTargetElement(targetElement)) {
                        isOverTarget = true;
                        // 如果游標移動到新的目標元素上，更新當前懸停元素並創建新的預覽
                        if (targetElement !== currentHoveredElement) {
                            currentHoveredElement = targetElement;
                            createPreview(targetElement, siteHandler, e);
                        }
                        break;
                    }
                    // 向上一級
                    targetElement = targetElement.parentElement;
                }
                
                // 如果不在目標元素或預覽上，關閉預覽
                if (!isOverTarget) {
                    if (util && util.removeActivePreview) {
                        if (util && util.removeActivePreview) {
            util.removeActivePreview();
        }
                    }
                    currentHoveredElement = null;
                }
            }
        });
    }

    processUserCards() {
        // 檢查是否是個人頁面
        if (this.domManager.isUserProfilePage()) {
            this.processUserProfilePage();
            return;
        }
        
        // 處理卡片列表頁面
        const cards = this.domManager.findUserCards();
        
        if (cards.length === 0) {
            return;
        }
        
        cards.forEach((card) => {
            // 檢查是否已經有按鈕，如果有就跳過
            if (card.querySelector('.kemono-blacklist-btn')) {
                // 如果已經有按鈕但沒有處理標記，設置標記
                if (!card.dataset.blacklistProcessed) {
                    card.dataset.blacklistProcessed = 'true';
                }
                return;
            }
            
            // 如果已經處理過但沒有按鈕，可能是之前的處理失敗了，清除標記重新處理
            if (card.dataset.blacklistProcessed) {
                delete card.dataset.blacklistProcessed;
            }
            
            card.dataset.blacklistProcessed = 'true';
            
            let userInfo = null;
            
            try {
                // 判斷是文章卡片還是創作者卡片
                if (card.classList.contains('post-card')) {
                    // 文章卡片：使用 data-user 和 data-service 屬性
                    userInfo = this.domManager.extractUserInfoFromPostCard(card);
                } else {
                    // 創作者卡片：使用連結和名稱元素
                    const nameElement = card.querySelector('[class*="name"], h2, h3, .title, .user-card__name');
                    const href = card.href || card.getAttribute('href') || '';
                    userInfo = this.domManager.extractUserInfoFromLink(href, nameElement);
                }
                
                if (!userInfo) {
                    return;
                }
                
                // 如果在 /posts 頁面且啟用了隱藏功能，先檢查是否應該隱藏
                const shouldHide = window.location.href.includes('/posts') && 
                                  this.blacklistManager.visualSettings.hideBlacklistedPosts &&
                                  this.blacklistManager.isBlacklisted(userInfo);
                
                if (shouldHide) {
                    card.style.display = 'none';
                    card.dataset.kemonoHidden = 'true';
                    // 如果卡片被隱藏，跳過按鈕創建和樣式應用
                    return;
                }
                
                // 找到icon容器
                const iconContainer = this.domManager.findIconContainer(card);
                if (!iconContainer) {
                    return;
                }
                
                this.domManager.ensureContainerPosition(iconContainer);
                
                // 創建黑名單按鈕
                this.blacklistManager.createBlacklistButton(iconContainer, userInfo, card);
                
                // 如果在黑名單中，應用樣式
                if (this.blacklistManager.isBlacklisted(userInfo)) {
                    this.blacklistManager.applyBlacklistStyle(card);
                }
                
                // 如果在收藏中，應用樣式
                if (this.favoritesManager.isFavorited(userInfo)) {
                    this.favoritesManager.applyFavoriteStyle(card);
                }
            } catch (error) {
                logger.error('[KemonoFriends] 處理卡片時發生錯誤:', error);
            }
        });

        // 如果是 /posts 頁面，應用隱藏邏輯並更新統計資訊
        if (window.location.href.includes('/posts')) {
            this.blacklistManager.applyHideBlacklistedPosts();
            // 延遲更新統計資訊，確保 DOM 已更新
            setTimeout(() => {
                this.blacklistManager.updatePostCount();
            }, 100);
        }
    }

    processUserProfilePage() {
        // 檢查是否已經有按鈕存在，如果有就跳過
        if (document.querySelector('.kemono-profile-blacklist-btn')) {
            return;
        }
        
        // 從當前頁面提取創作者信息
        const userInfo = this.domManager.extractUserInfoFromCurrentPage();
        
        if (!userInfo) {
            logger.warn('[KemonoFriends] 無法提取個人頁面的創作者信息');
            return;
        }
        
        
        // 找到合適的按鈕容器
        const container = this.domManager.findProfileButtonContainer();
        
        if (container) {
            this.domManager.ensureContainerPosition(container);
            
            // 創建固定位置的黑名單按鈕
            this.createProfileBlacklistButton(container, userInfo);
        }
    }

    createProfileBlacklistButton(container, userInfo) {
        // 檢查是否已經有按鈕
        if (container.querySelector('.kemono-profile-blacklist-btn')) {
            return;
        }
        
        // 檢查是否已被收藏，如果是收藏用戶則不顯示黑名單按鈕
        if (this.favoritesManager.isFavorited(userInfo)) {
            return;
        }
        
        const isBlacklisted = this.blacklistManager.isBlacklisted(userInfo);
        
        // 確保容器有相對定位
        this.domManager.ensureContainerPosition(container);
        
        const button = this.domManager.createButton({
            className: 'kemono-profile-blacklist-btn kemono-blacklist-btn',
            innerHTML: isBlacklisted ? '✓' : '×',
            title: isBlacklisted ? '從黑名單移除' : '加入黑名單',
            styles: `
                position: absolute;
                top: 10px;
                right: 10px;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: 2px solid white;
                background: ${isBlacklisted ? '#666' : '#ff4444'};
                color: white;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                z-index: 1000;
                box-shadow: 0 3px 8px rgba(0,0,0,0.4);
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            `,
            onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.blacklistManager.toggleBlacklist(userInfo, container, button);
            }
        });

        container.appendChild(button);
        
        // 如果已經在黑名單中，應用樣式
        if (isBlacklisted) {
            this.blacklistManager.applyBlacklistStyle(container);
        }
        
        // 如果在收藏中，應用樣式  
        if (this.favoritesManager.isFavorited(userInfo)) {
            this.favoritesManager.applyFavoriteStyle(container);
        }
    }

    async loadVisualSettings() {
        try {
            await this.blacklistManager.loadVisualSettings();
            await this.favoritesManager.loadVisualSettings();
            
            // 設置初始的body類別
            this.updateBodyClasses(this.blacklistManager.visualSettings);
        } catch (error) {
            console.error('[KemonoFriends] 載入視覺設定失敗:', error);
        }
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'updateVisualSettings') {
                this.handleVisualSettingsUpdate(message.settings);
                sendResponse({ success: true });
            } else if (message.action === 'updatePreviewSettings') {
                this.handlePreviewSettingsUpdate(message.settings);
                sendResponse({ success: true });
            } else if (message.action === 'updateRequestQueueSettings') {
                this.handleRequestQueueSettingsUpdate(message.settings);
                sendResponse({ success: true });
            }
        });
    }

    handleVisualSettingsUpdate(newSettings) {
        
        // 更新管理器中的設定
        this.blacklistManager.setVisualSettings(newSettings);
        this.favoritesManager.setVisualSettings(newSettings);
        
        // 設置body類別來控制CSS
        this.updateBodyClasses(newSettings);
        
        // 重新應用或移除所有樣式
        this.refreshAllStyles();

        // 如果是 /posts 頁面，重新處理卡片
        if (window.location.href.includes('/posts')) {
            setTimeout(() => {
                this.processUserCards();
            }, 100);
        }
    }

    updateBodyClasses(settings) {
        // 控制黑名單視覺效果
        if (settings.blacklistVisualEffects) {
            document.body.classList.remove('blacklist-visual-disabled');
        } else {
            document.body.classList.add('blacklist-visual-disabled');
        }
        
        // 控制收藏視覺效果
        if (settings.favoritesVisualEffects) {
            document.body.classList.remove('favorites-visual-disabled');
        } else {
            document.body.classList.add('favorites-visual-disabled');
        }
    }

    refreshAllStyles() {
        // 重新處理所有黑名單卡片
        document.querySelectorAll('.kemono-blacklisted').forEach(card => {
            // 移除現有樣式
            this.blacklistManager.removeBlacklistStyle(card);
            // 重新應用樣式（會根據新設定決定是否顯示）
            this.blacklistManager.applyBlacklistStyle(card);
        });

        // 重新處理所有收藏卡片
        document.querySelectorAll('.kemono-favorited').forEach(card => {
            // 移除現有樣式
            this.favoritesManager.removeFavoriteStyle(card);
            // 重新應用樣式（會根據新設定決定是否顯示）
            this.favoritesManager.applyFavoriteStyle(card);
        });
    }

    handlePreviewSettingsUpdate(newSettings) {
        
        // 更新 settings.js 中的設定
        if (window.KemonoSettings && window.KemonoSettings.settings) {
            window.KemonoSettings.settings.enabled = newSettings.enabled;
            window.KemonoSettings.settings.switchMode = newSettings.switchMode;
            window.KemonoSettings.settings.maxPreviewSize = newSettings.maxPreviewSize;
            window.KemonoSettings.settings.preloadImageCount = newSettings.preloadImageCount || 5;
            window.KemonoSettings.saveSettings();
        }
        
        // 如果預覽被停用，移除當前預覽
        if (!newSettings.enabled && util && util.removeActivePreview) {
            util.removeActivePreview();
        }
    }

    handleRequestQueueSettingsUpdate(newSettings) {
        // 更新請求排隊設定
        if (window.KemonoRequestQueue && newSettings.maxRequestsPerSecond !== undefined) {
            window.KemonoRequestQueue.updateSettings(newSettings.maxRequestsPerSecond);
            logger.log('請求排隊設定已更新:', newSettings.maxRequestsPerSecond);
        }
    }

    destroy() {
        this.isActive = false;
        this.domManager.destroy();
        // 清除所有按鈕和樣式
        this.domManager.clearButtons('.kemono-blacklist-btn');
        this.domManager.clearButtons('.kemono-profile-blacklist-btn');
        document.querySelectorAll('.kemono-favorited').forEach(card => {
            this.favoritesManager.removeFavoriteStyle(card);
        });
        document.querySelectorAll('.kemono-blacklisted').forEach(card => {
            this.blacklistManager.removeBlacklistStyle(card);
        });
        // 清除個人頁面的處理標記
        if (document.body.dataset.profileProcessed) {
            delete document.body.dataset.profileProcessed;
        }
        // 清除懸停預覽
        if (util && util.removeActivePreview) {
            util.removeActivePreview();
        }
    }
}

/**
 * 創建預覽圖
 * @param {HTMLElement} target - 目標元素
 * @param {Object} siteHandler - 網站處理模組
 * @param {Event} event - 鼠標事件
 */
function createPreview(target, siteHandler, event) {
    if (!window.KemonoSettings || !window.KemonoSettings.settings || !window.KemonoSettings.settings.enabled) {
        return;
    }
    
    const imageSrc = siteHandler.getImageUrl(target);
    if (!imageSrc) return;
    
    logger.log('創建預覽圖:', imageSrc);
    
    const postUrl = siteHandler.getPostUrl ? siteHandler.getPostUrl(target) : null;
    
    // 立即創建預覽並開始載入 API 數據
    if (util && util.createImagePreviewWithAPI) {
        util.createImagePreviewWithAPI(imageSrc, event, postUrl, siteHandler);
    }
}

// 全域實例管理
let currentKemonoFriends = null;
let currentUrl = window.location.href;

const checkUrlChange = () => {
    if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        currSite = currentUrl; // 更新懸停預覽的當前網站
        
        // 銷毀舊實例
        if (currentKemonoFriends) {
            currentKemonoFriends.destroy();
            currentKemonoFriends = null;
        }
        
        // 清除懸停預覽
        if (util && util.removeActivePreview) {
            util.removeActivePreview();
        }
        currentHoveredElement = null;
        
        // 重新初始化 - 增加延遲以確保頁面完全載入
        setTimeout(() => {
            currentKemonoFriends = new KemonoFriends();
            
            // 對於個人頁面，額外再檢查一次
            setTimeout(() => {
                if (currentKemonoFriends && currentKemonoFriends.isActive && 
                    currentKemonoFriends.domManager.isUserProfilePage()) {
                    currentKemonoFriends.processUserCards();
                }
            }, 1500);
        }, 800);
    }
};

// 監聽popstate事件（瀏覽器前進後退）
window.addEventListener('popstate', checkUrlChange);

// 監聽pushstate和replacestate（程序化導航）
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
    originalPushState.apply(history, args);
    setTimeout(checkUrlChange, 100);
};

history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    setTimeout(checkUrlChange, 100);
};

// 初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        currentKemonoFriends = new KemonoFriends();
    });
} else {
    currentKemonoFriends = new KemonoFriends();
}

if (logger) {
    logger.log('Content script fully initialized');
}
