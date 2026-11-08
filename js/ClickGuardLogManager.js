// 點擊防護紀錄管理器 - 設定頁「防護紀錄」頁籤

console.log('[KemonoLens] ClickGuardLogManager 加載');

class ClickGuardLogManager {
    constructor(messageManager) {
        this.messageManager = messageManager;
        this.storageKey = 'clickGuardLogs';
        this.logs = [];
        this.typeLabels = {
            invisible_overlay: '隱形覆蓋層',
            click_hijack: '點擊劫持',
            window_open: '惡意開窗'
        };

        this.elements = {
            list: document.getElementById('clickguard-log-list'),
            empty: document.getElementById('clickguard-log-empty'),
            count: document.getElementById('clickguard-log-count'),
            refreshBtn: document.getElementById('clickguard-log-refresh'),
            clearBtn: document.getElementById('clickguard-log-clear')
        };

        this.setupEventListeners();
        this.setupStorageListener();
    }

    setupEventListeners() {
        if (this.elements.refreshBtn) {
            this.elements.refreshBtn.addEventListener('click', () => {
                this.loadLogs().then(() => this.render());
            });
        }
        if (this.elements.clearBtn) {
            this.elements.clearBtn.addEventListener('click', async () => {
                if (!confirm('確定要清空全部防護紀錄嗎？')) {
                    return;
                }
                await this.clearLogs();
                if (this.messageManager) {
                    this.messageManager.showSuccess('已清空防護紀錄');
                }
            });
        }
    }

    setupStorageListener() {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes[this.storageKey]) {
                return;
            }
            const next = changes[this.storageKey].newValue;
            this.logs = Array.isArray(next) ? next : [];
            this.render();
        });
    }

    loadLogs() {
        return new Promise((resolve) => {
            chrome.storage.local.get([this.storageKey], (result) => {
                this.logs = Array.isArray(result[this.storageKey]) ? result[this.storageKey] : [];
                resolve(this.logs);
            });
        });
    }

    clearLogs() {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [this.storageKey]: [] }, () => {
                this.logs = [];
                this.render();
                resolve();
            });
        });
    }

    formatTime(time) {
        try {
            return new Date(time).toLocaleString('zh-TW', { hour12: false });
        } catch (_) {
            return String(time || '');
        }
    }

    typeLabel(type) {
        return this.typeLabels[type] || type || '未知';
    }

    typeBadgeClass(type) {
        if (type === 'window_open') {
            return 'clickguard-type-open';
        }
        if (type === 'click_hijack') {
            return 'clickguard-type-click';
        }
        return 'clickguard-type-overlay';
    }

    escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    buildDetailLines(entry) {
        const lines = [];
        if (entry.pageUrl) {
            lines.push(`頁面：${entry.pageUrl}`);
        }
        if (entry.tag) {
            lines.push(`元素：${entry.tag}${entry.elementId ? `#${entry.elementId}` : ''}`);
        }
        if (entry.className) {
            lines.push(`class：${entry.className}`);
        }
        if (entry.src) {
            lines.push(`來源：${entry.src}`);
        }
        if (entry.blockedUrl) {
            lines.push(`擋下網址：${entry.blockedUrl}`);
        }
        if (entry.openTarget) {
            lines.push(`開窗目標：${entry.openTarget}`);
        }
        return lines;
    }

    render() {
        if (this.elements.count) {
            this.elements.count.textContent = String(this.logs.length);
        }

        if (!this.elements.list) {
            return;
        }

        if (this.logs.length === 0) {
            this.elements.list.innerHTML = '';
            if (this.elements.empty) {
                this.elements.empty.style.display = 'block';
            }
            return;
        }

        if (this.elements.empty) {
            this.elements.empty.style.display = 'none';
        }

        this.elements.list.innerHTML = this.logs.map((entry) => {
            const details = this.buildDetailLines(entry)
                .map((line) => `<div class="clickguard-log-detail">${this.escapeHtml(line)}</div>`)
                .join('');
            return `
                <div class="clickguard-log-item">
                    <div class="clickguard-log-head">
                        <span class="clickguard-type-badge ${this.typeBadgeClass(entry.type)}">
                            ${this.escapeHtml(this.typeLabel(entry.type))}
                        </span>
                        <span class="clickguard-log-time">${this.escapeHtml(this.formatTime(entry.time))}</span>
                        <span class="clickguard-log-host">${this.escapeHtml(entry.pageHost || '')}</span>
                    </div>
                    ${details}
                </div>
            `;
        }).join('');
    }
}
