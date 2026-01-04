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
        
        // 讀取設定值，優先從 settings 物件讀取
        let maxSize = 600; // 預設值
        if (window.KemonoSettings && window.KemonoSettings.settings) {
            maxSize = window.KemonoSettings.settings.maxPreviewSize || 600;
        }
        
        // 如果還是預設值，嘗試從 localStorage 直接讀取
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
                window.KemonoLogger.warn('無法從 localStorage 讀取設定:', e);
            }
        }
        
        window.KemonoLogger.log('建立預覽圖，最大尺寸設定:', maxSize, 'px');
        window.KemonoLogger.log('設定來源:', {
            fromSettings: window.KemonoSettings?.settings?.maxPreviewSize,
            fromLocalStorage: (() => {
                try {
                    const local = localStorage.getItem('kemono_preview_settings');
                    return local ? JSON.parse(local).maxPreviewSize : null;
                } catch { return null; }
            })(),
            finalMaxSize: maxSize
        });
        
        // Debug logger
        if (window.DebugLogger) {
            window.DebugLogger.debug('建立預覽圖', {
                imageSrc: imageSrc,
                maxSize: maxSize,
                settings: window.KemonoSettings?.settings,
                fromLocalStorage: (() => {
                    try {
                        const local = localStorage.getItem('kemono_preview_settings');
                        return local ? JSON.parse(local) : null;
                    } catch { return null; }
                })()
            });
        }
        
        const preview = document.createElement('div');
        preview.id = 'image-preview';
        preview.className = 'kemono-preview-container';
        // 使用 !important 確保設定值優先於 CSS，並設定明確的寬度限制
        // 使用 border-box，所以 max-width 已經包含 padding 和 border
        preview.style.setProperty('max-width', `${maxSize}px`, 'important');
        preview.style.setProperty('max-height', '70vh', 'important');
        preview.style.setProperty('width', 'auto', 'important');
        preview.style.setProperty('height', 'auto', 'important');
        preview.style.setProperty('box-sizing', 'border-box', 'important');
        // 確保沒有額外的 margin
        preview.style.setProperty('margin', '0', 'important');
        
        const img = document.createElement('img');
        // 確保圖片受到容器尺寸限制，使用 width 而不是 max-width 來強制限制
        img.style.setProperty('max-width', '100%', 'important');
        img.style.setProperty('max-height', '100%', 'important');
        img.style.setProperty('width', 'auto', 'important');
        img.style.setProperty('height', 'auto', 'important');
        img.style.setProperty('display', 'block', 'important');
        img.style.setProperty('object-fit', 'contain', 'important');
        
        // 創建狀態顯示區域
        const statusDiv = document.createElement('div');
        statusDiv.className = 'kemono-preview-status';
        statusDiv.textContent = window.KemonoI18n.t('loading_post_images');
        
        img.onload = () => {
            // 重新讀取設定值，確保使用最新值
            let currentMaxSize = 600; // 預設值
            if (window.KemonoSettings && window.KemonoSettings.settings) {
                currentMaxSize = window.KemonoSettings.settings.maxPreviewSize || 600;
            }
            
            // 如果還是預設值，嘗試從 localStorage 直接讀取
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
                    window.KemonoLogger.warn('無法從 localStorage 讀取設定:', e);
                }
            }
            
            const maxHeightVh = window.innerHeight * 0.7; // 70vh 的實際像素值
            
            // 計算圖片的自然尺寸
            const naturalWidth = img.naturalWidth;
            const naturalHeight = img.naturalHeight;
            
            // Debug logger
            if (window.DebugLogger) {
                window.DebugLogger.debug('圖片載入完成', {
                    naturalWidth: naturalWidth,
                    naturalHeight: naturalHeight,
                    maxSize: currentMaxSize,
                    maxHeightVh: maxHeightVh
                });
            }
            
            // 計算縮放比例，確保圖片本身不超過最大尺寸
            // 需要同時考慮寬度和高度，取較小的縮放比例以保持比例
            let scaleWidth = 1;
            let scaleHeight = 1;
            
            if (naturalWidth > currentMaxSize) {
                scaleWidth = currentMaxSize / naturalWidth;
            }
            if (naturalHeight > maxHeightVh) {
                scaleHeight = maxHeightVh / naturalHeight;
            }
            
            // 取較小的縮放比例，確保兩個方向都不超過限制
            const scale = Math.min(scaleWidth, scaleHeight);
            
            // 計算目標尺寸（圖片內容區域的尺寸）
            const targetWidth = naturalWidth * scale;
            const targetHeight = naturalHeight * scale;
            
            // 計算容器的實際最大寬度（考慮 padding 和 border）
            const containerPadding = 5 * 2; // 左右各 5px
            const containerBorder = 2 * 2; // 左右各 2px
            const containerExtra = containerPadding + containerBorder; // 總共 14px
            const containerMaxWidth = currentMaxSize + containerExtra;
            
            // 設定容器的尺寸限制
            preview.style.setProperty('max-width', `${containerMaxWidth}px`, 'important');
            preview.style.setProperty('max-height', `${maxHeightVh}px`, 'important');
            
            // 移除圖片元素上可能存在的 width 和 height 屬性
            if (img.hasAttribute('width')) {
                img.removeAttribute('width');
            }
            if (img.hasAttribute('height')) {
                img.removeAttribute('height');
            }
            
            // 設定圖片的尺寸，確保不超過容器
            img.style.setProperty('max-width', '100%', 'important');
            img.style.setProperty('max-height', '100%', 'important');
            img.style.setProperty('width', 'auto', 'important');
            img.style.setProperty('height', 'auto', 'important');
            
            // 強制瀏覽器重新計算尺寸
            void preview.offsetWidth; // 觸發重排
            
            this.positionPreviewAtCursor(mouseEvent);
            preview.style.visibility = 'visible';
            this._previewReady = true;
            
            // 使用 requestAnimationFrame 確保在渲染後檢查尺寸
            requestAnimationFrame(() => {
                const actualWidth = preview.offsetWidth;
                const actualHeight = preview.offsetHeight;
                const imgWidth = img.offsetWidth;
                const imgHeight = img.offsetHeight;
                
                // 獲取計算後的樣式，檢查 box-sizing
                const computedStyle = window.getComputedStyle(preview);
                const boxSizing = computedStyle.boxSizing;
                const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
                const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
                const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
                const borderRight = parseFloat(computedStyle.borderRightWidth) || 0;
                const totalExtra = paddingLeft + paddingRight + borderLeft + borderRight;
                
                const sizeInfo = {
                    maxWidth: currentMaxSize,
                    maxHeight: maxHeightVh,
                    naturalWidth: naturalWidth,
                    naturalHeight: naturalHeight,
                    targetWidth: targetWidth,
                    targetHeight: targetHeight,
                    actualWidth: actualWidth,
                    actualHeight: actualHeight,
                    imgWidth: imgWidth,
                    imgHeight: imgHeight,
                    boxSizing: boxSizing,
                    totalExtra: totalExtra
                };
                
                window.KemonoLogger.log('圖片載入完成，預覽容器尺寸:', sizeInfo);
                
                // Debug logger
                if (window.DebugLogger) {
                    window.DebugLogger.debug('預覽尺寸檢查', sizeInfo);
                }
                
                // 計算容器的實際最大寬度（考慮 padding 和 border）
                const containerPadding = 5 * 2; // 左右各 5px
                const containerBorder = 2 * 2; // 左右各 2px
                const containerExtra = containerPadding + containerBorder; // 總共 14px
                const containerMaxWidth = currentMaxSize + containerExtra;
                
                // 如果實際寬度超過限制，強制設定寬度
                if (actualWidth > containerMaxWidth) {
                    preview.style.setProperty('width', `${containerMaxWidth}px`, 'important');
                    window.KemonoLogger.warn('強制修正預覽容器寬度:', containerMaxWidth, '實際寬度:', actualWidth);
                    if (window.DebugLogger) {
                        window.DebugLogger.warn('預覽容器寬度超出限制，已強制修正', {
                            maxSize: currentMaxSize,
                            containerMaxWidth: containerMaxWidth,
                            actualWidth: actualWidth,
                            boxSizing: boxSizing,
                            totalExtra: totalExtra
                        });
                    }
                }
                
                // 檢查圖片寬度是否超過限制
                if (imgWidth > currentMaxSize) {
                    img.style.setProperty('width', `${currentMaxSize}px`, 'important');
                    window.KemonoLogger.warn('強制修正圖片寬度:', currentMaxSize, '實際圖片寬度:', imgWidth);
                    if (window.DebugLogger) {
                        window.DebugLogger.warn('圖片寬度超出限制，已強制修正', {
                            maxSize: currentMaxSize,
                            imgWidth: imgWidth
                        });
                    }
                }
                
                // 如果實際高度超過限制，強制設定高度
                if (actualHeight > maxHeightVh) {
                    preview.style.setProperty('height', `${maxHeightVh}px`, 'important');
                    window.KemonoLogger.warn('強制修正預覽高度:', maxHeightVh, '實際高度:', actualHeight);
                    if (window.DebugLogger) {
                        window.DebugLogger.warn('預覽高度超出限制，已強制修正', {
                            maxHeight: maxHeightVh,
                            actualHeight: actualHeight
                        });
                    }
                }
                
                // 如果圖片寬度超過容器，再次強制限制
                if (imgWidth > currentMaxSize) {
                    const newScale = currentMaxSize / imgWidth;
                    img.style.setProperty('width', `${currentMaxSize}px`, 'important');
                    window.KemonoLogger.warn('強制修正圖片寬度:', currentMaxSize, '實際圖片寬度:', imgWidth);
                    if (window.DebugLogger) {
                        window.DebugLogger.warn('圖片寬度超出限制，已強制修正', {
                            maxSize: currentMaxSize,
                            imgWidth: imgWidth
                        });
                    }
                }
            });
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
        
        // 設定 ResizeObserver 來持續監聽尺寸變化
        this.setupResizeObserver(preview, img);
        
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
        // Debug logger
        if (window.DebugLogger) {
            window.DebugLogger.debug('切換預覽圖片', { newSrc, statusText });
        }
        
        // 顯示載入狀態
        this.updatePreviewStatus(window.KemonoI18n.t('loading'));
        
        // 添加載入樣式（可選：降低透明度）
        imgElement.style.opacity = '0.6';
        imgElement.style.filter = 'blur(1px)';
        
        // 創建新的圖片物件來預載入
        const newImg = new Image();
        
        newImg.onload = () => {
            // 載入完成，更新圖片和狀態
            imgElement.src = newSrc;
            imgElement.style.opacity = '1';
            imgElement.style.filter = 'none';
            
            // 確保容器尺寸限制仍然有效
            if (this._activePreview) {
                const maxSize = (window.KemonoSettings && window.KemonoSettings.settings) ? window.KemonoSettings.settings.maxPreviewSize : 600;
                const maxHeightVh = window.innerHeight * 0.7;
                
                // 移除圖片元素上可能存在的 width 和 height 屬性
                if (imgElement.hasAttribute('width')) {
                    imgElement.removeAttribute('width');
                }
                if (imgElement.hasAttribute('height')) {
                    imgElement.removeAttribute('height');
                }
                
                // 設定容器尺寸限制
                this._activePreview.style.setProperty('max-width', `${maxSize}px`, 'important');
                this._activePreview.style.setProperty('max-height', `${maxHeightVh}px`, 'important');
                
                // 設定圖片尺寸限制
                imgElement.style.setProperty('max-width', '100%', 'important');
                imgElement.style.setProperty('max-height', '100%', 'important');
                imgElement.style.setProperty('width', 'auto', 'important');
                imgElement.style.setProperty('height', 'auto', 'important');
                
                // 使用 requestAnimationFrame 確保在渲染後檢查尺寸
                requestAnimationFrame(() => {
                    const actualWidth = this._activePreview.offsetWidth;
                    const actualHeight = this._activePreview.offsetHeight;
                    const imgWidth = imgElement.offsetWidth;
                    
                    // 強制檢查並修正尺寸
                    if (actualWidth > maxSize) {
                        this._activePreview.style.setProperty('width', `${maxSize}px`, 'important');
                        window.KemonoLogger.warn('切換圖片後強制修正預覽寬度:', maxSize, '實際寬度:', actualWidth);
                    }
                    
                    if (actualHeight > maxHeightVh) {
                        this._activePreview.style.setProperty('height', `${maxHeightVh}px`, 'important');
                        window.KemonoLogger.warn('切換圖片後強制修正預覽高度:', maxHeightVh, '實際高度:', actualHeight);
                    }
                    
                    if (imgWidth > maxSize) {
                        imgElement.style.setProperty('width', `${maxSize}px`, 'important');
                        window.KemonoLogger.warn('切換圖片後強制修正圖片寬度:', maxSize, '實際圖片寬度:', imgWidth);
                        if (window.DebugLogger) {
                            window.DebugLogger.warn('切換圖片後圖片寬度超出限制', {
                                maxSize: maxSize,
                                imgWidth: imgWidth
                            });
                        }
                    }
                });
            }
            
            this.updatePreviewStatus(statusText);
            window.KemonoLogger.log(statusText);
            if (window.DebugLogger) {
                window.DebugLogger.debug('圖片切換完成', { statusText });
            }
        };
        
        newImg.onerror = () => {
            // 載入失敗，恢復樣式並顯示錯誤
            imgElement.style.opacity = '1';
            imgElement.style.filter = 'none';
            this.updatePreviewStatus(window.KemonoI18n.t('image_failed_to_load'));
            window.KemonoLogger.error('圖片載入失敗:', newSrc);
            if (window.DebugLogger) {
                window.DebugLogger.error('圖片載入失敗', { newSrc });
            }
        };
        
        // 開始預載入
        newImg.src = newSrc;
    },    positionPreviewAtCursor: function(event) {
        if (!this._activePreview || !event) return;
        
        const preview = this._activePreview;
        
        // 確保預覽圖可見以獲取正確的尺寸
        if (preview.style.visibility === 'hidden') {
            preview.style.visibility = 'visible';
            preview.style.opacity = '0';
        }
        
        // 重置變換
        preview.style.transform = 'none';
        
        // 獲取視窗尺寸和滾動位置
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight,
            scrollX: window.pageXOffset || document.documentElement.scrollLeft,
            scrollY: window.pageYOffset || document.documentElement.scrollTop
        };
        
        // 強制重新計算預覽圖尺寸
        preview.style.left = '0px';
        preview.style.top = '0px';
        const previewRect = preview.getBoundingClientRect();
        let previewWidth = previewRect.width;
        let previewHeight = previewRect.height;
        
        // 如果尺寸為0，使用預設值
        if (previewWidth === 0) previewWidth = 300;
        if (previewHeight === 0) previewHeight = 200;        // 較小的偏移量，讓預覽圖更接近游標
        const offset = 15;
        const margin = 5; // 視窗邊緣留白
        const statusBarHeight = 25; // 狀態欄高度
        const horizontalOffset = 20; // 水平偏移量，讓預覽圖往右移動，避免游標停留在預覽圖上
        
        // 游標位置
        const cursorX = event.clientX;
        const cursorY = event.clientY;
        
        // 預設位置：預覽圖左上角對齊游標位置（考慮狀態欄高度和水平偏移）
        let left = cursorX + horizontalOffset;
        let top = cursorY - statusBarHeight;        // 右邊界檢查：如果預覽圖會超出右邊，向左調整
        if (left + previewWidth > viewport.width - margin) {
            left = viewport.width - previewWidth - margin;
        }
        
        // 左邊界檢查：確保不會超出左邊
        if (left < margin) {
            left = margin;
        }
        
        // 下邊界檢查：如果預覽圖會超出下邊，向上調整
        if (top + previewHeight + statusBarHeight > viewport.height - margin) {
            top = viewport.height - previewHeight - statusBarHeight - margin;
        }
        
        // 上邊界檢查：確保狀態欄不會超出上邊
        if (top - statusBarHeight < margin) {
            top = margin + statusBarHeight;
        }
        
        // 最終邊界強制限制：確保預覽圖和狀態欄完全在視窗內
        left = Math.max(margin, Math.min(left, viewport.width - previewWidth - margin));
        top = Math.max(margin + statusBarHeight, Math.min(top, viewport.height - previewHeight - margin));
        
        // 設定最終位置
        preview.style.left = `${Math.round(left)}px`;
        preview.style.top = `${Math.round(top)}px`;
        preview.style.opacity = '1';
        
        window.KemonoLogger.log(`優化預覽圖定位: left=${Math.round(left)}, top=${Math.round(top)}, 預覽尺寸: ${previewWidth}x${previewHeight}, 游標: x=${cursorX}, y=${cursorY}, 視窗: ${viewport.width}x${viewport.height}`);
    },
      updatePreviewPosition: function(event) {
        // 使用相同的智能定位邏輯
        if (!this._activePreview) return;
        
        this.positionPreviewAtCursor(event);
    },
    
    setupResizeObserver: function(preview, img) {
        // 清除舊的觀察者
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        
        // 建立新的 ResizeObserver 來監聽尺寸變化
        this._resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const target = entry.target;
                const maxSize = (window.KemonoSettings && window.KemonoSettings.settings) ? window.KemonoSettings.settings.maxPreviewSize : 600;
                const maxHeightVh = window.innerHeight * 0.7;
                
                // 檢查容器尺寸
                if (target === preview) {
                    const width = entry.contentRect.width;
                    const height = entry.contentRect.height;
                    
                    if (width > maxSize) {
                        preview.style.setProperty('width', `${maxSize}px`, 'important');
                        window.KemonoLogger.warn('ResizeObserver: 強制修正預覽容器寬度:', maxSize, '實際寬度:', width);
                    }
                    
                    if (height > maxHeightVh) {
                        preview.style.setProperty('height', `${maxHeightVh}px`, 'important');
                        window.KemonoLogger.warn('ResizeObserver: 強制修正預覽容器高度:', maxHeightVh, '實際高度:', height);
                    }
                }
                
                // 檢查圖片尺寸
                if (target === img) {
                    const width = entry.contentRect.width;
                    if (width > maxSize) {
                        img.style.setProperty('width', `${maxSize}px`, 'important');
                        window.KemonoLogger.warn('ResizeObserver: 強制修正圖片寬度:', maxSize, '實際寬度:', width);
                    }
                }
            }
        });
        
        // 開始觀察
        this._resizeObserver.observe(preview);
        this._resizeObserver.observe(img);
    },
    
    removeActivePreview: function() {
        // 清除任何待處理的預覽請求
        if (this._pendingPreview) {
            clearTimeout(this._pendingPreview);
            this._pendingPreview = null;
        }
        
        // 清除 ResizeObserver
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
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
