/**
 * Logger system - 統一所有日誌輸出到 console
 */

/**
 * 記錄訊息
 * @param {...any} args - 要記錄的參數
 */
function log(...args) {
    console.log('[Kemono Friends]', ...args);
}

/**
 * 詳細模式的日誌
 * @param {...any} args - 要記錄的參數
 */
function verbose(...args) {
    console.log('[Kemono Friends]', ...args);
}

/**
 * Debug 模式的日誌（與 verbose 相同）
 * @param {...any} args - 要記錄的參數
 */
function debug(...args) {
    verbose(...args);
}

/**
 * 記錄警告
 * @param {...any} args - 要記錄的參數
 */
function warn(...args) {
    console.warn('[Kemono Friends]', ...args);
}

/**
 * 記錄錯誤
 * @param {...any} args - 要記錄的參數
 */
function error(...args) {
    console.error('[Kemono Friends]', ...args);
}

// 在全域暴露這些函數
window.KemonoLogger = {
    log,
    verbose,
    debug,
    warn,
    error
};
