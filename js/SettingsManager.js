// 設定管理器 - 處理顯示設定選項

console.log('[KemonoLens] SettingsManager 加載');

const DEFAULT_TOGGLE_READER_SHORTCUTS = ['`'];
const DEFAULT_TOGGLE_TOPBAR_SHORTCUTS = ['Escape'];
const DEFAULT_READER_PREV_SHORTCUTS = ['a', 'ArrowLeft', 'ArrowUp'];
const DEFAULT_READER_NEXT_SHORTCUTS = ['d', 'ArrowRight', 'ArrowDown'];

const READER_SHORTCUT_DEFS = {
    toggleReaderShortcut: {
        fallback: DEFAULT_TOGGLE_READER_SHORTCUTS,
        label: '開關閱讀器',
        chipsId: 'shortcut-toggle-reader-chips',
        addId: 'shortcut-toggle-reader-add',
        resetId: 'shortcut-toggle-reader-reset'
    },
    readerPrevShortcuts: {
        fallback: DEFAULT_READER_PREV_SHORTCUTS,
        label: '上一頁',
        chipsId: 'shortcut-prev-chips',
        addId: 'shortcut-prev-add',
        resetId: 'shortcut-prev-reset'
    },
    readerNextShortcuts: {
        fallback: DEFAULT_READER_NEXT_SHORTCUTS,
        label: '下一頁',
        chipsId: 'shortcut-next-chips',
        addId: 'shortcut-next-add',
        resetId: 'shortcut-next-reset'
    },
    toggleTopBarShortcut: {
        fallback: DEFAULT_TOGGLE_TOPBAR_SHORTCUTS,
        label: '顯示／隱藏控制列',
        chipsId: 'shortcut-toggle-topbar-chips',
        addId: 'shortcut-toggle-topbar-add',
        resetId: 'shortcut-toggle-topbar-reset'
    }
};

function formatShortcutDisplay(key) {
    if (key === ' ') return 'Space';
    if (key === 'ArrowLeft') return '←';
    if (key === 'ArrowRight') return '→';
    if (key === 'ArrowUp') return '↑';
    if (key === 'ArrowDown') return '↓';
    if (key === 'Escape') return 'Esc';
    if (key === 'Enter') return 'Enter';
    if (key === 'Tab') return 'Tab';
    return key || '`';
}

function normalizeShortcutKey(key) {
    if (typeof key !== 'string' || key.length === 0) return null;
    if (key.length === 1) return key.toLowerCase();
    return key;
}

