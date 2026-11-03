/**
 * 作品頁圖片清單服務：產出 { thumbUrl, originalUrl } 成對資料
 * 不修改 util.parsePostApiImages 對外契約
 */
(function () {
  const logger = window.KemonoLogger || console;

  function isImageItem(item) {
    if (!item) return false;
    const util = window.KemonoUtil;
    if (util && typeof util.isImageFilePath === 'function') {
      return util.isImageFilePath(item.path) || util.isImageFilePath(item.name);
    }
    const check = (s) => s && /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)(\?|$)/i.test(s);
    return check(item.path) || check(item.name);
  }

  function normalizePath(path) {
    if (!path) return '';
    return String(path).replace(/^\/+/, '');
  }

  function resolveSiteFamily(url) {
    try {
      const host = new URL(url).hostname;
      if (window.KemonoDomainConfig && window.KemonoDomainConfig.resolveSiteFamily) {
        return window.KemonoDomainConfig.resolveSiteFamily(host) || 'kemono';
      }
    } catch (e) { /* ignore */ }
    return 'kemono';
  }

  function buildThumbUrl(site, path, convertToThumbnailUrl) {
    const clean = normalizePath(path);
    if (window.KemonoDomainConfig && window.KemonoDomainConfig.buildImgThumbnailUrl) {
      return window.KemonoDomainConfig.buildImgThumbnailUrl(site, clean);
    }
    if (convertToThumbnailUrl) {
      return convertToThumbnailUrl(`https://img.example/data/${clean}`);
    }
    return null;
  }

  function buildOriginalUrl(site, item, baseOrigin) {
    if (!item || !item.path) return null;
    if (item.server) {
      return `${String(item.server).replace(/\/$/, '')}${item.path.startsWith('/') ? item.path : `/${item.path}`}`;
    }
    const clean = normalizePath(item.path);
    if (window.KemonoDomainConfig && window.KemonoDomainConfig.buildImgOriginalUrl) {
      return window.KemonoDomainConfig.buildImgOriginalUrl(site, clean);
    }
    const domain = (window.KemonoDomainConfig && window.KemonoDomainConfig.getDomain(site)) || 'kemono.cr';
    return `https://file.${domain}/data/${clean}`;
  }

  function parseAlbumFromApi(raw, postUrl, siteHandler) {
    const site = resolveSiteFamily(postUrl);
    const baseOrigin = new URL(postUrl).origin;
    const convertToThumbnailUrl = siteHandler && siteHandler.convertToThumbnailUrl
      ? siteHandler.convertToThumbnailUrl.bind(siteHandler)
      : null;

    const post = (raw && raw.post && typeof raw.post === 'object') ? raw.post : raw;
    const title = (post && post.title) || document.title || '';
    const previews = Array.isArray(raw?.previews)
      ? raw.previews
      : (Array.isArray(post?.previews) ? post.previews : []);
    const attachments = Array.isArray(raw?.attachments) && raw.attachments.length > 0
      ? raw.attachments
      : (Array.isArray(post?.attachments) ? post.attachments : []);
    const file = post?.file || raw?.file || null;

    const pages = [];
    const seen = new Set();

    const pushItem = (item) => {
      if (!item || !item.path || seen.has(item.path)) return;
      if (!isImageItem(item)) return;
      seen.add(item.path);
      const thumbUrl = buildThumbUrl(site, item.path, convertToThumbnailUrl);
      const originalUrl = buildOriginalUrl(site, item, baseOrigin);
      if (!thumbUrl && !originalUrl) return;
      pages.push({
        index: pages.length,
        thumbUrl: thumbUrl || originalUrl,
        originalUrl: originalUrl || thumbUrl,
        name: item.name || null
      });
    };

    // 有 previews：縮圖清單 + 用 attachments／file 補齊 original（同 path）
    if (previews.length > 0) {
      const originalByPath = new Map();
      if (file && file.path) originalByPath.set(file.path, file);
      attachments.forEach((att) => {
        if (att && att.path) originalByPath.set(att.path, { ...att, ...(originalByPath.get(att.path) || {}) });
      });

      previews.forEach((preview) => {
        if (!preview || !preview.path) return;
        const richer = originalByPath.get(preview.path);
        const merged = richer
          ? { ...preview, server: richer.server || preview.server, name: richer.name || preview.name }
          : preview;
        if (!isImageItem(merged)) return;
        if (seen.has(merged.path)) return;
        seen.add(merged.path);
        const thumbUrl = buildThumbUrl(site, merged.path, convertToThumbnailUrl);
        const originalUrl = buildOriginalUrl(site, merged, baseOrigin);
        if (!thumbUrl && !originalUrl) return;
        pages.push({
          index: pages.length,
          thumbUrl: thumbUrl || originalUrl,
          originalUrl: originalUrl || thumbUrl,
          name: merged.name || null
        });
      });

      // 補上 attachments／file 中尚未出現在 previews 的圖片
      if (file) pushItem(file);
      attachments.forEach(pushItem);
    } else {
      if (file) pushItem(file);
      attachments.forEach(pushItem);
    }

    return { title, pages, postUrl };
  }

  function parseAlbumFromDom(postUrl, siteHandler) {
    const titleEl = document.querySelector('.post__title, h1');
    const title = (titleEl && titleEl.textContent.trim()) || document.title || '';
    const site = resolveSiteFamily(postUrl);
    const convertToThumbnailUrl = siteHandler && siteHandler.convertToThumbnailUrl
      ? siteHandler.convertToThumbnailUrl.bind(siteHandler)
      : ((u) => u);

    const pages = [];
    const seen = new Set();
    const links = document.querySelectorAll('.post__files a.fileThumb, a.fileThumb.image-link, .fancy-image__thumbnail');

    links.forEach((node) => {
      let anchor = node;
      if (node.tagName !== 'A') {
        anchor = node.closest('a') || (node.parentElement && node.parentElement.tagName === 'A' ? node.parentElement : null);
      }
      if (!anchor) return;

      const originalUrl = anchor.href || anchor.dataset.src || null;
      const img = anchor.querySelector('img') || (node.tagName === 'IMG' ? node : null);
      let thumbUrl = (img && (img.dataset.src || img.src)) || null;

      if (!originalUrl && !thumbUrl) return;

      const pathKey = originalUrl || thumbUrl;
      if (seen.has(pathKey)) return;

      // 過濾非圖片
      const checkUrl = originalUrl || thumbUrl;
      if (window.KemonoUtil && window.KemonoUtil.isImageFilePath) {
        if (!window.KemonoUtil.isImageFilePath(checkUrl) && !window.KemonoUtil.isImageFilePath(anchor.getAttribute('download'))) {
          return;
        }
      } else if (!/\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)(\?|$)/i.test(checkUrl)) {
        return;
      }

      seen.add(pathKey);
      if (!thumbUrl && originalUrl) {
        thumbUrl = convertToThumbnailUrl(originalUrl);
      }
      pages.push({
        index: pages.length,
        thumbUrl: thumbUrl || originalUrl,
        originalUrl: originalUrl || thumbUrl,
        name: anchor.getAttribute('download') || null
      });
    });

    return { title, pages, postUrl };
  }

  async function fetchAlbum(postUrl, options = {}) {
    const allowDomFallback = options.allowDomFallback !== false;
    const siteHandler = window.KemonoSites && window.KemonoSites.getHandler
      ? window.KemonoSites.getHandler(postUrl)
      : null;

    try {
      let apiUrl = postUrl;
      try {
        const parsed = new URL(postUrl);
        apiUrl = `${parsed.origin}/api/v1${parsed.pathname}${parsed.search}`;
      } catch (e) {
        logger.warn?.('解析貼文 URL 失敗:', e);
      }

      const fetchFn = window.KemonoRequestQueue
        ? (url, opts) => window.KemonoRequestQueue.fetch(url, opts)
        : fetch;

      const response = await fetchFn(apiUrl, {
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'text/css',
          Referer: window.location.href,
          Origin: window.location.origin
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const raw = await response.json();
      const album = parseAlbumFromApi(raw, postUrl, siteHandler);
      if (album.pages.length > 0) {
        logger.log?.(`AlbumService API 取得 ${album.pages.length} 張圖片`);
        return album;
      }
      logger.log?.('AlbumService API 無圖片，改用 DOM');
    } catch (e) {
      logger.warn?.('AlbumService API 失敗，改用 DOM:', e);
    }

    if (!allowDomFallback) {
      return { title: '', pages: [], postUrl };
    }

    return parseAlbumFromDom(postUrl, siteHandler);
  }

  function isPostPage(url) {
    return typeof url === 'string' && url.includes('/post/');
  }

  window.KemonoAlbumService = {
    fetchAlbum,
    parseAlbumFromApi,
    parseAlbumFromDom,
    isPostPage
  };
})();
