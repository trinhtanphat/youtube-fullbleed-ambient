"use strict";

importScripts("ad-rules.js");

const R = globalThis.YTFBAdRules;
const RUNTIME_VERSION = "1.5.2";
const DEFAULT_SETTINGS = Object.freeze({ enabled: true, adBlock: true });

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

chrome.runtime.onInstalled.addListener(() => {
  syncFromStorage(() => setTimeout(refreshStaleYoutubeTabs, 120));
});

chrome.runtime.onStartup.addListener(() => {
  syncFromStorage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.ytfbSettings) return;
  applyAdRules(changes.ytfbSettings.newValue || DEFAULT_SETTINGS);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ytfb-ad-rules-status") return;

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
      pageGuardStatic: true,
      version: RUNTIME_VERSION
    });
  });
  return true;
});

syncFromStorage();
