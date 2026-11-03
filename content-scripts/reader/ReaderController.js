/**
 * 作品頁閱讀器控制器：浮出按鈕、overlay、SPA 生命週期
 *
 * 注意：content script 處於隔離世界，無法攔截頁面端的 history.pushState
 *（例如 Pawchive 的 HTMX 換頁）。必須以 Navigation API／HTMX 事件／輪詢偵測 URL。
 */
(function () {
  const logger = window.KemonoLogger || console;
  const DEFAULT_TOGGLE_SHORTCUT = '`';
  const SPA_POLL_MS = 500;
  const HTMX_NAV_EVENTS = [
    'htmx:afterSwap',
    'htmx:pushedIntoHistory',
    'htmx:replacedInHistory',
    'htmx:historyRestore',
    'htmx:after:swap',
    'htmx:after:history:push',
    'htmx:after:history:replace',
    'htmx:before:history:restore'
  ];

  function formatShortcutLabel(key) {
    if (key === ' ') return 'Space';
    if (key === 'ArrowLeft') return '←';
    if (key === 'ArrowRight') return '→';
    if (key === 'ArrowUp') return '↑';
    if (key === 'ArrowDown') return '↓';
    if (key === 'Escape') return 'Esc';
    return key || DEFAULT_TOGGLE_SHORTCUT;
  }

  function postPageKey(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch (e) {
      return String(url || '');
    }
  }

  class ReaderController {
    constructor() {
      this.switchEl = null;
      this.appEl = null;
      this.bookView = null;
      this.thumbs = null;
      this.album = null;
      this.isOpen = false;
      this._prevOverflow = '';
      this._onSettingsChanged = null;
      this._boundToggleKey = null;
      this._toggleShortcut = DEFAULT_TOGGLE_SHORTCUT;
      this._initGen = 0;
      this._destroyed = false;
      this._watchedUrl = window.location.href;
      this._spaBound = false;
      this._onSpaNav = null;
      this._onNavigate = null;
      this._spaPollTimer = null;
      this._opening = false;
    }

    async init() {
      const gen = ++this._initGen;
      await this.destroy({ keepGeneration: true });
      this._destroyed = false;
      this._bindSpaWatch();
      this._watchedUrl = window.location.href;
      if (gen !== this._initGen) return;

      const url = window.location.href;
      if (!window.KemonoAlbumService || !window.KemonoAlbumService.isPostPage(url)) {
        return;
      }

      const siteHandler = window.KemonoSites && window.KemonoSites.getHandler
        ? window.KemonoSites.getHandler(url)
        : null;
      if (!siteHandler) {
        return;
      }

      const settingsApi = window.KemonoReaderSettings;
      if (settingsApi) {
        await settingsApi.whenReady();
        if (gen !== this._initGen || this._destroyed) return;
        if (!settingsApi.get().readerEnabled) {
          logger.log?.('閱讀器已停用');
          return;
        }
      }

      let album = null;
      try {
        // SPA 換頁當下 DOM 可能仍是舊文；先只走 API，避免誤用舊圖片
        album = await window.KemonoAlbumService.fetchAlbum(url, { allowDomFallback: false });
      } catch (e) {
        logger.warn?.('閱讀器載入作品失敗:', e);
      }
      if (gen !== this._initGen || this._destroyed) return;

      // API 尚無結果時稍候再試（等 HTMX 把新文掛上）
      if (!album || !album.pages || album.pages.length === 0) {
        await new Promise((r) => setTimeout(r, 600));
        if (gen !== this._initGen || this._destroyed) return;
        if (postPageKey(window.location.href) !== postPageKey(url)) return;
        try {
          album = await window.KemonoAlbumService.fetchAlbum(url);
        } catch (e) {
          logger.warn?.('閱讀器延遲載入失敗:', e);
          try {
            album = window.KemonoAlbumService.parseAlbumFromDom(url, siteHandler);
          } catch (domErr) {
            logger.warn?.('閱讀器 DOM 備援失敗:', domErr);
          }
        }
      }

      if (gen !== this._initGen || this._destroyed) return;

      // 非同步載入期間若已換到另一篇，放棄本次結果
      if (postPageKey(window.location.href) !== postPageKey(url)) {
        return;
      }

      if (!album || !album.pages || album.pages.length === 0) {
        logger.log?.('作品頁無圖片，不啟用閱讀器');
        return;
      }

      this.album = album;
      this._watchedUrl = window.location.href;
      this._syncToggleShortcutFromSettings(
        settingsApi ? settingsApi.get() : null
      );
      this._createSwitch();
      this._bindToggleShortcut();
      this._onSettingsChanged = (e) => {
        const s = e.detail && e.detail.settings;
        if (!s) return;
        if (!s.readerEnabled) {
          this.destroy();
          return;
        }
        this._syncToggleShortcutFromSettings(s);
        this._updateSwitchTitle();
        if (this.bookView) {
          this.bookView.updateSettings(s);
        }
        if (this.thumbs) {
          this.thumbs.setVisible(s.showBookThumbs !== false);
        }
      };
      window.addEventListener('kemonoReaderSettingsChanged', this._onSettingsChanged);
      logger.log?.(`閱讀器就緒，共 ${this.album.pages.length} 張`);
    }

    _bindSpaWatch() {
      if (this._spaBound) return;
      this._spaBound = true;

      this._onSpaNav = () => {
        setTimeout(() => this._handleSpaNavigation(), 50);
      };

      window.addEventListener('popstate', this._onSpaNav);

      HTMX_NAV_EVENTS.forEach((name) => {
        document.addEventListener(name, this._onSpaNav, true);
      });

      if (window.navigation && typeof window.navigation.addEventListener === 'function') {
        this._onNavigate = () => {
          setTimeout(() => this._handleSpaNavigation(), 0);
        };
        window.navigation.addEventListener('navigate', this._onNavigate);
      }

      this._spaPollTimer = setInterval(() => {
        this._handleSpaNavigation();
      }, SPA_POLL_MS);
    }

    _unbindSpaWatch() {
      if (!this._spaBound) return;
      this._spaBound = false;

      if (this._onSpaNav) {
        window.removeEventListener('popstate', this._onSpaNav);
        HTMX_NAV_EVENTS.forEach((name) => {
          document.removeEventListener(name, this._onSpaNav, true);
        });
        this._onSpaNav = null;
      }

      if (this._onNavigate && window.navigation) {
        window.navigation.removeEventListener('navigate', this._onNavigate);
        this._onNavigate = null;
      }

      if (this._spaPollTimer) {
        clearInterval(this._spaPollTimer);
        this._spaPollTimer = null;
      }
    }

    _resetDetachedUi() {
      // HTMX 以 body.innerHTML 換頁時會清掉 overlay，但 JS 狀態可能仍認為開啟中
      if (this.bookView) {
        try { this.bookView.destroy(); } catch (e) { /* ignore */ }
        this.bookView = null;
      }
      if (this.thumbs) {
        try { this.thumbs.destroy(); } catch (e) { /* ignore */ }
        this.thumbs = null;
      }
      this.appEl = null;
      this.isOpen = false;
      document.body.style.overflow = this._prevOverflow || '';
    }

    _handleSpaNavigation() {
      if (this._destroyed) return;

      const url = window.location.href;
      if (url === this._watchedUrl) {
        const appDetached = this.isOpen && this.appEl && !document.body.contains(this.appEl);
        if (appDetached) {
          this._resetDetachedUi();
        }
        // HTMX 可能清掉浮出按鈕；URL 未變時重建即可
        if (this.album && (!this.switchEl || !document.body.contains(this.switchEl))) {
          this._createSwitch();
        }
        return;
      }

      // 先鎖住目前 URL，避免輪詢在 init 完成前重複觸發
      this._watchedUrl = url;
      logger.log?.('閱讀器偵測到 SPA 換頁，重新載入作品');
      this.init();
    }

    _albumMatchesCurrentPage() {
      if (!this.album) return false;
      const current = postPageKey(window.location.href);
      if (this.album.postUrl) {
        return postPageKey(this.album.postUrl) === current;
      }
      return postPageKey(this._watchedUrl) === current;
    }

    _syncToggleShortcutFromSettings(settings) {
      const key = settings && settings.toggleReaderShortcut;
      this._toggleShortcut = (typeof key === 'string' && key.length > 0)
        ? key
        : DEFAULT_TOGGLE_SHORTCUT;
    }

    _matchesToggleShortcut(e) {
      const shortcut = this._toggleShortcut || DEFAULT_TOGGLE_SHORTCUT;
      if (e.key === shortcut) return true;
      if (shortcut === '`' && e.code === 'Backquote') return true;
      return false;
    }

    _isTypingTarget(target) {
      if (!target) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      return false;
    }

    _bindToggleShortcut() {
      this._unbindToggleShortcut();
      this._boundToggleKey = (e) => {
        if (this._destroyed) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (this._isTypingTarget(e.target)) return;
        if (!this._matchesToggleShortcut(e)) return;
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      };
      document.addEventListener('keydown', this._boundToggleKey, true);
    }

    _unbindToggleShortcut() {
      if (this._boundToggleKey) {
        document.removeEventListener('keydown', this._boundToggleKey, true);
        this._boundToggleKey = null;
      }
    }

    _updateSwitchTitle() {
      if (!this.switchEl) return;
      const label = (window.KemonoI18n && window.KemonoI18n.t)
        ? window.KemonoI18n.t('reader_open')
        : '閱讀器';
      const keyLabel = formatShortcutLabel(this._toggleShortcut);
      const hint = (window.KemonoI18n && window.KemonoI18n.t)
        ? window.KemonoI18n.t('shortcut_toggle_reader_hint', { key: keyLabel })
        : keyLabel;
      this.switchEl.title = `${label}（${hint}）`;
    }

    _createSwitch() {
      this._removeSwitch();
      if (!document.body) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'kf-reader-switch';
      btn.className = 'kf-reader-switch';
      const label = (window.KemonoI18n && window.KemonoI18n.t)
        ? window.KemonoI18n.t('reader_open')
        : '閱讀器';
      btn.textContent = label;
      this.switchEl = btn;
      this._updateSwitchTitle();
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void this.open();
      });
      document.body.appendChild(btn);
    }

    _removeSwitch() {
      const existing = document.getElementById('kf-reader-switch');
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
      this.switchEl = null;
    }

    _ensureApp() {
      if (this.appEl && document.body.contains(this.appEl)) {
        return this.appEl;
      }
      let el = document.getElementById('kf-reader-app');
      if (!el) {
        el = document.createElement('div');
        el.id = 'kf-reader-app';
        el.className = 'kf-reader-app';
        document.body.appendChild(el);
      }
      this.appEl = el;
      return el;
    }

    toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        void this.open();
      }
    }

    async open() {
      if (this.isOpen || this._opening || this._destroyed) return;

      // SPA 換篇後若相簿仍是舊文，先重載再開啟
      if (!this._albumMatchesCurrentPage()) {
        this._opening = true;
        try {
          await this.init();
        } finally {
          this._opening = false;
        }
        if (this._destroyed || !this.album || this.isOpen) return;
      }

      if (!this.album) return;

      const settings = window.KemonoReaderSettings
        ? window.KemonoReaderSettings.get()
        : {
            loadOriginals: false,
            pagesPerScreen: 0,
            bookDirection: 'rtl',
            isChangeOddEven: false,
            showBookThumbs: true
          };

      const app = this._ensureApp();
      app.style.display = 'flex';
      app.innerHTML = '';

      const main = document.createElement('div');
      main.className = 'kf-reader-main';
      app.appendChild(main);

      this.bookView = new window.KemonoBookView(main, {
        album: this.album,
        settings,
        onSettingsChange: (partial) => {
          if (window.KemonoReaderSettings) {
            window.KemonoReaderSettings.update(partial);
          }
        },
        onClose: () => this.close(),
        onPageChange: (pageIndex) => {
          if (this.thumbs) {
            this.thumbs.setActive(pageIndex);
          }
        }
      });
      this.bookView.mount();

      this.thumbs = new window.KemonoBookThumbs(app, {
        pages: this.album.pages,
        onJump: (index) => {
          if (this.bookView) this.bookView.jumpToPage(index);
        }
      });
      this.thumbs.mount();
      this.thumbs.setVisible(settings.showBookThumbs !== false);
      this.thumbs.setActive(this.bookView.curPageIndex);

      this._prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      this.isOpen = true;

      if (this.switchEl) {
        this.switchEl.style.display = 'none';
      }
    }

    close() {
      if (!this.isOpen) return;
      if (this.bookView) {
        this.bookView.destroy();
        this.bookView = null;
      }
      if (this.thumbs) {
        this.thumbs.destroy();
        this.thumbs = null;
      }
      if (this.appEl) {
        this.appEl.style.display = 'none';
        this.appEl.innerHTML = '';
      }
      document.body.style.overflow = this._prevOverflow || '';
      this.isOpen = false;
      if (this.switchEl && document.body.contains(this.switchEl)) {
        this.switchEl.style.display = '';
      } else if (this.album) {
        this._createSwitch();
      }
    }

    async destroy(options = {}) {
      if (!options.keepGeneration) {
        this._destroyed = true;
        this._initGen += 1;
        this._unbindSpaWatch();
      }
      this.close();
      this._unbindToggleShortcut();
      if (this._onSettingsChanged) {
        window.removeEventListener('kemonoReaderSettingsChanged', this._onSettingsChanged);
        this._onSettingsChanged = null;
      }
      this._removeSwitch();
      if (this.appEl && this.appEl.parentNode) {
        this.appEl.parentNode.removeChild(this.appEl);
      }
      this.appEl = null;
      this.album = null;
    }
  }

  window.KemonoReaderController = ReaderController;
})();
