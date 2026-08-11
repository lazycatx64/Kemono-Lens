// DOM 管理器 - 處理 DOM 操作和用戶信息提取

class DOMManager {
    constructor() {
        this.observer = null;
        this.isActive = true;
        this.logger = window.KemonoLogger || { log: console.log, debug: console.log, warn: console.warn, error: console.error };
    }

    shouldRunOnCurrentPage() {
        const url = window.location.href;
        
        // 檢查是否為支援的網域（依 DomainConfig 設定）
        const domainConfig = window.KemonoDomainConfig;
        let isSupportedDomain = false;
        if (domainConfig) {
            try {
                const hostname = new URL(url).hostname;
                isSupportedDomain = !!domainConfig.resolveSiteFamily(hostname);
            } catch (e) {
                isSupportedDomain = false;
            }
        } else {
            isSupportedDomain = /https?:\/\/(?:www\.)?(kemono\.cr|coomer\.st)/.test(url);
        }
        if (!isSupportedDomain) {
            return false;
        }
        
        const validPaths = [
            '/artists',
            '/artists/updated', 
            '/account/favorites/artists',
            '/posts'  // 添加文章搜尋頁面支援
        ];
        
        // 檢查是否是推薦頁面
        const isRecommendedPage = /\/\w+\/user\/\d+\/recommended/.test(url);
        
        // 檢查是否是創作者個人頁面 - 修改為支援URL參數
        const isUserProfilePage = /\/\w+\/user\/\d+(?:\?.*)?$/.test(url);
        
        // 檢查是否是有效路徑
        const isValidPath = validPaths.some(path => url.includes(path));
        
        return isRecommendedPage || isUserProfilePage || isValidPath;
    }

    waitForContent(processCallback) {
        let isProcessing = false;
        let checkCount = 0;
        const maxChecks = 10; // 最多檢查10次（20秒）
        
        // 檢查是否有卡片但沒有按鈕的輔助函數
        const hasCardsWithoutButtons = () => {
            const cards = this.findUserCards();
            if (cards.length === 0) {
                return false;
            }
            
            // 檢查是否有卡片缺少按鈕
            const cardsWithoutButtons = Array.from(cards).filter(card => {
                // 檢查是否已經處理過
                if (card.dataset.blacklistProcessed) {
                    return false;
                }
                // 檢查是否已經有按鈕
                return !card.querySelector('.kemono-blacklist-btn');
            });
            
            return cardsWithoutButtons.length > 0;
        };
        
        // 使用MutationObserver來監控DOM變化
        this.observer = new MutationObserver((mutations) => {
            if (isProcessing || !this.isActive) return;
            
            const hasSignificantChanges = mutations.some(mutation => {
                if (mutation.type === 'childList') {
                    return Array.from(mutation.addedNodes).some(node => 
                        node.nodeType === 1 && (
                            // 卡片變化
                            (node.matches && node.matches('a, [class*="card"]')) ||
                            (node.querySelector && node.querySelector('a, [class*="card"]')) ||
                            // 個人頁面內容變化 - 檢查主要內容容器
                            (node.matches && node.matches('main, [class*="user"], [class*="profile"], [id*="main"]')) ||
                            (node.querySelector && node.querySelector('main, [class*="user"], [class*="profile"]')) ||
                            // 任何包含大量內容的容器變化
                            (node.children && node.children.length > 5)
                        )
                    );
                }
                return false;
            });
            
            if (hasSignificantChanges) {
                isProcessing = true;
                setTimeout(() => {
                    if (this.isActive) {
                        processCallback();
                    }
                    isProcessing = false;
                }, 100);
            }
        });

        // 開始觀察
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 初始處理 - 增加多次嘗試以應對直接訪問URL的情況
        const initialProcess = () => {
            if (!this.isActive) return;
            // 立即處理一次（針對已存在的卡片）
            processCallback();
            // 然後在延遲後再處理
            setTimeout(() => {
                if (this.isActive) processCallback();
            }, 500);
        };
        
        // 立即執行一次（針對直接訪問URL的情況）
        initialProcess();
        
        // 1秒後處理
        setTimeout(() => {
            if (this.isActive) processCallback();
        }, 1000);
        
        // 2秒後處理
        setTimeout(() => {
            if (this.isActive) processCallback();
        }, 2000);
        
        // 3秒後處理
        setTimeout(() => {
            if (this.isActive) processCallback();
        }, 3000);
        
        // 5秒後處理（針對較慢的渲染）
        setTimeout(() => {
            if (this.isActive) processCallback();
        }, 5000);
        
        // 對於個人頁面，設置定期檢查機制
        if (this.isUserProfilePage()) {
            const profileCheckInterval = setInterval(() => {
                if (!this.isActive) {
                    clearInterval(profileCheckInterval);
                    return;
                }
                
                // 如果個人頁面沒有黑名單按鈕，重新處理
                if (!document.querySelector('.kemono-profile-blacklist-btn')) {
                    processCallback();
                }
            }, 2000); // 每2秒檢查一次
            
            // 10秒後停止定期檢查
            setTimeout(() => {
                clearInterval(profileCheckInterval);
            }, 10000);
        } else {
            // 對於卡片列表頁面，也設置定期檢查機制
            const cardListCheckInterval = setInterval(() => {
                if (!this.isActive) {
                    clearInterval(cardListCheckInterval);
                    return;
                }
                
                checkCount++;
                
                // 檢查是否有卡片但沒有按鈕
                if (hasCardsWithoutButtons()) {
                    processCallback();
                }
                
                // 達到最大檢查次數後停止
                if (checkCount >= maxChecks) {
                    clearInterval(cardListCheckInterval);
                }
            }, 2000); // 每2秒檢查一次
        }
    }

