/**
 * 網站網域設定 - 集中管理 kemono / coomer 網域
 * 以經典 script 暴露於 window.KemonoDomainConfig
 */

(function (global) {
    const STORAGE_KEY = 'siteDomains';

    const DEFAULT_DOMAINS = {
        kemono: 'kemono.cr',
        coomer: 'coomer.st'
    };

    const CONTENT_SCRIPT_IDS = {
        kemono: 'kemono-custom',
        coomer: 'coomer-custom'
    };

    const CLICKGUARD_SCRIPT_IDS = {
        kemono: 'kemono-clickguard',
        coomer: 'coomer-clickguard'
    };

    const CLICKGUARD_BRIDGE_SCRIPT_IDS = {
        kemono: 'kemono-clickguard-bridge',
        coomer: 'coomer-clickguard-bridge'
    };

    const CLICKGUARD_SCRIPT_JS = [
        'content-scripts/ClickGuard.js'
    ];

    const CLICKGUARD_BRIDGE_SCRIPT_JS = [
        'content-scripts/ClickGuardBridge.js'
    ];

    const CONTENT_SCRIPT_PATHS = [
        '/artists*',
        '/artists/updated*',
        '/*/user/*',
        '/account/favorites/artists*',
        '/posts*'
    ];

    const CONTENT_SCRIPT_JS = [
        'logger.js',
        'i18n.js',
        'RequestQueue.js',
        'settings.js',
        'util.js',
        'js/DomainConfig.js',
        'sites/kemono.js',
        'sites/coomer.js',
        'sites/index.js',
        'content-scripts/DOMManager.js',
        'content-scripts/BlacklistContentManager.js',
        'content-scripts/FavoritesContentManager.js',
        'content-scripts/reader/ReaderSettings.js',
        'content-scripts/reader/AlbumService.js',
        'content-scripts/reader/book/spreads.js',
        'content-scripts/reader/book/layout.js',
        'content-scripts/reader/book/BookView.js',
        'content-scripts/reader/book/BookThumbs.js',
        'content-scripts/reader/ReaderController.js',
        'content.js'
    ];

    const CONTENT_SCRIPT_CSS = [
        'styles.css',
        'content-scripts/reader/reader.css'
    ];

    let cachedDomains = { ...DEFAULT_DOMAINS };

    function normalizeDomain(input) {
        if (!input || typeof input !== 'string') {
            return '';
        }

        let domain = input.trim().toLowerCase();
        domain = domain.replace(/^https?:\/\//, '');
        domain = domain.replace(/\/.*$/, '');
        domain = domain.replace(/:\d+$/, '');
        domain = domain.replace(/^www\./, '');
        domain = domain.replace(/\.$/, '');

        // 簡單驗證：至少含一個點，且僅允許合法主機字元
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
            return '';
        }

        return domain;
    }

    function getOriginPatterns(domain) {
        const normalized = normalizeDomain(domain);
        if (!normalized) {
            return [];
        }
        return [
            `https://${normalized}/*`,
            `https://*.${normalized}/*`
        ];
    }

    function buildMatchesForDomain(domain) {
        const normalized = normalizeDomain(domain);
        if (!normalized) {
            return [];
        }
        // 同時涵蓋 apex 與 www，與 isMatch 行為一致
        return CONTENT_SCRIPT_PATHS.flatMap((path) => [
            `https://${normalized}${path}`,
            `https://www.${normalized}${path}`
        ]);
    }

    function isDefaultDomain(site, domain) {
        const normalized = normalizeDomain(domain);
        return normalized === DEFAULT_DOMAINS[site];
    }

    function hostnameMatchesDomain(hostname, domain) {
        if (!hostname || !domain) {
            return false;
        }
        const host = hostname.toLowerCase().replace(/^www\./, '');
        const target = normalizeDomain(domain);
        return host === target || host.endsWith(`.${target}`);
    }

    function resolveSiteFamily(hostname) {
        if (!hostname) {
            return null;
        }
        if (hostnameMatchesDomain(hostname, cachedDomains.kemono)) {
            return 'kemono';
        }
        if (hostnameMatchesDomain(hostname, cachedDomains.coomer)) {
            return 'coomer';
        }
        return null;
    }

    function getDomain(site) {
        return cachedDomains[site] || DEFAULT_DOMAINS[site];
    }

    function getDomains() {
        return { ...cachedDomains };
    }

    function setCachedDomains(domains) {
        cachedDomains = {
            kemono: normalizeDomain(domains?.kemono) || DEFAULT_DOMAINS.kemono,
            coomer: normalizeDomain(domains?.coomer) || DEFAULT_DOMAINS.coomer
        };
        return getDomains();
    }

    function loadDomains() {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
                setCachedDomains(DEFAULT_DOMAINS);
                resolve(getDomains());
                return;
            }

            chrome.storage.local.get([STORAGE_KEY], (result) => {
                const stored = result[STORAGE_KEY] || {};
                setCachedDomains({
                    kemono: stored.kemono || DEFAULT_DOMAINS.kemono,
                    coomer: stored.coomer || DEFAULT_DOMAINS.coomer
                });
                resolve(getDomains());
            });
        });
    }

    function setDomains(domains) {
        const next = setCachedDomains(domains);
        return new Promise((resolve, reject) => {
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
                resolve(next);
                return;
            }
            chrome.storage.local.set({ [STORAGE_KEY]: next }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(next);
            });
        });
    }

    function buildUserUrl(site, platform, userId) {
        const domain = getDomain(site || 'kemono');
        return `https://${domain}/${platform}/user/${userId}`;
    }

    function buildIconUrl(site, platform, userId) {
        const domain = getDomain(site || 'kemono');
        return `https://${domain}/icons/${platform}/${userId}`;
    }

    function buildApiUrl(site, path) {
        const domain = getDomain(site || 'kemono');
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        return `https://${domain}${normalizedPath}`;
    }

    /**
     * 將 API／CDN 路徑正規化為縮圖用的 hash 路徑：aa/bb/{hash}{ext}
     * 相容：
     * - 標準兩碼目錄：/de/49/de497e....jpeg
     * - 鏡像站 shard 前綴：/1de/49/de497e....jpeg（第一段多一個數字）
     * - 完整 URL、/data/、/thumbnail/data/ 前綴
     */
    function normalizeImgDataPath(pathOrUrl) {
        if (!pathOrUrl) {
            return '';
        }

        const raw = String(pathOrUrl).split('#')[0].split('?')[0];
        const hashMatch = raw.match(/([a-f0-9]{64}|[a-f0-9]{40}|[a-f0-9]{32})(\.[a-z0-9]+)?$/i);
        if (hashMatch) {
            const hash = hashMatch[1].toLowerCase();
            const ext = (hashMatch[2] || '').toLowerCase();
            return `${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}${ext}`;
        }

        let path = raw.replace(/^https?:\/\/[^/]+/i, '');
        path = path.replace(/^\/+/, '');
        path = path.replace(/^(?:thumbnail\/)?data\//i, '');
        // 去掉第一段目錄開頭的 shard 數字（例如 1de → de）
        path = path.replace(/^(\d)([a-f0-9]{2}\/[a-f0-9]{2}\/)/i, '$2');
        return path;
    }

    function buildImgThumbnailUrl(site, path) {
        const domain = getDomain(site || 'kemono');
        const clean = normalizeImgDataPath(path);
        return `https://img.${domain}/thumbnail/data/${clean}`;
    }

    function buildImgOriginalUrl(site, path) {
        const domain = getDomain(site || 'kemono');
        // 原圖需保留 API 原始 path（可能含 shard 前綴），不可改寫成純 hash 路徑
        const clean = String(path || '')
            .replace(/^https?:\/\/[^/]+/i, '')
            .replace(/^\/+/, '')
            .replace(/^(?:thumbnail\/)?data\//i, '');
        return `https://file.${domain}/data/${clean}`;
    }

    function getTabQueryUrls() {
        const domains = getDomains();
        const urls = [];
        Object.values(domains).forEach((domain) => {
            urls.push(`https://${domain}/*`);
            urls.push(`https://*.${domain}/*`);
        });
        return urls;
    }

    function rewriteIconUrlHost(iconUrl, oldDomain, newDomain) {
        if (!iconUrl || !oldDomain || !newDomain) {
            return iconUrl;
        }
        try {
            const url = new URL(iconUrl);
            if (!hostnameMatchesDomain(url.hostname, oldDomain)) {
                return iconUrl;
            }
            // 保留子網域前綴（例如 img.）
            const host = url.hostname.toLowerCase();
            const oldNorm = normalizeDomain(oldDomain);
            const newNorm = normalizeDomain(newDomain);
            if (host === oldNorm || host === `www.${oldNorm}`) {
                url.hostname = newNorm;
            } else if (host.endsWith(`.${oldNorm}`)) {
                const prefix = host.slice(0, -(oldNorm.length + 1));
                url.hostname = `${prefix}.${newNorm}`;
            } else {
                return iconUrl;
            }
            return url.toString();
        } catch (e) {
            return iconUrl;
        }
    }

    async function migrateBlacklistIconUrls(oldDomains, newDomains) {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            return 0;
        }

        return new Promise((resolve) => {
            chrome.storage.local.get(['blacklistData'], (result) => {
                const blacklistData = result.blacklistData || {};
                let changed = 0;

                Object.keys(blacklistData).forEach((userId) => {
                    const entry = blacklistData[userId];
                    if (!entry || !entry.iconUrl) {
                        return;
                    }

                    let nextUrl = entry.iconUrl;
                    if (oldDomains.kemono !== newDomains.kemono) {
                        nextUrl = rewriteIconUrlHost(nextUrl, oldDomains.kemono, newDomains.kemono);
                    }
                    if (oldDomains.coomer !== newDomains.coomer) {
                        nextUrl = rewriteIconUrlHost(nextUrl, oldDomains.coomer, newDomains.coomer);
                    }

                    if (nextUrl !== entry.iconUrl) {
                        entry.iconUrl = nextUrl;
                        changed += 1;
                    }
                });

                if (changed === 0) {
                    resolve(0);
                    return;
                }

                chrome.storage.local.set({ blacklistData }, () => resolve(changed));
            });
        });
    }

    const api = {
        STORAGE_KEY,
        DEFAULT_DOMAINS,
        CONTENT_SCRIPT_IDS,
        CONTENT_SCRIPT_JS,
        CONTENT_SCRIPT_CSS,
        CLICKGUARD_SCRIPT_IDS,
        CLICKGUARD_SCRIPT_JS,
        CLICKGUARD_BRIDGE_SCRIPT_IDS,
        CLICKGUARD_BRIDGE_SCRIPT_JS,
        normalizeDomain,
        getOriginPatterns,
        buildMatchesForDomain,
        isDefaultDomain,
        hostnameMatchesDomain,
        resolveSiteFamily,
        getDomain,
        getDomains,
        setCachedDomains,
        loadDomains,
        setDomains,
        buildUserUrl,
        buildIconUrl,
        buildApiUrl,
        normalizeImgDataPath,
        buildImgThumbnailUrl,
        buildImgOriginalUrl,
        getTabQueryUrls,
        rewriteIconUrlHost,
        migrateBlacklistIconUrls
    };

    // 瀏覽器頁面 / content script
    if (typeof window !== 'undefined') {
        window.KemonoDomainConfig = api;
    }

    // Service worker（importScripts）
    if (typeof self !== 'undefined' && typeof window === 'undefined') {
        self.KemonoDomainConfig = api;
    }

    // 同步環境（Node 測試等）
    if (typeof global !== 'undefined') {
        global.KemonoDomainConfig = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : self);
