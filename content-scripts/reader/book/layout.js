/**
 * 書本跨頁槽位幾何
 */
(function () {
  /**
   * @param {{
   *   viewportWidth: number,
   *   viewportHeight: number,
   *   pagesPerScreen: number,
   *   bookDirection: 'rtl'|'ltr',
   *   topBarHeight?: number,
   *   aspects?: number[]  // height/width，缺省用 1.45
   * }} opts
   */
  function computeSpreadLayout(opts) {
    const {
      viewportWidth,
      viewportHeight,
      pagesPerScreen,
      bookDirection,
      topBarHeight = 44,
      aspects = []
    } = opts;

    const pps = Math.max(1, pagesPerScreen);
    const pad = 12;
    const availableH = Math.max(100, viewportHeight - topBarHeight - pad * 2);
    const availableW = Math.max(100, viewportWidth - pad * 2);

    let maxAspect = 1.45;
    for (let i = 0; i < pps; i++) {
      const a = aspects[i];
      if (typeof a === 'number' && a > 0) {
        maxAspect = Math.max(maxAspect, a);
      }
    }

    // 先以高度塞滿，再檢查寬度
    let pageHeight = availableH;
    let pageWidth = pageHeight / maxAspect;
    if (pageWidth * pps > availableW) {
      pageWidth = availableW / pps;
      pageHeight = pageWidth * maxAspect;
    }

    const totalWidth = pageWidth * pps;
    const leftOffset = (viewportWidth - totalWidth) / 2;
    const top = topBarHeight + (availableH - pageHeight) / 2 + pad;

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