    destroy() {
        this.isActive = false;
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

    findUserCards() {
        // 檢查當前頁面類型
        const url = window.location.href;
        
        if (url.includes('/posts')) {
            return document.querySelectorAll('.card-list__items > article.post-card');
        } else {
            // 嘗試多種選擇器
            let cards = document.querySelectorAll('.card-list__items > a.user-card');
            if (cards.length === 0) {
                cards = document.querySelectorAll('.card-list__items > a');
            }
            if (cards.length === 0) {
                cards = document.querySelectorAll('[class*="card-list"] a.user-card');
            }
            if (cards.length === 0) {
                cards = document.querySelectorAll('a.user-card');
            }
            return cards;
        }
    }

    // 檢測是否是個人頁面
    isUserProfilePage() {
        const url = window.location.href;
        return /\/\w+\/user\/\d+(?:\?.*)?$/.test(url);
    }

    // 從URL提取個人頁面的創作者信息
    extractUserInfoFromCurrentPage() {
        const url = window.location.href;
        // 支援目前設定的站點網域
        const match = url.match(/\/(\w+)\/user\/(\d+)(?:\?.*)?$/);
        
        if (match) {
            const platform = match[1];
            const userId = match[2];
            
            // 嘗試找到創作者名稱
            let userName = `User ${userId}`;
            
            // 常見的創作者名稱選擇器
            const nameSelectors = [
                'h1',
                '[class*="user-header"] h1',
                '[class*="profile"] h1',
                '[class*="user-info"] h1',
                '[class*="name"]',
                '.user-name',
                '.profile-name'
            ];
            
            for (const selector of nameSelectors) {
                const nameElement = document.querySelector(selector);
                if (nameElement && nameElement.textContent.trim()) {
                    userName = nameElement.textContent.trim();
                    break;
                }
            }
            
            this.logger.debug('[DOMManager] 從個人頁面提取用戶信息:', {
                url,
                platform,
                userId,
                userName
            });
            
            return {
                id: userId,
                platform: platform,
                name: userName
            };
        }
        
        return null;
    }

    // 為個人頁面找到合適的按鈕容器
    findProfileButtonContainer() {
        // 找到創作者頭像或個人資訊卡片
        const containerSelectors = [
            '.user-header',
            '.profile-header', 
            '.user-info',
            '.profile-info',
            '[class*="user"]',
            '[class*="profile"]',
            '[class*="header"]',
            'img', // 創作者頭像
        ];
        
        for (const selector of containerSelectors) {
            const container = document.querySelector(selector);
            if (container) {
                return container;
            }
        }
        
        // 如果都找不到，嘗試找第一個有背景圖片的元素（通常是banner或頭像區域）
        const elementsWithBg = document.querySelectorAll('*');
        for (const el of elementsWithBg) {
            const style = window.getComputedStyle(el);
            if (style.backgroundImage && style.backgroundImage !== 'none' && el.offsetWidth > 100) {
                return el;
            }
        }
        
        // 最後fallback到body
        return document.body;
    }

    extractUserInfoFromLink(href, nameElement) {
        // 匹配 /平台/user/ID（含可選網域前綴），支援 URL 參數
        let match = href.match(/https?:\/\/[^/]+\/(\w+)\/user\/(\d+)(?:\?.*)?(?:#.*)?/);
        if (!match) {
            // 嘗試匹配不含域名的格式 /平台/user/ID，支援URL參數
            match = href.match(/\/(\w+)\/user\/(\d+)(?:\?.*)?(?:#.*)?/);
        }
        
        if (match) {
            const platform = match[1];
            const userId = match[2];
            const userName = nameElement ? nameElement.textContent.trim() : `User ${userId}`;
            
            return {
                id: userId,
                platform: platform,
                name: userName
            };
        }
        
        return null;
    }

    // 從文章卡片提取用戶信息（使用 data-user 和 data-service 屬性）
    extractUserInfoFromPostCard(postCard) {
        const userId = postCard.getAttribute('data-user');
        const platform = postCard.getAttribute('data-service');
        
        if (!userId || !platform) {
            return null;
        }
        
        // 嘗試從標題獲取用戶名稱（如果有的話）
        let userName = `User ${userId}`;
        const headerElement = postCard.querySelector('.post-card__header');
        if (headerElement && headerElement.textContent.trim()) {
            userName = headerElement.textContent.trim();
        }
        
        return {
            id: userId,
            platform: platform,
            name: userName
        };
    }

    findIconContainer(element) {
        // 按鈕掛在卡片外層右上角（略伸出），避免壓到標題；勿掛在 image-container（常有 overflow:hidden）
        if (element.classList.contains('post-card')) {
            return element;
        }

        // 創作者卡片：以整個連結作為定位容器
        const img = element.querySelector('img');
        if (img) {
            return element;
        }
        return null;
    }

    async extractUserIcon(card) {
        try {
            // 查找頭像圖片 - 嘗試多種選擇器
            let img = card.querySelector('img');
            
            if (!img) {
                // 如果直接找不到，嘗試在父元素中找
                const parent = card.closest('a, div');
                if (parent) {
                    img = parent.querySelector('img');
                }
            }
            
            if (!img || !img.src) {
                return null;
            }
            
            // 由於CORS限制，我們直接使用圖片的src URL
            // 不需要等待載入或轉換為base64
            return img.src;
        } catch (error) {
            return null;
        }
    }

    ensureContainerPosition(container) {
        // 確保容器有相對定位
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        // 按鈕會略伸出卡片外，需讓容器與祖先層不裁切
        this.ensureOverflowVisible(container, 6);
    }

    ensureOverflowVisible(startElement, maxDepth = 6) {
        let el = startElement;
        let depth = 0;
        while (el && el !== document.documentElement && depth <= maxDepth) {
            const style = getComputedStyle(el);
            const clips = (value) => value === 'hidden' || value === 'clip';

            // 只解除會裁切伸出按鈕的 hidden/clip，保留 auto/scroll 捲動行為
            if (clips(style.overflow) || clips(style.overflowX) || clips(style.overflowY)) {
                if (clips(style.overflow)) {
                    el.style.overflow = 'visible';
                }
                if (clips(style.overflowX)) {
                    el.style.overflowX = 'visible';
                }
                if (clips(style.overflowY)) {
                    el.style.overflowY = 'visible';
                }
            }
            el = el.parentElement;
            depth += 1;
        }
    }

    createButton(options) {
        const button = document.createElement('button');
        button.className = options.className;
        button.innerHTML = options.innerHTML;
        button.title = options.title;
        button.style.cssText = options.styles;

        // 添加hover效果
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'scale(1.1)';
            button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.6)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 3px 8px rgba(0,0,0,0.4)';
        });

        // 添加點擊事件
        if (options.onClick) {
            button.addEventListener('click', options.onClick);
        }

        return button;
    }

    clearButtons(selectors) {
        document.querySelectorAll(selectors).forEach(btn => btn.remove());
    }
}
