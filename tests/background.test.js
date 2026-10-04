const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function bootWorker(
  initialSettings = { enabled: true, adBlock: true },
  youtubeTabs = [],
  initialStats = null
) {
  const dnrCalls = [];
  const reloads = [];
  const badges = [];
  const localState = { ytfbBlockStats: initialStats };
  const listeners = {
    storageChanged: null,
    installed: null,
    startup: null,
    message: null,
    tabRemoved: null,
    dnrMatch: null
  };

  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "background.js"), "utf8");
  const R = require("../ad-rules.js");
  const S = require("../block-stats.js");

  const runtime = {
    lastError: null,
    onInstalled: { addListener(fn) { listeners.installed = fn; } },
    onStartup: { addListener(fn) { listeners.startup = fn; } },
    onMessage: { addListener(fn) { listeners.message = fn; } }
  };

  const context = {
    console,
    setTimeout(fn) {
      fn();
      return 1;
    },
    clearTimeout() {},
    YTFBAdRules: null,
    YTFBBlockStats: null,
    importScripts(...files) {
      for (const file of files) {
        if (file === "ad-rules.js") context.YTFBAdRules = R;
        else if (file === "block-stats.js") context.YTFBBlockStats = S;
        else throw new Error("unexpected importScripts file: " + file);
      }
    },
    chrome: {
      declarativeNetRequest: {
        updateDynamicRules(options, callback) {
          dnrCalls.push(options);
          callback?.();
        },
        getDynamicRules(callback) {
          callback(dnrCalls.at(-1)?.addRules || []);
        },
        onRuleMatchedDebug: {
          addListener(fn) {
            listeners.dnrMatch = fn;
          }
        }
      },
      action: {
        setBadgeBackgroundColor(options, callback) {
          badges.push({ type: "color", ...options });
          callback?.();
        },
        setBadgeText(options, callback) {
          badges.push({ type: "text", ...options });
          callback?.();
        }
      },
      tabs: {
        query(_query, callback) {
          callback(youtubeTabs);
        },
        sendMessage(tabId, _message, callback) {
          const tab = youtubeTabs.find((item) => item.id === tabId);
          callback(tab?.runtimeVersion ? { version: tab.runtimeVersion } : undefined);
        },
        reload(tabId) {
          reloads.push(tabId);
        },
        onRemoved: {
          addListener(fn) {
            listeners.tabRemoved = fn;
          }
        }
      },
      storage: {
        sync: {
          get(_defaults, callback) {
            callback({ ytfbSettings: initialSettings });
          }
        },
        local: {
          get(defaults, callback) {
            callback({ ...defaults, ...localState });
          },
          set(values, callback) {
            Object.assign(localState, values);
            callback?.();
          }
        },
        onChanged: { addListener(fn) { listeners.storageChanged = fn; } }
      },
      runtime
    }
  };
  context.globalThis = context;

  vm.runInNewContext(source, context, { filename: "background.js" });
  return { dnrCalls, reloads, badges, listeners, localState, R, S };
}

function send(listeners, message, sender = {}) {
  let response = null;
  const async = listeners.message(message, sender, (value) => { response = value; });
  return { async, response };
}

test("background enables all network Ad Shield rules by default", () => {
  const { dnrCalls, R } = bootWorker();
  assert.ok(dnrCalls.length >= 1);
  const last = dnrCalls.at(-1);
  assert.deepEqual(Array.from(last.removeRuleIds), [...R.AD_RULE_IDS]);
  assert.equal(last.addRules.length, R.AD_RULE_IDS.length);
});

test("background disables network rules when Ad Shield is off", () => {
  const { dnrCalls, listeners, R } = bootWorker();
  listeners.storageChanged(
    { ytfbSettings: { newValue: { enabled: true, adBlock: false } } },
    "sync"
  );
  const last = dnrCalls.at(-1);
  assert.deepEqual(Array.from(last.removeRuleIds), [...R.AD_RULE_IDS]);
  assert.equal(Array.from(last.addRules).length, 0);
});

test("background disables all network Ad Shield rules when master toggle is off", () => {
  const { dnrCalls, listeners } = bootWorker();
  listeners.storageChanged(
    { ytfbSettings: { newValue: { enabled: false, adBlock: true } } },
    "sync"
  );
  assert.equal(Array.from(dnrCalls.at(-1).addRules).length, 0);
});

test("install refreshes stale YouTube tabs but leaves current v1.8.2 tabs alone", () => {
  const { listeners, reloads } = bootWorker(
    { enabled: true, adBlock: true },
    [
      { id: 11, runtimeVersion: "1.6.1" },
      { id: 12, runtimeVersion: "1.8.2" },
      { id: 13 }
    ]
  );
  listeners.installed({ reason: "update" });
  assert.deepEqual(reloads, [11, 13]);
});

test("Ad Shield status reports dynamic rules, feedback counter, and static guard", () => {
  const { listeners, R } = bootWorker();
  const { async, response } = send(listeners, { type: "ytfb-ad-rules-status" });
  assert.equal(async, true);
  assert.equal(response.ok, true);
  assert.equal(response.enabled, true);
  assert.equal(response.ruleCount, R.AD_RULE_IDS.length);
  assert.equal(response.ruleTotal, R.AD_RULE_IDS.length);
  assert.equal(response.pageGuardStatic, true);
  assert.equal(response.counterFeedback, true);
  assert.equal(response.version, "1.8.2");
});

test("blocked counters combine exact network matches with page and player handling", () => {
  const { listeners } = bootWorker();
  listeners.dnrMatch({ rule: { ruleId: 1001 }, request: { tabId: 42 } });
  send(listeners, { type: "ytfb-blocked-event", kind: "cosmetic", count: 3 }, { tab: { id: 42 } });
  send(listeners, { type: "ytfb-blocked-event", kind: "player", count: 1 }, { tab: { id: 42 } });

  const { async, response } = send(listeners, { type: "ytfb-block-stats", tabId: 42 });
  assert.equal(async, true);
  assert.equal(response.ok, true);
  assert.equal(response.tabTotal, 5);
  assert.equal(response.total, 5);
  assert.deepEqual(
    { ...response.tab },
    { network: 1, cosmetic: 3, player: 1 }
  );
});

test("closing a tab clears its per-tab counter but preserves lifetime totals", () => {
  const { listeners } = bootWorker();
  listeners.dnrMatch({ rule: { ruleId: 1001 }, request: { tabId: 7 } });
  listeners.tabRemoved(7);

  const { response } = send(listeners, { type: "ytfb-block-stats", tabId: 7 });
  assert.equal(response.tabTotal, 0);
  assert.equal(response.total, 1);
});

test("reset blocked counters clears totals and visible badges", () => {
  const tabs = [{ id: 5 }, { id: 6 }];
  const { listeners, badges } = bootWorker({ enabled: true, adBlock: true }, tabs);
  listeners.dnrMatch({ rule: { ruleId: 1002 }, request: { tabId: 5 } });

  const reset = send(listeners, { type: "ytfb-reset-block-stats" });
  assert.equal(reset.async, true);
  assert.equal(reset.response.ok, true);

  const { response } = send(listeners, { type: "ytfb-block-stats", tabId: 5 });
  assert.equal(response.total, 0);
  assert.equal(response.tabTotal, 0);
  assert.ok(badges.some((item) => item.type === "text" && item.tabId === 5 && item.text === ""));
});
