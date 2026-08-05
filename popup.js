/**
 * Popup 頁面腳本 - 設定管理
 */

class PopupSettingsManager {
    constructor() {
        this.settings = {
            blacklistVisualEffects: true,
            favoritesVisualEffects: true,
            hideBlacklistedPosts: false,
            previewEnabled: true,
            previewSwitchMode: 'alt_scroll',
            previewMaxSize: 600
        };
        
        this.init();
    }
    
    getTabQueryUrls() {
        if (window.KemonoDomainConfig) {
            return window.KemonoDomainConfig.getTabQueryUrls();
        }
        return ['https://kemono.cr/*', 'https://coomer.st/*'];
    }

    async init() {
        if (window.KemonoDomainConfig) {
            await window.KemonoDomainConfig.loadDomains();
        }
        this.setupEventListeners();
        this.loadSettings();
        this.setupOpenOptionsLink();
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
    }

    setupOpenOptionsLink() {
        const openOptionsLink = document.getElementById('open-options');
        if (openOptionsLink) {
            openOptionsLink.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.runtime.openOptionsPage();
            });
        }
    }

    async loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['visualSettings', 'kemono_preview_settings'], (result) => {
                if (result.visualSettings) {
                    this.settings = { ...this.settings, ...result.visualSettings };
                }
                
                // 載入預覽設定
                if (result.kemono_preview_settings) {
                    try {
                        const previewSettings = JSON.parse(result.kemono_preview_settings);
                        this.settings.previewEnabled = previewSettings.enabled !== undefined ? previewSettings.enabled : this.settings.previewEnabled;
                        this.settings.previewSwitchMode = previewSettings.switchMode || this.settings.previewSwitchMode;
                        this.settings.previewMaxSize = previewSettings.maxPreviewSize || this.settings.previewMaxSize;
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

        // 儲存預覽設定
        const previewSettings = {
            enabled: this.settings.previewEnabled,
            switchMode: this.settings.previewSwitchMode,
            maxPreviewSize: this.settings.previewMaxSize
        };
        chrome.storage.local.set({ kemono_preview_settings: JSON.stringify(previewSettings) });
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
    }

    notifySettingsChanged(type, enabled) {
        // 通知內容腳本更新設定
        chrome.tabs.query({url: this.getTabQueryUrls()}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'updateVisualSettings',
                    settings: this.settings
                }).catch(() => {
                    // 忽略無法發送訊息的標籤頁
                });
            });
        });
    }

    notifyPreviewSettingsChanged() {
        // 通知所有相關的標籤頁更新預覽設定
        chrome.tabs.query({url: this.getTabQueryUrls()}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'updatePreviewSettings',
                    settings: {
                        enabled: this.settings.previewEnabled,
                        switchMode: this.settings.previewSwitchMode,
                        maxPreviewSize: this.settings.previewMaxSize
                    }
                }).catch(() => {
                    // 忽略無法發送訊息的標籤頁
                });
            });
        });
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new PopupSettingsManager();
});
