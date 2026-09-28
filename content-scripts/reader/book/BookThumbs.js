/**
 * 書本模式側邊縮圖列（永遠使用 thumbUrl）
 */
(function () {
  class BookThumbs {
    /**
     * @param {HTMLElement} container
     * @param {{
     *   pages: Array<{ thumbUrl: string, name?: string }>,
     *   onJump: (pageIndex: number) => void
     * }} options
     */
    constructor(container, options) {
      this.container = container;
      this.pages = options.pages || [];
      this.onJump = options.onJump;
      this.el = null;
      this.activeIndex = -1;
    }

    mount() {
      this.el = document.createElement('div');
      this.el.className = 'kf-reader-thumbs';
      this.el.setAttribute('role', 'navigation');

      this.pages.forEach((page, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'kf-reader-thumb';
        btn.dataset.index = String(index);
        btn.title = page.name || String(index + 1);

        const img = document.createElement('img');
        img.src = page.thumbUrl;
        img.alt = page.name || `thumb ${index + 1}`;
        img.loading = 'lazy';
        btn.appendChild(img);

        const label = document.createElement('span');
        label.className = 'kf-reader-thumb-label';
        label.textContent = String(index + 1);
        btn.appendChild(label);

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.onJump(index);
        });

        this.el.appendChild(btn);
      });

      this.container.appendChild(this.el);
      this.setActive(this.activeIndex);
    }

    destroy() {
      if (this.el && this.el.parentNode) {
        this.el.parentNode.removeChild(this.el);
      }
      this.el = null;
    }

    setVisible(visible) {
      if (!this.el) return;
      this.el.style.display = visible ? '' : 'none';
      if (this.container) {
        this.container.classList.toggle('kf-reader-has-thumbs', !!visible);
      }
    }

    setActive(pageIndex) {
      this.activeIndex = pageIndex;
      if (!this.el) return;
      this.el.querySelectorAll('.kf-reader-thumb').forEach((btn) => {
        const idx = parseInt(btn.dataset.index, 10);
        const isActive = idx === pageIndex;
        btn.classList.toggle('is-active', isActive);
        if (isActive) {
          btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      });
    }
  }

  window.KemonoBookThumbs = BookThumbs;
})();
