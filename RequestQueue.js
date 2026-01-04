// 請求排隊管理器 - 限制請求速率以避免過快發送

console.log('[KemonoFriends] RequestQueue 加載');

class RequestQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.requestTimes = []; // 記錄最近請求的時間戳
        this.maxRequestsPerSecond = 10; // 預設每秒最多10次請求
        this.currentRequests = new Map(); // 追蹤正在進行的請求，key 為請求 ID，value 為 { abortController, type, url }
        this.pendingRequests = new Set(); // 追蹤等待中的請求（在 waitForSlot 中等待的）
        this.requestIdCounter = 0;
        this.notifier = null; // 通知器實例
        
        this.loadSettings();
        this.setupSettingsListener();
        this.initNotifier();
    }

    loadSettings() {
        // 從 chrome.storage 或 localStorage 讀取設定
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['kemono_request_queue_settings'], (result) => {
                if (result.kemono_request_queue_settings) {
                    try {
                        const settings = JSON.parse(result.kemono_request_queue_settings);
                        if (settings.maxRequestsPerSecond !== undefined) {
                            this.maxRequestsPerSecond = settings.maxRequestsPerSecond;
                        }
                    } catch (e) {
                        console.error('載入請求排隊設定失敗:', e);
                    }
                }
            });
        } else {
            try {
                const localSettings = localStorage.getItem('kemono_request_queue_settings');
                if (localSettings) {
                    const settings = JSON.parse(localSettings);
                    if (settings.maxRequestsPerSecond !== undefined) {
                        this.maxRequestsPerSecond = settings.maxRequestsPerSecond;
                    }
                }
            } catch (e) {
                console.error('載入請求排隊設定失敗:', e);
            }
        }
    }

    setupSettingsListener() {
        // 監聽設定變更事件
        window.addEventListener('storage', (e) => {
            if (e.key === 'kemono_request_queue_settings') {
                try {
                    const settings = JSON.parse(e.newValue);
                    if (settings.maxRequestsPerSecond !== undefined) {
                        this.maxRequestsPerSecond = settings.maxRequestsPerSecond;
                    }
                } catch (err) {
                    console.error('更新請求排隊設定失敗:', err);
                }
            }
        });

        // 監聽自訂事件（從 options 頁面發送）
        window.addEventListener('kemonoRequestQueueSettingsChanged', (e) => {
            if (e.detail && e.detail.maxRequestsPerSecond !== undefined) {
                this.maxRequestsPerSecond = e.detail.maxRequestsPerSecond;
            }
        });
    }

    // 更新設定
    updateSettings(maxRequestsPerSecond) {
        this.maxRequestsPerSecond = maxRequestsPerSecond;
        
        // 儲存設定
        const settings = { maxRequestsPerSecond };
        const settingsJson = JSON.stringify(settings);
        
        try {
            localStorage.setItem('kemono_request_queue_settings', settingsJson);
        } catch (e) {
            console.warn('無法寫入 localStorage:', e);
        }
        
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ kemono_request_queue_settings: settingsJson });
        }
    }

    // 清理過期的請求時間記錄（只保留最近1秒內的）
    cleanRequestTimes() {
        const now = Date.now();
        this.requestTimes = this.requestTimes.filter(time => now - time < 1000);
    }

    // 檢查在當前時間往前1秒的窗口內，是否可以發送請求
    // 這確保了在任何1秒的時間窗口內，請求數都不會超過限制
    canSendRequest() {
        const now = Date.now();
        // 清理超過1秒的舊記錄
        this.cleanRequestTimes();
        
        // 檢查當前1秒窗口內的請求數
        // 使用嚴格的小於，因為我們即將要發送一個新請求
        return this.requestTimes.length < this.maxRequestsPerSecond;
    }

    // 記錄請求時間（在實際發送請求時調用）
    recordRequest() {
        const now = Date.now();
        this.requestTimes.push(now);
        // 保持陣列排序（雖然理論上應該已經是排序的，但為了安全起見）
        this.requestTimes.sort((a, b) => a - b);
    }

    // 等待直到可以發送請求
    // 使用滑動窗口確保在任何1秒時間窗口內都不超過限制
    async waitForSlot(requestId = null) {
        // 如果有 requestId，標記為等待中
        if (requestId !== null) {
            // 在等待前再次檢查是否已被取消（可能因為重複而被取消）
            const request = this.currentRequests.get(requestId);
            if (!request || request.abortController.signal.aborted) {
                return; // 請求已被取消，不需要等待
            }
            
            this.pendingRequests.add(requestId);
            this.updateNotifier();
        }
        
        try {
            // 持續檢查直到可以發送請求
            while (true) {
                // 清理過期記錄（超過1秒的請求時間戳）
                this.cleanRequestTimes();
                
                // 檢查當前1秒窗口內的請求數
                if (this.requestTimes.length < this.maxRequestsPerSecond) {
                    // 可以發送請求，跳出循環
                    break;
                }
                
                // 如果超過限制，計算需要等待的時間
                // 找到最舊的請求時間（在1秒窗口內最早的）
                if (this.requestTimes.length > 0) {
                    const oldestTime = this.requestTimes[0];
                    const now = Date.now();
                    const elapsed = now - oldestTime;
                    
                    // 計算需要等待的時間，直到最舊的請求超過1秒
                    // 加10ms緩衝以避免邊界情況和時序問題
                    const waitTime = Math.max(10, 1000 - elapsed + 10);
                    
                    // 限制最大等待時間為2秒，防止異常情況
                    const actualWaitTime = Math.min(waitTime, 2000);
                    
                    await new Promise(resolve => setTimeout(resolve, actualWaitTime));
                } else {
                    // 如果沒有記錄（理論上不應該發生），短暫等待後重試
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
        } finally {
            // 移除等待標記
            if (requestId !== null) {
                this.pendingRequests.delete(requestId);
                this.updateNotifier();
            }
        }
    }

    // 檢查並移除重複的請求（相同 URL）
    removeDuplicateRequests(url, currentRequestId) {
        const duplicates = [];
        
        // 檢查正在處理的請求
        for (const [id, request] of this.currentRequests.entries()) {
            if (id !== currentRequestId && request.url === url) {
                duplicates.push(id);
            }
        }
        
        // 檢查等待中的請求
        for (const id of this.pendingRequests) {
            if (id !== currentRequestId) {
                const request = this.currentRequests.get(id);
                if (request && request.url === url) {
                    duplicates.push(id);
                }
            }
        }
        
        // 取消重複的請求
        duplicates.forEach(id => {
            const request = this.currentRequests.get(id);
            if (request && request.abortController) {
                request.abortController.abort();
            }
            this.currentRequests.delete(id);
            this.pendingRequests.delete(id);
        });
        
        if (duplicates.length > 0) {
            this.updateNotifier();
        }
        
        return duplicates.length;
    }

    // 發送 fetch 請求（帶排隊）
    async fetch(url, options = {}) {
        const requestId = ++this.requestIdCounter;
        const abortController = new AbortController();
        
        // 將 abort signal 合併到選項中
        const fetchOptions = {
            ...options,
            signal: abortController.signal
        };
        
        // 記錄請求
        this.currentRequests.set(requestId, {
            abortController,
            type: 'fetch',
            url
        });
        
        // 檢查並移除重複的請求
        this.removeDuplicateRequests(url, requestId);
        
        this.updateNotifier();
        
        try {
            // 等待可用的請求槽位（確保在1秒窗口內不超過限制）
            await this.waitForSlot(requestId);
            
            // 檢查是否已被取消
            if (abortController.signal.aborted) {
                throw new Error('Request aborted');
            }
            
            // 在實際發送請求之前記錄時間戳
            // 這樣可以確保在發送時就佔用一個配額，防止同一時間窗口內發送過多請求
            this.recordRequest();
            
            // 發送請求
            const response = await fetch(url, fetchOptions);
            
            // 請求完成，移除追蹤
            this.currentRequests.delete(requestId);
            this.updateNotifier();
            
            return response;
        } catch (error) {
            // 請求失敗或取消，移除追蹤
            this.currentRequests.delete(requestId);
            this.updateNotifier();
            
            if (error.name === 'AbortError' || error.message === 'Request aborted') {
                throw error;
            }
            throw error;
        }
    }

    // 載入圖片（帶排隊）
    async loadImage(url) {
        const requestId = ++this.requestIdCounter;
        const abortController = new AbortController();
        
        // 記錄請求
        this.currentRequests.set(requestId, {
            abortController,
            type: 'image',
            url
        });
        
        // 檢查並移除重複的請求
        this.removeDuplicateRequests(url, requestId);
        
        this.updateNotifier();
        
        return new Promise((resolve, reject) => {
            // 等待可用的請求槽位（確保在1秒窗口內不超過限制）
            this.waitForSlot(requestId).then(() => {
                // 檢查是否已被取消
                if (abortController.signal.aborted) {
                    this.currentRequests.delete(requestId);
                    this.updateNotifier();
                    reject(new Error('Request aborted'));
                    return;
                }
                
                // 在實際載入圖片之前記錄時間戳
                // 這樣可以確保在載入時就佔用一個配額，防止同一時間窗口內載入過多圖片
                this.recordRequest();
                
                const img = new Image();
                
                // 設定 abort 處理
                const abortHandler = () => {
                    img.src = ''; // 取消圖片載入
                    this.currentRequests.delete(requestId);
                    this.updateNotifier();
                    reject(new Error('Request aborted'));
                };
                
                abortController.signal.addEventListener('abort', abortHandler);
                
                img.onload = () => {
                    abortController.signal.removeEventListener('abort', abortHandler);
                    this.currentRequests.delete(requestId);
                    this.updateNotifier();
                    resolve(img);
                };
                
                img.onerror = (error) => {
                    abortController.signal.removeEventListener('abort', abortHandler);
                    this.currentRequests.delete(requestId);
                    this.updateNotifier();
                    reject(error);
                };
                
                img.src = url;
            }).catch(reject);
        });
    }

    // 取消特定類型的請求（例如：取消所有圖片預載請求）
    abortRequestsByType(type) {
        const toAbort = [];
        for (const [id, request] of this.currentRequests.entries()) {
            if (request.type === type) {
                toAbort.push(id);
            }
        }
        
        toAbort.forEach(id => {
            const request = this.currentRequests.get(id);
            if (request && request.abortController) {
                request.abortController.abort();
            }
            this.currentRequests.delete(id);
            this.pendingRequests.delete(id); // 同時從等待列表中移除
        });
        
        this.updateNotifier();
        return toAbort.length;
    }

    // 取消特定 URL 的請求
    abortRequestByUrl(url) {
        for (const [id, request] of this.currentRequests.entries()) {
            if (request.url === url) {
                request.abortController.abort();
                this.currentRequests.delete(id);
                this.pendingRequests.delete(id); // 同時從等待列表中移除
                this.updateNotifier();
                return true;
            }
        }
        return false;
    }

    // 取消所有請求
    abortAll() {
        for (const [id, request] of this.currentRequests.entries()) {
            if (request.abortController) {
                request.abortController.abort();
            }
        }
        this.currentRequests.clear();
        this.pendingRequests.clear();
        this.updateNotifier();
    }

    // 獲取當前排隊中的請求數量
    getQueueLength() {
        return this.queue.length;
    }

    // 獲取當前正在進行的請求數量
    getActiveRequestCount() {
        return this.currentRequests.size;
    }

    // 獲取等待中的請求數量
    getPendingRequestCount() {
        return this.pendingRequests.size;
    }

    // 獲取總請求數量（等待中 + 正在處理）
    getTotalRequestCount() {
        return this.pendingRequests.size + this.currentRequests.size;
    }

    // 初始化通知器
    initNotifier() {
        if (typeof document === 'undefined') return; // 非瀏覽器環境
        
        // 確保 document.body 存在
        if (document.body) {
            this.createNotifier();
        } else {
            // 如果 body 還不存在，等待 DOM 載入
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.createNotifier();
                });
            } else {
                // 如果已經載入完成但 body 不存在，稍後重試
                setTimeout(() => {
                    if (document.body) {
                        this.createNotifier();
                    }
                }, 100);
            }
        }
    }

    // 創建通知器元素
    createNotifier() {
        if (this.notifier) return; // 已經創建過了
        
        // 檢查是否已經存在（避免重複創建）
        let notifier = document.getElementById('kemono-request-queue-notifier');
        if (!notifier) {
            notifier = document.createElement('div');
            notifier.id = 'kemono-request-queue-notifier';
            notifier.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #ffc107;
                color: #333;
                padding: 12px 16px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 10001;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                line-height: 1.5;
                display: none;
                transition: background-color 0.3s ease;
                font-weight: 500;
            `;
            document.body.appendChild(notifier);
        }
        this.notifier = notifier;
    }

    // 更新通知器顯示
    updateNotifier() {
        // 確保通知器已創建
        if (!this.notifier && typeof document !== 'undefined' && document.body) {
            this.createNotifier();
        }
        
        if (!this.notifier) return;
        
        const pendingCount = this.pendingRequests.size;
        const activeCount = this.currentRequests.size;
        const totalCount = pendingCount + activeCount;
        
        if (totalCount === 0) {
            // 所有請求完成，變綠色並在0.5秒後消失
            if (this.notifier.style.display !== 'none') {
                this.notifier.style.background = '#4CAF50';
                this.notifier.style.color = '#fff';
                this.notifier.textContent = '所有請求已完成';
                
                setTimeout(() => {
                    if (this.notifier && this.notifier.parentNode) {
                        this.notifier.style.display = 'none';
                    }
                }, 500);
            }
            return;
        }
        
        // 有請求在處理或等待，顯示黃色通知器
        this.notifier.style.display = 'block';
        this.notifier.style.background = '#ffc107';
        this.notifier.style.color = '#333';
        
        // 顯示內容：正在處理的項目、總數、剩餘數量
        const activeText = activeCount > 0 ? `正在處理: ${activeCount}` : '';
        const pendingText = pendingCount > 0 ? `等待中: ${pendingCount}` : '';
        const totalText = `總數: ${totalCount}`;
        
        let content = totalText;
        if (activeText && pendingText) {
            content = `${activeText} | ${pendingText} | ${totalText}`;
        } else if (activeText) {
            content = `${activeText} | ${totalText}`;
        } else if (pendingText) {
            content = `${pendingText} | ${totalText}`;
        }
        
        this.notifier.textContent = content;
    }
}

// 建立全域實例
window.KemonoRequestQueue = new RequestQueue();
