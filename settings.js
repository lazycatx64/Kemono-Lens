/**
 * 設定管理和選項視窗
 */

class SettingsManager {
  constructor() {
    this.settings = this.loadSettings();
    this.settingsWindow = null;
    this.createSettingsButton();
  }
  
  getDefaultSettings() {
    return {
      enabled: true,
      switchMode: 'alt_scroll', // 'scroll', 'alt_scroll', 'keyboard'
      maxPreviewSize: 600,
      language: window.KemonoI18n.currentLanguage
    };
  }
  
  loadSettings() {
    try {
      const saved = localStorage.getItem('kemono_preview_settings');
      if (saved) {
        return { ...this.getDefaultSettings(), ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
    return this.getDefaultSettings();
  }
  
  saveSettings() {
    try {
      localStorage.setItem('kemono_preview_settings', JSON.stringify(this.settings));
      // 更新語言設定
      window.KemonoI18n.setLanguage(this.settings.language);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }
  
  updateSetting(key, value) {
    this.settings[key] = value;
    this.saveSettings();
    
    // 觸發設定變更事件
    window.dispatchEvent(new CustomEvent('kemonoSettingsChanged', {
      detail: { key, value, settings: this.settings }
    }));
  }
  
  createSettingsButton() {
    const button = document.createElement('div');
    button.id = 'kemono-settings-button';
    button.innerHTML = '⚙️';
    button.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 40px;
      height: 40px;
      background: #fff;
      border: 2px solid #333;
      border-radius: 50%;
      cursor: pointer;
      z-index: 9998;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      transition: all 0.3s ease;
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'scale(1.1)';
      button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'scale(1)';
      button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    });
    
    button.addEventListener('click', () => {
      this.toggleSettingsWindow();
    });
    
    document.body.appendChild(button);
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
    
    // 最大尺寸
    const maxSizeInput = document.getElementById('kemono-max-size');
    maxSizeInput.addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      if (!isNaN(value) && value >= 200 && value <= 1200) {
        this.updateSetting('maxPreviewSize', value);
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
