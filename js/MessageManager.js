// 訊息管理器 - 處理成功和錯誤訊息顯示

console.log('[KemonoFriends] MessageManager 加載');

class MessageManager {
    constructor() {
        this.elements = {
            successMessage: document.getElementById('success-message'),
            errorMessage: document.getElementById('error-message')
        };
        this.activeToasts = []; // 追蹤活躍的通知
    }

    showSuccess(message) {
        // 優先使用右下角通知
        this.showToast(message, 'success');
        
        // 備用：原始位置顯示
        if (this.elements.successMessage) {
            this.elements.successMessage.textContent = message;
            this.elements.successMessage.style.display = 'block';
        }
        if (this.elements.errorMessage) {
            this.elements.errorMessage.style.display = 'none';
        }
        
        setTimeout(() => {
            if (this.elements.successMessage) {
                this.elements.successMessage.style.display = 'none';
            }
        }, 5000);
    }

    showError(message) {
        // 優先使用右下角通知
        this.showToast(message, 'error');
        
        // 備用：原始位置顯示
        if (this.elements.errorMessage) {
            this.elements.errorMessage.textContent = message;
            this.elements.errorMessage.style.display = 'block';
        }
        if (this.elements.successMessage) {
            this.elements.successMessage.style.display = 'none';
        }
        
        // 對於較長的錯誤訊息（如 API 失敗說明），延長顯示時間
        const displayTime = message.length > 200 ? 10000 : 5000;
        setTimeout(() => {
            if (this.elements.errorMessage) {
                this.elements.errorMessage.style.display = 'none';
            }
        }, displayTime);
    }

    showToast(message, type = 'info') {
        // 創建右下角浮動通知
        const toast = document.createElement('div');
        toast.className = `kemono-toast kemono-toast-${type}`;
        
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        
        toast.innerHTML = `
            <div class="kemono-toast-icon">${icon}</div>
            <div class="kemono-toast-message">${message}</div>
            <button class="kemono-toast-close">×</button>
        `;
        
        // 計算垂直位置（從底部開始堆疊）
        const bottomOffset = this.calculateToastPosition();
        
        // 樣式
        toast.style.cssText = `
            position: fixed;
            bottom: ${bottomOffset}px;
            right: 20px;
            max-width: 400px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            padding: 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.4;
            animation: slideInRight 0.3s ease-out;
            transition: bottom 0.3s ease-out;
        `;
        
        // 關閉按鈕樣式
        const closeBtn = toast.querySelector('.kemono-toast-close');
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 18px;
            cursor: pointer;
            padding: 0;
            margin-left: auto;
            opacity: 0.8;
            transition: opacity 0.2s;
        `;
        
        closeBtn.addEventListener('mouseenter', () => closeBtn.style.opacity = '1');
        closeBtn.addEventListener('mouseleave', () => closeBtn.style.opacity = '0.8');
        
        // 添加動畫樣式
        if (!document.querySelector('#kemono-toast-styles')) {
            const style = document.createElement('style');
            style.id = 'kemono-toast-styles';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOutRight {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
                .kemono-toast-message {
                    flex: 1;
                    white-space: pre-wrap;
                }
                .kemono-toast-icon {
                    flex-shrink: 0;
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(toast);
        
        // 加入活躍通知列表
        this.activeToasts.push(toast);
        
        // 自動移除
        const displayTime = message.length > 200 ? 10000 : 5000;
        const autoRemove = setTimeout(() => this.removeToast(toast), displayTime);
        
        // 手動關閉
        closeBtn.addEventListener('click', () => {
            clearTimeout(autoRemove);
            this.removeToast(toast);
        });
        
        // 點擊通知也可以關閉（除了關閉按鈕）
        toast.addEventListener('click', (e) => {
            if (e.target !== closeBtn) {
                clearTimeout(autoRemove);
                this.removeToast(toast);
            }
        });
    }

    calculateToastPosition() {
        let totalHeight = 20; // 底部基礎間距
        
        // 計算現有通知的總高度
        this.activeToasts.forEach(toast => {
            if (toast.parentNode) { // 確保元素還在 DOM 中
                totalHeight += toast.offsetHeight + 12; // 12px 是通知間距
            }
        });
        
        return totalHeight;
    }

    updateToastPositions() {
        // 重新計算所有活躍通知的位置
        let currentBottom = 20;
        
        // 從下往上重新定位每個通知
        for (let i = 0; i < this.activeToasts.length; i++) {
            const toast = this.activeToasts[i];
            if (toast.parentNode) { // 確保元素還在 DOM 中
                toast.style.bottom = `${currentBottom}px`;
                currentBottom += toast.offsetHeight + 12;
            }
        }
    }

    removeToast(toast) {
        // 從活躍列表中移除
        const index = this.activeToasts.indexOf(toast);
        if (index > -1) {
            this.activeToasts.splice(index, 1);
        }
        
        toast.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            // 移除後重新排列剩餘的通知
            this.updateToastPositions();
        }, 300);
    }

    hideAll() {
        if (this.elements.successMessage) {
            this.elements.successMessage.style.display = 'none';
        }
        if (this.elements.errorMessage) {
            this.elements.errorMessage.style.display = 'none';
        }
    }
}