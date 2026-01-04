// Initialize the logger if it doesn't exist yet
window.KemonoLogger = window.KemonoLogger || {
    log: function(...args) {
        if (window.KemonoConfig && window.KemonoConfig.debug) {
            console.log('[Kemono Hover]', ...args);
        }
    },
    error: function(...args) {
        console.error('[Kemono Hover]', ...args);
    },
    warn: function(...args) {
        if (window.KemonoConfig && window.KemonoConfig.debug) {
            console.warn('[Kemono Hover]', ...args);
        }
    }
};

// Initialize configuration
window.KemonoConfig = window.KemonoConfig || {
    debug: true  // Set to false in production
};

// Initialize utilities
window.KemonoUtil = window.KemonoUtil || {
    _activePreview: null,
    _currentImageIndex: 0,
    _relatedImages: [],
    _isLoadingImages: false,
    _postImages: [],
    _pendingPreview: null,
    _previewReady: false,
    _apiCache: new Map(), // API 快取
    _currentPostUrl: null, // 當前貼文 URL
    _coverImage: null, // 封面圖像
    _resizeObserver: null, // ResizeObserver 用於監聽尺寸變化
    
    createImagePreviewWithAPI: function(imageSrc, mouseEvent, postUrl, siteHandler) {
        // 檢查是否啟用
        if (!window.KemonoSettings || !window.KemonoSettings.settings || !window.KemonoSettings.settings.enabled) {
            if (window.DebugLogger) {
                window.DebugLogger.debug('預覽功能已停用');
            }
            return null;
        }
        
        // Debug logger
        if (window.DebugLogger) {
            window.DebugLogger.debug('建立預覽（含 API）', {
                imageSrc: imageSrc,
                postUrl: postUrl,
                hasSiteHandler: !!siteHandler
            });
        }
        
        // 創建基本預覽
        const preview = this.createImagePreview(imageSrc, mouseEvent);
        if (!preview) return null;
        
        // 如果有貼文 URL，立即開始載入 API 數據
        if (postUrl) {
            this._currentPostUrl = postUrl;
            this.loadPostImagesAsync(postUrl, siteHandler);
        }
        
        return preview;
    },
    
    createImagePreview: function(imageSrc, mouseEvent, relatedImages = []) {
        // 檢查是否啟用
        if (!window.KemonoSettings || !window.KemonoSettings.settings || !window.KemonoSettings.settings.enabled) {
            return null;
        }
        
        this._previewReady = false;
        
        if (this._pendingPreview) {
            clearTimeout(this._pendingPreview);
            this._pendingPreview = null;
        }
        
        if (this._activePreview) {
            const currentImg = this._activePreview.querySelector('img');
            if (currentImg && currentImg.src === imageSrc) {
                this.positionPreviewAtCursor(mouseEvent);
                return this._activePreview;
            }
            this.removeActivePreview();
        }
        
        // 讀取設定值
        let maxSize = 600;
        if (window.KemonoSettings && window.KemonoSettings.settings) {
            maxSize = window.KemonoSettings.settings.maxPreviewSize || 600;
        }
        if (maxSize === 600) {
            try {
                const localSettings = localStorage.getItem('kemono_preview_settings');
                if (localSettings) {
                    const previewSettings = JSON.parse(localSettings);
                    if (previewSettings.maxPreviewSize) {
                        maxSize = previewSettings.maxPreviewSize;
                    }
                }
            } catch (e) {
                // 忽略錯誤
            }
        }
        
        if (window.DebugLogger) {
            window.DebugLogger.debug('建立預覽圖', { imageSrc, maxSize });
        }
        
        const preview = document.createElement('div');
        preview.id = 'image-preview';
        preview.className = 'kemono-preview-container';
        preview.style.setProperty('max-width', `${maxSize}px`, 'important');
        preview.style.setProperty('max-height', `${maxSize}px`, 'important');
        preview.style.setProperty('box-sizing', 'border-box', 'important');
        preview.style.setProperty('margin', '0', 'important');
        
        const img = document.createElement('img');
        img.style.setProperty('max-width', '100%', 'important');
        img.style.setProperty('max-height', '100%', 'important');
        img.style.setProperty('display', 'block', 'important');
        img.style.setProperty('object-fit', 'contain', 'important');
        
        // 創建狀態顯示區域
        const statusDiv = document.createElement('div');
        statusDiv.className = 'kemono-preview-status';
        statusDiv.textContent = window.KemonoI18n.t('loading_post_images');
        
        img.onload = () => {
            // 重新讀取設定值
            let currentMaxSize = 600;
            if (window.KemonoSettings && window.KemonoSettings.settings) {
                currentMaxSize = window.KemonoSettings.settings.maxPreviewSize || 600;
            }
            if (currentMaxSize === 600) {
                try {
                    const localSettings = localStorage.getItem('kemono_preview_settings');
                    if (localSettings) {
                        const previewSettings = JSON.parse(localSettings);
                        if (previewSettings.maxPreviewSize) {
                            currentMaxSize = previewSettings.maxPreviewSize;
                        }
                    }
                } catch (e) {
                    // 忽略錯誤
                }
            }
            
            const naturalWidth = img.naturalWidth;
            const naturalHeight = img.naturalHeight;
            
            // 計算縮放比例（同時考慮寬度和高度限制）
            let scale = 1;
            if (naturalWidth > currentMaxSize) {
                scale = Math.min(scale, currentMaxSize / naturalWidth);
            }
            if (naturalHeight > currentMaxSize) {
                scale = Math.min(scale, currentMaxSize / naturalHeight);
            }
            
            // 計算目標尺寸
            const targetWidth = naturalWidth * scale;
            const targetHeight = naturalHeight * scale;
            
            // 計算容器最大寬度（考慮 padding 和 border）
            const containerPadding = 5 * 2;
            const containerBorder = 2 * 2;
            const containerMaxWidth = currentMaxSize + containerPadding + containerBorder;
            
            // 計算容器最大高度（考慮狀態欄在容器上方）
            const statusBarHeight = 25;
            const containerMaxHeight = currentMaxSize + statusBarHeight;
            
            // 設定容器尺寸
            preview.style.setProperty('max-width', `${containerMaxWidth}px`, 'important');
            preview.style.setProperty('max-height', `${containerMaxHeight}px`, 'important');
            
            // 設定圖片尺寸（直接設定寬度，不設動畫）
            img.style.setProperty('width', `${targetWidth}px`, 'important');
            img.style.setProperty('height', `${targetHeight}px`, 'important');
            
            if (window.DebugLogger) {
                window.DebugLogger.debug('圖片載入完成', {
                    naturalSize: `${naturalWidth}x${naturalHeight}`,
                    targetSize: `${targetWidth}x${targetHeight}`,
                    maxSize: currentMaxSize,
                    scale: scale
                });
            }
            
            this.positionPreviewAtCursor(mouseEvent);
            preview.style.visibility = 'visible';
            this._previewReady = true;
        };
        
        img.onerror = () => {
            window.KemonoLogger.error('Failed to load image:', imageSrc);
            if (window.DebugLogger) {
                window.DebugLogger.error('預覽圖片載入失敗', { imageSrc });
            }
            const errorMsg = document.createElement('div');
            errorMsg.className = 'kemono-error-message';
            errorMsg.textContent = window.KemonoI18n.t('image_failed_to_load');
            preview.innerHTML = '';
            preview.appendChild(errorMsg);
            preview.style.visibility = 'visible';
            this._previewReady = true;
        };
        
        const loadTimeout = setTimeout(() => {
            if (!this._previewReady && preview === this._activePreview) {
                preview.style.visibility = 'visible';
                const loadingMsg = document.createElement('div');
                loadingMsg.className = 'kemono-loading-overlay';
                loadingMsg.textContent = window.KemonoI18n.t('loading');
                preview.appendChild(loadingMsg);
            }
        }, 300);
        
        preview.appendChild(img);
        preview.appendChild(statusDiv);
        document.body.appendChild(preview);
        this._activePreview = preview;
        
        img.src = imageSrc;
        
        this._relatedImages = relatedImages;
        this._currentImageIndex = Math.max(0, relatedImages.indexOf(imageSrc));
        
        this.positionPreviewAtCursor(mouseEvent);
        
        return preview;
    },
    
    createLoadingIndicator: function(mouseEvent) {
        this.removeActivePreview();
        
        const preview = document.createElement('div');
        preview.id = 'image-preview';
        preview.className = 'kemono-preview-container loading';
        
        const loadingText = document.createElement('div');
        loadingText.className = 'kemono-loading-text';
        loadingText.textContent = window.KemonoI18n.t('loading_post_images');
        
        const spinner = document.createElement('div');
        spinner.className = 'kemono-loading-spinner';
        
        preview.appendChild(spinner);
        preview.appendChild(loadingText);
        document.body.appendChild(preview);
        this._activePreview = preview;
        
        this.positionPreviewAtCursor(mouseEvent);
        
        this._isLoadingImages = true;
        return preview;
    },
    
    loadPostImagesAsync: async function(postUrl, siteHandler) {
        if (!postUrl || !siteHandler || !siteHandler.fetchPostImages) {
            window.KemonoLogger.error('loadPostImagesAsync: 缺少必要參數', { postUrl, siteHandler });
            this.updatePreviewStatus(window.KemonoI18n.t('no_images_found'));
            return;
        }
        
        window.KemonoLogger.log('開始載入貼文圖片:', postUrl);
        
        try {
            // 檢查快取
            if (this._apiCache.has(postUrl)) {
                window.KemonoLogger.log('使用快取數據');
                const cachedData = this._apiCache.get(postUrl);
                this._postImages = cachedData.contentImages || [];
                this._relatedImages = cachedData.contentImages || [];
                this._coverImage = cachedData.coverImage;
                this._hasOriginalImages = cachedData.hasOriginalImages;
                  // 檢查當前預覽的圖片並更新狀態
                const currentImg = this._activePreview?.querySelector('img');
                if (currentImg && this._coverImage && currentImg.src === this._coverImage) {
                    // 當前顯示的是封面圖
                    const statusText = this._hasOriginalImages 
                        ? (this._relatedImages.length > 1 
                            ? window.KemonoI18n.t('image_count_original', { current: 1, total: this._relatedImages.length })
                            : window.KemonoI18n.t('cover_preview_original'))
                        : (this._relatedImages.length > 1 
                            ? window.KemonoI18n.t('image_count', { current: 1, total: this._relatedImages.length })
                            : window.KemonoI18n.t('cover_preview'));
                    this.updatePreviewStatus(statusText);
                } else if (this._relatedImages.length > 0) {
                    // 找到當前圖片在列表中的索引
                    const currentIndex = this._relatedImages.findIndex(img => img === (currentImg ? currentImg.src : ''));
                    if (currentIndex >= 0) {
                        this._currentImageIndex = currentIndex;
                        const statusText = this._hasOriginalImages 
                            ? window.KemonoI18n.t('image_count_original', {
                                current: currentIndex + 1,
                                total: this._relatedImages.length
                            })
                            : window.KemonoI18n.t('image_count', {
                                current: currentIndex + 1,
                                total: this._relatedImages.length
                            });
                        this.updatePreviewStatus(statusText);
                    } else {
                        // 找不到當前圖片，顯示預設狀態
                        const statusText = this._relatedImages.length > 1
                            ? (this._hasOriginalImages 
                                ? window.KemonoI18n.t('image_count_original', { current: 1, total: this._relatedImages.length })
                                : window.KemonoI18n.t('image_count', { current: 1, total: this._relatedImages.length }))
                            : (this._hasOriginalImages 
                                ? window.KemonoI18n.t('cover_preview_original') 
                                : window.KemonoI18n.t('cover_preview'));
                        this.updatePreviewStatus(statusText);
                    }
                } else {
                    this.updatePreviewStatus(window.KemonoI18n.t('only_cover_available'));
                }
                
                window.KemonoLogger.log('使用快取的圖片數據 - 內文圖片:', this._relatedImages.length);
                return;
            }
            
            // 更新狀態
            this.updatePreviewStatus(window.KemonoI18n.t('loading_post_images'));
            this._isLoadingImages = true;
            
            window.KemonoLogger.log('呼叫 API 獲取圖片...');
            
            // 獲取圖片
            const result = await siteHandler.fetchPostImages(postUrl);
            
            window.KemonoLogger.log('API 回應結果:', result);
            if (window.DebugLogger) {
                window.DebugLogger.debug('API 回應結果', {
                    postUrl: postUrl,
                    coverImage: result.coverImage ? '有' : '無',
                    contentImagesCount: result.contentImages?.length || 0,
                    hasOriginalImages: result.hasOriginalImages || false
                });
            }
            
            // 處理新的 API 回應格式
            const coverImage = result.coverImage || null;
            const contentImages = result.contentImages || [];
            const hasOriginalImages = result.hasOriginalImages || false;
            
            window.KemonoLogger.log('處理後的數據:', { coverImage, contentImages: contentImages.length, hasOriginalImages });
            
            // 快取結果
            const cacheData = {
                coverImage: coverImage,
                contentImages: contentImages,
                hasOriginalImages: hasOriginalImages
            };
            this._apiCache.set(postUrl, cacheData);
            
            this._postImages = contentImages;
            this._relatedImages = contentImages;
            this._coverImage = coverImage;
            this._hasOriginalImages = hasOriginalImages;
              // 更新狀態顯示
            const currentImg = this._activePreview?.querySelector('img');
            if (currentImg && coverImage && currentImg.src === coverImage) {
                // 當前顯示的是封面圖
                const statusText = hasOriginalImages 
                    ? (contentImages.length > 1 
                        ? window.KemonoI18n.t('image_count_original', { current: 1, total: contentImages.length })
                        : window.KemonoI18n.t('cover_preview_original'))
                    : (contentImages.length > 1 
                        ? window.KemonoI18n.t('image_count', { current: 1, total: contentImages.length })
                        : window.KemonoI18n.t('cover_preview'));
                this.updatePreviewStatus(statusText);
            } else if (contentImages.length > 0) {
                // 檢查當前是否顯示其他圖片
                const currentIndex = contentImages.findIndex(img => img === (currentImg ? currentImg.src : ''));
                if (currentIndex >= 0) {
                    this._currentImageIndex = currentIndex;
                    const statusText = hasOriginalImages 
                        ? window.KemonoI18n.t('image_count_original', {
                            current: currentIndex + 1,
                            total: contentImages.length
                        })
                        : window.KemonoI18n.t('image_count', {
                            current: currentIndex + 1,
                            total: contentImages.length
                        });
                    this.updatePreviewStatus(statusText);
                } else {
                    // 找不到當前圖片，顯示預設狀態
                    const statusText = contentImages.length > 1
                        ? (hasOriginalImages 
                            ? window.KemonoI18n.t('image_count_original', { current: 1, total: contentImages.length })
                            : window.KemonoI18n.t('image_count', { current: 1, total: contentImages.length }))
                        : (hasOriginalImages 
                            ? window.KemonoI18n.t('cover_preview_original') 
                            : window.KemonoI18n.t('cover_preview'));
                    this.updatePreviewStatus(statusText);
                }
            } else {
                this.updatePreviewStatus(window.KemonoI18n.t('only_cover_available'));
            }
            
            if (hasOriginalImages) {
                window.KemonoLogger.warn(`API 載入完成，使用原圖 - 封面圖: ${coverImage ? 1 : 0} 張，內文圖片: ${contentImages.length} 張`);
            } else {
                window.KemonoLogger.log(`API 載入完成，封面圖: ${coverImage ? 1 : 0} 張，內文圖片: ${contentImages.length} 張`);
            }
            
        } catch (error) {
            window.KemonoLogger.error('載入貼文圖片時出錯:', error);
            this.updatePreviewStatus(window.KemonoI18n.t('api_failed'));
        } finally {
            this._isLoadingImages = false;
        }
    },
    
    updatePreviewStatus: function(statusText) {
        if (!this._activePreview) return;
        
        const statusDiv = this._activePreview.querySelector('.kemono-preview-status');
        if (statusDiv) {
            statusDiv.textContent = statusText;
        }
    },      navigateImages: function(direction) {
        // 如果沒有活動預覽，無法導航
        if (!this._activePreview) {
            window.KemonoLogger.log('沒有活動預覽');
            return;
        }
        
        const currentImg = this._activePreview.querySelector('img');
        if (!currentImg) {
            window.KemonoLogger.log('預覽中找不到圖片元素');
            return;
        }
        
        // 建立完整的圖片列表
        let allImages = [];
        
        // 如果有內文圖片，使用內文圖片列表
        if (this._relatedImages.length > 0) {
            allImages = [...this._relatedImages];
        } 
        // 如果沒有內文圖片但有封面圖，創建只包含封面圖的列表
        else if (this._coverImage) {
            allImages = [this._coverImage];
        }
        
        // 如果沒有任何圖片，無法導航
        if (allImages.length === 0) {
            window.KemonoLogger.log('沒有圖片可導航 - relatedImages:', this._relatedImages.length, 'coverImage:', !!this._coverImage);
            return;
        }
        
        // 如果只有一張圖片，不需要切換但可以顯示提示
        if (allImages.length === 1) {
            window.KemonoLogger.log('只有一張圖片，無需切換');
            // 更新狀態顯示，確保顯示正確
            const statusText = this._hasOriginalImages 
                ? window.KemonoI18n.t('cover_preview_original')
                : window.KemonoI18n.t('cover_preview');
            this.updatePreviewStatus(statusText);
            return;
        }
        
        // 找到當前圖片在完整列表中的索引
        let currentIndex = allImages.findIndex(img => img === currentImg.src);
        
        // 如果找不到當前圖片，設為0
        if (currentIndex === -1) {
            window.KemonoLogger.log('無法找到當前圖片在列表中的位置，設為第一張');
            currentIndex = 0;
        }
        
        // 計算下一張圖片的索引（循環切換）
        let nextIndex;
        if (direction > 0) {
            // 向前：到達最後一張時回到第一張
            nextIndex = (currentIndex + 1) % allImages.length;
        } else {
            // 向後：到達第一張時回到最後一張
            nextIndex = (currentIndex - 1 + allImages.length) % allImages.length;
        }
        
        const nextImage = allImages[nextIndex];
        
        // 決定狀態文字
        const statusText = this._hasOriginalImages 
            ? window.KemonoI18n.t('image_count_original', { 
                current: nextIndex + 1, 
                total: allImages.length 
            })
            : window.KemonoI18n.t('image_count', { 
                current: nextIndex + 1, 
                total: allImages.length 
            });
        
        // 更新當前圖片索引
        this._currentImageIndex = nextIndex;
        
        // 載入新圖片
        this.loadImageWithIndicator(currentImg, nextImage, statusText);
        
        window.KemonoLogger.log(`切換到圖片 ${nextIndex + 1}/${allImages.length}: ${nextImage}`);
    },
    
    loadImageWithIndicator: function(imgElement, newSrc, statusText) {
        if (window.DebugLogger) {
            window.DebugLogger.debug('切換預覽圖片', { newSrc, statusText });
        }
        
        this.updatePreviewStatus(window.KemonoI18n.t('loading'));
        
        const newImg = new Image();
        
        newImg.onload = () => {
            // 重新讀取設定值並計算尺寸
            let maxSize = 600;
            if (window.KemonoSettings && window.KemonoSettings.settings) {
                maxSize = window.KemonoSettings.settings.maxPreviewSize || 600;
            }
            if (maxSize === 600) {
                try {
                    const localSettings = localStorage.getItem('kemono_preview_settings');
                    if (localSettings) {
                        const previewSettings = JSON.parse(localSettings);
                        if (previewSettings.maxPreviewSize) {
                            maxSize = previewSettings.maxPreviewSize;
                        }
                    }
                } catch (e) {
                    // 忽略錯誤
                }
            }
            
            // 計算縮放比例（同時考慮寬度和高度限制）
            const naturalWidth = newImg.naturalWidth;
            const naturalHeight = newImg.naturalHeight;
            let scale = 1;
            if (naturalWidth > maxSize) {
                scale = Math.min(scale, maxSize / naturalWidth);
            }
            if (naturalHeight > maxSize) {
                scale = Math.min(scale, maxSize / naturalHeight);
            }
            
            const targetWidth = naturalWidth * scale;
            const targetHeight = naturalHeight * scale;
            
            // 更新圖片（直接設定尺寸，不設動畫）
            imgElement.src = newSrc;
            imgElement.style.setProperty('width', `${targetWidth}px`, 'important');
            imgElement.style.setProperty('height', `${targetHeight}px`, 'important');
            
            // 更新容器尺寸
            if (this._activePreview) {
                const containerPadding = 5 * 2;
                const containerBorder = 2 * 2;
                const statusBarHeight = 25;
                const containerMaxWidth = maxSize + containerPadding + containerBorder;
                const containerMaxHeight = maxSize + statusBarHeight;
                this._activePreview.style.setProperty('max-width', `${containerMaxWidth}px`, 'important');
                this._activePreview.style.setProperty('max-height', `${containerMaxHeight}px`, 'important');
            }
            
            this.updatePreviewStatus(statusText);
        };
        
        newImg.onerror = () => {
            this.updatePreviewStatus(window.KemonoI18n.t('image_failed_to_load'));
            if (window.DebugLogger) {
                window.DebugLogger.error('圖片載入失敗', { newSrc });
            }
        };
        
        newImg.src = newSrc;
    },    positionPreviewAtCursor: function(event) {
        if (!this._activePreview || !event) return;
        
        const preview = this._activePreview;
        
        // 確保預覽圖可見以獲取正確的尺寸
        if (preview.style.visibility === 'hidden') {
            preview.style.visibility = 'visible';
            preview.style.opacity = '0';
        }
        
        // 獲取視窗尺寸
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        // 獲取預覽圖尺寸（包含狀態欄）
        const previewRect = preview.getBoundingClientRect();
        let previewWidth = previewRect.width || 300;
        let previewHeight = previewRect.height || 200;
        
        // 狀態欄高度（從 CSS 中獲取）
        const statusBarHeight = 25;
        const margin = 5;
        const horizontalOffset = 20;
        
        // 游標位置
        const cursorX = event.clientX;
        const cursorY = event.clientY;
        
        // 計算位置（考慮狀態欄在容器上方）
        let left = cursorX + horizontalOffset;
        let top = cursorY - statusBarHeight;
        
        // 邊界檢查
        if (left + previewWidth > viewport.width - margin) {
            left = viewport.width - previewWidth - margin;
        }
        if (left < margin) {
            left = margin;
        }
        
        // 下邊界檢查（考慮狀態欄在容器上方，所以預覽圖高度已經包含狀態欄）
        if (top + previewHeight > viewport.height - margin) {
            top = viewport.height - previewHeight - margin;
        }
        
        // 上邊界檢查（確保狀態欄不超出，狀態欄在 top - statusBarHeight 位置）
        if (top - statusBarHeight < margin) {
            top = margin + statusBarHeight;
        }
        
        // 設定位置
        preview.style.left = `${Math.round(left)}px`;
        preview.style.top = `${Math.round(top)}px`;
        preview.style.opacity = '1';
    },
      updatePreviewPosition: function(event) {
        // 使用相同的智能定位邏輯
        if (!this._activePreview) return;
        
        this.positionPreviewAtCursor(event);
    },
    
    removeActivePreview: function() {
        // 清除任何待處理的預覽請求
        if (this._pendingPreview) {
            clearTimeout(this._pendingPreview);
            this._pendingPreview = null;
        }
        
        if (this._activePreview && this._activePreview.parentNode) {
            // 使用淡出效果移除預覽
            this._activePreview.style.transition = 'opacity 0.1s ease';
            this._activePreview.style.opacity = '0';
            
            const preview = this._activePreview;
            // 短暫延遲後從 DOM 中移除元素
            setTimeout(() => {
                if (preview.parentNode) {
                    preview.parentNode.removeChild(preview);
                }
                // 僅當這是當前活動的預覽時才重置
                if (this._activePreview === preview) {
                    this._activePreview = null;
                    this._previewReady = false;
                }
            }, 100);
        } else {
            this._activePreview = null;
            this._previewReady = false;
        }
    },
    
    isMouseOverPreview: function(event) {
        if (!this._activePreview) return false;
        
        const rect = this._activePreview.getBoundingClientRect();
        return (
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom
        );
    },
    
    getActivePreview: function() {
        return this._activePreview;
    },
    
    isLoadingImages: function() {
        return this._isLoadingImages;
    },
    
    resetPostImages: function() {
        this._postImages = [];
        this._currentPostUrl = null;
        this._coverImage = null;
        this._hasOriginalImages = false;
        this._currentImageIndex = 0;
    },
    
    clearAPICache: function() {
        this._apiCache.clear();
        window.KemonoLogger.log('API 快取已清除');
    }
};

window.KemonoLogger.log('Utilities initialized');
