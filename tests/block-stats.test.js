const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../block-stats.js");

test("block stats normalize malformed input", () => {
  const stats = S.normalize({
    totals: { network: 2.9, cosmetic: -4, player: "3" },
    tabs: { "9": { network: "2", cosmetic: 1, player: null }, nope: { network: 8 } }
  });
  assert.deepEqual(stats.totals, { network: 2, cosmetic: 0, player: 3 });
  assert.deepEqual(stats.tabs["9"], { network: 2, cosmetic: 1, player: 0 });
  assert.equal(stats.tabs.nope, undefined);
});

test("block stats add and snapshot separate tab from lifetime totals", () => {
  let stats = S.normalize(null);
  stats = S.add(stats, "network", 4, 2);
  stats = S.add(stats, "cosmetic", 4, 3);
  stats = S.add(stats, "player", 5, 1);
  const tab4 = S.snapshot(stats, 4);
  assert.equal(tab4.tabTotal, 5);
  assert.equal(tab4.total, 6);
  assert.deepEqual(tab4.tab, { network: 2, cosmetic: 3, player: 0 });
});

test("badge text stays compact", () => {
  assert.equal(S.badgeText(0), "");
  assert.equal(S.badgeText(8), "8");
  assert.equal(S.badgeText(999), "999");
  assert.equal(S.badgeText(1000), "999+");
});
