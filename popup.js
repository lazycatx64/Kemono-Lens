/**
 * Popup 頁面腳本 - 設定管理
 */

const DEFAULT_TOGGLE_READER_SHORTCUT = '`';

function formatShortcutDisplay(key) {
    if (key === ' ') return 'Space';
    if (key === 'ArrowLeft') return '←';
    if (key === 'ArrowRight') return '→';
    if (key === 'ArrowUp') return '↑';
    if (key === 'ArrowDown') return '↓';
    if (key === 'Escape') return 'Esc';
    if (key === 'Enter') return 'Enter';
    if (key === 'Tab') return 'Tab';
    return key || DEFAULT_TOGGLE_READER_SHORTCUT;
}

class PopupSettingsManager {
    constructor() {
        this.settings = {
            blacklistVisualEffects: true,
            favoritesVisualEffects: true,
            hideBlacklistedPosts: false,
            previewEnabled: true,
            readerEnabled: true,
            toggleReaderShortcut: DEFAULT_TOGGLE_READER_SHORTCUT,
            previewSwitchMode: 'alt_scroll',
            previewMaxSize: 600,
            preloadImageCount: 5,
            previewControlMode: 'hold_to_hide',
            previewModifierKey: 'alt'
        };
        this._shortcutRecording = null;
        this._shortcutRecordHandler = null;
        
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

        // 作品頁閱讀器開關
        const readerEnabledToggle = document.getElementById('reader-enabled');
        if (readerEnabledToggle) {
            readerEnabledToggle.addEventListener('change', (e) => {
                this.settings.readerEnabled = e.target.checked;
                this.saveReaderSettings();
                this.notifyReaderSettingsChanged();
            });
        }

        // 開關閱讀器快速鍵
        const toggleReaderBtn = document.getElementById('shortcut-toggle-reader');
        if (toggleReaderBtn) {
            toggleReaderBtn.addEventListener('click', () => {
                this.startShortcutRecording('toggleReaderShortcut', toggleReaderBtn);
            });
        }
        const toggleReaderResetBtn = document.getElementById('shortcut-toggle-reader-reset');
        if (toggleReaderResetBtn) {
            toggleReaderResetBtn.addEventListener('click', () => {
                this.cancelShortcutRecording();
                this.settings.toggleReaderShortcut = DEFAULT_TOGGLE_READER_SHORTCUT;
                this.saveReaderSettings();
                this.notifyReaderSettingsChanged();
                this.updateShortcutUI();
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

    applyPreviewSettings(previewSettings) {
        this.settings.previewEnabled = previewSettings.enabled !== undefined ? previewSettings.enabled : this.settings.previewEnabled;
        this.settings.previewSwitchMode = previewSettings.switchMode || this.settings.previewSwitchMode;
        this.settings.previewMaxSize = previewSettings.maxPreviewSize || this.settings.previewMaxSize;
        this.settings.preloadImageCount = previewSettings.preloadImageCount !== undefined ? previewSettings.preloadImageCount : this.settings.preloadImageCount;
        this.settings.previewControlMode = previewSettings.controlMode || this.settings.previewControlMode;
        this.settings.previewModifierKey = previewSettings.modifierKey || this.settings.previewModifierKey;
    }

    async loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['visualSettings', 'kemono_preview_settings', 'kemono_reader_settings'], (result) => {
                if (result.visualSettings) {
                    this.settings = { ...this.settings, ...result.visualSettings };
                }
                
                // 載入預覽設定
                if (result.kemono_preview_settings) {
                    try {
                        const previewSettings = JSON.parse(result.kemono_preview_settings);
                        this.applyPreviewSettings(previewSettings);
                    } catch (e) {
                        console.error('載入預覽設定失敗:', e);
                    }
                }

                if (result.kemono_reader_settings) {
                    try {
                        const readerSettings = typeof result.kemono_reader_settings === 'string'
                            ? JSON.parse(result.kemono_reader_settings)
                            : result.kemono_reader_settings;
                        if (readerSettings.readerEnabled !== undefined) {
                            this.settings.readerEnabled = !!readerSettings.readerEnabled;
                        }
                        if (readerSettings.toggleReaderShortcut) {
                            this.settings.toggleReaderShortcut = readerSettings.toggleReaderShortcut;
                        }
                    } catch (e) {
                        console.error('載入閱讀器設定失敗:', e);
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

        // merge 既有預覽設定，避免蓋掉 preloadImageCount 等欄位
        chrome.storage.local.get(['kemono_preview_settings'], (result) => {
            let existing = {};
            if (result.kemono_preview_settings) {
                try {
                    existing = JSON.parse(result.kemono_preview_settings);
                } catch (e) {
                    existing = {};
                }
            }

            const previewSettings = {
                ...existing,
                enabled: this.settings.previewEnabled,
                switchMode: this.settings.previewSwitchMode,
                maxPreviewSize: this.settings.previewMaxSize,
                preloadImageCount: this.settings.preloadImageCount !== undefined
                    ? this.settings.preloadImageCount
                    : (existing.preloadImageCount !== undefined ? existing.preloadImageCount : 5),
                controlMode: this.settings.previewControlMode || 'hold_to_hide',
                modifierKey: this.settings.previewModifierKey || 'alt'
            };
            chrome.storage.local.set({ kemono_preview_settings: JSON.stringify(previewSettings) });
        });
    }

    saveReaderSettings() {
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
                readerEnabled: this.settings.readerEnabled !== false,
                toggleReaderShortcut: this.settings.toggleReaderShortcut || DEFAULT_TOGGLE_READER_SHORTCUT
            };
            const json = JSON.stringify(next);
            chrome.storage.local.set({ kemono_reader_settings: json });
            try {
                localStorage.setItem('kemono_reader_settings', json);
            } catch (e) {
                // 忽略
            }
        });
    }

    startShortcutRecording(settingKey, buttonEl) {
        this.cancelShortcutRecording();
        this._shortcutRecording = { settingKey, buttonEl };
        buttonEl.classList.add('recording');
        buttonEl.textContent = '請按鍵…';

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

            const key = e.key;
            if (!key) return;

            this.settings[settingKey] = key;
            this.cancelShortcutRecording();
            this.saveReaderSettings();
            this.notifyReaderSettingsChanged();
            this.updateShortcutUI();
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

    updateShortcutUI() {
        const toggleReaderBtn = document.getElementById('shortcut-toggle-reader');
        if (toggleReaderBtn && !toggleReaderBtn.classList.contains('recording')) {
            toggleReaderBtn.textContent = formatShortcutDisplay(
                this.settings.toggleReaderShortcut || DEFAULT_TOGGLE_READER_SHORTCUT
            );
        }
    }

    updateUI() {
        const blacklistToggle = document.getElementById('blacklist-visual-effects');
        const favoritesToggle = document.getElementById('favorites-visual-effects');
        const hideBlacklistedPostsToggle = document.getElementById('hide-blacklisted-posts');
        const previewEnabledToggle = document.getElementById('preview-enabled');
        const readerEnabledToggle = document.getElementById('reader-enabled');
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

        if (readerEnabledToggle) {
            readerEnabledToggle.checked = this.settings.readerEnabled !== false;
        }

        this.updateShortcutUI();

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
        const previewPayload = {
            enabled: this.settings.previewEnabled,
            switchMode: this.settings.previewSwitchMode,
            maxPreviewSize: this.settings.previewMaxSize,
            preloadImageCount: this.settings.preloadImageCount,
            controlMode: this.settings.previewControlMode || 'hold_to_hide',
            modifierKey: this.settings.previewModifierKey || 'alt'
        };

        // 通知所有相關的標籤頁更新預覽設定
        chrome.tabs.query({url: this.getTabQueryUrls()}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'updatePreviewSettings',
                    settings: previewPayload
                }).catch(() => {
                    // 忽略無法發送訊息的標籤頁
                });
            });
        });
    }

    notifyReaderSettingsChanged() {
        chrome.tabs.query({url: this.getTabQueryUrls()}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'updateReaderSettings',
                    settings: {
                        readerEnabled: this.settings.readerEnabled !== false,
                        toggleReaderShortcut: this.settings.toggleReaderShortcut || DEFAULT_TOGGLE_READER_SHORTCUT
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
