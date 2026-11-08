/**
 * ClickGuardBridge - isolated world
 * 接收 MAIN world ClickGuard 的攔截事件，寫入 chrome.storage.local
 */
(function () {
  'use strict';

  const REPORT_SOURCE = 'kemono-clickguard';
  const STORAGE_KEY = 'clickGuardLogs';
  const MAX_LOGS = 200;
  const DEDUPE_MS = 5000;

  const recentKeys = new Map();
  let writeChain = Promise.resolve();

  function buildDedupeKey(detail) {
    return [
      detail.type || '',
      detail.pageHost || '',
      detail.tag || '',
      detail.blockedUrl || '',
      detail.src || '',
      detail.className || ''
    ].join('|');
  }

  function shouldAccept(detail) {
    const key = buildDedupeKey(detail);
    const now = Date.now();
    const last = recentKeys.get(key) || 0;
    if (now - last < DEDUPE_MS) {
      return false;
    }
    recentKeys.set(key, now);

    if (recentKeys.size > 100) {
      for (const [k, t] of recentKeys) {
        if (now - t > DEDUPE_MS) {
          recentKeys.delete(k);
        }
      }
    }
    return true;
  }

  function normalizeEntry(detail) {
    const time = Number(detail.time) || Date.now();
    return {
      id: `${time}-${Math.random().toString(36).slice(2, 8)}`,
      time,
      type: String(detail.type || 'unknown'),
      pageUrl: String(detail.pageUrl || '').slice(0, 500),
      pageHost: String(detail.pageHost || '').slice(0, 120),
      tag: String(detail.tag || '').slice(0, 40),
      elementId: String(detail.elementId || '').slice(0, 120),
      className: String(detail.className || '').slice(0, 200),
      src: String(detail.src || '').slice(0, 300),
      blockedUrl: String(detail.blockedUrl || '').slice(0, 500),
      openTarget: String(detail.openTarget || '').slice(0, 80)
    };
  }

  function appendLog(detail) {
    if (!detail || !detail.type || !shouldAccept(detail)) {
      return;
    }

    const entry = normalizeEntry(detail);
    writeChain = writeChain.then(() => new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const list = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
        list.unshift(entry);
        const trimmed = list.slice(0, MAX_LOGS);
        chrome.storage.local.set({ [STORAGE_KEY]: trimmed }, () => resolve());
      });
    })).catch(() => {});
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) {
      return;
    }
    if (event.origin && event.origin !== window.location.origin) {
      return;
    }
    const data = event.data;
    if (!data || data.source !== REPORT_SOURCE || !data.type) {
      return;
    }
    appendLog(data);
  });
})();
