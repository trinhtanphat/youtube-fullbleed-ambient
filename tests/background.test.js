const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function bootWorker(
  initialSettings = { enabled: true, adBlock: true },
  youtubeTabs = []
) {
  const dnrCalls = [];
  const reloads = [];
  const listeners = { storageChanged: null, installed: null, startup: null, message: null };
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "background.js"), "utf8");
  const R = require("../ad-rules.js");

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
    importScripts(file) {
      assert.equal(file, "ad-rules.js");
      context.YTFBAdRules = R;
    },
    chrome: {
      declarativeNetRequest: {
        updateDynamicRules(options, callback) {
          dnrCalls.push(options);
          callback?.();
        },
        getDynamicRules(callback) {
          callback(dnrCalls.at(-1)?.addRules || []);
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
        }
      },
      storage: {
        sync: {
          get(_defaults, callback) {
            callback({ ytfbSettings: initialSettings });
          }
        },
        onChanged: { addListener(fn) { listeners.storageChanged = fn; } }
      },
      runtime
    }
  };
  context.globalThis = context;

  vm.runInNewContext(source, context, { filename: "background.js" });
  return { dnrCalls, reloads, listeners, R };
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

test("install refreshes stale YouTube tabs but leaves current v1.4 tabs alone", () => {
  const { listeners, reloads } = bootWorker(
    { enabled: true, adBlock: true },
    [
      { id: 11, runtimeVersion: "1.3.0" },
      { id: 12, runtimeVersion: "1.4.0" },
      { id: 13 }
    ]
  );
  listeners.installed({ reason: "update" });
  assert.deepEqual(reloads, [11, 13]);
});

test("Ad Shield status reports dynamic rules and static MAIN-world guard", () => {
  const { listeners, R } = bootWorker();
  let response = null;
  const async = listeners.message(
    { type: "ytfb-ad-rules-status" },
    {},
    (value) => { response = value; }
  );
  assert.equal(async, true);
  assert.equal(response.ok, true);
  assert.equal(response.enabled, true);
  assert.equal(response.ruleCount, R.AD_RULE_IDS.length);
  assert.equal(response.pageGuardStatic, true);
  assert.equal(response.version, "1.5.0");
});
