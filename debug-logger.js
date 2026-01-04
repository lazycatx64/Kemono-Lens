/**
 * Debug Logger - 將日誌發送到 popup 頁面
 */

class DebugLogger {
    constructor() {
        this.enabled = true; // 開發階段預設啟用
        this.maxLogs = 1000;
    }
    
    /**
     * 發送日誌到 popup
     * @param {string} level - 日誌等級 (log, debug, warn, error)
     * @param {string} message - 日誌訊息
     * @param {any} data - 額外資料
     */
    sendLog(level, message, data = null) {
        if (!this.enabled) return;
        
        try {
            // 發送到 background script
            chrome.runtime.sendMessage({
                type: 'debug-log',
                level: level,
                message: message,
                data: data
            }).catch(() => {
                // 忽略錯誤（可能 popup 未開啟）
            });
        } catch (e) {
            // 忽略錯誤
        }
    }
    
    log(message, data = null) {
        this.sendLog('log', message, data);
    }
    
    debug(message, data = null) {
        this.sendLog('debug', message, data);
    }
    
    warn(message, data = null) {
        this.sendLog('warn', message, data);
    }
    
    error(message, data = null) {
        this.sendLog('error', message, data);
    }
    
    /**
     * 啟用/停用 debug logger
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }
}

// 建立全域實例
window.DebugLogger = window.DebugLogger || new DebugLogger();