function normalizeShortcutList(list, fallback) {
    let source = list;
    if (typeof source === 'string') {
        source = source.length > 0 ? [source] : [];
    }
    if (!Array.isArray(source)) return fallback.slice();
    const seen = new Set();
    const out = [];
    source.forEach((item) => {
        const key = normalizeShortcutKey(item);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(key);
    });
    return out.length > 0 ? out : fallback.slice();
}

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
            previewShowDelay: 200,
            previewModifierKey: 'alt',
            // 閱讀器快速鍵（皆為多按鍵陣列）
            toggleReaderShortcut: DEFAULT_TOGGLE_READER_SHORTCUTS.slice(),
            readerPrevShortcuts: DEFAULT_READER_PREV_SHORTCUTS.slice(),
            readerNextShortcuts: DEFAULT_READER_NEXT_SHORTCUTS.slice(),
            toggleTopBarShortcut: DEFAULT_TOGGLE_TOPBAR_SHORTCUTS.slice(),
            // 請求速率限制
            requestRateLimit: 10,
            // 日誌等級
            loggerLevel: 'info'
        };
        this._shortcutRecording = null;
        this._shortcutRecordHandler = null;
        
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

        // 延遲顯示毫秒數
        const previewShowDelayInput = document.getElementById('preview-show-delay');
        if (previewShowDelayInput) {
            previewShowDelayInput.addEventListener('change', (e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 0 && value <= 5000) {
                    this.settings.previewShowDelay = value;
                    this.saveSettings();
                    this.notifyPreviewSettingsChanged();
                }
            });
        }

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

        // 快速鍵錄製（全部為多按鍵列表）
        Object.keys(READER_SHORTCUT_DEFS).forEach((settingKey) => {
            const def = READER_SHORTCUT_DEFS[settingKey];
            const addBtn = document.getElementById(def.addId);
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    this.startShortcutRecording({
                        settingKey,
                        buttonEl: addBtn
                    });
                });
            }
            const resetBtn = document.getElementById(def.resetId);
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    this.cancelShortcutRecording();
                    this.settings[settingKey] = def.fallback.slice();
                    this.persistReaderShortcuts('已還原為預設快速鍵');
                });
            }
        });
    }

    getShortcutFallback(settingKey) {
        const def = READER_SHORTCUT_DEFS[settingKey];
        return def ? def.fallback : DEFAULT_TOGGLE_READER_SHORTCUTS;
    }

    getReaderShortcutPayload() {
        const payload = {};
        Object.keys(READER_SHORTCUT_DEFS).forEach((settingKey) => {
            payload[settingKey] = normalizeShortcutList(
                this.settings[settingKey],
                this.getShortcutFallback(settingKey)
            );
        });
        return payload;
    }

    applyReaderShortcutSettings(readerSettings) {
        if (!readerSettings || typeof readerSettings !== 'object') return;
        Object.keys(READER_SHORTCUT_DEFS).forEach((settingKey) => {
            if (readerSettings[settingKey] !== undefined) {
                this.settings[settingKey] = normalizeShortcutList(
                    readerSettings[settingKey],
                    this.getShortcutFallback(settingKey)
                );
            }
        });
    }

    collectBoundShortcutKeys(excludeSettingKey) {
        const bound = new Map(); // key -> label
        const add = (key, label) => {
            const normalized = normalizeShortcutKey(key);
            if (!normalized) return;
            if (!bound.has(normalized)) bound.set(normalized, label);
        };

        Object.keys(READER_SHORTCUT_DEFS).forEach((settingKey) => {
            if (settingKey === excludeSettingKey) return;
            const def = READER_SHORTCUT_DEFS[settingKey];
            const keys = normalizeShortcutList(this.settings[settingKey], def.fallback);
            keys.forEach((k) => add(k, def.label));
        });
        return bound;
    }

    persistReaderShortcuts(successMessage) {
        this.saveReaderShortcutSettings(() => {
            this.notifyReaderSettingsChanged();
        });
        this.updateShortcutUI();
        if (successMessage) {
            this.messageManager.showSuccess(successMessage);
        }
    }

    removeShortcutFromList(settingKey, keyToRemove) {
        this.cancelShortcutRecording();
        const fallback = this.getShortcutFallback(settingKey);
        const current = normalizeShortcutList(this.settings[settingKey], fallback);
        const normalizedRemove = normalizeShortcutKey(keyToRemove);
        const next = current.filter((k) => k !== normalizedRemove);
        if (next.length === 0) {
            this.messageManager.showError('至少需保留一個快速鍵');
            return;
        }
        this.settings[settingKey] = next;
        this.persistReaderShortcuts('快速鍵已更新');
    }

    startShortcutRecording({ settingKey, buttonEl }) {
        this.cancelShortcutRecording();
        this._shortcutRecording = { settingKey, buttonEl };
        buttonEl.classList.add('recording');
        buttonEl.textContent = '…';
        buttonEl.title = '請按下新快速鍵（Esc 取消）';

        this._shortcutRecordHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Escape') {
                this.cancelShortcutRecording();
                this.updateShortcutUI();
                return;
            }

            if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') {
                return;
            }

            const key = normalizeShortcutKey(e.key);
            if (!key) return;

            const fallback = this.getShortcutFallback(settingKey);
            const current = normalizeShortcutList(this.settings[settingKey], fallback);
            if (current.includes(key)) {
                this.cancelShortcutRecording();
                this.updateShortcutUI();
                this.messageManager.showError('此快速鍵已在列表中');
                return;
            }

            const bound = this.collectBoundShortcutKeys(settingKey);
            if (bound.has(key)) {
                this.cancelShortcutRecording();
                this.updateShortcutUI();
                this.messageManager.showError(`此快速鍵已用於「${bound.get(key)}」`);
                return;
            }

            current.push(key);
            this.settings[settingKey] = current;
            this.cancelShortcutRecording();
            this.persistReaderShortcuts('快速鍵已更新');
        };

        document.addEventListener('keydown', this._shortcutRecordHandler, true);
    }

    cancelShortcutRecording() {
        if (this._shortcutRecordHandler) {
            document.removeEventListener('keydown', this._shortcutRecordHandler, true);
            this._shortcutRecordHandler = null;
        }
        if (this._shortcutRecording && this._shortcutRecording.buttonEl) {
            this._shortcutRecording.buttonEl.classList.remove('recording');
        }
        this._shortcutRecording = null;
    }

    renderShortcutChips(containerId, settingKey) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const fallback = this.getShortcutFallback(settingKey);
        const keys = normalizeShortcutList(this.settings[settingKey], fallback);
        this.settings[settingKey] = keys;
        container.innerHTML = '';
        keys.forEach((key) => {
            const chip = document.createElement('span');
            chip.className = 'shortcut-chip';
            const label = document.createElement('span');
            label.textContent = formatShortcutDisplay(key);
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'shortcut-chip-remove';
            removeBtn.title = '移除此快速鍵';
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', () => {
                this.removeShortcutFromList(settingKey, key);
            });
            chip.appendChild(label);
            chip.appendChild(removeBtn);
            container.appendChild(chip);
        });
    }

    updateShortcutUI() {
        Object.keys(READER_SHORTCUT_DEFS).forEach((settingKey) => {
            const def = READER_SHORTCUT_DEFS[settingKey];
            const addBtn = document.getElementById(def.addId);
            if (addBtn && !addBtn.classList.contains('recording')) {
                addBtn.textContent = '＋';
                addBtn.title = '新增快速鍵';
            }
            this.renderShortcutChips(def.chipsId, settingKey);
        });
    }

    saveReaderShortcutSettings(onDone) {
        const payload = this.getReaderShortcutPayload();
        Object.keys(payload).forEach((key) => {
            this.settings[key] = payload[key];
        });

        chrome.storage.local.get(['kemono_reader_settings'], (result) => {
            let existing = {};
            if (result.kemono_reader_settings) {
                try {
                    existing = typeof result.kemono_reader_settings === 'string'
                        ? JSON.parse(result.kemono_reader_settings)
                        : result.kemono_reader_settings;
                } catch (e) {
                    existing = {};
                }
            }
            const next = {
                ...existing,
                ...payload
            };
            const json = JSON.stringify(next);
            try {
                localStorage.setItem('kemono_reader_settings', json);
            } catch (e) {
                console.warn('無法寫入 localStorage:', e);
            }
            chrome.storage.local.set({ kemono_reader_settings: json }, () => {
                if (typeof onDone === 'function') onDone();
            });
        });
    }

    notifyReaderSettingsChanged() {
        const payload = this.getReaderShortcutPayload();
        chrome.tabs.query({ url: this.getTabQueryUrls() }, (tabs) => {
            tabs.forEach((tab) => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'updateReaderSettings',
                    settings: payload
                }).catch(() => {});
            });
        });
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
            chrome.storage.local.get(['visualSettings', 'kemono_preview_settings', 'kemono_request_queue_settings', 'kemono_logger_settings', 'kemono_reader_settings'], (result) => {
                if (result.visualSettings) {
                    this.settings = { ...this.settings, ...result.visualSettings };
                }

                if (result.kemono_reader_settings) {
                    try {
                        const readerSettings = typeof result.kemono_reader_settings === 'string'
                            ? JSON.parse(result.kemono_reader_settings)
                            : result.kemono_reader_settings;
                        this.applyReaderShortcutSettings(readerSettings);
                    } catch (e) {
                        console.error('載入閱讀器快速鍵設定失敗:', e);
                    }
                } else {
                    try {
                        const localReader = localStorage.getItem('kemono_reader_settings');
                        if (localReader) {
                            const readerSettings = JSON.parse(localReader);
                            this.applyReaderShortcutSettings(readerSettings);
                        }
                    } catch (e) {
                        console.error('載入閱讀器快速鍵設定失敗:', e);
                    }
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
                        this.settings.previewShowDelay = previewSettings.showDelay !== undefined ? previewSettings.showDelay : this.settings.previewShowDelay;
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
                                this.settings.previewShowDelay = previewSettings.showDelay !== undefined ? previewSettings.showDelay : this.settings.previewShowDelay;
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
                            this.settings.previewShowDelay = previewSettings.showDelay !== undefined ? previewSettings.showDelay : this.settings.previewShowDelay;
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
            showDelay: this.settings.previewShowDelay !== undefined ? this.settings.previewShowDelay : 200,
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

        const previewShowDelayInput = document.getElementById('preview-show-delay');
        if (previewShowDelayInput) {
            previewShowDelayInput.value = this.settings.previewShowDelay !== undefined
                ? this.settings.previewShowDelay
                : 200;
        }

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

        this.updateShortcutUI();
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
            showDelay: this.settings.previewShowDelay !== undefined ? this.settings.previewShowDelay : 200,
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