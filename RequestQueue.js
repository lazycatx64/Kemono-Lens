// 請求排隊管理器 - 限制請求速率以避免過快發送

console.log('[KemonoFriends] RequestQueue 加載');

class RequestQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.requestTimes = []; // 記錄最近請求的時間戳
        this.maxRequestsPerSecond = 10; // 預設每秒最多10次請求
        this.currentRequests = new Map(); // 追蹤正在進行的請求，key 為請求 ID，value 為 { abortController, type, url }
        this.requestIdCounter = 0;
        
        this.loadSettings();
        this.setupSettingsListener();
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

    // 檢查是否可以發送請求
    canSendRequest() {
        this.cleanRequestTimes();
        return this.requestTimes.length < this.maxRequestsPerSecond;
    }

    // 記錄請求時間
    recordRequest() {
        this.requestTimes.push(Date.now());
    }

    // 等待直到可以發送請求
    async waitForSlot() {
        while (!this.canSendRequest()) {
            // 計算需要等待的時間
            const oldestTime = this.requestTimes[0];
            const now = Date.now();
            const waitTime = 1000 - (now - oldestTime) + 10; // 加10ms緩衝
            
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            
            this.cleanRequestTimes();
        }
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
        
        try {
            // 等待可用的請求槽位
            await this.waitForSlot();
            
            // 檢查是否已被取消
            if (abortController.signal.aborted) {
                throw new Error('Request aborted');
            }
            
            // 記錄請求時間
            this.recordRequest();
            
            // 發送請求
            const response = await fetch(url, fetchOptions);
            
            // 請求完成，移除追蹤
            this.currentRequests.delete(requestId);
            
            return response;
        } catch (error) {
            // 請求失敗或取消，移除追蹤
            this.currentRequests.delete(requestId);
            
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
        
        return new Promise((resolve, reject) => {
            // 等待可用的請求槽位
            this.waitForSlot().then(() => {
                // 檢查是否已被取消
                if (abortController.signal.aborted) {
                    this.currentRequests.delete(requestId);
                    reject(new Error('Request aborted'));
                    return;
                }
                
                // 記錄請求時間
                this.recordRequest();
                
                const img = new Image();
                
                // 設定 abort 處理
                const abortHandler = () => {
                    img.src = ''; // 取消圖片載入
                    this.currentRequests.delete(requestId);
                    reject(new Error('Request aborted'));
                };
                
                abortController.signal.addEventListener('abort', abortHandler);
                
                img.onload = () => {
                    abortController.signal.removeEventListener('abort', abortHandler);
                    this.currentRequests.delete(requestId);
                    resolve(img);
                };
                
                img.onerror = (error) => {
                    abortController.signal.removeEventListener('abort', abortHandler);
                    this.currentRequests.delete(requestId);
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
        });
        
        return toAbort.length;
    }

    // 取消特定 URL 的請求
    abortRequestByUrl(url) {
        for (const [id, request] of this.currentRequests.entries()) {
            if (request.url === url) {
                request.abortController.abort();
                this.currentRequests.delete(id);
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
    }

    // 獲取當前排隊中的請求數量
    getQueueLength() {
        return this.queue.length;
    }

    // 獲取當前正在進行的請求數量
    getActiveRequestCount() {
        return this.currentRequests.size;
    }
}

// 建立全域實例
window.KemonoRequestQueue = new RequestQueue();
