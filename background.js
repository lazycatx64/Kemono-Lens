/**
 * Background Service Worker - 處理日誌轉發
 */

// 監聽來自 content script 的日誌訊息並轉發到 popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'debug-log') {
        // 將日誌訊息儲存到 storage，以便 popup 可以讀取
        chrome.storage.local.get(['debugLogs'], (result) => {
            const logs = result.debugLogs || [];
            logs.push({
                id: Date.now() + Math.random(),
                timestamp: new Date(),
                level: message.level,
                message: message.message,
                data: message.data
            });
            
            // 限制日誌數量（最多保留 500 條）
            if (logs.length > 500) {
                logs.shift();
            }
            
            chrome.storage.local.set({ debugLogs: logs });
        });
    }
});
