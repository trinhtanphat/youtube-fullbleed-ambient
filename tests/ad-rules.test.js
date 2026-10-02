const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../ad-rules.js");

test("Ad Shield rules are stable and uniquely identified", () => {
  const rules = R.buildAdRules();
  assert.equal(rules.length, R.AD_RULE_IDS.length);
  assert.deepEqual(rules.map((rule) => rule.id), [...R.AD_RULE_IDS]);
  assert.equal(new Set(rules.map((rule) => rule.id)).size, rules.length);
});

test("Ad Shield rules are scoped to YouTube initiators", () => {
  for (const rule of R.buildAdRules()) {
    assert.deepEqual(rule.condition.initiatorDomains, ["youtube.com"]);
    assert.equal(rule.action.type, "block");
  }
});

test("Ad Shield does not broadly block googlevideo content delivery", () => {
  const serialized = JSON.stringify(R.buildAdRules());
  assert.equal(serialized.includes("googlevideo.com"), false);
});

test("Ad Shield includes common ad-host blocking and first-party ad endpoints", () => {
  const rules = R.buildAdRules();
  const domains = new Set(
    rules.flatMap((rule) => rule.condition.requestDomains || [])
  );
  assert.equal(domains.has("doubleclick.net"), true);
  assert.equal(domains.has("googlesyndication.com"), true);
  assert.equal(domains.has("googleadservices.com"), true);
  assert.equal(rules.some((rule) => String(rule.condition.urlFilter || "").includes("/pagead/")), true);
});
