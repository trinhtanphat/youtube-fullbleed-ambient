const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "popup.html"), "utf8");
const js = fs.readFileSync(path.join(root, "popup.js"), "utf8");

test("popup exposes AdGuard-style blocked counters", () => {
  for (const id of [
    "tabBlocked",
    "totalBlocked",
    "networkBlocked",
    "cosmeticBlocked",
    "playerBlocked",
    "counterMode",
    "resetStats"
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(js, /ytfb-block-stats/);
  assert.match(js, /ytfb-reset-block-stats/);
});

test("packaged runtime contains no browser-bridge injection code", () => {
  const files = [
    "helpers.js",
    "ad-rules.js",
    "block-stats.js",
    "ad-sanitize.js",
    "page-guard.js",
    "background.js",
    "content.js",
    "popup.js"
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(source, /BRIDGE_URL|unsupported browser bridge command|new\s+WebSocket\s*\(/i, file);
  }
});
