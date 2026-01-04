/**
 * Debug logger system - 統一所有日誌輸出到 popup
 */

console.log('[LOGGER] logger.js 開始載入');

// 格式化訊息為易讀格式
function formatMessage(level, ...args) {
    const parts = [];
    for (const arg of args) {
        if (typeof arg === 'object' && arg !== null) {
            try {
                parts.push(JSON.stringify(arg, null, 2));
            } catch (e) {
                parts.push(String(arg));
            }
        } else {
            parts.push(String(arg));
        }
    }
    return parts.join(' ');
}

/**
 * 記錄訊息
 * @param {...any} args - 要記錄的參數
 */
function log(...args) {
    const message = formatMessage('log', ...args);
    console.log('[Kemono Friends]', ...args);
    if (window.DebugLogger) {
        window.DebugLogger.log(message);
    }
}

/**
 * 詳細模式的日誌
 * @param {...any} args - 要記錄的參數
 */
function verbose(...args) {
    const message = formatMessage('debug', ...args);
    console.log('[Kemono Friends]', ...args);
    if (window.DebugLogger) {
        window.DebugLogger.debug(message);
    }
}

/**
 * 記錄警告
 * @param {...any} args - 要記錄的參數
 */
function warn(...args) {
    const message = formatMessage('warn', ...args);
    console.warn('[Kemono Friends]', ...args);
    if (window.DebugLogger) {
        window.DebugLogger.warn(message);
    }
}

/**
 * 記錄錯誤
 * @param {...any} args - 要記錄的參數
 */
function error(...args) {
    const message = formatMessage('error', ...args);
    console.error('[Kemono Friends]', ...args);
    if (window.DebugLogger) {
        window.DebugLogger.error(message);
    }
}

// 在全域暴露這些函數
window.KemonoLogger = {
    log,
    verbose,
    warn,
    error
};

console.log('[LOGGER] logger.js 載入完成，KemonoLogger 已初始化');
