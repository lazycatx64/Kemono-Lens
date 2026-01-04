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
            preloadImageCount: 5
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
    }

    async loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['visualSettings', 'kemono_preview_settings'], (result) => {
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
                        }
                    } catch (e) {
                        console.error('載入預覽設定失敗:', e);
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
            preloadImageCount: this.settings.preloadImageCount
        };
        chrome.storage.local.set({ kemono_preview_settings: JSON.stringify(previewSettings) });
        try {
            localStorage.setItem('kemono_preview_settings', JSON.stringify(previewSettings));
        } catch (e) {
            console.warn('無法寫入 localStorage:', e);
        }

        this.messageManager.showSuccess('設定已保存');
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

        if (previewMaxSizeInput) {
            previewMaxSizeInput.value = this.settings.previewMaxSize;
        }

        const preloadImageCountInput = document.getElementById('preview-preload-count');
        if (preloadImageCountInput) {
            preloadImageCountInput.value = this.settings.preloadImageCount || 5;
        }
    }

    notifySettingsChanged(type, enabled) {
        // 通知內容腳本更新設定（支援兩個域名）
        chrome.tabs.query({url: ['https://kemono.cr/*', 'https://coomer.st/*']}, (tabs) => {
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
        // 觸發預覽設定變更事件（供 content script 使用）
        window.dispatchEvent(new CustomEvent('kemonoSettingsChanged', {
            detail: {
                key: 'preview',
                value: {
                    enabled: this.settings.previewEnabled,
                    switchMode: this.settings.previewSwitchMode,
                    maxPreviewSize: this.settings.previewMaxSize
                },
                settings: {
                    enabled: this.settings.previewEnabled,
                    switchMode: this.settings.previewSwitchMode,
                    maxPreviewSize: this.settings.previewMaxSize,
                    preloadImageCount: this.settings.preloadImageCount
                }
            }
        }));

        // 通知所有相關的標籤頁更新預覽設定
        chrome.tabs.query({url: ['https://kemono.cr/*', 'https://coomer.st/*']}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'updatePreviewSettings',
                    settings: {
                        enabled: this.settings.previewEnabled,
                        switchMode: this.settings.previewSwitchMode,
                        maxPreviewSize: this.settings.previewMaxSize
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