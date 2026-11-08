/**
 * ClickGuard - 擋住隱形廣告點擊劫持（MAIN world / document_start）
 * 主防線：清除全頁透明 overlay／iframe
 * 輔防線：攔截頂層跨來源 window.open
 */
(function () {
  'use strict';

  const LOG_PREFIX = '[KemonoLens:ClickGuard]';
  const AREA_RATIO_THRESHOLD = 0.7;
  const HIGH_Z_INDEX = 1000;
  const markedAttr = 'data-kemono-clickguard';

  function isKemonoUiNode(node) {
    if (!node || node.nodeType !== 1) {
      return false;
    }
    if (typeof node.closest === 'function') {
      try {
        if (node.closest('[class*="kemono-"], [id^="kemono-"]')) {
          return true;
        }
      } catch (_) {
        // ignore
      }
    }
    const id = node.id || '';
    if (id.startsWith('kemono-')) {
      return true;
    }
    const className = typeof node.className === 'string'
      ? node.className
      : (node.className && node.className.baseVal) || '';
    if (/(?:^|\s)kemono-/.test(className)) {
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
    if (!el || el.nodeType !== 1 || isKemonoUiNode(el)) {
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
    if (!el || el.nodeType !== 1 || isKemonoUiNode(el)) {
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

  function onClickCapture(event) {
    const target = event.target;
    if (!target || isKemonoUiNode(target)) {
      return;
    }

    let el = target;
    while (el && el !== document.documentElement) {
      if (el.nodeType === 1 && (el.getAttribute(markedAttr) === 'disabled' || isFullViewportTrap(el))) {
        if (el.getAttribute(markedAttr) !== 'disabled') {
          neutralizeTrap(el);
        }
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      el = el.parentElement;
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
        console.info(LOG_PREFIX, '已擋下跨來源 window.open:', url);
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
