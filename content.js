// Kemono Lens Content Script - 主控制器
// 整合黑名單、收藏和懸停預覽功能

// 使用全域 logger 和工具
const logger = window.KemonoLogger;
const util = window.KemonoUtil;
const siteManager = window.KemonoSites;

// 懸停預覽相關變數
let currSite = window.location.href;
let currentHoveredElement = null;
let modifierKeyPressed = false;
// 按下貼文連結後抑制重建，避免導航前 mousemove 又把預覽生回來
let suppressPreviewUntilUrlChange = false;
let suppressPreviewResetTimer = null;
// delay_show：懸停延遲顯示計時器
let previewShowDelayTimer = null;
let pendingPreviewTarget = null;
// delay_show：游標旁進度指示器
let delayIndicatorEl = null;

const SCROLL_KEYS = new Set([
    ' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'PageUp', 'PageDown', 'Home', 'End'
]);

function getPreviewSettings() {
    return (window.KemonoSettings && window.KemonoSettings.settings) || {};
}

function getConfiguredModifierKey() {
    const key = (getPreviewSettings().modifierKey || 'alt').toLowerCase();
    if (key === 'ctrl' || key === 'control') return 'ctrl';
    if (key === 'shift') return 'shift';
    return 'alt';
}

function isEventModifierPressed(e) {
    const key = getConfiguredModifierKey();
    if (key === 'ctrl') return !!(e.ctrlKey || e.metaKey);
    if (key === 'shift') return !!e.shiftKey;
    return !!e.altKey;
}

function isKeyboardModifierMatch(e) {
    const key = getConfiguredModifierKey();
    if (key === 'ctrl') return e.key === 'Control' || e.key === 'Meta';
    if (key === 'shift') return e.key === 'Shift';
    return e.key === 'Alt';
}

function getControlMode() {
    const mode = getPreviewSettings().controlMode;
    if (mode === 'hold_to_show') return 'hold_to_show';
    if (mode === 'hold_to_hide') return 'hold_to_hide';
    return 'delay_show';
}

function isModifierSuppressMode() {
    const mode = getControlMode();
    return mode === 'hold_to_hide' || mode === 'delay_show';
}

function getShowDelayMs() {
    const delay = parseInt(getPreviewSettings().showDelay, 10);
    if (!isNaN(delay) && delay >= 0) return delay;
    return 200;
}

function ensureDelayIndicator() {
    if (delayIndicatorEl && delayIndicatorEl.isConnected) {
        return delayIndicatorEl;
    }
    const el = document.createElement('div');
    el.className = 'kemono-delay-indicator';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
        '<svg class="kemono-delay-indicator__svg" viewBox="0 0 28 28" width="22" height="22">' +
            '<circle class="kemono-delay-indicator__track" cx="14" cy="14" r="11" pathLength="100"></circle>' +
            '<circle class="kemono-delay-indicator__progress" cx="14" cy="14" r="11" pathLength="100"></circle>' +
        '</svg>';
    el.hidden = true;
    (document.documentElement || document.body).appendChild(el);
    delayIndicatorEl = el;
    return el;
}

function updateDelayIndicatorPosition(clientX, clientY) {
    if (!delayIndicatorEl || delayIndicatorEl.hidden) return;
    delayIndicatorEl.style.transform =
        'translate3d(' + Math.round(clientX) + 'px,' + Math.round(clientY) + 'px,0)';
}

function showDelayIndicator(clientX, clientY, durationMs) {
    const el = ensureDelayIndicator();
    const progress = el.querySelector('.kemono-delay-indicator__progress');
    el.hidden = false;
    updateDelayIndicatorPosition(clientX, clientY);
    if (!progress) return;
    // 重啟動畫，時長對齊延遲毫秒數
    progress.style.animation = 'none';
    // 強制重繪以重播 CSS animation
    void progress.getBoundingClientRect();
    progress.style.animation = 'kemono-delay-donut-fill ' + durationMs + 'ms linear forwards';
}

function hideDelayIndicator() {
    if (!delayIndicatorEl) return;
    const progress = delayIndicatorEl.querySelector('.kemono-delay-indicator__progress');
    if (progress) {
        progress.style.animation = 'none';
    }
    delayIndicatorEl.hidden = true;
}

function clearPreviewShowDelay() {
    if (previewShowDelayTimer) {
        clearTimeout(previewShowDelayTimer);
        previewShowDelayTimer = null;
    }
    pendingPreviewTarget = null;
    hideDelayIndicator();
}

