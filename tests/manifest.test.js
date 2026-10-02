const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("manifest stays MV3 with minimal permissions", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://www.youtube.com/*"]);
  assert.ok(!manifest.permissions.includes("tabs"));
  assert.ok(!manifest.permissions.includes("activeTab"));
});

test("manifest and package versions match", () => {
  assert.equal(manifest.version, pkg.version);
});

test("all packaged entry files exist", () => {
  const files = new Set();
  files.add(manifest.action.default_popup);
  for (const value of Object.values(manifest.icons || {})) files.add(value);
  for (const value of Object.values(manifest.action.default_icon || {})) files.add(value);
  for (const script of manifest.content_scripts || []) {
    for (const js of script.js || []) files.add(js);
    for (const css of script.css || []) files.add(css);
  }
  for (const file of files) {
    assert.equal(fs.existsSync(path.join(root, file)), true, "missing packaged file: " + file);
  }
});

test("runtime files contain no remote code or dynamic code execution", () => {
  const runtimeFiles = ["helpers.js", "content.js", "popup.js", "popup.html"];
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
