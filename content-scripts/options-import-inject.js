// options.html 跨頁自動填入收藏 textarea & 新增前往 export 頁面按鈕
(function() {
    // 1. 自動填入收藏 textarea
    function tryImportFavoritesFromExport() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('importFavorites') !== '1') return;
        // 只在收藏 textarea 區塊存在時執行
        const textarea = document.getElementById('manual-json-input');
        if (!textarea) return;
        // 從 localStorage 取得資料
        const json = localStorage.getItem('kemonoFavoritesExport');
        if (json) {
            textarea.value = json;
            // 不自動送出，等待使用者手動操作
            // 清除暫存，避免重複
            localStorage.removeItem('kemonoFavoritesExport');
            // 視覺提示
            textarea.style.background = '#fffbe6';
            textarea.focus();
        }
    }

    // 2. 新增「前往 Kemono Export 頁面」按鈕
    function insertGotoExportBtn() {
        // 找到收藏手動同步區塊
        const manualSection = document.getElementById('manual-import-section');
        if (!manualSection) return;
        // 檢查是否已插入
        if (document.getElementById('goto-kemono-export-btn')) return;
        // 建立按鈕
        const btn = document.createElement('button');
        btn.id = 'goto-kemono-export-btn';
        btn.className = 'import-btn';
        btn.style.marginLeft = '8px';
        btn.textContent = '前往 Kemono Export 頁面';
        btn.onclick = function() {
            window.open('https://kemono.cr/account/favorites/export', '_blank');
        };
        // 插入到手動步驟區塊下方
        const steps = manualSection.querySelector('ol');
        if (steps) {
            steps.parentNode.insertBefore(btn, steps.nextSibling);
        } else {
            manualSection.appendChild(btn);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            tryImportFavoritesFromExport();
            insertGotoExportBtn();
        });
    } else {
        tryImportFavoritesFromExport();
        insertGotoExportBtn();
    }
})();
