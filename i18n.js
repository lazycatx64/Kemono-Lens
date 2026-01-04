/**
 * 多國語言支援系統
 */

const translations = {
  'zh-TW': {
    // 選項視窗
    'settings_title': '預覽設定',
    'enable_extension': '啟用擴充功能',
    'preview_switch_mode': '預覽圖切換方式',
    'switch_scroll': '使用滾輪切換',
    'switch_alt_scroll': '按著 Alt 使用滾輪切換',
    'switch_keyboard': '使用方向鍵切換',
    'max_preview_size': '預覽圖最大尺寸 (px)',
    'language': '顯示語言',
    'close': '關閉',
    
    // 狀態訊息
    'loading_post_images': '載入貼文圖片中...',
    'no_images_found': '此貼文中沒有找到圖片',
    'image_failed_to_load': '圖片載入失敗',
    'loading': '載入中...',
    'image_count': '第 {current} 張，共 {total} 張',
    'api_loading': '正在載入...',
    'api_loaded': '載入完成',
    'api_failed': '載入失敗',
    'cover_preview': '封面圖預覽',
    'only_cover_available': '僅有封面圖',
    'cover_preview_original': '封面圖預覽 (原圖)',
    'image_count_original': '第 {current} 張，共 {total} 張 (原圖)',
    'preview_cover_with_content_count': '正在預覽封面圖 + 內文共 {total} 張',
    'preview_content_image': '正在預覽內文圖，第 {current} 張，共 {total} 張',
    'preview_cover_and_first': '正在預覽封面圖與第 1 張，共 {total} 張',
    'loading_original_image': '載入原圖中...',
    'enabled': '啟用',
    'max_preview_size': '最大預覽尺寸',
    'switch_mode': '切換模式',
    'switch_mode_scroll': '滾輪',
    'switch_mode_alt_scroll': 'Alt + 滾輪',
    'switch_mode_keyboard': '鍵盤方向鍵',
    'chinese_traditional': '繁體中文',
    'english': 'English',
    
    // 黑名單相關
    'blacklist_title': '黑名單管理',
    'blacklist_add': '添加到黑名單',
    'blacklist_remove': '從黑名單移除',
    'blacklist_export': '匯出黑名單為 JSON',
    'blacklist_import': '匯入黑名單',
    'blacklist_clear': '清空所有黑名單',
    'blacklist_empty': '黑名單是空的',
    'blacklist_added': '成功將創作者添加到黑名單',
    'blacklist_removed': '成功將創作者從黑名單中移除',
    'blacklist_exported': '成功匯出黑名單',
    'blacklist_imported': '成功匯入黑名單',
    'blacklist_error': '黑名單操作失敗',
    
    // 收藏相關
    'favorites_title': '收藏管理',
    'favorites_sync': '同步 Kemono 收藏',
    'favorites_clear': '清除所有收藏標記',
    'favorites_empty': '尚未同步任何收藏',
    'favorites_synced': '成功同步收藏',
    'favorites_cleared': '成功清除所有收藏標記',
    
    // 設定相關
    'settings_title': '顯示設定',
    'preview_settings_title': '預覽設定',
    'blacklist_visual_effects': '啟用黑名單視覺效果',
    'favorites_visual_effects': '啟用收藏視覺效果',
    'hide_blacklisted_posts': '隱藏 /posts 頁面中被黑名單的項目',
    'preview_enabled': '啟用懸停預覽功能',
    'preview_switch_mode': '預覽圖切換方式',
    'preview_max_size': '最大預覽尺寸 (px)',
    'preload_image_count': '預載入圖片數量',
    'preload_image_count_help': '預先載入接下來的圖片，以便滾輪切換時不用等待'
  },
  
  'en': {
    // Settings window
    'settings_title': 'Preview Settings',
    'enable_extension': 'Enable Extension',
    'preview_switch_mode': 'Preview Switch Mode',
    'switch_scroll': 'Use scroll wheel',
    'switch_alt_scroll': 'Hold Alt + scroll wheel',
    'switch_keyboard': 'Use arrow keys',
    'max_preview_size': 'Max Preview Size (px)',
    'language': 'Display Language',
    'close': 'Close',
    
    // Status messages
    'loading_post_images': 'Loading post images...',
    'no_images_found': 'No images found in this post',
    'image_failed_to_load': 'Image failed to load',
    'loading': 'Loading...',
    'image_count': 'Image {current} of {total}',
    'api_loading': 'Loading...',
    'api_loaded': 'Loaded',
    'api_failed': 'Failed to load',
    'cover_preview': 'Cover Preview',
    'only_cover_available': 'Cover only',
    'cover_preview_original': 'Cover Preview (Original)',
    'image_count_original': 'Image {current} of {total} (Original)',
    'preview_cover_with_content_count': 'Previewing cover + {total} content images',
    'preview_content_image': 'Previewing content image {current} of {total}',
    'preview_cover_and_first': 'Previewing cover and image 1 of {total}',
    'loading_original_image': 'Loading original image...',
    'enabled': 'Enabled',
    'max_preview_size': 'Max Preview Size',
    'switch_mode': 'Switch Mode',
    'switch_mode_scroll': 'Scroll',
    'switch_mode_alt_scroll': 'Alt + Scroll',
    'switch_mode_keyboard': 'Keyboard Arrows',
    'chinese_traditional': '繁體中文',
    'english': 'English',
    
    // Blacklist related
    'blacklist_title': 'Blacklist Management',
    'blacklist_add': 'Add to Blacklist',
    'blacklist_remove': 'Remove from Blacklist',
    'blacklist_export': 'Export Blacklist as JSON',
    'blacklist_import': 'Import Blacklist',
    'blacklist_clear': 'Clear All Blacklist',
    'blacklist_empty': 'Blacklist is empty',
    'blacklist_added': 'Successfully added creator to blacklist',
    'blacklist_removed': 'Successfully removed creator from blacklist',
    'blacklist_exported': 'Successfully exported blacklist',
    'blacklist_imported': 'Successfully imported blacklist',
    'blacklist_error': 'Blacklist operation failed',
    
    // Favorites related
    'favorites_title': 'Favorites Management',
    'favorites_sync': 'Sync Kemono Favorites',
    'favorites_clear': 'Clear All Favorite Marks',
    'favorites_empty': 'No favorites synced yet',
    'favorites_synced': 'Successfully synced favorites',
    'favorites_cleared': 'Successfully cleared all favorite marks',
    
    // Settings related
    'settings_title': 'Display Settings',
    'preview_settings_title': 'Preview Settings',
    'blacklist_visual_effects': 'Enable Blacklist Visual Effects',
    'favorites_visual_effects': 'Enable Favorites Visual Effects',
    'hide_blacklisted_posts': 'Hide Blacklisted Items on /posts Page',
    'preview_enabled': 'Enable Hover Preview',
    'preview_switch_mode': 'Preview Image Switch Mode',
    'preview_max_size': 'Max Preview Size (px)',
    'preload_image_count': 'Preload Image Count',
    'preload_image_count_help': 'Preload next images in advance for smooth scrolling'
  }
};

