const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function bootWorker(initialSettings = { enabled: true, adBlock: true }) {
  const calls = [];
  const listeners = { storageChanged: null, installed: null, startup: null, message: null };
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "background.js"), "utf8");
  const R = require("../ad-rules.js");

  const context = {
    console,
    YTFBAdRules: null,
    importScripts(file) {
      assert.equal(file, "ad-rules.js");
      context.YTFBAdRules = R;
    },
    chrome: {
      declarativeNetRequest: {
        updateDynamicRules(options, callback) {
          calls.push(options);
          if (callback) callback();
        },
        getDynamicRules(callback) {
          callback(calls.at(-1)?.addRules || []);
        }
      },
      storage: {
        sync: {
          get(_defaults, callback) {
            callback({ ytfbSettings: initialSettings });
          }
        },
        onChanged: {
          addListener(fn) {
            listeners.storageChanged = fn;
          }
        }
      },
      runtime: {
        lastError: null,
        onInstalled: {
          addListener(fn) {
            listeners.installed = fn;
          }
        },
        onStartup: {
          addListener(fn) {
            listeners.startup = fn;
          }
        },
        onMessage: {
          addListener(fn) {
            listeners.message = fn;
          }
        }
      }
    }
  };
  context.globalThis = context;

  vm.runInNewContext(source, context, { filename: "background.js" });
  return { calls, listeners, R };
}

test("background enables all Ad Shield rules by default", () => {
  const { calls, R } = bootWorker();
  assert.ok(calls.length >= 1);
  const last = calls.at(-1);
  assert.deepEqual(Array.from(last.removeRuleIds), [...R.AD_RULE_IDS]);
  assert.equal(last.addRules.length, R.AD_RULE_IDS.length);
});

test("background disables Ad Shield rules when toggle is off", () => {
  const { calls, listeners, R } = bootWorker();
  listeners.storageChanged(
    { ytfbSettings: { newValue: { enabled: true, adBlock: false } } },
    "sync"
  );
  const last = calls.at(-1);
  assert.deepEqual(Array.from(last.removeRuleIds), [...R.AD_RULE_IDS]);
  assert.equal(Array.from(last.addRules).length, 0);
});

test("background disables Ad Shield rules when extension master toggle is off", () => {
  const { calls, listeners } = bootWorker();
  listeners.storageChanged(
    { ytfbSettings: { newValue: { enabled: false, adBlock: true } } },
    "sync"
  );
  assert.equal(Array.from(calls.at(-1).addRules).length, 0);
});
