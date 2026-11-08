/**
 * 設定管理和選項視窗
 */

class SettingsManager {
  constructor() {
    this.settings = this.getDefaultSettings();
    this.settingsWindow = null;
    // 異步載入設定
    this.loadSettings();
  }
  
  getDefaultSettings() {
    return {
      enabled: true,
      switchMode: 'alt_scroll', // 'scroll', 'alt_scroll', 'keyboard'
      maxPreviewSize: 600,
      preloadImageCount: 5, // 預載入接下來的圖片數量
      controlMode: 'hold_to_hide', // 'hold_to_show' | 'hold_to_hide' | 'delay_show'
      showDelay: 200, // delay_show 模式的延遲毫秒數
      modifierKey: 'alt', // 'alt' | 'ctrl' | 'shift'
      loggerLevel: 'info', // 'silent' | 'error' | 'warn' | 'info' | 'debug'
      language: window.KemonoI18n.currentLanguage
    };
  }
  
  loadSettings() {
    // 先嘗試從 chrome.storage 讀取（優先）
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        chrome.storage.local.get(['kemono_preview_settings', 'kemono_logger_settings'], (result) => {
          if (result.kemono_preview_settings) {
            try {
              const saved = JSON.parse(result.kemono_preview_settings);
              this.settings = { ...this.getDefaultSettings(), ...saved };
              // 同步到 localStorage 以保持相容性
              try {
                localStorage.setItem('kemono_preview_settings', JSON.stringify(this.settings));
              } catch (e) {
                // 忽略 localStorage 錯誤
              }
            } catch (e) {
              console.error('Error parsing settings from chrome.storage:', e);
              this.loadFromLocalStorage();
            }
          } else {
            // 如果 chrome.storage 沒有，嘗試從 localStorage 讀取
            this.loadFromLocalStorage();
          }

          if (result.kemono_logger_settings) {
            this.applyLoggerLevelFromStorage(result.kemono_logger_settings);
          } else if (this.settings.loggerLevel && window.KemonoLogger) {
            window.KemonoLogger.setLogLevel(this.settings.loggerLevel);
          }
        });
      } catch (error) {
        console.error('Error loading settings from chrome.storage:', error);
        this.loadFromLocalStorage();
      }
    } else {
      // 如果沒有 chrome.storage，從 localStorage 讀取
      this.loadFromLocalStorage();
    }
  }

  applyLoggerLevelFromStorage(raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && parsed.level) {
        this.settings.loggerLevel = parsed.level;
        if (window.KemonoLogger && typeof window.KemonoLogger.setLogLevel === 'function') {
          window.KemonoLogger.setLogLevel(parsed.level);
        }
      }
    } catch (e) {
      // 忽略
    }
  }
  
  loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem('kemono_preview_settings');
      if (saved) {
        this.settings = { ...this.getDefaultSettings(), ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Error loading settings from localStorage:', error);
    }
  }
  
  saveSettings() {
    try {
      // 日誌等級獨立儲存，不混入預覽設定
      const { loggerLevel, ...previewSettings } = this.settings;
      const settingsJson = JSON.stringify(previewSettings);
      localStorage.setItem('kemono_preview_settings', settingsJson);
      
      // 更新語言設定
      if (window.KemonoI18n) {
        window.KemonoI18n.setLanguage(this.settings.language);
      }
      
      // 儲存到 chrome.storage（如果可用）
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ kemono_preview_settings: settingsJson });
      }

      if (loggerLevel && window.KemonoLogger && typeof window.KemonoLogger.setLogLevel === 'function') {
        window.KemonoLogger.setLogLevel(loggerLevel);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }
  
  updateSetting(key, value) {
    this.settings[key] = value;
    if (key === 'loggerLevel') {
      if (window.KemonoLogger && typeof window.KemonoLogger.setLogLevel === 'function') {
        window.KemonoLogger.setLogLevel(value);
      }
      window.dispatchEvent(new CustomEvent('kemonoSettingsChanged', {
        detail: { key, value, settings: this.settings }
      }));
      return;
    }
    this.saveSettings();
    
    // 觸發設定變更事件
    window.dispatchEvent(new CustomEvent('kemonoSettingsChanged', {
      detail: { key, value, settings: this.settings }
    }));
  }
  
  toggleSettingsWindow() {
    if (this.settingsWindow) {
      this.closeSettingsWindow();
    } else {
      this.openSettingsWindow();
    }
  }
  
  openSettingsWindow() {
    if (this.settingsWindow) return;
    
    const overlay = document.createElement('div');
    overlay.className = 'kemono-settings-overlay';
    
    const window = document.createElement('div');
    window.className = 'kemono-settings-window';
    
    window.innerHTML = this.createSettingsHTML();
    overlay.appendChild(window);
    document.body.appendChild(overlay);
    
    this.settingsWindow = overlay;
    this.bindSettingsEvents();
    
    // 點擊遮罩關閉
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeSettingsWindow();
      }
    });
  }
  
  createSettingsHTML() {
    const i18n = window.KemonoI18n;
    const languages = i18n.getAvailableLanguages();
    
    return `
      <h3 class="kemono-settings-title">${i18n.t('settings_title')}</h3>
      
      <div class="kemono-settings-section">
        <label class="kemono-checkbox-label">
          <input type="checkbox" id="kemono-enable" class="kemono-checkbox" ${this.settings.enabled ? 'checked' : ''}>
          <span>${i18n.t('enable_extension')}</span>
        </label>
      </div>
      
      <div class="kemono-settings-section">
        <label class="kemono-settings-label">${i18n.t('preview_control_mode')}</label>
        <div class="kemono-radio-group">
          <label class="kemono-radio-label">
            <input type="radio" name="controlMode" value="hold_to_hide" class="kemono-radio" ${(this.settings.controlMode || 'hold_to_hide') === 'hold_to_hide' ? 'checked' : ''}>
            <span>${i18n.t('control_hold_to_hide')}</span>
          </label>
          <label class="kemono-radio-label">
            <input type="radio" name="controlMode" value="hold_to_show" class="kemono-radio" ${this.settings.controlMode === 'hold_to_show' ? 'checked' : ''}>
            <span>${i18n.t('control_hold_to_show')}</span>
          </label>
          <label class="kemono-radio-label">
            <input type="radio" name="controlMode" value="delay_show" class="kemono-radio" ${this.settings.controlMode === 'delay_show' ? 'checked' : ''}>
            <span>${i18n.t('control_delay_show')}</span>
          </label>
        </div>
        <div class="kemono-settings-row" style="margin-top: 8px;">
          <label class="kemono-settings-label" for="kemono-show-delay">${i18n.t('preview_show_delay')}</label>
          <input type="number" id="kemono-show-delay" class="kemono-input" value="${this.settings.showDelay !== undefined ? this.settings.showDelay : 200}"
                 min="0" max="5000" step="50">
        </div>
        <div class="kemono-settings-help">${i18n.t('preview_show_delay_help')}</div>
        <div class="kemono-settings-help">${i18n.t('preview_control_mode_help')}</div>
      </div>
      
      <div class="kemono-settings-section">
        <label class="kemono-settings-label">${i18n.t('preview_modifier_key')}</label>
        <div class="kemono-radio-group">
          <label class="kemono-radio-label">
            <input type="radio" name="modifierKey" value="alt" class="kemono-radio" ${(this.settings.modifierKey || 'alt') === 'alt' ? 'checked' : ''}>
            <span>${i18n.t('modifier_alt')}</span>
          </label>
          <label class="kemono-radio-label">
            <input type="radio" name="modifierKey" value="ctrl" class="kemono-radio" ${this.settings.modifierKey === 'ctrl' ? 'checked' : ''}>
            <span>${i18n.t('modifier_ctrl')}</span>
          </label>
          <label class="kemono-radio-label">
            <input type="radio" name="modifierKey" value="shift" class="kemono-radio" ${this.settings.modifierKey === 'shift' ? 'checked' : ''}>
            <span>${i18n.t('modifier_shift')}</span>
          </label>
        </div>
        <div class="kemono-settings-help">${i18n.t('preview_modifier_key_help')}</div>
      </div>
      
      <div class="kemono-settings-section">
        <label class="kemono-settings-label">${i18n.t('preview_switch_mode')}</label>
        <div class="kemono-radio-group">
          <label class="kemono-radio-label">
            <input type="radio" name="switchMode" value="scroll" class="kemono-radio" ${this.settings.switchMode === 'scroll' ? 'checked' : ''}>
            <span>${i18n.t('switch_scroll')}</span>
          </label>
          <label class="kemono-radio-label">
            <input type="radio" name="switchMode" value="alt_scroll" class="kemono-radio" ${this.settings.switchMode === 'alt_scroll' ? 'checked' : ''}>
            <span>${i18n.t('switch_alt_scroll')}</span>
          </label>
          <label class="kemono-radio-label">
            <input type="radio" name="switchMode" value="keyboard" class="kemono-radio" ${this.settings.switchMode === 'keyboard' ? 'checked' : ''}>
            <span>${i18n.t('switch_keyboard')}</span>
          </label>
        </div>
      </div>
      
      <div class="kemono-settings-section">
        <label class="kemono-settings-label">${i18n.t('max_preview_size')}</label>
        <input type="number" id="kemono-max-size" class="kemono-input" value="${this.settings.maxPreviewSize}" 
               min="200" max="1200" step="50">
      </div>
      
      <div class="kemono-settings-section">
        <label class="kemono-settings-label">${i18n.t('preload_image_count')}</label>
        <input type="number" id="kemono-preload-count" class="kemono-input" value="${this.settings.preloadImageCount || 5}" 
               min="0" max="20" step="1">
        <div class="kemono-settings-help">${i18n.t('preload_image_count_help')}</div>
      </div>
      
      <div class="kemono-settings-section">
        <label class="kemono-settings-label">${i18n.t('logger_level')}</label>
        <div class="kemono-radio-group">
          <label class="kemono-radio-label">
            <input type="radio" name="loggerLevel" value="silent" class="kemono-radio" ${this.settings.loggerLevel === 'silent' ? 'checked' : ''}>
            <span>${i18n.t('logger_level_silent')}</span>
          </label>
          <label class="kemono-radio-label">
            <input type="radio" name="loggerLevel" value="error" class="kemono-radio" ${this.settings.loggerLevel === 'error' ? 'checked' : ''}>
            <span>${i18n.t('logger_level_error')}</span>
          </label>
          <label class="kemono-radio-label">
            <input type="radio" name="loggerLevel" value="warn" class="kemono-radio" ${this.settings.loggerLevel === 'warn' ? 'checked' : ''}>
            <span>${i18n.t('logger_level_warn')}</span>
          </label>
          <label class="kemono-radio-label">
            <input type="radio" name="loggerLevel" value="info" class="kemono-radio" ${!this.settings.loggerLevel || this.settings.loggerLevel === 'info' ? 'checked' : ''}>
            <span>${i18n.t('logger_level_info')}</span>
          </label>
          <label class="kemono-radio-label">
            <input type="radio" name="loggerLevel" value="debug" class="kemono-radio" ${this.settings.loggerLevel === 'debug' ? 'checked' : ''}>
            <span>${i18n.t('logger_level_debug')}</span>
          </label>
        </div>
        <div class="kemono-settings-help">${i18n.t('logger_level_help')}</div>
      </div>
      
      <div class="kemono-settings-section">
        <label class="kemono-settings-label">${i18n.t('language')}</label>
        <select id="kemono-language" class="kemono-select">
          ${Object.entries(languages).map(([code, name]) => 
            `<option value="${code}" ${this.settings.language === code ? 'selected' : ''}>${name}</option>`
          ).join('')}
        </select>
      </div>
      
      <div class="kemono-settings-footer">
        <button id="kemono-close-settings" class="kemono-close-button">${i18n.t('close')}</button>
      </div>
    `;
  }
  
  bindSettingsEvents() {
    // 啟用/停用
    const enableCheckbox = document.getElementById('kemono-enable');
    enableCheckbox.addEventListener('change', (e) => {
      this.updateSetting('enabled', e.target.checked);
    });
    
    // 切換模式
    document.querySelectorAll('input[name="switchMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.updateSetting('switchMode', e.target.value);
        }
      });
    });
    
    // 預覽控制模式
    document.querySelectorAll('input[name="controlMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.updateSetting('controlMode', e.target.value);
        }
      });
    });

    // 延遲顯示毫秒數
    const showDelayInput = document.getElementById('kemono-show-delay');
    if (showDelayInput) {
      showDelayInput.addEventListener('change', (e) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= 0 && value <= 5000) {
          this.updateSetting('showDelay', value);
        }
      });
    }
    
    // 修飾鍵
    document.querySelectorAll('input[name="modifierKey"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.updateSetting('modifierKey', e.target.value);
        }
      });
    });

    // 日誌等級
    document.querySelectorAll('input[name="loggerLevel"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.updateSetting('loggerLevel', e.target.value);
        }
      });
    });
    
    // 最大尺寸
    const maxSizeInput = document.getElementById('kemono-max-size');
    maxSizeInput.addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      if (!isNaN(value) && value >= 200 && value <= 1200) {
        this.updateSetting('maxPreviewSize', value);
      }
    });
    
    // 預載入數量
    const preloadCountInput = document.getElementById('kemono-preload-count');
    preloadCountInput.addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      if (!isNaN(value) && value >= 0 && value <= 20) {
        this.updateSetting('preloadImageCount', value);
      }
    });
    
    // 語言
    const languageSelect = document.getElementById('kemono-language');
    languageSelect.addEventListener('change', (e) => {
      this.updateSetting('language', e.target.value);
      // 重新載入設定視窗以更新語言
      this.closeSettingsWindow();
      setTimeout(() => this.openSettingsWindow(), 100);
    });
    
    // 關閉按鈕
    const closeButton = document.getElementById('kemono-close-settings');
    closeButton.addEventListener('click', () => {
      this.closeSettingsWindow();
    });
  }
  
  closeSettingsWindow() {
    if (this.settingsWindow) {
      document.body.removeChild(this.settingsWindow);
      this.settingsWindow = null;
    }
  }
}

// 初始化設定管理器
window.KemonoSettings = new SettingsManager();