class I18n {
  constructor() {
    this.currentLanguage = this.detectLanguage();
  }
  
  detectLanguage() {
    // 從設定中讀取，如果沒有則使用瀏覽器語言
    const savedLang = localStorage.getItem('kemono_preview_language');
    if (savedLang && translations[savedLang]) {
      return savedLang;
    }
    
    // 檢測瀏覽器語言
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith('zh')) {
      return 'zh-TW';
    }
    return 'en'; // 預設英文
  }
  
  setLanguage(lang) {
    if (translations[lang]) {
      this.currentLanguage = lang;
      localStorage.setItem('kemono_preview_language', lang);
    }
  }
  
  t(key, params = {}) {
    const translation = translations[this.currentLanguage] || translations['en'];
    let text = translation[key] || key;
    
    // 替換參數
    Object.keys(params).forEach(param => {
      text = text.replace(`{${param}}`, params[param]);
    });
    
    return text;
  }
  
  getAvailableLanguages() {
    return {
      'zh-TW': '繁體中文',
      'en': 'English'
    };
  }
}

window.KemonoI18n = new I18n();

// 偵測瀏覽器語言
function detectLanguage() {
  const browserLang = navigator.language || navigator.userLanguage;
  
  // 檢查瀏覽器語言並映射到我們支援的語言
  if (browserLang.startsWith('zh')) {
    if (browserLang.includes('TW') || browserLang.includes('HK') || browserLang.includes('MO')) {
      return 'zh-TW'; // 繁體中文
    }
    return 'zh-TW'; // 預設繁體中文
  }
  
  return 'en'; // 預設英文
}

// 當前語言，從設定中讀取或使用偵測到的語言
let currentLanguage = 'zh-TW'; // 預設值

// 從設定載入語言
if (window.KemonoSettings && window.KemonoSettings.settings.language) {
  currentLanguage = window.KemonoSettings.settings.language;
} else {
  currentLanguage = detectLanguage();
}

// 翻譯函數
function t(key, params = {}) {
  const langTranslations = translations[currentLanguage] || translations['en'];
  let text = langTranslations[key] || key;
  
  // 簡單的參數替換
  Object.keys(params).forEach(param => {
    text = text.replace(new RegExp(`{${param}}`, 'g'), params[param]);
  });
  
  return text;
}

// 設定語言
function setLanguage(lang) {
  if (translations[lang]) {
    currentLanguage = lang;
    window.KemonoLogger.log('Language set to:', lang);
    
    // 觸發語言變更事件
    window.dispatchEvent(new CustomEvent('kemonoLanguageChanged', {
      detail: { language: lang }
    }));
  }
}

// 獲取當前語言
function getCurrentLanguage() {
  return currentLanguage;
}

// 獲取支援的語言列表
function getSupportedLanguages() {
  return Object.keys(translations);
}

// 暴露到全域
window.KemonoI18n.t = t;
window.KemonoI18n.setLanguage = setLanguage;
window.KemonoI18n.getCurrentLanguage = getCurrentLanguage;
window.KemonoI18n.getSupportedLanguages = getSupportedLanguages;

window.KemonoLogger.log('i18n initialized with language:', currentLanguage);
