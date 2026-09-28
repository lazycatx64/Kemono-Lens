/**
 * 書本跨頁模型（參考 eHunter bookSpread）
 */
(function () {
  /**
   * @param {{ pageCount: number, pagesPerScreen: number, isChangeOddEven: boolean }} opts
   * @returns {number[][]} 每個 spread 為虛擬頁索引陣列；-1=封面，pageCount=END
   */
  function buildSpreads({ pageCount, pagesPerScreen, isChangeOddEven }) {
    const pps = Math.max(1, pagesPerScreen | 0);
    const virtual = [];
    if (!isChangeOddEven) {
      virtual.push(-1);
    }
    for (let i = 0; i < pageCount; i++) {
      virtual.push(i);
    }
    virtual.push(pageCount);

    const spreads = [];
    for (let i = 0; i < virtual.length; i += pps) {
      spreads.push(virtual.slice(i, i + pps));
    }
    return spreads;
  }

  function findSpreadIndex(spreads, pageIndex) {
    for (let s = 0; s < spreads.length; s++) {
      if (spreads[s].includes(pageIndex)) return s;
    }
    // 封面
    if (pageIndex === -1) {
      for (let s = 0; s < spreads.length; s++) {
        if (spreads[s].includes(-1)) return s;
      }
    }
    return 0;
  }

  /** 從目前 spread 找一個真實頁索引作為錨點 */
  function getAnchorPage(spread, pageCount) {
    for (let i = 0; i < spread.length; i++) {
      const idx = spread[i];
      if (idx >= 0 && idx < pageCount) return idx;
    }
    if (spread.includes(-1)) return -1;
    return pageCount;
  }

  window.KemonoBookSpreads = {
    buildSpreads,
    findSpreadIndex,
    getAnchorPage
  };
})();
