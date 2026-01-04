// 注入 Export to Kemono Friends 按鈕（直接匯入擴充功能收藏）
(function() {
    function insertExportButton() {
        // 找到 Export Favorites 按鈕
        const exportBtn = Array.from(document.querySelectorAll('button.button')).find(btn => btn.textContent.trim() === 'Export Favorites');
        if (!exportBtn) return;
        // 檢查是否已經插入過
        if (document.getElementById('kemono-blacklist-export-btn')) return;

        // 建立新按鈕
        const newBtn = document.createElement('button');
        newBtn.id = 'kemono-blacklist-export-btn';
        newBtn.className = 'button';
        newBtn.style.marginLeft = '8px';
        newBtn.textContent = 'Export to Kemono Friends';

        // 建立提示元素
        const tipSpan = document.createElement('span');
        tipSpan.id = 'kemono-blacklist-export-tip';
        tipSpan.style.marginLeft = '12px';
        tipSpan.style.color = '#28a745';
        tipSpan.style.fontWeight = 'bold';
        tipSpan.style.display = 'none';


        newBtn.onclick = function() {
            const textarea = document.querySelector('textarea');
            if (!textarea) {
                alert('請先點擊 Export Favorites 產生收藏資料');
                console.log('[KemonoFriends][Export] 未找到 textarea');
                return;
            }
            const json = textarea.value.trim();
            if (!json || json === '{}') {
                alert('請先產生有效的收藏 JSON 資料');
                console.log('[KemonoFriends][Export] JSON 為空或 {}');
                return;
            }
            let rawData;
            try {
                rawData = JSON.parse(json);
                console.log('[KemonoFriends][Export] 解析 JSON 成功:', rawData);
            } catch (e) {
                alert('JSON 格式錯誤，請確認內容正確');
                console.log('[KemonoFriends][Export] JSON 解析失敗:', e, json);
                return;
            }

            // 只匯入 artists 陣列內容，並轉換為物件格式（key: platform-id）
            let artists = [];
            if (Array.isArray(rawData.artists)) {
                artists = rawData.artists.map(a => ({
                    id: a.id || a.user_id || a.artist_id || a.user || '',
                    service: a.service || a.platform || a.site || '',
                    name: a.name || ''
                })).filter(a => a.id && a.service);
                console.log('[KemonoFriends][Export] 處理 artists 陣列:', artists);
            } else if (Array.isArray(rawData)) {
                artists = rawData.map(a => ({
                    id: a.id || a.user_id || a.artist_id || a.user || '',
                    service: a.service || a.platform || a.site || '',
                    name: a.name || ''
                })).filter(a => a.id && a.service);
                console.log('[KemonoFriends][Export] 處理純陣列:', artists);
            } else {
                console.log('[KemonoFriends][Export] 未識別的資料格式:', rawData);
            }

            if (!artists.length) {
                alert('找不到有效的創作者資料，請確認 JSON 內容。');
                console.log('[KemonoFriends][Export] artists 陣列為空，原始資料:', rawData);
                return;
            }

            // 轉換為物件格式
            const favoritesData = {};
            for (const artist of artists) {
                const key = `${artist.service}-${artist.id}`;
                favoritesData[key] = {
                    id: artist.id,
                    name: artist.name,
                    service: artist.service,
                    addedAt: Date.now()
                };
            }
            console.log('[KemonoFriends][Export] 寫入 favoritesData:', favoritesData);
            chrome.storage.local.set({ favoritesData, lastSynced: Date.now() }, function() {
                tipSpan.textContent = '✅ 匯入成功！';
                tipSpan.style.display = 'inline';
                setTimeout(() => {
                    tipSpan.style.display = 'none';
                }, 3500);
                console.log('[KemonoFriends][Export] chrome.storage.local.set 完成');
            });
        };

        exportBtn.parentNode.insertBefore(newBtn, exportBtn.nextSibling);
        exportBtn.parentNode.insertBefore(tipSpan, newBtn.nextSibling);
        exportBtn.parentNode.style.display = 'flex';
        exportBtn.parentNode.style.alignItems = 'center';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', insertExportButton);
    } else {
        insertExportButton();
    }
})();
