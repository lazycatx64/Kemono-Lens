/**
 * Debug logger system
 */

// 將預設模式設為只顯示警告和錯誤
const DEBUG_MODE = false;  // 改為 false 以減少日誌輸出
const VERBOSE_MODE = false; // 詳細模式，用於顯示額外的偵錯訊息

/**
 * 只有在偵錯模式啟用時才記錄訊息
 * @param {...any} args - 要記錄的參數
 */
function log(...args) {
    if (DEBUG_MODE) {
        console.log('[Kemono Friends]', ...args);
    }
}

/**
 * 詳細模式的日誌，用於高頻率事件
 * @param {...any} args - 要記錄的參數
 */
function verbose(...args) {
    if (DEBUG_MODE && VERBOSE_MODE) {
        console.log('[Kemono Friends]', ...args);
    }
}

/**
 * 只有在偵錯模式啟用時才記錄警告
 * @param {...any} args - 要記錄的參數
 */
function warn(...args) {
    if (DEBUG_MODE) {
        console.warn('[Kemono Friends]', ...args);
    }
}

/**
 * 總是記錄錯誤，無論偵錯模式是否啟用
 * @param {...any} args - 要記錄的參數
 */
function error(...args) {
    console.error('[Kemono Friends]', ...args);
}

// 在全域暴露這些函數
window.KemonoLogger = {
    log,
    verbose,
    warn,
    error
};
