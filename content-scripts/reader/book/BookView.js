/**
 * 書本模式主畫面：跨頁渲染、導航、預載
 */
(function () {
  const logger = window.KemonoLogger || console;
  const PLACEHOLDER_ASPECT = 1.45;

  class BookView {
    /**
     * @param {HTMLElement} root
     * @param {{
     *   album: { title: string, pages: Array },
     *   settings: object,
     *   onSettingsChange: (partial: object) => void,
     *   onClose: () => void,
     *   onPageChange?: (pageIndex: number) => void
     * }} options
     */
    constructor(root, options) {
      this.root = root;
      this.album = options.album;
      this.settings = options.settings;
      this.onSettingsChange = options.onSettingsChange;
      this.onClose = options.onClose;
      this.onPageChange = options.onPageChange || (() => {});

      this.pageCount = this.album.pages.length;
      this.curPageIndex = -1; // 從封面開始
      this.aspectMap = {}; // pageIndex -> height/width
      this.wheelAcc = 0;
      this.wheelTimer = null;
      this._boundKey = null;
      this._boundWheel = null;
      this._boundClick = null;
      this._boundResize = null;

      this.stageEl = null;
      this.topBarEl = null;
      this.pageInfoEl = null;
      this._mounted = false;
    }

    mount() {
      this.root.innerHTML = '';
      this.root.classList.add('kf-reader-open');
      this._mounted = true;

      this.topBarEl = this._buildTopBar();
      this.root.appendChild(this.topBarEl);

      this.stageEl = document.createElement('div');
      this.stageEl.className = 'kf-reader-stage';
      this.root.appendChild(this.stageEl);

      this._boundKey = (e) => this._onKey(e);
      this._boundWheel = (e) => this._onWheel(e);
      this._boundClick = (e) => this._onClick(e);
      this._boundResize = () => this.render();

      document.addEventListener('keydown', this._boundKey, true);
      this.root.addEventListener('wheel', this._boundWheel, { passive: false });
      this.stageEl.addEventListener('click', this._boundClick);
      window.addEventListener('resize', this._boundResize);

      this.render();
    }

    destroy() {
      if (this._boundKey) {
        document.removeEventListener('keydown', this._boundKey, true);
      }
      if (this._boundResize) {
        window.removeEventListener('resize', this._boundResize);
      }
      if (this._boundWheel && this.root) {
        this.root.removeEventListener('wheel', this._boundWheel);
      }
      if (this.wheelTimer) clearTimeout(this.wheelTimer);
      this._mounted = false;
      if (this.root) {
        this.root.classList.remove('kf-reader-open');
        this.root.innerHTML = '';
      }
      this.stageEl = null;
      this.topBarEl = null;
    }

    updateSettings(settings) {
      this.settings = settings;
      this._syncTopBarControls();
      this.render();
    }

    setAlbum(album) {
      this.album = album;
      this.pageCount = album.pages.length;
      this.curPageIndex = -1;
      this.render();
    }

    jumpToPage(pageIndex) {
      if (pageIndex < -1) pageIndex = -1;
      if (pageIndex > this.pageCount) pageIndex = this.pageCount;
      this.curPageIndex = pageIndex;
      this.render();
      this.onPageChange(this.curPageIndex);
    }

    getPagesPerScreen() {
      const v = this.settings.pagesPerScreen;
      if (v === 1 || v === 2) return v;
      return window.innerWidth >= 768 ? 2 : 1;
    }

    getSpreads() {
      return window.KemonoBookSpreads.buildSpreads({
        pageCount: this.pageCount,
        pagesPerScreen: this.getPagesPerScreen(),
        isChangeOddEven: !!this.settings.isChangeOddEven
      });
    }

    getCurrentSpreadIndex() {
      const spreads = this.getSpreads();
      return window.KemonoBookSpreads.findSpreadIndex(spreads, this.curPageIndex);
    }

    turnSpread(delta) {
      const spreads = this.getSpreads();
      let si = this.getCurrentSpreadIndex() + delta;
      if (si < 0) si = 0;
      if (si >= spreads.length) si = spreads.length - 1;
      const anchor = window.KemonoBookSpreads.getAnchorPage(spreads[si], this.pageCount);
      this.curPageIndex = anchor;
      this.render();
      this.onPageChange(this.curPageIndex);
    }

    getDisplayUrl(page) {
      if (!page) return null;
      return this.settings.loadOriginals ? page.originalUrl : page.thumbUrl;
    }

    render() {
      if (!this.stageEl) return;
      const spreads = this.getSpreads();
      const si = this.getCurrentSpreadIndex();
      const spread = spreads[si] || [];
      const pps = this.getPagesPerScreen();
      const direction = this.settings.bookDirection === 'ltr' ? 'ltr' : 'rtl';

      const aspects = spread.map((idx) => {
        if (idx < 0 || idx >= this.pageCount) return PLACEHOLDER_ASPECT;
        return this.aspectMap[idx] || PLACEHOLDER_ASPECT;
      });

      const layout = window.KemonoBookLayout.computeSpreadLayout({
        viewportWidth: this.root.clientWidth || window.innerWidth,
        viewportHeight: this.root.clientHeight || window.innerHeight,
        pagesPerScreen: Math.max(spread.length, 1),
        bookDirection: direction,
        topBarHeight: 44,
        aspects
      });

      // 預載鄰近 spread 的真實頁
      const preloadRange = 2;
      const preloadSet = new Set();
      for (let s = Math.max(0, si - preloadRange); s <= Math.min(spreads.length - 1, si + preloadRange); s++) {
        spreads[s].forEach((idx) => {
          if (idx >= 0 && idx < this.pageCount) preloadSet.add(idx);
        });
      }

      this.stageEl.innerHTML = '';
      const spreadEl = document.createElement('div');
      spreadEl.className = 'kf-reader-spread';
      spreadEl.style.width = '100%';
      spreadEl.style.height = '100%';
      spreadEl.style.position = 'relative';

      spread.forEach((pageIndex, slotI) => {
        const slot = layout.slots[slotI] || layout.slots[0];
        const pageEl = document.createElement('div');
        pageEl.className = 'kf-reader-page';
        pageEl.style.left = `${slot.left}px`;
        pageEl.style.top = `${slot.top}px`;
        pageEl.style.width = `${slot.width}px`;
        pageEl.style.height = `${slot.height}px`;

        if (pageIndex === -1) {
          pageEl.classList.add('kf-reader-page--cover');
          pageEl.innerHTML = `
            <div class="kf-reader-cover-inner">
              <div class="kf-reader-cover-title">${this._escape(this.album.title || '')}</div>
              <div class="kf-reader-cover-meta">${this._t('reader_cover')}</div>
            </div>`;
        } else if (pageIndex >= this.pageCount) {
          pageEl.classList.add('kf-reader-page--end');
          pageEl.innerHTML = `
            <div class="kf-reader-cover-inner">
              <div class="kf-reader-cover-title">${this._t('reader_end')}</div>
            </div>`;
        } else {
          const page = this.album.pages[pageIndex];
          const url = this.getDisplayUrl(page);
          const img = document.createElement('img');
          img.className = 'kf-reader-img';
          img.alt = page.name || `page ${pageIndex + 1}`;
          img.decoding = 'async';
          img.dataset.pageIndex = String(pageIndex);
          if (preloadSet.has(pageIndex) && url) {
            img.src = url;
          }
          img.addEventListener('load', () => {
            if (img.naturalWidth > 0) {
              this.aspectMap[pageIndex] = img.naturalHeight / img.naturalWidth;
            }
          });
          img.addEventListener('error', () => {
            pageEl.classList.add('kf-reader-page--error');
          });
          pageEl.appendChild(img);
        }

        spreadEl.appendChild(pageEl);
      });

      this.stageEl.appendChild(spreadEl);
      this._updatePageInfo(si, spreads.length);

      // 預載鄰近頁（隱藏 img）
      this._preloadNeighbors(preloadSet, spread);
    }

    _preloadNeighbors(preloadSet, currentSpread) {
      const currentSet = new Set(currentSpread);
      preloadSet.forEach((idx) => {
        if (currentSet.has(idx)) return;
        const page = this.album.pages[idx];
        const url = this.getDisplayUrl(page);
        if (!url) return;
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
        img.onload = () => {
          if (img.naturalWidth > 0) {
            this.aspectMap[idx] = img.naturalHeight / img.naturalWidth;
          }
        };
      });
    }

    _buildTopBar() {
      const bar = document.createElement('div');
      bar.className = 'kf-reader-topbar';
      const i18n = window.KemonoI18n;
      const t = (k) => (i18n && i18n.t ? i18n.t(k) : k);

      const pps = this.settings.pagesPerScreen;
      const ppsVal = pps === 1 || pps === 2 ? String(pps) : 'auto';

      bar.innerHTML = `
        <div class="kf-reader-topbar-left">
          <button type="button" class="kf-reader-btn" data-action="close" title="${t('close')}">${t('close')}</button>
          <span class="kf-reader-pageinfo" data-role="pageinfo"></span>
        </div>
        <div class="kf-reader-topbar-right">
          <label class="kf-reader-toggle">
            <input type="checkbox" data-action="loadOriginals" ${this.settings.loadOriginals ? 'checked' : ''}>
            <span>${t('reader_load_originals')}</span>
          </label>
          <label class="kf-reader-inline">
            <span>${t('reader_pages_per_screen')}</span>
            <select data-action="pagesPerScreen">
              <option value="auto" ${ppsVal === 'auto' ? 'selected' : ''}>${t('reader_pages_auto')}</option>
              <option value="1" ${ppsVal === '1' ? 'selected' : ''}>1</option>
              <option value="2" ${ppsVal === '2' ? 'selected' : ''}>2</option>
            </select>
          </label>
          <label class="kf-reader-inline">
            <span>${t('reader_direction')}</span>
            <select data-action="bookDirection">
              <option value="rtl" ${this.settings.bookDirection !== 'ltr' ? 'selected' : ''}>${t('reader_direction_rtl')}</option>
              <option value="ltr" ${this.settings.bookDirection === 'ltr' ? 'selected' : ''}>${t('reader_direction_ltr')}</option>
            </select>
          </label>
          <label class="kf-reader-toggle">
            <input type="checkbox" data-action="isChangeOddEven" ${this.settings.isChangeOddEven ? 'checked' : ''}>
            <span>${t('reader_odd_even')}</span>
          </label>
          <label class="kf-reader-toggle">
            <input type="checkbox" data-action="showBookThumbs" ${this.settings.showBookThumbs !== false ? 'checked' : ''}>
            <span>${t('reader_show_thumbs')}</span>
          </label>
        </div>
      `;

      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="close"]');
        if (btn) {
          e.preventDefault();
          e.stopPropagation();
          this.onClose();
        }
      });

      bar.addEventListener('change', (e) => {
        const el = e.target;
        const action = el.getAttribute('data-action');
        if (!action) return;
        if (action === 'loadOriginals') {
          this.onSettingsChange({ loadOriginals: !!el.checked });
        } else if (action === 'pagesPerScreen') {
          const v = el.value === 'auto' ? 0 : parseInt(el.value, 10);
          this.onSettingsChange({ pagesPerScreen: v });
        } else if (action === 'bookDirection') {
          this.onSettingsChange({ bookDirection: el.value === 'ltr' ? 'ltr' : 'rtl' });
        } else if (action === 'isChangeOddEven') {
          this.onSettingsChange({ isChangeOddEven: !!el.checked });
        } else if (action === 'showBookThumbs') {
          this.onSettingsChange({ showBookThumbs: !!el.checked });
        }
      });

      this.pageInfoEl = bar.querySelector('[data-role="pageinfo"]');
      return bar;
    }

    _syncTopBarControls() {
      if (!this.topBarEl) return;
      const load = this.topBarEl.querySelector('[data-action="loadOriginals"]');
      if (load) load.checked = !!this.settings.loadOriginals;
      const pps = this.topBarEl.querySelector('[data-action="pagesPerScreen"]');
      if (pps) {
        const v = this.settings.pagesPerScreen;
        pps.value = v === 1 || v === 2 ? String(v) : 'auto';
      }
      const dir = this.topBarEl.querySelector('[data-action="bookDirection"]');
      if (dir) dir.value = this.settings.bookDirection === 'ltr' ? 'ltr' : 'rtl';
      const odd = this.topBarEl.querySelector('[data-action="isChangeOddEven"]');
      if (odd) odd.checked = !!this.settings.isChangeOddEven;
      const thumbs = this.topBarEl.querySelector('[data-action="showBookThumbs"]');
      if (thumbs) thumbs.checked = this.settings.showBookThumbs !== false;
    }

    _updatePageInfo(spreadIndex, spreadCount) {
      if (!this.pageInfoEl) return;
      const real = this.curPageIndex;
      let label;
      if (real < 0) {
        label = this._t('reader_cover');
      } else if (real >= this.pageCount) {
        label = this._t('reader_end');
      } else {
        label = this._t('reader_page_of', {
          current: real + 1,
          total: this.pageCount
        });
      }
      this.pageInfoEl.textContent = `${label} · ${spreadIndex + 1}/${spreadCount}`;
    }

    _onKey(e) {
      if (!this._mounted || !this.root || !this.root.classList.contains('kf-reader-open')) return;
      const app = this.root.closest('#kf-reader-app');
      if (app && app.style.display === 'none') return;

      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) {
        return;
      }
      if (e.metaKey || e.ctrlKey) return;

      const key = e.key;
      if (key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.onClose();
        return;
      }

      const nextKeys = ['d', 'D', 'ArrowRight', 'ArrowDown'];
      const prevKeys = ['a', 'A', 'ArrowLeft', 'ArrowUp'];

      if (nextKeys.includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        this.turnSpread(1);
      } else if (prevKeys.includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        this.turnSpread(-1);
      }
    }

    _onWheel(e) {
      e.preventDefault();
      e.stopPropagation();
      this.wheelAcc += e.deltaY;
      if (this.wheelTimer) clearTimeout(this.wheelTimer);
      this.wheelTimer = setTimeout(() => {
        this.wheelAcc = 0;
      }, 100);
      if (Math.abs(this.wheelAcc) >= 100) {
        const dir = this.wheelAcc > 0 ? 1 : -1;
        this.wheelAcc = 0;
        this.turnSpread(dir);
      }
    }

    _onClick(e) {
      // 點擊頂欄不翻頁
      if (e.target.closest('.kf-reader-topbar')) return;
      if (e.target.closest('.kf-reader-thumbs')) return;

      const rect = this.stageEl.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const ratio = y / rect.height;
      if (ratio < 0.3) {
        this.turnSpread(-1);
      } else if (ratio > 0.7) {
        this.turnSpread(1);
      }
    }

    _t(key, params) {
      if (window.KemonoI18n && window.KemonoI18n.t) {
        return window.KemonoI18n.t(key, params);
      }
      return key;
    }

    _escape(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  }

  window.KemonoBookView = BookView;
})();
