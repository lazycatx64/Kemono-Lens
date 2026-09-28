/**
 * 閱讀器設定（獨立於懸停預覽設定）
 */
(function () {
  const STORAGE_KEY = 'kemono_reader_settings';
  const logger = window.KemonoLogger || console;

  function getDefaultSettings() {
    return {
      readerEnabled: true,
      loadOriginals: false,
      pagesPerScreen: 0, // 0 = 依視窗寬度自動（>=768 → 2，否則 1）
      bookDirection: 'rtl', // 'rtl' 日式｜'ltr'
      isChangeOddEven: false,
      showBookThumbs: true,
      forceUpscale: true // 強制低解析度圖放大以符合槽位
    };
  }

  class ReaderSettings {
    constructor() {
      this.settings = getDefaultSettings();
      this._ready = this.load();
    }

    getDefaults() {
      return getDefaultSettings();
    }

    async whenReady() {
      return this._ready;
    }

    get() {
      return { ...this.settings };
    }

    resolvePagesPerScreen() {
      const v = this.settings.pagesPerScreen;
      if (v === 1 || v === 2) return v;
      return window.innerWidth >= 768 ? 2 : 1;
    }

    async load() {
      const defaults = getDefaultSettings();
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const result = await new Promise((resolve) => {
            chrome.storage.local.get([STORAGE_KEY], (r) => resolve(r || {}));
          });
          if (result[STORAGE_KEY]) {
            const raw = typeof result[STORAGE_KEY] === 'string'
              ? JSON.parse(result[STORAGE_KEY])
              : result[STORAGE_KEY];
            this.settings = { ...defaults, ...raw };
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
            } catch (e) { /* ignore */ }
            return this.settings;
          }
        }
      } catch (e) {
        logger.warn?.('載入閱讀器設定失敗（chrome.storage）:', e);
      }

      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          this.settings = { ...defaults, ...JSON.parse(saved) };
        }
      } catch (e) {
        logger.warn?.('載入閱讀器設定失敗（localStorage）:', e);
      }
      return this.settings;
    }

    save() {
      try {
        const json = JSON.stringify(this.settings);
        localStorage.setItem(STORAGE_KEY, json);
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ [STORAGE_KEY]: json });
        }
      } catch (e) {
        logger.warn?.('儲存閱讀器設定失敗:', e);
      }
      window.dispatchEvent(new CustomEvent('kemonoReaderSettingsChanged', {
        detail: { settings: this.get() }
      }));
    }

    update(partial) {
      this.settings = { ...this.settings, ...partial };
      this.save();
      return this.get();
    }

    updateKey(key, value) {
      this.settings[key] = value;
      this.save();
      return this.get();
    }
  }

  window.KemonoReaderSettings = new ReaderSettings();
})();
