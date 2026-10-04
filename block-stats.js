(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YTFBBlockStats = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const KINDS = Object.freeze(["network", "cosmetic", "player"]);

  function blankBucket() {
    return { network: 0, cosmetic: 0, player: 0 };
  }

  function safeCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER);
  }

  function normalizeBucket(value) {
    const out = blankBucket();
    for (const kind of KINDS) out[kind] = safeCount(value?.[kind]);
    return out;
  }

  function normalize(value) {
    const stats = {
      totals: normalizeBucket(value?.totals),
      tabs: {}
    };

    if (value?.tabs && typeof value.tabs === "object") {
      for (const [tabId, bucket] of Object.entries(value.tabs)) {
        if (!/^\d+$/.test(tabId)) continue;
        stats.tabs[tabId] = normalizeBucket(bucket);
      }
    }
    return stats;
  }

  function totalOf(bucket) {
    const safe = normalizeBucket(bucket);
    return safe.network + safe.cosmetic + safe.player;
  }

  function add(value, kind, tabId, count = 1) {
    const stats = normalize(value);
    if (!KINDS.includes(kind)) return stats;

    const delta = safeCount(count);
    if (!delta) return stats;

    stats.totals[kind] += delta;
    if (Number.isInteger(tabId) && tabId >= 0) {
      const key = String(tabId);
      const bucket = normalizeBucket(stats.tabs[key]);
      bucket[kind] += delta;
      stats.tabs[key] = bucket;
    }
    return stats;
  }

  function clearTab(value, tabId) {
    const stats = normalize(value);
    if (Number.isInteger(tabId) && tabId >= 0) delete stats.tabs[String(tabId)];
    return stats;
  }

  function snapshot(value, tabId) {
    const stats = normalize(value);
    const tab = Number.isInteger(tabId) && tabId >= 0
      ? normalizeBucket(stats.tabs[String(tabId)])
      : blankBucket();

    return {
      total: totalOf(stats.totals),
      tabTotal: totalOf(tab),
      totals: stats.totals,
      tab
    };
  }

  function badgeText(count) {
    const n = safeCount(count);
    if (!n) return "";
    if (n > 999) return "999+";
    return String(n);
  }

  return {
    KINDS,
    blankBucket,
    normalizeBucket,
    normalize,
    totalOf,
    add,
    clearTab,
    snapshot,
    badgeText
  };
});
