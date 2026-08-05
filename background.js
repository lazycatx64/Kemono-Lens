/**
 * Background Service Worker
 * 負責依使用者設定的網域動態註冊 content scripts
 */

importScripts('js/DomainConfig.js');

const DomainConfig = self.KemonoDomainConfig;

/**
 * 同步動態 content scripts：僅為非預設網域註冊，避免與靜態 manifest 重複注入
 */
async function syncContentScripts() {
    const domains = await DomainConfig.loadDomains();
    const existing = await chrome.scripting.getRegisteredContentScripts();
    const existingIds = existing.map((script) => script.id);
    const idsToRemove = Object.values(DomainConfig.CONTENT_SCRIPT_IDS).filter((id) =>
        existingIds.includes(id)
    );

    if (idsToRemove.length > 0) {
        await chrome.scripting.unregisterContentScripts({ ids: idsToRemove });
    }

    const toRegister = [];

    for (const site of ['kemono', 'coomer']) {
        const domain = domains[site];
        if (DomainConfig.isDefaultDomain(site, domain)) {
            continue;
        }

        const matches = DomainConfig.buildMatchesForDomain(domain);
        if (matches.length === 0) {
            continue;
        }

        toRegister.push({
            id: DomainConfig.CONTENT_SCRIPT_IDS[site],
            matches,
            js: DomainConfig.CONTENT_SCRIPT_JS,
            css: DomainConfig.CONTENT_SCRIPT_CSS,
            runAt: 'document_end',
            persistAcrossSessions: true
        });
    }

    if (toRegister.length > 0) {
        await chrome.scripting.registerContentScripts(toRegister);
    }

    return {
        domains,
        registered: toRegister.map((script) => script.id)
    };
}

/**
 * 移除已不再使用的自訂網域 optional 權限（預設網域保留在 host_permissions）
 */
async function cleanupUnusedPermissions(previousDomains, currentDomains) {
    const originsToRemove = [];

    for (const site of ['kemono', 'coomer']) {
        const oldDomain = previousDomains?.[site];
        const newDomain = currentDomains[site];
        if (!oldDomain || oldDomain === newDomain) {
            continue;
        }
        if (DomainConfig.isDefaultDomain(site, oldDomain)) {
            continue;
        }
        // 若舊網域仍被另一站使用則保留
        const stillUsed = Object.values(currentDomains).some(
            (domain) => DomainConfig.normalizeDomain(domain) === DomainConfig.normalizeDomain(oldDomain)
        );
        if (stillUsed) {
            continue;
        }
        originsToRemove.push(...DomainConfig.getOriginPatterns(oldDomain));
    }

    if (originsToRemove.length === 0) {
        return;
    }

    try {
        await chrome.permissions.remove({ origins: originsToRemove });
    } catch (error) {
        console.warn('[KemonoFriends] 移除舊網域權限失敗:', error);
    }
}

chrome.runtime.onInstalled.addListener(() => {
    syncContentScripts().catch((error) => {
        console.error('[KemonoFriends] onInstalled 同步 content scripts 失敗:', error);
    });
});

chrome.runtime.onStartup.addListener(() => {
    syncContentScripts().catch((error) => {
        console.error('[KemonoFriends] onStartup 同步 content scripts 失敗:', error);
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) {
        return false;
    }

    if (message.action === 'SYNC_CONTENT_SCRIPTS') {
        (async () => {
            try {
                if (message.previousDomains) {
                    const current = await DomainConfig.loadDomains();
                    await cleanupUnusedPermissions(message.previousDomains, current);
                }
                const result = await syncContentScripts();
                sendResponse({ ok: true, ...result });
            } catch (error) {
                console.error('[KemonoFriends] SYNC_CONTENT_SCRIPTS 失敗:', error);
                sendResponse({ ok: false, error: error.message || String(error) });
            }
        })();
        return true;
    }

    return false;
});

// Service worker 啟動時也嘗試同步一次（補強 onInstalled 時機）
syncContentScripts().catch((error) => {
    console.warn('[KemonoFriends] 啟動時同步 content scripts 失敗:', error);
});
