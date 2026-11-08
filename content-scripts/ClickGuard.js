/**
 * ClickGuard - 擋住隱形廣告點擊劫持（MAIN world / document_start）
 * 主防線：清除全頁透明 overlay／iframe
 * 輔防線：攔截頂層跨來源 window.open
 * 中鍵防護：短暫擋下 location／a.click() 強制導向，避免「新分頁開了、原分頁也被帶走」
 */
(function () {
  'use strict';

  const LOG_PREFIX = '[KemonoLens:ClickGuard]';
  const AREA_RATIO_THRESHOLD = 0.7;
  const HIGH_Z_INDEX = 1000;
  const markedAttr = 'data-kemono-clickguard';
  const REPORT_SOURCE = 'kemono-clickguard';
  const MIDDLE_NAV_SUPPRESS_MS = 2000;

  /** 中鍵手勢期間禁止目前分頁被腳本強制導向 */
  let suppressDocumentNavigationUntil = 0;

  function summarizeElement(el) {
    if (!el || el.nodeType !== 1) {
      return {};
    }
    const tag = (el.tagName || '').toUpperCase();
    const id = el.id || '';
    const className = typeof el.className === 'string'
      ? el.className
      : (el.className && el.className.baseVal) || '';
    let src = '';
    try {
      src = el.getAttribute('src') || el.href || '';
    } catch (_) {
      src = '';
    }
    if (src.length > 300) {
      src = `${src.slice(0, 300)}…`;
    }
    return {
      tag,
      elementId: id.slice(0, 120),
      className: String(className).slice(0, 200),
      src
    };
  }

  function reportHit(type, extra) {
    try {
      // 使用 postMessage：跨 MAIN／isolated world 比 CustomEvent.detail 更可靠
      window.postMessage(Object.assign({
        source: REPORT_SOURCE,
        type,
        time: Date.now(),
        pageUrl: String(location.href || '').slice(0, 500),
        pageHost: location.hostname || ''
      }, extra || {}), window.location.origin);
    } catch (_) {
      // ignore
    }
  }

  function isExtensionUiNode(node) {
    if (!node || node.nodeType !== 1) {
      return false;
    }
    if (typeof node.closest === 'function') {
      try {
        // kemono-*：預覽／設定等；kf-reader-*／kf-*：書本閱讀器
        if (node.closest(
          '[class*="kemono-"], [id^="kemono-"], [class*="kf-reader-"], [id^="kf-reader-"], [class*="kf-"], [id^="kf-"]'
        )) {
          return true;
        }
      } catch (_) {
        // ignore
      }
    }
    const id = node.id || '';
    if (id.startsWith('kemono-') || id.startsWith('kf-reader-') || id.startsWith('kf-')) {
      return true;
    }
    const className = typeof node.className === 'string'
      ? node.className
      : (node.className && node.className.baseVal) || '';
    if (/(?:^|\s)(?:kemono-|kf-reader-|kf-)/.test(className)) {
      return true;
    }
    return false;
  }

  function parseZIndex(value) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : 0;
  }

  function isNearlyInvisible(style, el) {
    const opacity = parseFloat(style.opacity);
    if (Number.isFinite(opacity) && opacity <= 0.05) {
      return true;
    }
    if (style.visibility === 'hidden') {
      return true;
    }
    // 透明背景且幾乎無文字／子內容的覆蓋層
    const bg = style.backgroundColor || '';
    const transparentBg = !bg
      || bg === 'transparent'
      || /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/i.test(bg)
      || /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)$/i.test(bg);

    if (!transparentBg) {
      return false;
    }

    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'IFRAME' || tag === 'A') {
      return true;
    }

    const text = (el.textContent || '').replace(/\s+/g, '');
    if (text.length > 20) {
      return false;
    }
    return true;
  }

  function isFullViewportTrap(el) {
    if (!el || el.nodeType !== 1 || isExtensionUiNode(el)) {
      return false;
    }
    if (el.getAttribute(markedAttr) === 'disabled') {
      return true;
    }

    const tag = (el.tagName || '').toUpperCase();
    if (tag !== 'DIV' && tag !== 'IFRAME' && tag !== 'A' && tag !== 'SPAN' && tag !== 'SECTION') {
      return false;
    }

    let style;
    try {
      style = window.getComputedStyle(el);
    } catch (_) {
      return false;
    }

    const position = style.position;
    if (position !== 'fixed' && position !== 'absolute') {
      return false;
    }

    // iframe 覆蓋層即使 z-index 中等也可能攔截點擊
    if (tag !== 'IFRAME' && parseZIndex(style.zIndex) < HIGH_Z_INDEX) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    const vw = Math.max(window.innerWidth || 0, 1);
    const vh = Math.max(window.innerHeight || 0, 1);
    const areaRatio = (rect.width * rect.height) / (vw * vh);
    if (areaRatio < AREA_RATIO_THRESHOLD) {
      return false;
    }

    // 接近貼齊視窗
    if (rect.width < vw * 0.85 || rect.height < vh * 0.85) {
      return false;
    }

    if (!isNearlyInvisible(style, el) && tag !== 'IFRAME') {
      // 可見的全螢幕層（例如站點自家 modal）不處理；透明 iframe 仍視為陷阱
      return false;
    }

    // iframe：無 src 或跨來源／可疑廣告常見
    if (tag === 'IFRAME') {
      if (style.pointerEvents === 'none') {
        return false;
      }
      return true;
    }

    if (style.pointerEvents === 'none') {
      return false;
    }

    return true;
  }

  function neutralizeTrap(el) {
    if (!el || el.nodeType !== 1 || isExtensionUiNode(el)) {
      return;
    }
    if (el.getAttribute(markedAttr) === 'disabled') {
      return;
    }

    try {
      el.style.setProperty('pointer-events', 'none', 'important');
      el.setAttribute(markedAttr, 'disabled');
      // 常見覆蓋用連結／iframe：再藏起來降低誤點
      const tag = (el.tagName || '').toUpperCase();
      if (tag === 'IFRAME' || tag === 'A') {
        el.style.setProperty('display', 'none', 'important');
      }
      console.info(LOG_PREFIX, '已禁用隱形點擊陷阱', tag, el.className || el.id || '');
      reportHit('invisible_overlay', summarizeElement(el));
    } catch (error) {
      console.warn(LOG_PREFIX, '禁用陷阱失敗', error);
    }
  }

  function scanNode(node) {
    if (!node || node.nodeType !== 1) {
      return;
    }
    if (isFullViewportTrap(node)) {
      neutralizeTrap(node);
    }
    // 限制深度掃描，避免整頁遍歷過重
    const candidates = node.querySelectorAll
      ? node.querySelectorAll('div, iframe, a, span, section')
      : [];
    const max = Math.min(candidates.length, 200);
    for (let i = 0; i < max; i += 1) {
      const el = candidates[i];
      if (isFullViewportTrap(el)) {
        neutralizeTrap(el);
      }
    }
  }

  function scanDocument() {
    if (!document.documentElement) {
      return;
    }
    scanNode(document.documentElement);
  }

  function armDocumentNavSuppress(ms) {
    const until = Date.now() + (ms || MIDDLE_NAV_SUPPRESS_MS);
    if (until > suppressDocumentNavigationUntil) {
      suppressDocumentNavigationUntil = until;
    }
  }

  function shouldSuppressDocumentNavigation() {
    return Date.now() < suppressDocumentNavigationUntil;
  }

  function neutralizeTrapsAtPoint(x, y) {
    let hitTrap = false;
    try {
      const stacked = document.elementsFromPoint(x, y) || [];
      for (const node of stacked) {
        if (node && node.nodeType === 1 && isFullViewportTrap(node)) {
          neutralizeTrap(node);
          hitTrap = true;
        }
      }
    } catch (_) {
      // ignore
    }
    return hitTrap;
  }

  function findUnderlyingElement(x, y) {
    try {
      const stack = document.elementsFromPoint(x, y) || [];
      return stack.find((node) => (
        node
        && node.nodeType === 1
        && node.getAttribute(markedAttr) !== 'disabled'
        && !isFullViewportTrap(node)
        && !isExtensionUiNode(node)
      )) || null;
    } catch (_) {
      return null;
    }
  }

  function findAnchorFromNode(node) {
    if (!node || typeof node.closest !== 'function') {
      return null;
    }
    try {
      return node.closest('a[href]');
    } catch (_) {
      return null;
    }
  }

  function stopOtherListeners(event) {
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  }

  function onPointerDownCapture(event) {
    if (isExtensionUiNode(event.target)) {
      return;
    }

    // 中鍵：先拆陷阱、擋後續腳本（廣告／頁面常在 mousedown 就導向），保留瀏覽器預設開新分頁
    if (event.button === 1) {
      armDocumentNavSuppress(MIDDLE_NAV_SUPPRESS_MS);
      if (neutralizeTrapsAtPoint(event.clientX, event.clientY)) {
        reportHit('click_hijack', { tag: 'MIDDLE_DOWN', className: 'pointerdown-trap' });
      }
      stopOtherListeners(event);
      return;
    }

    // 左鍵：若點到陷阱也先拆，讓後續事件較容易落到真實元素
    if (event.button === 0) {
      neutralizeTrapsAtPoint(event.clientX, event.clientY);
    }
  }

  function onClickCapture(event) {
    if (event.__kemonoClickGuardRetarget) {
      return;
    }

    const target = event.target;
    if (!target || isExtensionUiNode(target)) {
      return;
    }

    const isMiddle = event.button === 1;

    if (isMiddle) {
      armDocumentNavSuppress(MIDDLE_NAV_SUPPRESS_MS);
    }

    let trap = null;
    let el = target;
    while (el && el !== document.documentElement) {
      if (el.nodeType === 1 && (el.getAttribute(markedAttr) === 'disabled' || isFullViewportTrap(el))) {
        trap = el;
        break;
      }
      el = el.parentElement;
    }

    // 中鍵點在真實連結上：讓瀏覽器開新分頁，但擋住頁面／廣告腳本再處理同一事件
    if (isMiddle && !trap) {
      stopOtherListeners(event);
      // 不 preventDefault，保留中鍵開新分頁的瀏覽器預設行為
      return;
    }

    if (!trap) {
      return;
    }

    reportHit('click_hijack', summarizeElement(trap));
    neutralizeTrap(trap);
    neutralizeTrapsAtPoint(event.clientX, event.clientY);

    stopOtherListeners(event);
    event.preventDefault();

    const below = findUnderlyingElement(event.clientX, event.clientY);
    if (!below || below === trap) {
      return;
    }

    // 中鍵點到陷阱：自行開新分頁，避免合成事件帶走原分頁
    if (isMiddle) {
      const anchor = findAnchorFromNode(below);
      const href = anchor && anchor.href;
      if (href) {
        try {
          window.open(href, '_blank');
        } catch (error) {
          console.warn(LOG_PREFIX, '中鍵轉開新分頁失敗', error);
        }
      }
      return;
    }

    try {
      const retarget = new MouseEvent(event.type, {
        bubbles: true,
        cancelable: true,
        view: window,
        detail: event.detail,
        screenX: event.screenX,
        screenY: event.screenY,
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        button: event.button,
        buttons: event.buttons
      });
      retarget.__kemonoClickGuardRetarget = true;
      below.dispatchEvent(retarget);
    } catch (error) {
      console.warn(LOG_PREFIX, '轉送點擊失敗', error);
    }
  }

  function installDocumentNavigationGuard() {
    const locProto = window.Location && window.Location.prototype;
    if (!locProto) {
      return;
    }

    function blockIfNeeded(url, via) {
      if (!shouldSuppressDocumentNavigation()) {
        return false;
      }
      console.info(LOG_PREFIX, '已擋下中鍵期間的強制導向:', via, url);
      reportHit('forced_navigation', {
        blockedUrl: String(url == null ? '' : url).slice(0, 500),
        openTarget: via
      });
      return true;
    }

    if (typeof locProto.assign === 'function' && !locProto.assign.__kemonoClickGuard) {
      const originalAssign = locProto.assign;
      locProto.assign = function guardedAssign(url) {
        if (blockIfNeeded(url, 'location.assign')) {
          return;
        }
        return originalAssign.call(this, url);
      };
      locProto.assign.__kemonoClickGuard = true;
    }

    if (typeof locProto.replace === 'function' && !locProto.replace.__kemonoClickGuard) {
      const originalReplace = locProto.replace;
      locProto.replace = function guardedReplace(url) {
        if (blockIfNeeded(url, 'location.replace')) {
          return;
        }
        return originalReplace.call(this, url);
      };
      locProto.replace.__kemonoClickGuard = true;
    }

    try {
      const hrefDesc = Object.getOwnPropertyDescriptor(locProto, 'href');
      if (hrefDesc && hrefDesc.set && hrefDesc.configurable && !hrefDesc.set.__kemonoClickGuard) {
        const originalSet = hrefDesc.set;
        const originalGet = hrefDesc.get;
        const guardedSet = function guardedHrefSet(url) {
          if (blockIfNeeded(url, 'location.href')) {
            return;
          }
          return originalSet.call(this, url);
        };
        guardedSet.__kemonoClickGuard = true;
        Object.defineProperty(locProto, 'href', {
          configurable: true,
          enumerable: hrefDesc.enumerable,
          get: originalGet ? function () { return originalGet.call(this); } : undefined,
          set: guardedSet
        });
      }
    } catch (error) {
      console.warn(LOG_PREFIX, '無法包裝 location.href', error);
    }

    // 廣告常在中鍵時對 <a> 呼叫 .click() 帶走原分頁
    const htmlProto = window.HTMLElement && window.HTMLElement.prototype;
    if (htmlProto && typeof htmlProto.click === 'function' && !htmlProto.click.__kemonoClickGuard) {
      const originalClick = htmlProto.click;
      htmlProto.click = function guardedElementClick() {
        if (shouldSuppressDocumentNavigation()) {
          const tag = (this && this.tagName) ? String(this.tagName).toUpperCase() : '';
          const isLink = tag === 'A' || (typeof this.closest === 'function' && this.closest('a[href]'));
          if (isLink) {
            console.info(LOG_PREFIX, '已擋下中鍵期間的 a.click()');
            reportHit('forced_navigation', {
              blockedUrl: (this.href || (this.closest && this.closest('a') && this.closest('a').href) || '').toString().slice(0, 500),
              openTarget: 'element.click'
            });
            return;
          }
        }
        return originalClick.call(this);
      };
      htmlProto.click.__kemonoClickGuard = true;
    }

    // Navigation API：即使 location 包裝失敗也能擋腳本導向
    try {
      if (window.navigation && typeof window.navigation.addEventListener === 'function'
          && !window.navigation.__kemonoClickGuard) {
        window.navigation.addEventListener('navigate', (event) => {
          if (!shouldSuppressDocumentNavigation()) {
            return;
          }
          if (event.hashChange || event.downloadRequest) {
            return;
          }
          // 使用者信任的中鍵開新分頁不會在「目前」document 觸發 navigate；此處多半是腳本推導向
          if (event.cancelable) {
            event.preventDefault();
            console.info(LOG_PREFIX, '已擋下 Navigation API 導向:', event.destination && event.destination.url);
            reportHit('forced_navigation', {
              blockedUrl: String((event.destination && event.destination.url) || '').slice(0, 500),
              openTarget: 'navigation'
            });
          }
        });
        window.navigation.__kemonoClickGuard = true;
      }
    } catch (error) {
      console.warn(LOG_PREFIX, '無法掛載 Navigation API 防護', error);
    }
  }

  function isAllowedOpenUrl(url) {
    if (url == null) {
      return true;
    }
    const raw = String(url).trim();
    if (!raw || raw === 'about:blank') {
      return true;
    }
    // 相對路徑視為同源
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
      return true;
    }
    try {
      const parsed = new URL(raw, window.location.href);
      if (parsed.protocol === 'about:' && parsed.pathname === 'blank') {
        return true;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        // 非 http(s)（例如 blob:）保守允許，避免誤傷站點功能
        return true;
      }
      return parsed.origin === window.location.origin;
    } catch (_) {
      return false;
    }
  }

  function installWindowOpenGuard() {
    const originalOpen = window.open;
    if (typeof originalOpen !== 'function') {
      return;
    }
    if (originalOpen.__kemonoClickGuard) {
      return;
    }

    function guardedOpen(url, target, features) {
      if (!isAllowedOpenUrl(url)) {
        // 擋下惡意開窗後，廣告常改推 location／.click() 帶走原分頁
        armDocumentNavSuppress(MIDDLE_NAV_SUPPRESS_MS);
        console.info(LOG_PREFIX, '已擋下跨來源 window.open:', url);
        reportHit('window_open', {
          blockedUrl: String(url == null ? '' : url).slice(0, 500),
          openTarget: target == null ? '' : String(target).slice(0, 80)
        });
        return null;
      }
      return originalOpen.call(window, url, target, features);
    }

    guardedOpen.__kemonoClickGuard = true;
    try {
      window.open = guardedOpen;
    } catch (error) {
      console.warn(LOG_PREFIX, '無法覆寫 window.open', error);
    }
  }

  function startObserver() {
    if (!document.documentElement) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') {
          continue;
        }
        for (const node of mutation.addedNodes) {
          scanNode(node);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    scanDocument();
  }

  installWindowOpenGuard();
  installDocumentNavigationGuard();

  document.addEventListener('pointerdown', onPointerDownCapture, true);
  document.addEventListener('mousedown', onPointerDownCapture, true);
  document.addEventListener('click', onClickCapture, true);
  document.addEventListener('auxclick', onClickCapture, true);

  if (document.documentElement) {
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      startObserver();
    }, { once: true });
  }

  // document_start 時可能尚無 body；稍後再掃一次
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      scanDocument();
    }, { once: true });
  } else {
    scanDocument();
  }

  console.info(LOG_PREFIX, '已啟用');
})();
