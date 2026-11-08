/**
 * Logger system - 統一日誌輸出，支援等級過濾
 *
 * 等級（由嚴到鬆）：silent < error < warn < info < debug
 * - silent：不輸出
 * - error：僅錯誤
 * - warn：警告與錯誤
 * - info：一般資訊、警告、錯誤（預設）
 * - debug：全部（含 verbose / debug）
 */

const LOG_LEVELS = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4
};

const LOG_LEVEL_NAMES = Object.keys(LOG_LEVELS);
const STORAGE_KEY = 'kemono_logger_settings';
const DEFAULT_LEVEL = 'info';

let currentLevelValue = LOG_LEVELS[DEFAULT_LEVEL];
let currentLevelName = DEFAULT_LEVEL;

function normalizeLevel(level) {
    if (typeof level !== 'string') {
        return DEFAULT_LEVEL;
    }
    const normalized = level.toLowerCase().trim();
    if (normalized === 'verbose' || normalized === 'log') {
        return normalized === 'verbose' ? 'debug' : 'info';
    }
    return LOG_LEVELS[normalized] !== undefined ? normalized : DEFAULT_LEVEL;
}

function shouldLog(levelName) {
    const messageLevel = LOG_LEVELS[levelName];
    if (messageLevel === undefined) {
        return true;
    }
    return messageLevel <= currentLevelValue;
}

function applyLogLevel(level) {
    currentLevelName = normalizeLevel(level);
    currentLevelValue = LOG_LEVELS[currentLevelName];
}

function getLogLevel() {
    return currentLevelName;
}

function getAvailableLogLevels() {
    return LOG_LEVEL_NAMES.slice();
}

function persistLogLevel(level) {
    const normalized = normalizeLevel(level);
    applyLogLevel(normalized);
    const payload = JSON.stringify({ level: normalized });

    try {
        localStorage.setItem(STORAGE_KEY, payload);
    } catch (e) {
        // 忽略 localStorage 錯誤
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
            chrome.storage.local.set({ [STORAGE_KEY]: payload });
        } catch (e) {
            // 忽略 chrome.storage 錯誤
        }
    }

    return normalized;
}

function loadLogLevelFromLocalStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.level) {
                applyLogLevel(parsed.level);
                return;
            }
        }
    } catch (e) {
        // 忽略
    }
}

function loadLogLevelFromChromeStorage() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        return;
    }

    try {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            if (chrome.runtime && chrome.runtime.lastError) {
                return;
            }
            if (!result || !result[STORAGE_KEY]) {
                return;
            }
            try {
                const parsed = typeof result[STORAGE_KEY] === 'string'
                    ? JSON.parse(result[STORAGE_KEY])
                    : result[STORAGE_KEY];
                if (parsed && parsed.level) {
                    applyLogLevel(parsed.level);
                    try {
                        localStorage.setItem(STORAGE_KEY, JSON.stringify({ level: currentLevelName }));
                    } catch (e) {
                        // 忽略
                    }
                }
            } catch (e) {
                // 忽略
            }
        });
    } catch (e) {
        // 忽略
    }
}

function bindStorageListener() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) {
        return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[STORAGE_KEY]) {
            return;
        }
        const next = changes[STORAGE_KEY].newValue;
        if (!next) {
            return;
        }
        try {
            const parsed = typeof next === 'string' ? JSON.parse(next) : next;
            if (parsed && parsed.level) {
                applyLogLevel(parsed.level);
            }
        } catch (e) {
            // 忽略
        }
    });
}

// 啟動時先讀 localStorage，再非同步覆寫 chrome.storage
loadLogLevelFromLocalStorage();
loadLogLevelFromChromeStorage();
bindStorageListener();

/**
 * 一般資訊（info）
 * @param {...any} args
 */
function log(...args) {
    if (!shouldLog('info')) return;
    console.log('[Kemono Lens]', ...args);
}

/**
 * 一般資訊（info）別名
 * @param {...any} args
 */
function info(...args) {
    log(...args);
}

/**
 * 詳細／除錯日誌
 * @param {...any} args
 */
function verbose(...args) {
    if (!shouldLog('debug')) return;
    console.log('[Kemono Lens]', ...args);
}

/**
 * Debug 日誌
 * @param {...any} args
 */
function debug(...args) {
    verbose(...args);
}

/**
 * 警告
 * @param {...any} args
 */
function warn(...args) {
    if (!shouldLog('warn')) return;
    console.warn('[Kemono Lens]', ...args);
}

/**
 * 錯誤
 * @param {...any} args
 */
function error(...args) {
    if (!shouldLog('error')) return;
    console.error('[Kemono Lens]', ...args);
}

window.KemonoLogger = {
    log,
    info,
    verbose,
    debug,
    warn,
    error,
    getLogLevel,
    setLogLevel: persistLogLevel,
    getAvailableLogLevels,
    LOG_LEVELS: { ...LOG_LEVELS }
};
