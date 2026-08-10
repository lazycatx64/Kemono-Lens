// Access the global logger using a different variable name
const coomerLogger = window.KemonoLogger;

function escapeRegExpCoomer(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCoomerDomainPattern() {
  const domain = (window.KemonoDomainConfig && window.KemonoDomainConfig.getDomain('coomer')) || 'coomer.st';
  return escapeRegExpCoomer(domain);
}

/**
 * Image preview handler module for Coomer website
 * 架構與 kemono 相同，網域由 DomainConfig 決定
 */
const coomer = {
  // 檢查 URL 是否符合目前設定的 coomer 網域
  isMatch: (url) => {
    const pattern = getCoomerDomainPattern();
    return url.match(new RegExp(`https?:\\/\\/(?:www\\.)?${pattern}`, 'i'));
  },
  
  // 檢查當前頁面是否為貼文目錄頁面（而不是單個貼文）
  isPostsDirectory: (url) => {
    // 貼文頁面 URL 含有 '/post/'
    const isPostPage = url.includes('/post/');
    
    // 如果是 coomer 網域但不是貼文頁面，則為目錄頁面
    const pattern = getCoomerDomainPattern();
    const isDirectory = url.match(new RegExp(`https?:\\/\\/(?:www\\.)?${pattern}`, 'i')) && !isPostPage;
    
    return isDirectory;
  },
  
  // 檢查元素是否為目標圖片
  isTargetElement: (element) => {
    // 立即跳過非圖片元素
    if (element.tagName !== 'IMG') {
      return false;
    }

    // Check for post cards on main page
    if (element.classList.contains('post-card__image')) {
      return true;
    }
    
    // Additional checks for directory page thumbnails
    if (element.closest('.post-card')) {
      return true;
    }
    
    return false;
  },
  
  // 將原圖 URL 轉換為 thumbnail URL
  convertToThumbnailUrl: (url) => {
    if (!url) return url;
    
    try {
      const domainPattern = getCoomerDomainPattern();
      // 匹配 apex／www／CDN 子網域上的資料路徑
      const coomerPattern = new RegExp(
        `(https?:\\/\\/)?(?:[\\w-]+\\.)?${domainPattern}\\/(?:(?:thumbnail\\/)?data\\/)?([a-f0-9]{2})\\/([a-f0-9]{2})\\/([a-f0-9]+[^\\/\\s?#]*)`,
        'i'
      );
      const match = url.match(coomerPattern);
      
      if (match) {
        const path = `${match[2]}/${match[3]}/${match[4]}`;
        const thumbnailUrl = window.KemonoDomainConfig
          ? window.KemonoDomainConfig.buildImgThumbnailUrl('coomer', path)
          : `https://img.coomer.st/thumbnail/data/${path}`;
        coomerLogger.log('轉換為 thumbnail URL:', url, '->', thumbnailUrl);
        return thumbnailUrl;
      }
    } catch (error) {
      coomerLogger.warn('轉換 thumbnail URL 時出錯:', error, url);
    }
    
    return url;
  },
  
  // 獲取實際圖片 URL
  getImageUrl: (element) => {
    let imageSrc = element.src;
    coomerLogger.log('Initial image source:', imageSrc);
    
    // 根據元素類型處理不同的圖片來源
    if (element.classList.contains('load')) {
      // 對於帶有 'load' 類的主要貼文圖片
      imageSrc = imageSrc.replace('/img/', '/jpg/');
      coomerLogger.log('Modified "load" image source:', imageSrc);
    } else if (element.parentElement && 
               element.parentElement.classList.contains('fancy-image__thumbnail')) {
      // 對於貼文詳情頁面的縮圖，獲取 data-src 屬性
      // 從父元素的 data-src 或父元素的父錨點標籤的 href
      if (element.parentElement.dataset.src) {
        imageSrc = element.parentElement.dataset.src;
        coomerLogger.log('Using parent data-src:', imageSrc);
      } else if (element.parentElement.parentElement && 
                 element.parentElement.parentElement.tagName === 'A') {
        imageSrc = element.parentElement.parentElement.href;
        coomerLogger.log('Using grandparent href:', imageSrc);
      }
    } else if (element.dataset.src) {
      // 使用 data-src（如果有的話）（lazy-loaded 圖片）
      imageSrc = element.dataset.src;
      coomerLogger.log('Using data-src attribute:', imageSrc);
    } else if (element.parentElement && element.parentElement.tagName === 'A' && 
               element.parentElement.href) {
      // 對於在 <a> 標籤中的圖片，如果指向圖片則使用 href
      const href = element.parentElement.href;
      if (href.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
        imageSrc = href;
        coomerLogger.log('Using parent anchor href:', imageSrc);
      }
    }
    
    // 轉換為 thumbnail URL
    imageSrc = coomer.convertToThumbnailUrl(imageSrc);
    
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
      coomerLogger.log('Found post URL:', postLink.href);
      return postLink.href;
    }
    
    coomerLogger.log('No post URL found');
    return null;
  },
  
  // 檢查檔案是否為圖片格式
  isImageFile: (path) => {
    if (!path) return false;
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)(\?|$)/i;
    return imageExtensions.test(path);
  },
  
  // 獲取貼文頁面的所有圖片
  fetchPostImages: async (postUrl) => {
    coomerLogger.log('正在從以下位置獲取貼文圖片:', postUrl);
    
    try {
      // 將網站路徑轉為 /api/v1/...
      let apiUrl = postUrl;
      try {
        const parsed = new URL(postUrl);
        apiUrl = `${parsed.origin}/api/v1${parsed.pathname}${parsed.search}`;
      } catch (e) {
        coomerLogger.log('解析貼文 URL 失敗，使用原始 URL:', e);
      }
      coomerLogger.log('API URL:', apiUrl);
      
      // 使用請求排隊系統
      const response = await (window.KemonoRequestQueue 
        ? window.KemonoRequestQueue.fetch(apiUrl, {
            credentials: 'include',
            cache: 'no-store',
            headers: {
              'Accept': 'text/css',
              'Referer': window.location.href,
              'Origin': window.location.origin
            }
          })
        : fetch(apiUrl, {
            credentials: 'include',
            cache: 'no-store',
            headers: {
              'Accept': 'text/css',
              'Referer': window.location.href,
              'Origin': window.location.origin
            }
          }));
      
      if (!response.ok) {
        throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
      }
      
      const postData = await response.json();
      coomerLogger.log('API 回應:', postData);
      
      const baseUrl = new URL(postUrl).origin;
      if (window.KemonoUtil && typeof window.KemonoUtil.parsePostApiImages === 'function') {
        return window.KemonoUtil.parsePostApiImages(postData, baseUrl, {
          convertToThumbnailUrl: coomer.convertToThumbnailUrl,
          logger: coomerLogger
        });
      }

      coomerLogger.warn('KemonoUtil.parsePostApiImages 不可用，使用後備解析');
      return {
        coverImage: null,
        contentImages: [],
        hasOriginalImages: false,
        nonImageCount: 0
      };
    } catch (error) {
      coomerLogger.error('獲取貼文圖片時出錯:', error);
      return {
        coverImage: null,
        contentImages: [],
        hasOriginalImages: false,
        nonImageCount: 0
      };
    }
  },
  
  // 獲取貼文中的相關圖片
  getRelatedImages: (element) => {
    let images = [];
    
    // 如果我們在一個有多個圖片的貼文頁面上
    if (window.location.href.includes('/post/')) {
      coomerLogger.log('Finding related images on post page');
      
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
        
        // 轉換為 thumbnail URL
        imageSrc = coomer.convertToThumbnailUrl(imageSrc);
        
        images.push(imageSrc);
      });
      
      coomerLogger.log(`Found ${images.length} related images`);
    }
    
    return images;
  }
};

// Make sure to initialize the global object before accessing it
window.KemonoSites = window.KemonoSites || {};
window.KemonoSites.coomer = coomer;

coomerLogger.log('Coomer handler module loaded');