function shouldCreatePreviewNow() {
    if (suppressPreviewUntilUrlChange) return false;
    const settings = getPreviewSettings();
    if (!settings.enabled) return false;
    if (getControlMode() === 'hold_to_show') {
        return modifierKeyPressed;
    }
    // hold_to_hide / delay_show：按著修飾鍵時暫時停用
    return !modifierKeyPressed;
}

function beginSuppressPreviewOnPostOpen() {
    suppressPreviewUntilUrlChange = true;
    if (suppressPreviewResetTimer) {
        clearTimeout(suppressPreviewResetTimer);
    }
    // 若未發生 URL 變更（例如取消導航），逾時後恢復預覽
    suppressPreviewResetTimer = setTimeout(() => {
        suppressPreviewResetTimer = null;
        suppressPreviewUntilUrlChange = false;
    }, 2000);
}

function endSuppressPreviewOnUrlChange() {
    suppressPreviewUntilUrlChange = false;
    if (suppressPreviewResetTimer) {
        clearTimeout(suppressPreviewResetTimer);
        suppressPreviewResetTimer = null;
    }
}

function isFormFieldFocused(target) {
    if (!target || !target.tagName) return false;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
}

function findTargetImageAtPoint(clientX, clientY, siteHandler) {
    const elementAtPoint = document.elementFromPoint(clientX, clientY);
    if (!elementAtPoint || !siteHandler) return null;
    
    let targetElement = elementAtPoint;
    while (targetElement && targetElement !== document.body) {
        if (targetElement.tagName === 'IMG' && siteHandler.isTargetElement(targetElement)) {
            return targetElement;
        }
        targetElement = targetElement.parentElement;
    }
    return null;
}

function syncHoverTargetFromEvent(e, siteHandler) {
    const target = findTargetImageAtPoint(e.clientX, e.clientY, siteHandler);
    currentHoveredElement = target;
    return target;
}

function requestPreviewCreate(target, siteHandler, e) {
    if (!target || !siteHandler || !shouldCreatePreviewNow()) return;

    if (getControlMode() !== 'delay_show') {
        clearPreviewShowDelay();
        createPreview(target, siteHandler, e);
        return;
    }

    // 已在等待同一目標時不重設計時器
    if (pendingPreviewTarget === target && previewShowDelayTimer) return;

    clearPreviewShowDelay();
    pendingPreviewTarget = target;
    const delay = getShowDelayMs();
    const clientX = e && e.clientX !== undefined ? e.clientX : 0;
    const clientY = e && e.clientY !== undefined ? e.clientY : 0;

    if (delay <= 0) {
        pendingPreviewTarget = null;
        hideDelayIndicator();
        createPreview(target, siteHandler, { clientX, clientY });
        return;
    }

    showDelayIndicator(clientX, clientY, delay);

    previewShowDelayTimer = setTimeout(() => {
        previewShowDelayTimer = null;
        pendingPreviewTarget = null;
        hideDelayIndicator();
        if (currentHoveredElement === target && shouldCreatePreviewNow()) {
            createPreview(target, siteHandler, { clientX, clientY });
        }
    }, delay);
}

function tryCreatePreviewForCurrentHover(e) {
    if (!currentHoveredElement || !shouldCreatePreviewNow()) return;
    const siteHandler = siteManager.getHandler(currSite);
    if (!siteHandler) return;
    requestPreviewCreate(currentHoveredElement, siteHandler, e);
}

function dismissPreviewForControlMode() {
    clearPreviewShowDelay();
    if (util && util.removeActivePreview) {
        util.removeActivePreview();
    }
}

// 黑名單和收藏管理器
class KemonoLens {
    constructor() {
        this.isActive = true;
        this.domManager = new DOMManager();
        this.blacklistManager = new BlacklistContentManager(this.domManager);
        this.favoritesManager = new FavoritesContentManager(this.domManager);
        this.readerController = null;
        this.init();
    }

