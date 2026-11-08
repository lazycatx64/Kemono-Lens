/**
 * 閱讀器設定（獨立於懸停預覽設定）
 */
(function () {
  const STORAGE_KEY = 'kemono_reader_settings';
  const logger = window.KemonoLogger || console;

  const DEFAULT_PREV_SHORTCUTS = ['a', 'ArrowLeft', 'ArrowUp'];
  const DEFAULT_NEXT_SHORTCUTS = ['d', 'ArrowRight', 'ArrowDown'];
  const DEFAULT_TOGGLE_TOPBAR_SHORTCUT = 'Escape';

  function normalizeShortcutKey(key) {
    if (typeof key !== 'string' || key.length === 0) return null;
    if (key.length === 1) return key.toLowerCase();
    return key;
  }

  function normalizeShortcutList(list, fallback) {
    if (!Array.isArray(list)) return fallback.slice();
    const seen = new Set();
    const out = [];
    list.forEach((item) => {
      const key = normalizeShortcutKey(item);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(key);
    });
    return out.length > 0 ? out : fallback.slice();
  }

  function getDefaultSettings() {
    return {
      readerEnabled: true,
      loadOriginals: false,
      pagesPerScreen: 0, // 0 = 依視窗寬度自動（>=768 → 2，否則 1）
      bookDirection: 'rtl', // 'rtl' 日式｜'ltr'
      isChangeOddEven: false,
      showBookThumbs: true,
      forceUpscale: true, // 強制低解析度圖放大以符合槽位
      toggleReaderShortcut: '`', // 開關閱讀器快速鍵（KeyboardEvent.key）
      readerPrevShortcuts: DEFAULT_PREV_SHORTCUTS.slice(),
      readerNextShortcuts: DEFAULT_NEXT_SHORTCUTS.slice(),
      toggleTopBarShortcut: DEFAULT_TOGGLE_TOPBAR_SHORTCUT
    };
  }

  function normalizeSettings(raw) {
    const defaults = getDefaultSettings();
    const merged = { ...defaults, ...(raw && typeof raw === 'object' ? raw : {}) };
    merged.readerPrevShortcuts = normalizeShortcutList(
      merged.readerPrevShortcuts,
      DEFAULT_PREV_SHORTCUTS
    );
    merged.readerNextShortcuts = normalizeShortcutList(
      merged.readerNextShortcuts,
      DEFAULT_NEXT_SHORTCUTS
    );
    const topBar = normalizeShortcutKey(merged.toggleTopBarShortcut);
    merged.toggleTopBarShortcut = topBar || DEFAULT_TOGGLE_TOPBAR_SHORTCUT;
    const toggleReader = normalizeShortcutKey(merged.toggleReaderShortcut);
    // 單一字元已小寫；保留 ` 等非字母鍵原樣
    if (typeof merged.toggleReaderShortcut === 'string' && merged.toggleReaderShortcut.length === 1) {
      merged.toggleReaderShortcut = toggleReader || defaults.toggleReaderShortcut;
    } else if (!merged.toggleReaderShortcut) {
      merged.toggleReaderShortcut = defaults.toggleReaderShortcut;
    }
    return merged;
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
      return {
        ...this.settings,
        readerPrevShortcuts: (this.settings.readerPrevShortcuts || []).slice(),
        readerNextShortcuts: (this.settings.readerNextShortcuts || []).slice()
      };
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
            this.settings = normalizeSettings(raw);
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
          this.settings = normalizeSettings(JSON.parse(saved));
        } else {
          this.settings = defaults;
        }
      } catch (e) {
        logger.warn?.('載入閱讀器設定失敗（localStorage）:', e);
        this.settings = defaults;
      }
      return this.settings;
    }

    save() {
      try {
        this.settings = normalizeSettings(this.settings);
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
      this.settings = normalizeSettings({ ...this.settings, ...partial });
      this.save();
      return this.get();
    }

    updateKey(key, value) {
      this.settings[key] = value;
      this.settings = normalizeSettings(this.settings);
      this.save();
      return this.get();
    }
  }

  window.KemonoReaderSettings = new ReaderSettings();
  window.KemonoReaderShortcutDefaults = {
    readerPrevShortcuts: DEFAULT_PREV_SHORTCUTS.slice(),
    readerNextShortcuts: DEFAULT_NEXT_SHORTCUTS.slice(),
    toggleTopBarShortcut: DEFAULT_TOGGLE_TOPBAR_SHORTCUT,
    normalizeShortcutKey,
    normalizeShortcutList
  };
})();
