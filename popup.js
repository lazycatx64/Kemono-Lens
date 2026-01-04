/**
 * Popup 頁面腳本 - Debug Log 檢視器
 */

class DebugLogViewer {
    constructor() {
        this.logs = [];
        this.isPaused = false;
        this.autoScroll = true;
        this.levelFilter = 'all';
        this.searchTerm = '';
        this.stats = {
            total: 0,
            log: 0,
            debug: 0,
            warn: 0,
            error: 0
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupMessageListener();
        this.loadStoredLogs();
    }
    
    setupEventListeners() {
        // 清除日誌
        document.getElementById('clear-btn').addEventListener('click', () => {
            this.clearLogs();
        });
        
        // 匯出日誌
        document.getElementById('export-btn').addEventListener('click', () => {
            this.exportLogs();
        });
        
        // 暫停/繼續
        document.getElementById('toggle-btn').addEventListener('click', () => {
            this.togglePause();
        });
        
        // 自動滾動
        document.getElementById('auto-scroll').addEventListener('change', (e) => {
            this.autoScroll = e.target.checked;
        });
        
        // 等級篩選
        document.getElementById('level-filter').addEventListener('change', (e) => {
            this.levelFilter = e.target.value;
            this.renderLogs();
        });
        
        // 搜尋
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.renderLogs();
        });
    }
    
    setupMessageListener() {
        // 監聽來自 content script 的日誌訊息
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'debug-log') {
                this.addLog(message.level, message.message, message.data);
            }
        });
    }
    
    loadStoredLogs() {
        // 從 storage 載入已儲存的日誌
        chrome.storage.local.get(['debugLogs'], (result) => {
            if (result.debugLogs && Array.isArray(result.debugLogs)) {
                // 將時間戳記字串轉換回 Date 物件
                this.logs = result.debugLogs.map(log => {
                    if (log.timestamp && !(log.timestamp instanceof Date)) {
                        // 如果是字串，嘗試轉換為 Date
                        const date = new Date(log.timestamp);
                        if (!isNaN(date.getTime())) {
                            log.timestamp = date;
                        } else {
                            // 如果轉換失敗，使用當前時間
                            log.timestamp = new Date();
                        }
                    } else if (!log.timestamp) {
                        // 如果沒有時間戳記，使用當前時間
                        log.timestamp = new Date();
                    }
                    return log;
                });
                this.updateStats();
                this.renderLogs();
            }
        });
    }
    
    addLog(level, message, data = null) {
        if (this.isPaused) return;
        
        const logEntry = {
            id: Date.now() + Math.random(),
            timestamp: new Date(),
            level: level,
            message: message,
            data: data
        };
        
        this.logs.push(logEntry);
        
        // 限制日誌數量（最多保留 1000 條）
        if (this.logs.length > 1000) {
            this.logs.shift();
        }
        
        this.updateStats();
        this.saveLogs();
        this.renderLogs();
    }
    
    updateStats() {
        this.stats = {
            total: this.logs.length,
            log: this.logs.filter(l => l.level === 'log').length,
            debug: this.logs.filter(l => l.level === 'debug').length,
            warn: this.logs.filter(l => l.level === 'warn').length,
            error: this.logs.filter(l => l.level === 'error').length
        };
        
        document.getElementById('total-count').textContent = this.stats.total;
        document.getElementById('log-count').textContent = this.stats.log;
        document.getElementById('debug-count').textContent = this.stats.debug;
        document.getElementById('warn-count').textContent = this.stats.warn;
        document.getElementById('error-count').textContent = this.stats.error;
    }
    
    renderLogs() {
        const container = document.getElementById('log-container');
        
        // 篩選日誌
        let filteredLogs = this.logs;
        
        if (this.levelFilter !== 'all') {
            filteredLogs = filteredLogs.filter(log => log.level === this.levelFilter);
        }
        
        if (this.searchTerm) {
            filteredLogs = filteredLogs.filter(log => {
                const messageMatch = log.message.toLowerCase().includes(this.searchTerm);
                const dataMatch = log.data ? JSON.stringify(log.data).toLowerCase().includes(this.searchTerm) : false;
                return messageMatch || dataMatch;
            });
        }
        
        if (filteredLogs.length === 0) {
            container.innerHTML = '<div class="empty-state">沒有符合條件的日誌</div>';
            return;
        }
        
        container.innerHTML = filteredLogs.map(log => this.renderLogEntry(log)).join('');
        
        // 自動滾動到底部
        if (this.autoScroll) {
            container.scrollTop = container.scrollHeight;
        }
    }
    
    renderLogEntry(log) {
        let time;
        try {
            if (log.timestamp instanceof Date) {
                time = log.timestamp.toLocaleTimeString('zh-TW', { 
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    fractionalSecondDigits: 2
                });
            } else if (typeof log.timestamp === 'string') {
                const date = new Date(log.timestamp);
                if (!isNaN(date.getTime())) {
                    time = date.toLocaleTimeString('zh-TW', { 
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        fractionalSecondDigits: 2
                    });
                } else {
                    time = '無效時間';
                }
            } else if (typeof log.timestamp === 'number') {
                time = new Date(log.timestamp).toLocaleTimeString('zh-TW', { 
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    fractionalSecondDigits: 2
                });
            } else {
                time = '未知時間';
            }
        } catch (e) {
            time = '時間錯誤';
        }
        
        // 訊息已經包含格式化後的資料，直接顯示（單行顯示）
        return `<div class="log-entry ${log.level}"><span class="log-time">${time}</span><span class="log-level ${log.level}">[${log.level.toUpperCase()}]</span><span class="log-message">${this.escapeHtml(log.message)}</span></div>`;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    clearLogs() {
        this.logs = [];
        this.updateStats();
        this.saveLogs();
        this.renderLogs();
    }
    
    exportLogs() {
        if (this.logs.length === 0) {
            alert('沒有日誌可以匯出');
            return;
        }
        
        try {
            const logText = this.logs.map(log => {
                let time;
                try {
                    if (log.timestamp instanceof Date) {
                        time = log.timestamp.toISOString();
                    } else if (typeof log.timestamp === 'string') {
                        const date = new Date(log.timestamp);
                        if (!isNaN(date.getTime())) {
                            time = date.toISOString();
                        } else {
                            time = '[無效的時間戳記]';
                        }
                    } else if (typeof log.timestamp === 'number') {
                        time = new Date(log.timestamp).toISOString();
                    } else {
                        time = '[未知的時間格式]';
                    }
                } catch (e) {
                    time = '[時間處理錯誤]';
                }
                
                let line = `[${time}] [${log.level.toUpperCase()}] ${log.message}`;
                if (log.data) {
                    try {
                        line += '\n' + JSON.stringify(log.data, null, 2);
                    } catch (e) {
                        line += '\n[無法序列化資料]';
                    }
                }
                return line;
            }).join('\n\n');
            
            const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kemono-friends-debug-${new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')}.log`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // 延遲釋放 URL，確保下載開始
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 100);
        } catch (error) {
            console.error('匯出日誌時發生錯誤:', error);
            alert('匯出日誌時發生錯誤: ' + error.message);
        }
    }
    
    togglePause() {
        this.isPaused = !this.isPaused;
        const btn = document.getElementById('toggle-btn');
        btn.textContent = this.isPaused ? '繼續' : '暫停';
        btn.style.background = this.isPaused ? '#c72e2e' : '#0e639c';
    }
    
    saveLogs() {
        // 只儲存最近的 500 條日誌
        const logsToSave = this.logs.slice(-500);
        chrome.storage.local.set({ debugLogs: logsToSave });
    }
}

// 初始化
const viewer = new DebugLogViewer();
