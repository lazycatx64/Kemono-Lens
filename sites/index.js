// Access the global logger using a different variable name
const indexLogger = window.KemonoLogger;

// Site handler registry
const siteModules = [
  window.KemonoSites.kemono,
  window.KemonoSites.coomer,
  // Additional site modules can be added here in the future
];

indexLogger.log('Site modules loaded:', siteModules.length);

/**
 * Returns the appropriate handler module based on current URL
 * @param {string} url - Current website URL
 * @returns {Object|null} - Returns matching site handler module, or null if none found
 */
function getHandler(url) {
    indexLogger.log('Finding handler for URL:', url);
    for (const module of siteModules) {
        if (module && module.isMatch(url)) {
            indexLogger.log('Handler matched:', module);
            return module;
        }
    }
    indexLogger.log('No handler found for URL');
    return null;
}

// Expose functions globally
window.KemonoSites = window.KemonoSites || {};
window.KemonoSites.getHandler = getHandler;
