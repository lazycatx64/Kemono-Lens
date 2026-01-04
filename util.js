// Initialize utilities
window.KemonoUtil = window.KemonoUtil || {
    _activePreview: null,
    _currentImageIndex: 0,
    _relatedImages: [],
    _isLoadingImages: false,
    _isLoadingSingleImage: false, // 追蹤單個圖片是否正在載入
    _postImages: [],
    _pendingPreview: null,
    _previewReady: false,
    _apiCache: new Map(), // API 快取
    _currentPostUrl: null, // 當前貼文 URL
    _coverImage: null, // 封面圖像
    _resizeObserver: null, // ResizeObserver 用於監聽尺寸變化
    _preloadedImages: new Map(), // 預載入的圖片快取，key 為圖片 URL，value 為 Image 物件
    _nonImageCount: 0, // 非圖片數量
    _lastMouseEvent: null, // 最後一次游標位置，用於圖片切換時重新計算位置
    
    createImagePreviewWithAPI: function(imageSrc, mouseEvent, postUrl, siteHandler) {
        // 檢查是否啟用
        if (!window.KemonoSettings || !window.KemonoSettings.settings || !window.KemonoSettings.settings.enabled) {
            return null;
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
            if (currentImg && this.compareImageUrls(currentImg.src, imageSrc)) {
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
            
            this.positionPreviewAtCursor(mouseEvent);
            preview.style.visibility = 'visible';
            this._previewReady = true;
        };
        
        img.onerror = () => {
            window.KemonoLogger.error('Failed to load image:', imageSrc);
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
                this._nonImageCount = cachedData.nonImageCount || 0;
                // 檢查當前預覽的圖片並更新狀態
                const currentImg = this._activePreview?.querySelector('img');
                if (currentImg) {
                    const statusText = this.generatePreviewStatusText(
                        currentImg.src,
                        this._coverImage,
                        this._relatedImages,
                        this._nonImageCount
                    );
                    this.updatePreviewStatus(statusText);
                    // 更新當前圖片索引
                    const currentIndex = this._relatedImages.findIndex(img => 
                        this.compareImageUrls(img, currentImg.src)
                    );
                    if (currentIndex >= 0) {
                        this._currentImageIndex = currentIndex;
                    }
                } else {
                    // 如果沒有當前圖片，顯示預設狀態
                    const statusText = this.generatePreviewStatusText(
                        null,
                        this._coverImage,
                        this._relatedImages,
                        this._nonImageCount
                    );
                    this.updatePreviewStatus(statusText);
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
            
            // 處理新的 API 回應格式
            const coverImage = result.coverImage || null;
            const contentImages = result.contentImages || [];
            const hasOriginalImages = result.hasOriginalImages || false;
            const nonImageCount = result.nonImageCount || 0;
            
            window.KemonoLogger.log('處理後的數據:', { coverImage, contentImages: contentImages.length, hasOriginalImages, nonImageCount });
            
            // 快取結果
            const cacheData = {
                coverImage: coverImage,
                contentImages: contentImages,
                hasOriginalImages: hasOriginalImages,
                nonImageCount: nonImageCount
            };
            this._apiCache.set(postUrl, cacheData);
            
            this._postImages = contentImages;
            this._relatedImages = contentImages;
            this._coverImage = coverImage;
            this._hasOriginalImages = hasOriginalImages;
            this._nonImageCount = nonImageCount;
            // 更新狀態顯示
            const currentImg = this._activePreview?.querySelector('img');
            if (currentImg) {
                const statusText = this.generatePreviewStatusText(
                    currentImg.src,
                    coverImage,
                    contentImages,
                    nonImageCount
                );
                this.updatePreviewStatus(statusText);
                // 更新當前圖片索引
                const currentIndex = contentImages.findIndex(img => 
                    this.compareImageUrls(img, currentImg.src)
                );
                if (currentIndex >= 0) {
                    this._currentImageIndex = currentIndex;
                }
            } else {
                // 如果沒有當前圖片，顯示預設狀態
                const statusText = this.generatePreviewStatusText(
                    null,
                    coverImage,
                    contentImages,
                    nonImageCount
                );
                this.updatePreviewStatus(statusText);
            }
            
            if (hasOriginalImages) {
                window.KemonoLogger.warn(`API 載入完成，使用原圖 - 封面圖: ${coverImage ? 1 : 0} 張，內文圖片: ${contentImages.length} 張`);
            } else {
                window.KemonoLogger.log(`API 載入完成，封面圖: ${coverImage ? 1 : 0} 張，內文圖片: ${contentImages.length} 張`);
            }
            
            // 預載入接下來的圖片
            this.preloadNextImages();
            
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
    },
    
    // 生成預覽狀態文字
    generatePreviewStatusText: function(currentImgSrc, coverImage, contentImages, nonImageCount = 0) {
        // 計算去重後的實際圖片總數
        // 邏輯：
        // 1. contentImages 已經只包含圖片（非圖片已經被過濾掉）
        // 2. 如果封面圖與第一張內文圖相同，總數 = contentImages.length（封面圖已經在 contentImages 中，且去重）
        // 3. 如果封面圖與第一張內文圖不同，總數 = contentImages.length + 1（封面圖不在 contentImages 中）
        // 4. 注意：nonImageCount 不需要從 totalImages 中扣除，因為 totalImages 已經只包含圖片
        const calculateTotalImages = () => {
            if (!contentImages || contentImages.length === 0) {
                // 只有封面圖
                return coverImage ? 1 : 0;
            }
            
            // 檢查封面圖與第一張內文圖是否相同
            const isCoverSameAsFirst = coverImage && 
                this.compareImageUrls(coverImage, contentImages[0]);
            
            if (isCoverSameAsFirst) {
                // 封面圖與第一張相同，總數 = contentImages.length（封面圖已經在 contentImages 中，且去重）
                return contentImages.length;
            } else {
                // 封面圖與第一張不同，總數 = contentImages.length + 1（封面圖不在 contentImages 中）
                return contentImages.length + (coverImage ? 1 : 0);
            }
        };
        
        const totalImages = calculateTotalImages();
        
        // 輔助函數：在訊息後方添加非圖片數量
        const appendNonImageCount = (text) => {
            if (nonImageCount > 0) {
                return text + window.KemonoI18n.t('non_image_count', { count: nonImageCount });
            }
            return text;
        };
        
        // 如果只有封面圖（沒有內文圖片或內文圖片只有封面圖本身）
        if (!contentImages || contentImages.length === 0) {
            return appendNonImageCount(window.KemonoI18n.t('only_cover_available'));
        }
        
        // 如果內文圖片只有一張且與封面圖相同
        if (contentImages.length === 1 && coverImage && this.compareImageUrls(coverImage, contentImages[0])) {
            return appendNonImageCount(window.KemonoI18n.t('only_cover_available'));
        }
        
        // 如果沒有當前圖片，預設顯示第一張內文圖的狀態
        if (!currentImgSrc) {
            // 檢查封面圖與第一張內文圖是否相同
            const isCoverSameAsFirst = coverImage && contentImages.length > 0 && 
                this.compareImageUrls(coverImage, contentImages[0]);
            if (isCoverSameAsFirst) {
                // 封面圖與第一張相同，顯示第 1 張
                return appendNonImageCount(window.KemonoI18n.t('preview_content_image', { 
                    current: 1, 
                    total: totalImages 
                }));
            } else {
                // 封面圖與第一張不同，顯示第 2 張（因為封面圖不算在內文圖的編號中）
                return appendNonImageCount(window.KemonoI18n.t('preview_content_image', { 
                    current: 2, 
                    total: totalImages 
                }));
            }
        }
        
        // 檢查封面圖與第一張內文圖是否相同
        const isCoverSameAsFirst = coverImage && contentImages.length > 0 && 
            this.compareImageUrls(coverImage, contentImages[0]);
        
        // 檢查當前圖片是否為封面圖
        const isCurrentCover = coverImage && this.compareImageUrls(coverImage, currentImgSrc);
        
        // 找到當前圖片在內文圖片列表中的索引
        const currentIndex = contentImages.findIndex(img => 
            this.compareImageUrls(img, currentImgSrc)
        );
        
        // 如果找不到當前圖片在內文圖片列表中
        if (currentIndex < 0) {
            // 如果當前圖片是封面圖，且封面圖與第一張內文圖不同
            if (isCurrentCover && !isCoverSameAsFirst) {
                return appendNonImageCount(window.KemonoI18n.t('preview_cover_with_content_count', { total: totalImages }));
            }
            // 如果找不到且不是封面圖，預設顯示第一張的狀態
            // 根據封面圖與第一張的關係決定編號
            const displayNumber = isCoverSameAsFirst ? 1 : 2;
            return appendNonImageCount(window.KemonoI18n.t('preview_content_image', { 
                current: displayNumber, 
                total: totalImages 
            }));
        }
        
        // 當前圖片在內文圖片列表中的索引
        const displayIndex = currentIndex;
        
        // 如果正在預覽封面圖
        if (isCurrentCover) {
            // 如果封面圖與第一張內文圖相同，且當前正在預覽第一張內文圖（索引為 0）
            if (isCoverSameAsFirst && displayIndex === 0) {
                return appendNonImageCount(window.KemonoI18n.t('preview_cover_and_first', { total: totalImages }));
            }
            // 如果封面圖與第一張內文圖不同
            if (!isCoverSameAsFirst) {
                return appendNonImageCount(window.KemonoI18n.t('preview_cover_with_content_count', { total: totalImages }));
            }
        }
        
        // 如果正在預覽內文圖
        // 計算內文圖的編號：
        // - 如果封面圖與第一張內文圖相同，內文圖編號從 1 開始（封面圖就是第 1 張）
        // - 如果封面圖與第一張內文圖不同，內文圖編號從 2 開始（因為封面圖不算在內文圖的編號中）
        let contentImageNumber;
        if (isCoverSameAsFirst) {
            // 封面圖與第一張相同，內文圖編號從 1 開始
            contentImageNumber = displayIndex + 1;
        } else {
            // 封面圖與第一張不同，內文圖編號從 2 開始
            contentImageNumber = displayIndex + 2;
        }
        
        return appendNonImageCount(window.KemonoI18n.t('preview_content_image', { 
            current: contentImageNumber, 
            total: totalImages 
        }));
    },
    
    // 比較兩個圖片 URL，即使格式不同也能匹配（例如縮圖 URL 和完整 URL）
    compareImageUrls: function(url1, url2) {
        if (!url1 || !url2) return false;
        
        // 如果完全相同，直接返回 true
        if (url1 === url2) return true;
        
        try {
            // 提取 URL 的路徑部分，移除查詢參數和錨點
            const getPath = (url) => {
                try {
                    const urlObj = new URL(url);
                    return urlObj.pathname;
                } catch (e) {
                    // 如果無法解析為 URL，嘗試手動提取路徑
                    const match = url.match(/https?:\/\/[^\/]+(\/.*?)(?:\?|#|$)/);
                    return match ? match[1] : url;
                }
            };
            
            const path1 = getPath(url1);
            const path2 = getPath(url2);
            
            // 提取文件路徑中的唯一標識符（例如：d9/70/d970b0a7...）
            // 對於 kemono.cr，圖片路徑格式通常是：/d9/70/d970b0a7... 或 /thumbnail/data/d9/70/d970b0a7...
            const extractImageId = (path) => {
                // 匹配路徑中的圖片 ID 部分（通常是兩層目錄加上文件名）
                // 例如：/d9/70/d970b0a7... 或 /thumbnail/data/d9/70/d970b0a7...
                const match = path.match(/\/([a-f0-9]{2})\/([a-f0-9]{2})\/([a-f0-9]+)/i);
                if (match) {
                    return match.slice(1).join('/'); // 返回 "d9/70/d970b0a7..."
                }
                // 如果沒有匹配到標準格式，返回整個路徑（去除開頭的斜線和常見前綴）
                return path.replace(/^\/?(thumbnail\/data\/)?/, '').replace(/^\//, '');
            };
            
            const id1 = extractImageId(path1);
            const id2 = extractImageId(path2);
            
            // 比較提取的 ID
            if (id1 && id2 && id1 === id2) {
                return true;
            }
            
            // 如果 ID 比較失敗，嘗試比較文件名（去除擴展名）
            const getFileName = (path) => {
                const parts = path.split('/');
                const fileName = parts[parts.length - 1];
                return fileName.split('.')[0]; // 去除擴展名
            };
            
            const fileName1 = getFileName(path1);
            const fileName2 = getFileName(path2);
            
            return fileName1 && fileName2 && fileName1 === fileName2;
        } catch (e) {
            // 如果比較過程中出錯，返回 false
            window.KemonoLogger.log('比較圖片 URL 時出錯:', e, { url1, url2 });
            return false;
        }
    },
    
    navigateImages: function(direction) {
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
        
        // 建立完整的圖片列表（去重處理）
        let allImages = [];
        
        // 如果有內文圖片，使用內文圖片列表
        if (this._relatedImages.length > 0) {
            // 去重：使用智能比較確保同一張圖片不會重複出現
            allImages = [this._relatedImages[0]]; // 先加入第一張
            for (let i = 1; i < this._relatedImages.length; i++) {
                const img = this._relatedImages[i];
                // 檢查是否與已存在的圖片重複
                const isDuplicate = allImages.some(existingImg => 
                    this.compareImageUrls(existingImg, img)
                );
                if (!isDuplicate) {
                    allImages.push(img);
                }
            }
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
            const statusText = this.generatePreviewStatusText(
                currentImg.src,
                this._coverImage,
                this._relatedImages,
                this._nonImageCount
            );
            this.updatePreviewStatus(statusText);
            return;
        }
        
        // 找到當前圖片在完整列表中的索引（使用智能比較）
        let currentIndex = -1;
        for (let i = 0; i < allImages.length; i++) {
            if (this.compareImageUrls(allImages[i], currentImg.src)) {
                currentIndex = i;
                break;
            }
        }
        
        // 如果找不到當前圖片，嘗試使用已保存的索引
        if (currentIndex === -1) {
            // 如果之前有保存的索引且仍在有效範圍內，使用它
            if (this._currentImageIndex !== undefined && 
                this._currentImageIndex >= 0 && 
                this._currentImageIndex < allImages.length) {
                currentIndex = this._currentImageIndex;
                window.KemonoLogger.log('使用已保存的圖片索引:', currentIndex);
            } else {
                // 如果找不到且沒有有效索引，設為0
                window.KemonoLogger.log('無法找到當前圖片在列表中的位置，設為第一張', {
                    currentImgSrc: currentImg.src,
                    allImagesSample: allImages.slice(0, 3),
                    allImagesLength: allImages.length
                });
                currentIndex = 0;
            }
        } else {
            window.KemonoLogger.log('找到當前圖片索引:', currentIndex, {
                currentImgSrc: currentImg.src,
                matchedImage: allImages[currentIndex]
            });
        }
        
        // 計算下一張圖片的索引（循環切換，跳過重複圖片）
        let nextIndex;
        let searchIndex = currentIndex; // 使用臨時變數追蹤搜索位置
        let attempts = 0;
        const maxAttempts = allImages.length; // 最多嘗試所有圖片
        
        do {
            if (direction > 0) {
                // 向前：到達最後一張時回到第一張
                nextIndex = (searchIndex + 1) % allImages.length;
            } else {
                // 向後：到達第一張時回到最後一張
                nextIndex = (searchIndex - 1 + allImages.length) % allImages.length;
            }
            
            // 檢查下一張圖片是否與當前圖片相同
            const candidateImage = allImages[nextIndex];
            if (!this.compareImageUrls(candidateImage, currentImg.src)) {
                // 找到不同的圖片，跳出循環
                break;
            }
            
            // 如果相同，繼續尋找下一張
            window.KemonoLogger.log('跳過重複圖片', {
                nextIndex,
                candidateImage,
                currentImgSrc: currentImg.src,
                attempt: attempts + 1
            });
            
            searchIndex = nextIndex; // 更新搜索索引，繼續尋找
            attempts++;
        } while (attempts < maxAttempts);
        
        // 如果嘗試了所有圖片都找不到不同的，說明所有圖片都相同
        if (attempts >= maxAttempts) {
            window.KemonoLogger.log('所有圖片都相同，無法切換');
            return;
        }
        
        const nextImage = allImages[nextIndex];
        
        // 決定狀態文字（使用新的狀態文字生成函數）
        // 注意：這裡使用 this._relatedImages 作為 contentImages，因為狀態文字應該基於原始內文圖片列表
        const statusText = this.generatePreviewStatusText(
            nextImage,
            this._coverImage,
            this._relatedImages,
            this._nonImageCount
        );
        
        // 更新當前圖片索引（在 this._relatedImages 中找到對應的索引）
        const relatedIndex = this._relatedImages.findIndex(img => 
            this.compareImageUrls(img, nextImage)
        );
        if (relatedIndex >= 0) {
            this._currentImageIndex = relatedIndex;
        } else {
            // 如果找不到，使用 nextIndex 作為備用
            this._currentImageIndex = nextIndex;
        }
        
        // 載入新圖片（會自動檢查預載入快取）
        this.loadImageWithIndicator(currentImg, nextImage, statusText);
        
        window.KemonoLogger.log(`切換到圖片 ${nextIndex + 1}/${allImages.length}: ${nextImage}`);
    },
    
    loadImageWithIndicator: function(imgElement, newSrc, statusText) {
        // 檢查是否有預載入的圖片
        const preloadedImg = this.getPreloadedImage(newSrc);
        if (preloadedImg && preloadedImg.complete) {
            // 使用預載入的圖片，直接更新
            window.KemonoLogger.log('使用預載入的圖片:', newSrc);
            this.updateImageFromPreloaded(imgElement, preloadedImg, statusText);
            // 繼續預載入接下來的圖片
            this.preloadNextImages();
            return;
        }
        
        // 標記開始載入單個圖片
        this._isLoadingSingleImage = true;
        this.updatePreviewStatus(window.KemonoI18n.t('loading'));
        
        // 使用請求排隊系統載入圖片
        if (window.KemonoRequestQueue) {
            window.KemonoRequestQueue.loadImage(newSrc)
                .then((newImg) => {
                    // 標記載入完成
                    this._isLoadingSingleImage = false;
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
                    
                    // 圖片尺寸更新後，重新計算預覽圖位置
                    // 使用保存的最後一次游標位置
                    if (this._lastMouseEvent) {
                        // 等待 DOM 更新後再重新計算位置
                        setTimeout(() => {
                            this.positionPreviewAtCursor(this._lastMouseEvent);
                        }, 0);
                    }
                    
                    // 載入完成後，繼續預載入接下來的圖片
                    setTimeout(() => {
                        this.preloadNextImages();
                    }, 100);
                })
                .catch((error) => {
                    // 標記載入完成（即使失敗也要清除標記）
                    this._isLoadingSingleImage = false;
                    if (error.message !== 'Request aborted') {
                        this.updatePreviewStatus(window.KemonoI18n.t('image_failed_to_load'));
                        window.KemonoLogger.error('載入圖片失敗:', error);
                    }
                });
        } else {
            // 如果沒有請求排隊系統，使用傳統方式（向後相容）
            const newImg = new Image();
            
            newImg.onload = () => {
                // 標記載入完成
                this._isLoadingSingleImage = false;
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
                
                // 圖片尺寸更新後，重新計算預覽圖位置
                // 使用保存的最後一次游標位置
                if (this._lastMouseEvent) {
                    // 等待 DOM 更新後再重新計算位置
                    setTimeout(() => {
                        this.positionPreviewAtCursor(this._lastMouseEvent);
                    }, 0);
                }
                
                // 載入完成後，繼續預載入接下來的圖片
                setTimeout(() => {
                    this.preloadNextImages();
                }, 100);
            };
            
            newImg.onerror = () => {
                // 標記載入完成（即使失敗也要清除標記）
                this._isLoadingSingleImage = false;
                this.updatePreviewStatus(window.KemonoI18n.t('image_failed_to_load'));
            };
            
            newImg.src = newSrc;
        }
    },
    
    // 從預載入的圖片更新顯示
    updateImageFromPreloaded: function(imgElement, preloadedImg, statusText) {
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
        
        // 計算縮放比例
        const naturalWidth = preloadedImg.naturalWidth;
        const naturalHeight = preloadedImg.naturalHeight;
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
        imgElement.src = preloadedImg.src;
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
        
        // 圖片尺寸更新後，重新計算預覽圖位置
        // 使用保存的最後一次游標位置
        if (this._lastMouseEvent) {
            // 等待 DOM 更新後再重新計算位置
            setTimeout(() => {
                this.positionPreviewAtCursor(this._lastMouseEvent);
            }, 0);
        }
    },    positionPreviewAtCursor: function(event) {
        if (!this._activePreview) return;
        
        // 如果沒有提供 event，使用保存的最後一次游標位置
        if (!event && this._lastMouseEvent) {
            event = this._lastMouseEvent;
        }
        
        if (!event) return;
        
        // 保存游標位置，以便圖片切換時重新計算位置
        this._lastMouseEvent = event;
        
        const preview = this._activePreview;
        
        // 確保預覽圖使用 fixed 定位（相對於視窗）
        if (preview.style.position !== 'fixed') {
            preview.style.position = 'fixed';
        }
        
        // 確保預覽圖可見以獲取正確的尺寸
        if (preview.style.visibility === 'hidden') {
            preview.style.visibility = 'visible';
            preview.style.opacity = '0';
        }
        
        // 獲取視窗尺寸（相對於目前顯示畫面範圍）
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        // 獲取預覽圖尺寸（包含狀態欄和 padding、border）
        // getBoundingClientRect() 對於 position: fixed 的元素，返回的座標是相對於視窗的
        // 為了確保能正確獲取尺寸，先強制重新計算佈局
        const previewRect = preview.getBoundingClientRect();
        let previewWidth = previewRect.width || 300;
        let previewHeight = previewRect.height || 200;
        
        // 如果尺寸為 0 或異常，使用備用值並強制重新計算
        if (previewWidth <= 0 || previewHeight <= 0) {
            // 強制重新計算佈局
            preview.offsetHeight; // 觸發重新計算
            const rect = preview.getBoundingClientRect();
            previewWidth = rect.width || 300;
            previewHeight = rect.height || 200;
        }
        
        // 邊距設定
        const margin = 5;
        const horizontalOffset = 20; // 游標右側偏移量
        const verticalOffset = 10; // 游標下方偏移量，確保游標不在預覽圖範圍內
        
        // 游標位置（相對於視窗）
        const cursorX = event.clientX;
        const cursorY = event.clientY;
        
        // 先獲取預覽圖尺寸，然後根據尺寸計算相對位置
        let left, top;
        
        // 檢查是否會超出右邊界和下邊界
        const wouldExceedRight = cursorX + horizontalOffset + previewWidth > viewport.width - margin;
        const wouldExceedBottom = cursorY + verticalOffset + previewHeight > viewport.height - margin;
        
        if (wouldExceedRight && wouldExceedBottom) {
            // 同時太靠近右側和下方邊界：預覽圖顯示在游標左上
            // 預覽圖右下角對齊游標左上，所以預覽圖左上角 = 游標位置 - 預覽圖尺寸 - 偏移
            left = cursorX - previewWidth - horizontalOffset;
            top = cursorY - previewHeight - verticalOffset;
        } else if (wouldExceedRight) {
            // 太靠近右側邊界：預覽圖顯示在游標左下
            // 預覽圖右上角對齊游標左側，所以預覽圖左上角 = 游標X - 預覽圖寬度 - 偏移，Y = 游標Y + 偏移
            left = cursorX - previewWidth - horizontalOffset;
            top = cursorY + verticalOffset;
        } else if (wouldExceedBottom) {
            // 太靠近下方邊界：預覽圖顯示在游標右上
            // 預覽圖左下角對齊游標上方，所以預覽圖左上角 = 游標X + 偏移，Y = 游標Y - 預覽圖高度 - 偏移
            left = cursorX + horizontalOffset;
            top = cursorY - previewHeight - verticalOffset;
        } else {
            // 平常狀態：預覽圖顯示在游標右下角
            // 預覽圖左上角 = 游標位置 + 偏移
            left = cursorX + horizontalOffset;
            top = cursorY + verticalOffset;
        }
        
        // 最終邊界檢查（確保不會超出任何邊界，但不改變預覽圖大小）
        // 左邊界檢查
        if (left < margin) {
            left = margin;
        }
        
        // 右邊界檢查
        if (left + previewWidth > viewport.width - margin) {
            left = viewport.width - previewWidth - margin;
        }
        
        // 上邊界檢查
        if (top < margin) {
            top = margin;
        }
        
        // 下邊界檢查
        if (top + previewHeight > viewport.height - margin) {
            top = viewport.height - previewHeight - margin;
        }
        
        // 檢查預覽圖是否會覆蓋游標位置（避免游標 hover 在預覽圖上，導致無法點擊頁面內容）
        // 如果游標在預覽圖範圍內，則微調位置避免覆蓋
        const cursorInPreviewX = cursorX >= left && cursorX <= left + previewWidth;
        const cursorInPreviewY = cursorY >= top && cursorY <= top + previewHeight;
        
        if (cursorInPreviewX && cursorInPreviewY) {
            // 游標在預覽圖範圍內，需要微調位置避免覆蓋
            // 優先嘗試將預覽圖稍微往下移，讓游標在預覽圖上方
            const topBelowCursor = cursorY + verticalOffset;
            if (topBelowCursor + previewHeight <= viewport.height - margin) {
                top = topBelowCursor;
            } else {
                // 如果下方空間不足，則移到游標上方
                const topAboveCursor = cursorY - previewHeight - verticalOffset;
                if (topAboveCursor >= margin) {
                    top = topAboveCursor;
                }
                // 如果上下都不行，則保持原位置（已經在邊界檢查中處理過了）
            }
        }
        
        // 設定位置（固定大小，不因靠近邊界而調整）
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
        
        // 取消正在進行的圖片預載入請求
        if (window.KemonoRequestQueue) {
            const abortedCount = window.KemonoRequestQueue.abortRequestsByType('image');
            if (abortedCount > 0) {
                window.KemonoLogger.log(`已取消 ${abortedCount} 個正在進行的圖片預載入請求`);
            }
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
    
    // 檢查是否有任何圖片正在載入（包括 API 載入和單個圖片載入）
    isAnyImageLoading: function() {
        return this._isLoadingImages || this._isLoadingSingleImage;
    },
    
    resetPostImages: function() {
        this._postImages = [];
        this._currentPostUrl = null;
        this._coverImage = null;
        this._hasOriginalImages = false;
        this._currentImageIndex = 0;
        this._nonImageCount = 0;
    },
    
    clearAPICache: function() {
        this._apiCache.clear();
        window.KemonoLogger.log('API 快取已清除');
    },
    
    // 獲取預載入數量設定
    getPreloadCount: function() {
        let preloadCount = 5; // 預設值
        if (window.KemonoSettings && window.KemonoSettings.settings) {
            preloadCount = window.KemonoSettings.settings.preloadImageCount || 5;
        }
        // 如果設定中沒有，嘗試從 localStorage 讀取
        if (preloadCount === 5) {
            try {
                const localSettings = localStorage.getItem('kemono_preview_settings');
                if (localSettings) {
                    const previewSettings = JSON.parse(localSettings);
                    if (previewSettings.preloadImageCount !== undefined) {
                        preloadCount = previewSettings.preloadImageCount;
                    }
                }
            } catch (e) {
                // 忽略錯誤
            }
        }
        return preloadCount;
    },
    
    // 預載入接下來的圖片
    preloadNextImages: function() {
        const preloadCount = this.getPreloadCount();
        if (preloadCount <= 0) {
            return; // 如果設定為 0，不進行預載入
        }
        
        // 建立完整的圖片列表
        let allImages = [];
        if (this._relatedImages.length > 0) {
            // 去重處理
            allImages = [this._relatedImages[0]];
            for (let i = 1; i < this._relatedImages.length; i++) {
                const img = this._relatedImages[i];
                const isDuplicate = allImages.some(existingImg => 
                    this.compareImageUrls(existingImg, img)
                );
                if (!isDuplicate) {
                    allImages.push(img);
                }
            }
        } else if (this._coverImage) {
            allImages = [this._coverImage];
        }
        
        if (allImages.length <= 1) {
            return; // 只有一張圖片，不需要預載入
        }
        
        // 找到當前圖片的索引
        const currentImg = this._activePreview?.querySelector('img');
        let currentIndex = 0;
        if (currentImg) {
            for (let i = 0; i < allImages.length; i++) {
                if (this.compareImageUrls(allImages[i], currentImg.src)) {
                    currentIndex = i;
                    break;
                }
            }
        }
        
        // 預載入接下來的圖片（使用請求排隊系統）
        let preloaded = 0;
        for (let i = 1; i <= preloadCount && preloaded < preloadCount; i++) {
            const nextIndex = (currentIndex + i) % allImages.length;
            const imageUrl = allImages[nextIndex];
            
            // 如果已經預載入過，跳過
            if (this._preloadedImages.has(imageUrl)) {
                continue;
            }
            
            // 如果與當前圖片相同，跳過
            if (currentImg && this.compareImageUrls(imageUrl, currentImg.src)) {
                continue;
            }
            
            // 使用請求排隊系統預載入圖片
            if (window.KemonoRequestQueue) {
                window.KemonoRequestQueue.loadImage(imageUrl)
                    .then((img) => {
                        this._preloadedImages.set(imageUrl, img);
                        window.KemonoLogger.log(`預載入圖片完成: ${imageUrl}`);
                    })
                    .catch((error) => {
                        if (error.message !== 'Request aborted') {
                            window.KemonoLogger.warn(`預載入圖片失敗: ${imageUrl}`, error);
                        }
                    });
            } else {
                // 如果沒有請求排隊系統，使用傳統方式（向後相容）
                const img = new Image();
                img.onload = () => {
                    this._preloadedImages.set(imageUrl, img);
                    window.KemonoLogger.log(`預載入圖片完成: ${imageUrl}`);
                };
                img.onerror = () => {
                    window.KemonoLogger.warn(`預載入圖片失敗: ${imageUrl}`);
                };
                img.src = imageUrl;
            }
            preloaded++;
        }
        
        if (preloaded > 0) {
            window.KemonoLogger.log(`開始預載入 ${preloaded} 張圖片`);
        }
    },
    
    // 使用預載入的圖片（如果有的話）
    getPreloadedImage: function(imageUrl) {
        return this._preloadedImages.get(imageUrl) || null;
    },
    
    // 清除預載入快取
    clearPreloadedImages: function() {
        this._preloadedImages.clear();
    }
};

window.KemonoLogger.log('Utilities initialized');
