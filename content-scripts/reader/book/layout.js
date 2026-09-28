/**
 * 書本跨頁槽位幾何
 * 座標系以「舞台（stage）」為準，不含頂欄
 */
(function () {
  /**
   * @param {{
   *   viewportWidth: number,
   *   viewportHeight: number,
   *   pagesPerScreen: number,
   *   bookDirection: 'rtl'|'ltr',
   *   aspects?: number[],  // height/width，缺省用 1.45
   *   pad?: number
   * }} opts
   */
  function computeSpreadLayout(opts) {
    const {
      viewportWidth,
      viewportHeight,
      pagesPerScreen,
      bookDirection,
      aspects = [],
      pad = 8
    } = opts;

    const pps = Math.max(1, pagesPerScreen);
    const availableH = Math.max(100, viewportHeight - pad * 2);
    const availableW = Math.max(100, viewportWidth - pad * 2);

    // 取本跨頁實際最大高寬比；未知時才用 1.45（不可當下限，否則橫圖會被撑成直向槽位）
    let maxAspect = null;
    for (let i = 0; i < pps; i++) {
      const a = aspects[i];
      if (typeof a === 'number' && a > 0) {
        maxAspect = maxAspect === null ? a : Math.max(maxAspect, a);
      }
    }
    if (maxAspect === null) {
      maxAspect = 1.45;
    }

    // 先以高度塞滿，寬度不夠再改以寬度為準
    let pageHeight = availableH;
    let pageWidth = pageHeight / maxAspect;
    if (pageWidth * pps > availableW) {
      pageWidth = availableW / pps;
      pageHeight = pageWidth * maxAspect;
    }

    const totalWidth = pageWidth * pps;
    const leftOffset = (viewportWidth - totalWidth) / 2;
    // 靠上對齊，多餘空白留在下方
    const top = pad;

    const slots = [];
    for (let i = 0; i < pps; i++) {
      // RTL：slot 0 在右側；LTR：slot 0 在左側
      const visualIndex = bookDirection === 'ltr' ? i : (pps - 1 - i);
      slots.push({
        slotIndex: i,
        left: leftOffset + visualIndex * pageWidth,
        top,
        width: pageWidth,
        height: pageHeight
      });
    }

    return { pageWidth, pageHeight, slots, top, leftOffset, totalWidth };
  }

  window.KemonoBookLayout = {
    computeSpreadLayout
  };
})();
