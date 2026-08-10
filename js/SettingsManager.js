// 設定管理器 - 處理顯示設定選項

console.log('[KemonoFriends] SettingsManager 加載');

class SettingsManager {
    constructor(messageManager) {
        this.messageManager = messageManager;
        this.settings = {
            blacklistVisualEffects: true,
            favoritesVisualEffects: true,
            hideBlacklistedPosts: false,
            // 預覽設定
            previewEnabled: true,
            previewSwitchMode: 'alt_scroll',
            previewMaxSize: 600,
            preloadImageCount: 5,
            previewControlMode: 'hold_to_hide',
            previewModifierKey: 'alt',
            // 請求速率限制
            requestRateLimit: 10,
            // 日誌等級
            loggerLevel: 'info'
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSettings();
    }

    setupEventListeners() {
        // 黑名單視覺效果開關
        const blacklistToggle = document.getElementById('blacklist-visual-effects');
        if (blacklistToggle) {
            blacklistToggle.addEventListener('change', (e) => {
                this.settings.blacklistVisualEffects = e.target.checked;
                this.saveSettings();
                this.notifySettingsChanged('blacklist', e.target.checked);
            });
        }

        // 收藏視覺效果開關
        const favoritesToggle = document.getElementById('favorites-visual-effects');
        if (favoritesToggle) {
            favoritesToggle.addEventListener('change', (e) => {
                this.settings.favoritesVisualEffects = e.target.checked;
                this.saveSettings();
                this.notifySettingsChanged('favorites', e.target.checked);
            });
        }

        // 隱藏黑名單文章開關
        const hideBlacklistedPostsToggle = document.getElementById('hide-blacklisted-posts');
        if (hideBlacklistedPostsToggle) {
            hideBlacklistedPostsToggle.addEventListener('change', (e) => {
                this.settings.hideBlacklistedPosts = e.target.checked;
                this.saveSettings();
                this.notifySettingsChanged('hideBlacklistedPosts', e.target.checked);
            });
        }

        // 預覽功能開關
        const previewEnabledToggle = document.getElementById('preview-enabled');
        if (previewEnabledToggle) {
            previewEnabledToggle.addEventListener('change', (e) => {
                this.settings.previewEnabled = e.target.checked;
                this.saveSettings();
                this.notifyPreviewSettingsChanged();
            });
        }

        // 預覽切換模式
        const previewSwitchRadios = document.querySelectorAll('input[name="preview-switch-mode"]');
        previewSwitchRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.settings.previewSwitchMode = e.target.value;
                    this.saveSettings();
                    this.notifyPreviewSettingsChanged();
                }
            });
        });

        // 預覽觸發控制
        const previewControlRadios = document.querySelectorAll('input[name="preview-control-mode"]');
        previewControlRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.settings.previewControlMode = e.target.value;
                    this.saveSettings();
                    this.notifyPreviewSettingsChanged();
                }
            });
        });

        // 預覽控制快速鍵
        const previewModifierRadios = document.querySelectorAll('input[name="preview-modifier-key"]');
        previewModifierRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.settings.previewModifierKey = e.target.value;
                    this.saveSettings();
                    this.notifyPreviewSettingsChanged();
                }
            });
        });

        // 預覽最大尺寸
        const previewMaxSizeInput = document.getElementById('preview-max-size');
        if (previewMaxSizeInput) {
            previewMaxSizeInput.addEventListener('change', (e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value >= 200 && value <= 1200) {
                    this.settings.previewMaxSize = value;
                    this.saveSettings();
                    this.notifyPreviewSettingsChanged();
                }
            });
        }

        // 預載入圖片數量
        const preloadImageCountInput = document.getElementById('preview-preload-count');
        if (preloadImageCountInput) {
            preloadImageCountInput.addEventListener('change', (e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value >= 0 && value <= 20) {
                    this.settings.preloadImageCount = value;
                    this.saveSettings();
                    this.notifyPreviewSettingsChanged();
                }
            });
        }

        // 請求速率限制
        const requestRateLimitInput = document.getElementById('request-rate-limit');
        if (requestRateLimitInput) {
            requestRateLimitInput.addEventListener('change', (e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value >= 1 && value <= 100) {
                    this.settings.requestRateLimit = value;
                    this.saveSettings();
                    this.notifyRequestQueueSettingsChanged();
                }
            });
        }

        // 日誌等級
        const loggerLevelRadios = document.querySelectorAll('input[name="logger-level"]');
        loggerLevelRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.settings.loggerLevel = e.target.value;
                    this.saveLoggerSettings();
                }
            });
        });

        // 網站網域設定
        const saveDomainsBtn = document.getElementById('save-site-domains-btn');
        if (saveDomainsBtn) {
            saveDomainsBtn.addEventListener('click', () => this.saveSiteDomains());
        }
    }

    getTabQueryUrls() {
        if (window.KemonoDomainConfig) {
            return window.KemonoDomainConfig.getTabQueryUrls();
        }
        return ['https://kemono.cr/*', 'https://coomer.st/*'];
    }

    async loadSiteDomainsIntoUI() {
        const domainConfig = window.KemonoDomainConfig;
        if (!domainConfig) {
            return;
        }
        const domains = await domainConfig.loadDomains();
        const kemonoInput = document.getElementById('kemono-domain-input');
        const coomerInput = document.getElementById('coomer-domain-input');
        if (kemonoInput) {
            kemonoInput.value = domains.kemono;
        }
        if (coomerInput) {
            coomerInput.value = domains.coomer;
        }
        this.updateDomainHelpLinks(domains);
    }

    updateDomainHelpLinks(domains) {
        const kemonoDomain = domains?.kemono || 'kemono.cr';
        const siteLink = document.getElementById('favorites-kemono-site-link');
        const exportLink = document.getElementById('favorites-kemono-export-link');
        if (siteLink) {
            siteLink.href = `https://${kemonoDomain}/`;
            siteLink.textContent = 'Kemono 網站';
        }
        if (exportLink) {
            exportLink.href = `https://${kemonoDomain}/account/favorites/export`;
        }
        const blacklistHelpExample = document.getElementById('blacklist-url-example');
        if (blacklistHelpExample) {
            blacklistHelpExample.textContent = `https://${kemonoDomain}/patreon/user/5564244`;
        }
    }

    async saveSiteDomains() {
        const domainConfig = window.KemonoDomainConfig;
        if (!domainConfig) {
            this.messageManager.showError('網域設定模組未載入');
            return;
        }

        const kemonoInput = document.getElementById('kemono-domain-input');
        const coomerInput = document.getElementById('coomer-domain-input');
        const kemonoRaw = kemonoInput?.value || '';
        const coomerRaw = coomerInput?.value || '';

        const kemonoDomain = domainConfig.normalizeDomain(kemonoRaw);
        const coomerDomain = domainConfig.normalizeDomain(coomerRaw);

        if (!kemonoDomain || !coomerDomain) {
            this.messageManager.showError('請輸入有效的網域（例如 kemono.cr）');
            return;
        }

        const previousDomains = domainConfig.getDomains();
        const nextDomains = {
            kemono: kemonoDomain,
            coomer: coomerDomain
        };

        // 收集需要向使用者請求的 optional 權限
        const originsToRequest = [];
        for (const site of ['kemono', 'coomer']) {
            const domain = nextDomains[site];
            if (domainConfig.isDefaultDomain(site, domain)) {
                continue;
            }
            originsToRequest.push(...domainConfig.getOriginPatterns(domain));
        }
        const uniqueOrigins = [...new Set(originsToRequest)];

        try {
            if (uniqueOrigins.length > 0) {
                const granted = await chrome.permissions.request({ origins: uniqueOrigins });
                if (!granted) {
                    this.messageManager.showError('未獲得網域權限，設定未儲存');
                    await this.loadSiteDomainsIntoUI();
                    return;
                }
            }

            await domainConfig.setDomains(nextDomains);
            const migrated = await domainConfig.migrateBlacklistIconUrls(previousDomains, nextDomains);

            const syncResult = await chrome.runtime.sendMessage({
                action: 'SYNC_CONTENT_SCRIPTS',
                previousDomains
            });

            if (!syncResult || syncResult.ok === false) {
                this.messageManager.showError(`網域已儲存，但同步腳本失敗：${(syncResult && syncResult.error) || '未收到背景腳本回應'}`);
                return;
            }

            if (kemonoInput) kemonoInput.value = kemonoDomain;
            if (coomerInput) coomerInput.value = coomerDomain;
            this.updateDomainHelpLinks(nextDomains);

            const migrateHint = migrated > 0 ? `，已更新 ${migrated} 個頭像連結` : '';
            this.messageManager.showSuccess(`網域設定已儲存${migrateHint}。請重新整理已開啟的網站分頁以使功能生效。`);
        } catch (error) {
            console.error('儲存網域設定失敗:', error);
            this.messageManager.showError(`儲存網域設定失敗：${error.message || error}`);
            await this.loadSiteDomainsIntoUI();
        }
    }

    async loadSettings() {
        await this.loadSiteDomainsIntoUI();
        return new Promise((resolve) => {
            chrome.storage.local.get(['visualSettings', 'kemono_preview_settings', 'kemono_request_queue_settings', 'kemono_logger_settings'], (result) => {
                if (result.visualSettings) {
                    this.settings = { ...this.settings, ...result.visualSettings };
                }
                
                // 載入預覽設定（從 localStorage 或 chrome.storage）
                // 注意：從儲存讀取時使用 enabled, switchMode, maxPreviewSize, preloadImageCount，然後映射到內部使用的 previewEnabled, previewSwitchMode, previewMaxSize, preloadImageCount
                if (result.kemono_preview_settings) {
                    try {
                        const previewSettings = JSON.parse(result.kemono_preview_settings);
                        this.settings.previewEnabled = previewSettings.enabled !== undefined ? previewSettings.enabled : this.settings.previewEnabled;
                        this.settings.previewSwitchMode = previewSettings.switchMode || this.settings.previewSwitchMode;
                        this.settings.previewMaxSize = previewSettings.maxPreviewSize || this.settings.previewMaxSize;
                        this.settings.preloadImageCount = previewSettings.preloadImageCount !== undefined ? previewSettings.preloadImageCount : this.settings.preloadImageCount;
                        this.settings.previewControlMode = previewSettings.controlMode || this.settings.previewControlMode;
                        this.settings.previewModifierKey = previewSettings.modifierKey || this.settings.previewModifierKey;
                    } catch (e) {
                        // 如果解析失敗，嘗試從 localStorage 讀取
                        try {
                            const localSettings = localStorage.getItem('kemono_preview_settings');
                            if (localSettings) {
                                const previewSettings = JSON.parse(localSettings);
                                this.settings.previewEnabled = previewSettings.enabled !== undefined ? previewSettings.enabled : this.settings.previewEnabled;
                                this.settings.previewSwitchMode = previewSettings.switchMode || this.settings.previewSwitchMode;
                                this.settings.previewMaxSize = previewSettings.maxPreviewSize || this.settings.previewMaxSize;
                                this.settings.preloadImageCount = previewSettings.preloadImageCount !== undefined ? previewSettings.preloadImageCount : this.settings.preloadImageCount;
                                this.settings.previewControlMode = previewSettings.controlMode || this.settings.previewControlMode;
                                this.settings.previewModifierKey = previewSettings.modifierKey || this.settings.previewModifierKey;
                            }
                        } catch (e2) {
                            console.error('載入預覽設定失敗:', e2);
                        }
                    }
                } else {
                    // 嘗試從 localStorage 讀取
                    try {
                        const localSettings = localStorage.getItem('kemono_preview_settings');
                        if (localSettings) {
                            const previewSettings = JSON.parse(localSettings);
                            this.settings.previewEnabled = previewSettings.enabled !== undefined ? previewSettings.enabled : this.settings.previewEnabled;
                            this.settings.previewSwitchMode = previewSettings.switchMode || this.settings.previewSwitchMode;
                            this.settings.previewMaxSize = previewSettings.maxPreviewSize || this.settings.previewMaxSize;
                            this.settings.preloadImageCount = previewSettings.preloadImageCount !== undefined ? previewSettings.preloadImageCount : this.settings.preloadImageCount;
                            this.settings.previewControlMode = previewSettings.controlMode || this.settings.previewControlMode;
                            this.settings.previewModifierKey = previewSettings.modifierKey || this.settings.previewModifierKey;
                        }
                    } catch (e) {
                        console.error('載入預覽設定失敗:', e);
                    }
                }

                // 載入請求速率限制設定
                if (result.kemono_request_queue_settings) {
                    try {
                        const queueSettings = JSON.parse(result.kemono_request_queue_settings);
                        if (queueSettings.maxRequestsPerSecond !== undefined) {
                            this.settings.requestRateLimit = queueSettings.maxRequestsPerSecond;
                        }
                    } catch (e) {
                        console.error('載入請求排隊設定失敗:', e);
                    }
                } else {
                    try {
                        const localQueueSettings = localStorage.getItem('kemono_request_queue_settings');
                        if (localQueueSettings) {
                            const queueSettings = JSON.parse(localQueueSettings);
                            if (queueSettings.maxRequestsPerSecond !== undefined) {
                                this.settings.requestRateLimit = queueSettings.maxRequestsPerSecond;
                            }
                        }
                    } catch (e) {
                        console.error('載入請求排隊設定失敗:', e);
                    }
                }
                
                // 載入日誌等級設定
                if (result.kemono_logger_settings) {
                    try {
                        const loggerSettings = typeof result.kemono_logger_settings === 'string'
                            ? JSON.parse(result.kemono_logger_settings)
                            : result.kemono_logger_settings;
                        if (loggerSettings && loggerSettings.level) {
                            this.settings.loggerLevel = loggerSettings.level;
                        }
                    } catch (e) {
                        console.error('載入日誌等級設定失敗:', e);
                    }
                } else {
                    try {
                        const localLoggerSettings = localStorage.getItem('kemono_logger_settings');
                        if (localLoggerSettings) {
                            const loggerSettings = JSON.parse(localLoggerSettings);
                            if (loggerSettings && loggerSettings.level) {
                                this.settings.loggerLevel = loggerSettings.level;
                            }
                        }
                    } catch (e) {
                        console.error('載入日誌等級設定失敗:', e);
                    }
                }
                
                // 更新UI
                this.updateUI();
                resolve();
            });
        });
    }

    async saveSettings() {
        // 儲存視覺設定
        const visualSettings = {
            blacklistVisualEffects: this.settings.blacklistVisualEffects,
            favoritesVisualEffects: this.settings.favoritesVisualEffects,
            hideBlacklistedPosts: this.settings.hideBlacklistedPosts
        };
        chrome.storage.local.set({ visualSettings });

        // 儲存預覽設定（同時儲存到 chrome.storage 和 localStorage 以保持相容性）
        // 注意：儲存時使用 enabled, switchMode, maxPreviewSize, preloadImageCount 以與 content script 的 settings.js 保持一致
        const previewSettings = {
            enabled: this.settings.previewEnabled,
            switchMode: this.settings.previewSwitchMode,
            maxPreviewSize: this.settings.previewMaxSize,
            preloadImageCount: this.settings.preloadImageCount,
            controlMode: this.settings.previewControlMode || 'hold_to_hide',
            modifierKey: this.settings.previewModifierKey || 'alt'
        };
        chrome.storage.local.set({ kemono_preview_settings: JSON.stringify(previewSettings) });
        try {
            localStorage.setItem('kemono_preview_settings', JSON.stringify(previewSettings));
        } catch (e) {
            console.warn('無法寫入 localStorage:', e);
        }

        this.messageManager.showSuccess('設定已儲存');
    }

    updateUI() {
        const blacklistToggle = document.getElementById('blacklist-visual-effects');
        const favoritesToggle = document.getElementById('favorites-visual-effects');
        const hideBlacklistedPostsToggle = document.getElementById('hide-blacklisted-posts');
        const previewEnabledToggle = document.getElementById('preview-enabled');
        const previewMaxSizeInput = document.getElementById('preview-max-size');
        
        if (blacklistToggle) {
            blacklistToggle.checked = this.settings.blacklistVisualEffects;
        }
        
        if (favoritesToggle) {
            favoritesToggle.checked = this.settings.favoritesVisualEffects;
        }
        
        if (hideBlacklistedPostsToggle) {
            hideBlacklistedPostsToggle.checked = this.settings.hideBlacklistedPosts;
        }

        if (previewEnabledToggle) {
            previewEnabledToggle.checked = this.settings.previewEnabled;
        }

        // 設定預覽切換模式
        const previewSwitchRadios = document.querySelectorAll('input[name="preview-switch-mode"]');
        previewSwitchRadios.forEach(radio => {
            radio.checked = radio.value === this.settings.previewSwitchMode;
        });

        const previewControlRadios = document.querySelectorAll('input[name="preview-control-mode"]');
        previewControlRadios.forEach(radio => {
            radio.checked = radio.value === (this.settings.previewControlMode || 'hold_to_hide');
        });

        const previewModifierRadios = document.querySelectorAll('input[name="preview-modifier-key"]');
        previewModifierRadios.forEach(radio => {
            radio.checked = radio.value === (this.settings.previewModifierKey || 'alt');
        });

        if (previewMaxSizeInput) {
            previewMaxSizeInput.value = this.settings.previewMaxSize;
        }

        const preloadImageCountInput = document.getElementById('preview-preload-count');
        if (preloadImageCountInput) {
            preloadImageCountInput.value = this.settings.preloadImageCount || 5;
        }

        const requestRateLimitInput = document.getElementById('request-rate-limit');
        if (requestRateLimitInput) {
            requestRateLimitInput.value = this.settings.requestRateLimit || 10;
        }

        const loggerLevelRadios = document.querySelectorAll('input[name="logger-level"]');
        loggerLevelRadios.forEach(radio => {
            radio.checked = radio.value === (this.settings.loggerLevel || 'info');
        });
    }

    saveLoggerSettings() {
        const level = this.settings.loggerLevel || 'info';
        if (window.KemonoLogger && typeof window.KemonoLogger.setLogLevel === 'function') {
            window.KemonoLogger.setLogLevel(level);
        } else {
            const payload = JSON.stringify({ level });
            chrome.storage.local.set({ kemono_logger_settings: payload });
            try {
                localStorage.setItem('kemono_logger_settings', payload);
            } catch (e) {
                console.warn('無法寫入 localStorage:', e);
            }
        }
        this.messageManager.showSuccess('日誌等級已更新');
    }

    notifySettingsChanged(type, enabled) {
        // 通知內容腳本更新設定（依目前網域設定）
        chrome.tabs.query({url: this.getTabQueryUrls()}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'updateVisualSettings',
                    settings: this.settings
                }).catch(() => {
                    // 忽略無法發送訊息的標籤頁（例如未載入內容腳本）
                });
            });
        });

        console.log(`${type} ${enabled ? 'enabled' : 'disabled'}`);
    }

    notifyPreviewSettingsChanged() {
        const previewPayload = {
            enabled: this.settings.previewEnabled,
            switchMode: this.settings.previewSwitchMode,
            maxPreviewSize: this.settings.previewMaxSize,
            preloadImageCount: this.settings.preloadImageCount,
            controlMode: this.settings.previewControlMode || 'hold_to_hide',
            modifierKey: this.settings.previewModifierKey || 'alt'
        };

        // 觸發預覽設定變更事件（供 content script 使用）
        window.dispatchEvent(new CustomEvent('kemonoSettingsChanged', {
            detail: {
                key: 'preview',
                value: previewPayload,
                settings: previewPayload
            }
        }));

        // 通知所有相關的標籤頁更新預覽設定
        chrome.tabs.query({url: this.getTabQueryUrls()}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'updatePreviewSettings',
                    settings: previewPayload
                }).catch(() => {
                    // 忽略無法發送訊息的標籤頁（例如未載入內容腳本）
                });
            });
        });
    }

    notifyRequestQueueSettingsChanged() {
        // 儲存請求排隊設定
        const queueSettings = {
            maxRequestsPerSecond: this.settings.requestRateLimit
        };
        const queueSettingsJson = JSON.stringify(queueSettings);
        
        try {
            localStorage.setItem('kemono_request_queue_settings', queueSettingsJson);
        } catch (e) {
            console.warn('無法寫入 localStorage:', e);
        }
        
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ kemono_request_queue_settings: queueSettingsJson });
        }

        // 更新 RequestQueue 實例（如果在 options 頁面）
        if (window.KemonoRequestQueue) {
            window.KemonoRequestQueue.updateSettings(this.settings.requestRateLimit);
        }

        // 觸發設定變更事件（供 content script 使用）
        window.dispatchEvent(new CustomEvent('kemonoRequestQueueSettingsChanged', {
            detail: {
                maxRequestsPerSecond: this.settings.requestRateLimit
            }
        }));

        // 通知所有相關的標籤頁更新請求排隊設定
        chrome.tabs.query({url: this.getTabQueryUrls()}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'updateRequestQueueSettings',
                    settings: {
                        maxRequestsPerSecond: this.settings.requestRateLimit
                    }
                }).catch(() => {
                    // 忽略無法發送訊息的標籤頁（例如未載入內容腳本）
                });
            });
        });
    }

    getSettings() {
        return this.settings;
    }
}