    async init() {
        // 先載入可設定網域，供 site handler / DOM 判斷使用
        if (window.KemonoDomainConfig) {
            await window.KemonoDomainConfig.loadDomains();
        }

        // 作品頁閱讀器（與黑名單／預覽獨立）
        await this.initReader();

        // 閱讀器設定訊息（作品頁也需要，不依賴黑名單頁面）
        this.setupReaderMessageListener();

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

    async initReader() {
        if (!window.KemonoReaderController) {
            return;
        }
        try {
            if (this.readerController) {
                await this.readerController.destroy();
                this.readerController = null;
            }
            this.readerController = new window.KemonoReaderController();
            await this.readerController.init();
        } catch (e) {
            logger.warn?.('閱讀器初始化失敗:', e);
            this.readerController = null;
        }
    }

    setupReaderMessageListener() {
        if (window.__kfReaderMessageBound) return;
        window.__kfReaderMessageBound = true;
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action !== 'updateReaderSettings') return;
            const inst = currentKemonoLens;
            if (inst && typeof inst.handleReaderSettingsUpdate === 'function') {
                inst.handleReaderSettingsUpdate(message.settings);
            } else if (window.KemonoReaderSettings) {
                window.KemonoReaderSettings.update(message.settings || {});
            }
            sendResponse({ success: true });
            return true;
        });
    }

    async handleReaderSettingsUpdate(partial) {
        if (!window.KemonoReaderSettings) return;
        window.KemonoReaderSettings.update(partial || {});
        // readerEnabled 變更需重新掛載／卸載浮出按鈕
        if (partial && Object.prototype.hasOwnProperty.call(partial, 'readerEnabled')) {
            await this.initReader();
        }
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
            if (isKeyboardModifierMatch(e)) {
                const wasPressed = modifierKeyPressed;
                modifierKeyPressed = true;
                
                if (!wasPressed) {
                    if (getControlMode() === 'hold_to_show') {
                        tryCreatePreviewForCurrentHover(e);
                    } else if (isModifierSuppressMode()) {
                        dismissPreviewForControlMode();
                    }
                }
            }
            
            const preview = util && util.getActivePreview ? util.getActivePreview() : null;
            if (preview && !isFormFieldFocused(e.target) && SCROLL_KEYS.has(e.key)) {
                e.preventDefault();
            }
            
            // 處理方向鍵導航
            if (window.KemonoSettings && window.KemonoSettings.settings && 
                window.KemonoSettings.settings.switchMode === 'keyboard' && 
                (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                if (!preview) return;
                if (util.isLoadingImages && util.isLoadingImages()) return;
                
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
        }, true);

        document.addEventListener('keyup', function(e) {
            if (isKeyboardModifierMatch(e)) {
                modifierKeyPressed = false;
                
                if (getControlMode() === 'hold_to_show') {
                    dismissPreviewForControlMode();
                } else if (isModifierSuppressMode()) {
                    tryCreatePreviewForCurrentHover(e);
                }
            }
        }, true);

        // 頁面失去焦點時重置按鍵狀態
        window.addEventListener('blur', function() {
            const wasPressed = modifierKeyPressed;
            modifierKeyPressed = false;
            if (wasPressed) {
                if (getControlMode() === 'hold_to_show') {
                    dismissPreviewForControlMode();
                } else if (isModifierSuppressMode() && currentHoveredElement) {
                    const pos = util && util._lastMousePos ? util._lastMousePos : null;
                    tryCreatePreviewForCurrentHover(pos || { clientX: 0, clientY: 0 });
                }
            }
        });

        // 點擊／按下貼文連結時立即清除預覽圖（含載入／跟隨中的競態）
        const clearPreviewOnPostOpen = function(e) {
            const target = e.target;
            if (!target || !target.closest) return;
            // 略過右鍵等非導航按鍵，避免單純開選單也抑制預覽
            if (e.type === 'pointerdown' && typeof e.button === 'number' && e.button !== 0 && e.button !== 1) {
                return;
            }
            
            const postLink = target.closest('a[href*="/post/"]') ||
                (target.closest('.post-card') && target.closest('.post-card').querySelector('a[href*="/post/"]'));
            
            if (postLink) {
                beginSuppressPreviewOnPostOpen();
                clearPreviewShowDelay();
                if (util && util.removeActivePreview) {
                    util.removeActivePreview();
                }
                currentHoveredElement = null;
                logger.log('開啟貼文連結，已清除預覽圖');
            }
        };
        document.addEventListener('pointerdown', clearPreviewOnPostOpen, true);
        document.addEventListener('click', clearPreviewOnPostOpen, true);

        // 監聽頁面卸載事件，確保在頁面切換時清除預覽圖
        window.addEventListener('beforeunload', function() {
            clearPreviewShowDelay();
            if (util && util.removeActivePreview) {
                util.removeActivePreview();
            }
            currentHoveredElement = null;
        });

        // 監聽頁面可見性變化，當頁面隱藏時清除預覽圖
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                clearPreviewShowDelay();
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
            
            // 只在目錄頁面工作；離開目錄時清掉殘留預覽
            if (!siteHandler.isPostsDirectory || !siteHandler.isPostsDirectory(currSite)) {
                clearPreviewShowDelay();
                if (util && util.getActivePreview && util.getActivePreview()) {
                    util.removeActivePreview();
                }
                currentHoveredElement = null;
                return;
            }
            
            // 同步修飾鍵狀態（較穩）
            modifierKeyPressed = isEventModifierPressed(e);
            
            // 檢查是否為可預覽的目標元素
            if (siteHandler.isTargetElement(target)) {
                currentHoveredElement = target;
                if (shouldCreatePreviewNow()) {
                    requestPreviewCreate(target, siteHandler, e);
                }
            }
        });

        // 滾輪事件節流變數
        let lastWheelTime = 0;
        const wheelThrottleDelay = 50; // 最小間隔50ms，最多每秒20次切換
        
        // 預覽期間一律擋捲動；再依 switchMode 決定是否切圖
        document.addEventListener('wheel', function(e) {
            if (!util || !util.getActivePreview) return;
            const preview = util.getActivePreview();
            if (!preview) return;
            
            // 預覽期間一律擋頁面捲動（含 Ctrl+滾輪縮放、節流期間）
            e.preventDefault();
            
            if (!window.KemonoSettings || !window.KemonoSettings.settings) return;
            const settings = window.KemonoSettings.settings;
            if (!settings.enabled) return;
            
            const switchModifierPressed = settings.switchMode === 'alt_scroll'
                ? !!e.altKey
                : modifierKeyPressed;
            
            // 檢查切換模式
            const shouldNavigate = 
                (settings.switchMode === 'scroll') ||
                (settings.switchMode === 'alt_scroll' && switchModifierPressed);
            
            if (!shouldNavigate || !currentHoveredElement) return;
            
            // 檢查是否有任何圖片正在載入
            if (util.isAnyImageLoading && util.isAnyImageLoading()) {
                return;
            }
            
            // 節流處理：限制切換頻率（已 preventDefault，不會漏放行捲動）
            const now = Date.now();
            if (now - lastWheelTime < wheelThrottleDelay) {
                return;
            }
            lastWheelTime = now;
            
            const siteHandler = siteManager.getHandler(currSite);
            if (!siteHandler || !currentHoveredElement) return;
            
            const postUrl = siteHandler.getPostUrl ? siteHandler.getPostUrl(currentHoveredElement) : null;
            
            if (postUrl && !util.isLoadingImages()) {
                const hasImages = util._relatedImages.length > 0 || util._coverImage;
                
                if (!hasImages) {
                    logger.log('Wheel event triggered post images loading');
                    util.loadPostImagesAsync(postUrl, siteHandler);
                } else {
                    logger.log('Wheel event triggered image navigation, direction:', e.deltaY > 0 ? 'down' : 'up');
                    util.navigateImages(e.deltaY > 0 ? 1 : -1);
                }
            }
        }, { passive: false, capture: true });

        // 處理鼠標移動：更新懸停狀態（與預覽顯示解耦）並更新預覽位置
        document.addEventListener('mousemove', function(e) {
            currSite = window.location.href;
            modifierKeyPressed = isEventModifierPressed(e);

            // 延遲進度環跟隨游標
            if (previewShowDelayTimer) {
                updateDelayIndicatorPosition(e.clientX, e.clientY);
            }
            
            const siteHandler = siteManager.getHandler(currSite);
            if (!siteHandler || !siteHandler.isPostsDirectory || !siteHandler.isPostsDirectory(currSite)) {
                // SPA 進入貼文頁後若仍有殘留預覽，在此清掉
                clearPreviewShowDelay();
                if (util && util.getActivePreview && util.getActivePreview()) {
                    util.removeActivePreview();
                }
                currentHoveredElement = null;
                return;
            }
            
            const activePreview = util && util.getActivePreview ? util.getActivePreview() : null;
            const isOverPreview = activePreview && util.isMouseOverPreview
                ? util.isMouseOverPreview(e)
                : false;
            
            // 有預覽時更新位置
            if (activePreview && util.updatePreviewPosition) {
                util.updatePreviewPosition(e);
            }
            
            // 游標在預覽幾何範圍時，不更新離開偵測（避免誤關）
            if (isOverPreview) {
                return;
            }
            
            const previousHovered = currentHoveredElement;
            const target = syncHoverTargetFromEvent(e, siteHandler);
            
            if (target) {
                if (shouldCreatePreviewNow()) {
                    if (!activePreview || target !== previousHovered) {
                        // 切換目標時先清掉舊預覽，再依模式（含延遲）建立
                        if (activePreview && target !== previousHovered) {
                            clearPreviewShowDelay();
                            if (util && util.removeActivePreview) {
                                util.removeActivePreview();
                            }
                        }
                        requestPreviewCreate(target, siteHandler, e);
                    }
                } else {
                    dismissPreviewForControlMode();
                }
            } else {
                currentHoveredElement = null;
                dismissPreviewForControlMode();
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
                logger.error('[KemonoLens] 處理卡片時發生錯誤:', error);
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
            logger.log('[KemonoLens] 無法提取個人頁面的創作者資訊');
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
            console.error('[KemonoLens] 載入視覺設定失敗:', error);
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
            if (newSettings.controlMode !== undefined) {
                window.KemonoSettings.settings.controlMode = newSettings.controlMode;
            }
            if (newSettings.showDelay !== undefined) {
                window.KemonoSettings.settings.showDelay = newSettings.showDelay;
            }
            if (newSettings.modifierKey !== undefined) {
                window.KemonoSettings.settings.modifierKey = newSettings.modifierKey;
            }
            window.KemonoSettings.saveSettings();
        }

        // 控制模式或延遲變更時取消待顯示的計時器
        clearPreviewShowDelay();
        
        // 如果預覽被停用，移除當前預覽
        if (!newSettings.enabled && util && util.removeActivePreview) {
            util.removeActivePreview();
        }
        
        // 控制模式變更時依新規則調整目前預覽
        if (newSettings.enabled && !shouldCreatePreviewNow() && util && util.removeActivePreview) {
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
        if (this.readerController) {
            this.readerController.destroy();
            this.readerController = null;
        }
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
    
    if (!shouldCreatePreviewNow()) {
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
let currentKemonoLens = null;
let currentUrl = window.location.href;
let urlChangeGen = 0;
let urlChangeTimer = null;
let urlChangeProfileTimer = null;

const checkUrlChange = () => {
    if (window.location.href === currentUrl) {
        return;
    }

    currentUrl = window.location.href;
    currSite = currentUrl; // 更新懸停預覽的當前網站
    endSuppressPreviewOnUrlChange();

    // 銷毀舊實例
    if (currentKemonoLens) {
        currentKemonoLens.destroy();
        currentKemonoLens = null;
    }

    // 清除懸停預覽
    if (util && util.removeActivePreview) {
        util.removeActivePreview();
    }
    currentHoveredElement = null;

    // 快速連續換頁時取消尚未執行的重建，避免多實例並存
    const gen = ++urlChangeGen;
    if (urlChangeTimer) {
        clearTimeout(urlChangeTimer);
        urlChangeTimer = null;
    }
    if (urlChangeProfileTimer) {
        clearTimeout(urlChangeProfileTimer);
        urlChangeProfileTimer = null;
    }

    // 貼文頁可較快重建閱讀器；其他頁面多留時間等 SPA 內容掛載
    const reinitDelay = currentUrl.includes('/post/') ? 200 : 800;
    urlChangeTimer = setTimeout(() => {
        if (gen !== urlChangeGen) return;
        currentKemonoLens = new KemonoLens();

        urlChangeProfileTimer = setTimeout(() => {
            if (gen !== urlChangeGen) return;
            if (currentKemonoLens && currentKemonoLens.isActive &&
                currentKemonoLens.domManager.isUserProfilePage()) {
                currentKemonoLens.processUserCards();
            }
        }, 1500);
    }, reinitDelay);
};

// SPA 導航偵測
// content script 處於隔離世界，頁面端（如 HTMX）呼叫的 history.pushState
// 不會經過下方的 monkey-patch，因此需併用 Navigation API／HTMX 事件／輪詢。
const scheduleUrlCheck = () => setTimeout(checkUrlChange, 50);

window.addEventListener('popstate', scheduleUrlCheck);

if (window.navigation && typeof window.navigation.addEventListener === 'function') {
    window.navigation.addEventListener('navigate', scheduleUrlCheck);
}

[
    'htmx:afterSwap',
    'htmx:pushedIntoHistory',
    'htmx:replacedInHistory',
    'htmx:historyRestore',
    'htmx:after:swap',
    'htmx:after:history:push',
    'htmx:after:history:replace',
    'htmx:before:history:restore'
].forEach((eventName) => {
    document.addEventListener(eventName, scheduleUrlCheck, true);
});

setInterval(checkUrlChange, 500);

// 同世界內的 history 變更（備援）
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
    originalPushState.apply(history, args);
    scheduleUrlCheck();
};

history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    scheduleUrlCheck();
};

// 初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        currentKemonoLens = new KemonoLens();
    });
} else {
    currentKemonoLens = new KemonoLens();
}

if (logger) {
    logger.log('Content script fully initialized');
}
