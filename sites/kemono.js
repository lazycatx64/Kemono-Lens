// Access the global logger using a different variable name
const kemonoLogger = window.KemonoLogger;

/**
 * Image preview handler module for Kemono.cr website
 */
const kemono = {
  // 檢查 URL 是否符合 kemono.cr
  isMatch: (url) => {
    const isMatch = url.match(/https?:\/\/(?:www\.)?kemono\.cr/);
    kemonoLogger.verbose('Kemono.cr URL 匹配檢查:', isMatch ? 'Yes' : 'No');
    return isMatch;
  },
  
  // 檢查當前頁面是否為貼文目錄頁面（而不是單個貼文）
  isPostsDirectory: (url) => {
    // 貼文頁面 URL 含有 '/post/'
    const isPostPage = url.includes('/post/');
    
    // 如果是 kemono.cr 但不是貼文頁面，則為目錄頁面
    const isDirectory = url.match(/https?:\/\/(?:www\.)?kemono\.cr/) && !isPostPage;
    
    kemonoLogger.verbose('URL 檢查 - 目錄頁面:', isDirectory, '貼文頁面:', isPostPage);
    return isDirectory;
  },
  
  // 檢查元素是否為目標圖片
  isTargetElement: (element) => {
    // 立即跳過非圖片元素
    if (element.tagName !== 'IMG') {
      return false;
    }

    kemonoLogger.verbose('檢查元素:', element);
    
    // Check for post cards on main page
    if (element.classList.contains('post-card__image')) {
      kemonoLogger.log('Target is post-card__image');
      return true;
    }
    
    // Additional checks for directory page thumbnails
    if (element.closest('.post-card')) {
      kemonoLogger.log('Target is in post-card');
      return true;
    }
    
    return false;
  },
  
  // 獲取實際圖片 URL
  getImageUrl: (element) => {
    let imageSrc = element.src;
    kemonoLogger.log('Initial image source:', imageSrc);
    
    // 根據元素類型處理不同的圖片來源
    if (element.classList.contains('load')) {
      // 對於帶有 'load' 類的主要貼文圖片
      imageSrc = imageSrc.replace('/img/', '/jpg/');
      kemonoLogger.log('Modified "load" image source:', imageSrc);
    } else if (element.parentElement && 
               element.parentElement.classList.contains('fancy-image__thumbnail')) {
      // 對於貼文詳情頁面的縮圖，獲取 data-src 屬性
      // 從父元素的 data-src 或父元素的父錨點標籤的 href
      if (element.parentElement.dataset.src) {
        imageSrc = element.parentElement.dataset.src;
        kemonoLogger.log('Using parent data-src:', imageSrc);
      } else if (element.parentElement.parentElement && 
                 element.parentElement.parentElement.tagName === 'A') {
        imageSrc = element.parentElement.parentElement.href;
        kemonoLogger.log('Using grandparent href:', imageSrc);
      }
    } else if (element.dataset.src) {
      // 使用 data-src（如果有的話）（lazy-loaded 圖片）
      imageSrc = element.dataset.src;
      kemonoLogger.log('Using data-src attribute:', imageSrc);
    } else if (element.parentElement && element.parentElement.tagName === 'A' && 
               element.parentElement.href) {
      // 對於在 <a> 標籤中的圖片，如果指向圖片則使用 href
      const href = element.parentElement.href;
      if (href.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
        imageSrc = href;
        kemonoLogger.log('Using parent anchor href:', imageSrc);
      }
    }
    
    return imageSrc;
  },
  
  // 獲取懸停在貼文卡片上時的貼文 URL
  getPostUrl: (element) => {
    // 找到離貼文最近的鏈接
    let postLink = null;
    
    // 如果元素本身不是鏈接，嘗試尋找父元素
    if (element.tagName === 'A' && element.href.includes('/post/')) {
      postLink = element;
    } else {
      // 嘗試尋找父鏈接或最近的 post-card 與鏈接
      postLink = element.closest('a[href*="/post/"]');
      
      if (!postLink) {
        const postCard = element.closest('.post-card');
        if (postCard) {
          postLink = postCard.querySelector('a[href*="/post/"]');
        }
      }
    }
    
    if (postLink && postLink.href && postLink.href.includes('/post/')) {
      kemonoLogger.log('Found post URL:', postLink.href);
      return postLink.href;
    }
    
    kemonoLogger.log('No post URL found');
    return null;
  },
  
  // 獲取貼文頁面的所有圖片
  fetchPostImages: async (postUrl) => {
    kemonoLogger.log('正在從以下位置獲取貼文圖片:', postUrl);
    
    try {
      // 支援 kemono.cr 和 coomer.st
      let apiUrl = postUrl;
      if (apiUrl.includes('kemono.cr/')) {
        apiUrl = apiUrl.replace('kemono.cr/', 'kemono.cr/api/v1/');
      } else if (apiUrl.includes('coomer.st/')) {
        apiUrl = apiUrl.replace('coomer.st/', 'coomer.st/api/v1/');
      }
      kemonoLogger.log('API URL:', apiUrl);
      
      const response = await fetch(apiUrl, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
      }
      
      const postData = await response.json();
      kemonoLogger.log('API 回應:', postData);
      
      const baseUrl = new URL(postUrl).origin;
      let hasOriginalImages = false;
      let coverImageUrl = null;
      let contentImages = [];
      
      // 從 API 回應中獲取預覽圖片
      if (postData.previews && Array.isArray(postData.previews) && postData.previews.length > 0) {
        // 第一張圖片是封面圖
        if (postData.previews[0] && postData.previews[0].path) {
          coverImageUrl = baseUrl + postData.previews[0].path;
          kemonoLogger.log('API 封面圖片:', coverImageUrl);
        }
        
        // 所有預覽圖片都加入內文圖片列表，包括封面圖，這樣可以支持完整的圖片切換
        for (let i = 0; i < postData.previews.length; i++) {
          if (postData.previews[i] && postData.previews[i].path) {
            const fullImageUrl = baseUrl + postData.previews[i].path;
            contentImages.push(fullImageUrl);
            kemonoLogger.log('找到圖片:', fullImageUrl, i === 0 ? '(封面圖)' : '(內文圖片)');
          }
        }
      }
      
      // 如果沒有預覽圖片，嘗試從 attachments 獲取原圖
      if (!coverImageUrl && postData.attachments && Array.isArray(postData.attachments) && postData.attachments.length > 0) {
        hasOriginalImages = true;
        kemonoLogger.warn('沒有找到預覽圖片，改用附件原圖');
        
        // 第一張附件作為封面圖
        if (postData.attachments[0] && postData.attachments[0].path) {
          coverImageUrl = baseUrl + postData.attachments[0].path;
          kemonoLogger.log('找到附件封面原圖:', coverImageUrl);
        }
        
        // 所有附件都加入內文圖片列表，包括第一張，這樣可以支持完整的圖片切換
        for (let i = 0; i < postData.attachments.length; i++) {
          if (postData.attachments[i] && postData.attachments[i].path) {
            const fullImageUrl = baseUrl + postData.attachments[i].path;
            contentImages.push(fullImageUrl);
            kemonoLogger.log('找到附件圖片:', fullImageUrl, i === 0 ? '(封面圖)' : '(內文圖片)');
          }
        }
      }
      
      // 如果還是沒有封面圖，嘗試從主要文件獲取
      if (!coverImageUrl && postData.file && postData.file.path) {
        hasOriginalImages = true;
        kemonoLogger.warn('沒有找到預覽圖片和附件，改用主要文件');
        
        coverImageUrl = baseUrl + postData.file.path;
        // 主要文件也加入內文圖片列表，這樣即使只有一張圖片也可以切換
        contentImages.push(coverImageUrl);
        kemonoLogger.log('找到主要文件圖片:', coverImageUrl, '(封面圖)');
      }
      
      kemonoLogger.log(`從 API 獲取到封面圖: ${coverImageUrl ? '1' : '0'} 張，內文圖片: ${contentImages.length} 張${hasOriginalImages ? ' (包含原圖)' : ''}`);
      
      // 返回分離的結果
      return {
        coverImage: coverImageUrl,
        contentImages: contentImages,
        hasOriginalImages: hasOriginalImages
      };
    } catch (error) {
      kemonoLogger.error('獲取貼文圖片時出錯:', error);
      return {
        coverImage: null,
        contentImages: [],
        hasOriginalImages: false
      };
    }
  },
  
  // 獲取貼文中的相關圖片
  getRelatedImages: (element) => {
    let images = [];
    
    // 如果我們在一個有多個圖片的貼文頁面上
    if (window.location.href.includes('/post/')) {
      kemonoLogger.log('Finding related images on post page');
      
      // 找出貼文中的所有縮圖
      const thumbnails = document.querySelectorAll('.fancy-image__thumbnail img, .fileThumb, img.load');
      thumbnails.forEach(thumb => {
        let imageSrc = thumb.src;
        
        // 應用與 getImageUrl 中相同的轉換
        if (thumb.classList.contains('load')) {
          imageSrc = imageSrc.replace('/img/', '/jpg/');
        } else if (thumb.parentElement && 
                 thumb.parentElement.classList.contains('fancy-image__thumbnail')) {
          if (thumb.parentElement.dataset.src) {
            imageSrc = thumb.parentElement.dataset.src;
          } else if (thumb.parentElement.parentElement && 
                   thumb.parentElement.parentElement.tagName === 'A') {
            imageSrc = thumb.parentElement.parentElement.href;
          }
        } else if (thumb.dataset.src) {
          imageSrc = thumb.dataset.src;
        }
        
        images.push(imageSrc);
      });
      
      kemonoLogger.log(`Found ${images.length} related images`);
    }
    
    return images;
  }
};

// Make sure to initialize the global object before accessing it
window.KemonoSites = window.KemonoSites || {};
window.KemonoSites.kemono = kemono;

kemonoLogger.log('Kemono.cr handler module loaded');
