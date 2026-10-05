"use strict";

importScripts("ad-rules.js", "block-stats.js");

const R = globalThis.YTFBAdRules;
const S = globalThis.YTFBBlockStats;
const RUNTIME_VERSION = "1.8.6";
const DEFAULT_SETTINGS = Object.freeze({ enabled: true, adBlock: true });
const STATS_KEY = "ytfbBlockStats";
const RUNTIME_SEEN_KEY = "ytfbRuntimeVersionSeen";

let statsCache = null;
let statsSaveTimer = null;
let runtimeRefreshStarted = false;

function shieldEnabled(settings) {
  return settings?.enabled !== false && settings?.adBlock !== false;
}

function applyAdRules(settings, done = () => {}) {
  const enabled = shieldEnabled(settings);
  chrome.declarativeNetRequest.updateDynamicRules(
    {
      removeRuleIds: [...R.AD_RULE_IDS],
      addRules: enabled ? R.buildAdRules() : []
    },
    () => {
      const error = chrome.runtime.lastError?.message || "";
      if (error) {
        console.warn("YouTube Fullbleed Ambient: could not update Ad Shield rules", error);
      }
      done(error);
    }
  );
}

function syncFromStorage(done = () => {}) {
  chrome.storage.sync.get({ ytfbSettings: DEFAULT_SETTINGS }, (result) => {
    applyAdRules(result?.ytfbSettings || DEFAULT_SETTINGS, done);
  });
}

function withStats(done) {
  if (statsCache) {
    done(statsCache);
    return;
  }

  chrome.storage.local.get({ [STATS_KEY]: null }, (result) => {
    statsCache = S.normalize(result?.[STATS_KEY]);
    done(statsCache);
  });
}

function saveStatsSoon() {
  if (statsSaveTimer !== null) clearTimeout(statsSaveTimer);
  statsSaveTimer = setTimeout(() => {
    statsSaveTimer = null;
    if (!statsCache) return;
    chrome.storage.local.set({ [STATS_KEY]: statsCache });
  }, 120);
}

function updateBadge(tabId) {
  if (!statsCache || !Number.isInteger(tabId) || tabId < 0) return;
  const snapshot = S.snapshot(statsCache, tabId);
  const text = S.badgeText(snapshot.tabTotal);
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#45c27a" }, () => void chrome.runtime.lastError);
  chrome.action.setBadgeText({ tabId, text }, () => void chrome.runtime.lastError);
}

function recordBlocked(kind, tabId, count = 1) {
  if (!S.KINDS.includes(kind)) return;
  withStats((stats) => {
    statsCache = S.add(stats, kind, tabId, count);
    updateBadge(tabId);
    saveStatsSoon();
  });
}

function clearAllBadges() {
  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError || !Array.isArray(tabs)) return;
    for (const tab of tabs) {
      if (!Number.isInteger(tab?.id)) continue;
      chrome.action.setBadgeText({ tabId: tab.id, text: "" }, () => void chrome.runtime.lastError);
    }
  });
}

function resetStats(done = () => {}) {
  statsCache = S.normalize(null);
  if (statsSaveTimer !== null) {
    clearTimeout(statsSaveTimer);
    statsSaveTimer = null;
  }
  chrome.storage.local.set({ [STATS_KEY]: statsCache }, () => {
    clearAllBadges();
    done(chrome.runtime.lastError?.message || "");
  });
}

function refreshStaleYoutubeTabs() {
  chrome.tabs.query({ url: ["https://www.youtube.com/*"] }, (tabs) => {
    if (chrome.runtime.lastError || !Array.isArray(tabs)) return;

    for (const tab of tabs) {
      if (!tab?.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: "ytfb-version-probe" }, (response) => {
        const error = chrome.runtime.lastError?.message || "";
        if (error || response?.version !== RUNTIME_VERSION) {
          chrome.tabs.reload(tab.id);
        }
      });
    }
  });
}

function refreshTabsForRuntimeVersionOnce() {
  if (runtimeRefreshStarted) return;
  runtimeRefreshStarted = true;

  chrome.storage.local.get({ [RUNTIME_SEEN_KEY]: "" }, (result) => {
    const seen = String(result?.[RUNTIME_SEEN_KEY] || "");
    if (seen === RUNTIME_VERSION) return;

    chrome.storage.local.set({ [RUNTIME_SEEN_KEY]: RUNTIME_VERSION }, () => {
      if (chrome.runtime.lastError) return;
      setTimeout(refreshStaleYoutubeTabs, 120);
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  syncFromStorage();
  refreshTabsForRuntimeVersionOnce();
  withStats(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  syncFromStorage();
  refreshTabsForRuntimeVersionOnce();
  withStats(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.ytfbSettings) return;
  applyAdRules(changes.ytfbSettings.newValue || DEFAULT_SETTINGS);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  withStats((stats) => {
    statsCache = S.clearTab(stats, tabId);
    saveStatsSoon();
  });
});

if (chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const ruleId = Number(info?.rule?.ruleId);
    if (!R.AD_RULE_IDS.includes(ruleId)) return;
    recordBlocked("network", Number(info?.request?.tabId), 1);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ytfb-ad-rules-status") {
    chrome.declarativeNetRequest.getDynamicRules((rules) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, reason: chrome.runtime.lastError.message });
        return;
      }

      const activeIds = new Set(rules.map((rule) => rule.id));
      sendResponse({
        ok: true,
        enabled: R.AD_RULE_IDS.every((id) => activeIds.has(id)),
        ruleCount: R.AD_RULE_IDS.filter((id) => activeIds.has(id)).length,
        ruleTotal: R.AD_RULE_IDS.length,
        pageGuardStatic: true,
        counterFeedback: Boolean(chrome.declarativeNetRequest.onRuleMatchedDebug),
        version: RUNTIME_VERSION
      });
    });
    return true;
  }

  if (message?.type === "ytfb-blocked-event") {
    const count = Math.min(1000, Math.max(1, Number(message.count) || 1));
    recordBlocked(message.kind, Number(sender?.tab?.id), count);
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "ytfb-block-stats") {
    const tabId = Number(message.tabId);
    withStats((stats) => {
      sendResponse({
        ok: true,
        ...S.snapshot(stats, Number.isInteger(tabId) ? tabId : -1),
        version: RUNTIME_VERSION
      });
    });
    return true;
  }

  if (message?.type === "ytfb-reset-block-stats") {
    resetStats((error) => sendResponse({ ok: !error, reason: error || "" }));
    return true;
  }
});

syncFromStorage();
refreshTabsForRuntimeVersionOnce();
withStats(() => {});
