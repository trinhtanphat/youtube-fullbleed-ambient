"use strict";

importScripts("ad-rules.js");

const R = globalThis.YTFBAdRules;
const DEFAULT_SETTINGS = Object.freeze({ enabled: true, adBlock: true });

function applyAdRules(settings) {
  const enabled = settings?.enabled !== false && settings?.adBlock !== false;
  const removeRuleIds = [...R.AD_RULE_IDS];
  const addRules = enabled ? R.buildAdRules() : [];

  chrome.declarativeNetRequest.updateDynamicRules(
    { removeRuleIds, addRules },
    () => {
      if (chrome.runtime.lastError) {
        console.warn("YouTube Fullbleed Ambient: could not update Ad Shield rules", chrome.runtime.lastError.message);
      }
    }
  );
}

function syncFromStorage() {
  chrome.storage.sync.get({ ytfbSettings: DEFAULT_SETTINGS }, (result) => {
    const settings = result?.ytfbSettings || DEFAULT_SETTINGS;
    applyAdRules(settings);
  });
}

chrome.runtime.onInstalled.addListener(syncFromStorage);
chrome.runtime.onStartup.addListener(syncFromStorage);

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
      ruleCount: R.AD_RULE_IDS.filter((id) => activeIds.has(id)).length
    });
  });
  return true;
});

syncFromStorage();
