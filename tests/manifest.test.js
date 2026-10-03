const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("manifest stays MV3 without a new scripting permission escalation", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage", "declarativeNetRequest"]);
  assert.deepEqual(manifest.host_permissions, [
    "https://www.youtube.com/*",
    "*://*.doubleclick.net/*",
    "*://*.googlesyndication.com/*",
    "*://*.googleadservices.com/*",
    "*://adservice.google.com/*",
    "*://adservice.google.com.vn/*"
  ]);
  assert.ok(!manifest.permissions.includes("tabs"));
  assert.ok(!manifest.permissions.includes("activeTab"));
  assert.ok(!manifest.permissions.includes("webRequest"));
  assert.ok(!manifest.permissions.includes("scripting"));
  assert.equal(manifest.background?.service_worker, "background.js");
});

test("MAIN-world page guard is statically declared at document_start", () => {
  const guard = manifest.content_scripts.find((entry) =>
    entry.world === "MAIN" &&
    Array.isArray(entry.js) &&
    entry.js.includes("page-guard.js")
  );
  assert.ok(guard);
  assert.equal(guard.run_at, "document_start");
  assert.deepEqual(guard.matches, ["https://www.youtube.com/*"]);
  assert.deepEqual(guard.js, ["ad-sanitize.js", "page-guard.js"]);
});

test("isolated ambient content script remains document_idle", () => {
  const ambient = manifest.content_scripts.find((entry) =>
    Array.isArray(entry.js) && entry.js.includes("content.js")
  );
  assert.ok(ambient);
  assert.equal(ambient.run_at, "document_idle");
  assert.deepEqual(ambient.js, ["helpers.js", "content.js"]);
  assert.deepEqual(ambient.css, ["content.css"]);
});

test("manifest and package versions match", () => {
  assert.equal(manifest.version, pkg.version);
});

test("all packaged entry files exist", () => {
  const files = new Set();
  files.add(manifest.action.default_popup);
  if (manifest.background?.service_worker) files.add(manifest.background.service_worker);
  for (const value of Object.values(manifest.icons || {})) files.add(value);
  for (const value of Object.values(manifest.action.default_icon || {})) files.add(value);
  for (const script of manifest.content_scripts || []) {
    for (const js of script.js || []) files.add(js);
    for (const css of script.css || []) files.add(css);
  }
  files.add("ad-rules.js");

  for (const file of files) {
    assert.equal(fs.existsSync(path.join(root, file)), true, "missing packaged file: " + file);
  }
});

test("runtime files contain no remote code or dynamic code execution", () => {
  const runtimeFiles = [
    "helpers.js",
    "ad-rules.js",
    "ad-sanitize.js",
    "page-guard.js",
    "background.js",
    "content.js",
    "popup.js",
    "popup.html"
  ];
  for (const file of runtimeFiles) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(source, /\beval\s*\(/, file + " uses eval");
    assert.doesNotMatch(source, /\bnew\s+Function\b/, file + " uses new Function");
    assert.doesNotMatch(source, /<script[^>]+src\s*=\s*["']https?:\/\//i, file + " loads a remote script");
  }
});

test("extension icons have PNG signatures", () => {
  const icons = new Set([
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action.default_icon || {})
  ]);
  const signature = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  for (const icon of icons) {
    const bytes = fs.readFileSync(path.join(root, icon));
    assert.deepEqual(bytes.subarray(0, 8), signature, icon + " is not a valid PNG signature");
  }
});
