// 分頁管理器 - 處理頁籤切換邏輯

console.log('[KemonoLens] TabManager 加載');

class TabManager {
    constructor() {
        this.currentTab = 'blacklist';
        this.elements = {
            tabButtons: document.querySelectorAll('.tab-button'),
            tabContents: document.querySelectorAll('.tab-content')
        };
        
        this.setupEventListeners();
        this.showTab(this.currentTab);
    }

    setupEventListeners() {
        this.elements.tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const tabButton = e.currentTarget || e.target.closest('.tab-button');
                const tabId = tabButton && tabButton.getAttribute('data-tab');
                if (!tabId) {
                    return;
                }
                this.showTab(tabId);
            });
        });
    }

    showTab(tabId) {
        this.currentTab = tabId;
        
        // 更新按鈕狀態
        this.elements.tabButtons.forEach(button => {
            const buttonTabId = button.getAttribute('data-tab');
            if (buttonTabId === tabId) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });

        // 更新內容顯示
        this.elements.tabContents.forEach(content => {
            const contentTabId = content.getAttribute('data-tab');
            if (contentTabId === tabId) {
                content.style.display = 'block';
            } else {
                content.style.display = 'none';
            }
        });
    }
}