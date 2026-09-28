/**
 * 作品頁閱讀器控制器：浮出按鈕、overlay、SPA 生命週期
 */
(function () {
  const logger = window.KemonoLogger || console;

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
      this._initGen = 0;
      this._destroyed = false;
    }

    async init() {
      const gen = ++this._initGen;
      await this.destroy({ keepGeneration: true });
      this._destroyed = false;
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
        album = await window.KemonoAlbumService.fetchAlbum(url);
      } catch (e) {
        logger.warn?.('閱讀器載入作品失敗:', e);
      }
      if (gen !== this._initGen || this._destroyed) return;

      // API 尚無結果時稍候再試 DOM（SPA 內容可能尚未掛上）
      if (!album || !album.pages || album.pages.length === 0) {
        await new Promise((r) => setTimeout(r, 400));
        if (gen !== this._initGen || this._destroyed) return;
        try {
          album = window.KemonoAlbumService.parseAlbumFromDom(url, siteHandler);
        } catch (e) {
          logger.warn?.('閱讀器 DOM 備援失敗:', e);
        }
      }

      if (gen !== this._initGen || this._destroyed) return;

      if (!album || !album.pages || album.pages.length === 0) {
        logger.log?.('作品頁無圖片，不啟用閱讀器');
        return;
      }

      this.album = album;
      this._createSwitch();
      this._onSettingsChanged = (e) => {
        const s = e.detail && e.detail.settings;
        if (!s) return;
        if (!s.readerEnabled) {
          this.destroy();
          return;
        }
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

    _createSwitch() {
      this._removeSwitch();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'kf-reader-switch';
      btn.className = 'kf-reader-switch';
      const label = (window.KemonoI18n && window.KemonoI18n.t)
        ? window.KemonoI18n.t('reader_open')
        : '閱讀器';
      btn.textContent = label;
      btn.title = label;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.open();
      });
      document.body.appendChild(btn);
      this.switchEl = btn;
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

    open() {
      if (this.isOpen || !this.album) return;
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
      if (this.switchEl) {
        this.switchEl.style.display = '';
      }
    }

    async destroy(options = {}) {
      if (!options.keepGeneration) {
        this._destroyed = true;
        this._initGen += 1;
      }
      this.close();
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
