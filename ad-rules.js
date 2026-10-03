(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YTFBAdRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const AD_RULE_IDS = Object.freeze([1001, 1002, 1003, 1004, 1005, 1006, 1007]);

  const REQUEST_TYPES = Object.freeze([
    "script",
    "image",
    "xmlhttprequest",
    "sub_frame",
    "media",
    "other"
  ]);

  const FIRST_PARTY_REQUEST_TYPES = Object.freeze([
    "script",
    "image",
    "xmlhttprequest",
    "sub_frame",
    "other"
  ]);

  function blockUrl(id, urlFilter, resourceTypes = FIRST_PARTY_REQUEST_TYPES) {
    return {
      id,
      priority: 1,
      action: { type: "block" },
      condition: {
        initiatorDomains: ["youtube.com"],
        urlFilter,
        resourceTypes: [...resourceTypes]
      }
    };
  }

  function buildAdRules() {
    return [
      {
        id: 1001,
        priority: 1,
        action: { type: "block" },
        condition: {
          initiatorDomains: ["youtube.com"],
          requestDomains: ["doubleclick.net"],
          resourceTypes: [...REQUEST_TYPES]
        }
      },
      {
        id: 1002,
        priority: 1,
        action: { type: "block" },
        condition: {
          initiatorDomains: ["youtube.com"],
          requestDomains: ["googlesyndication.com", "googleadservices.com"],
          resourceTypes: [...REQUEST_TYPES]
        }
      },
      {
        id: 1003,
        priority: 1,
        action: { type: "block" },
        condition: {
          initiatorDomains: ["youtube.com"],
          requestDomains: ["adservice.google.com", "adservice.google.com.vn"],
          resourceTypes: [...REQUEST_TYPES]
        }
      },
      blockUrl(1004, "||youtube.com/pagead/"),
      blockUrl(1005, "||youtube.com/api/stats/ads", ["xmlhttprequest", "other"]),
      blockUrl(1006, "||youtube.com/ptracking", ["image", "xmlhttprequest", "other"]),
      blockUrl(1007, "||youtube.com/get_midroll_info", ["xmlhttprequest", "other"])
    ];
  }

  return {
    AD_RULE_IDS,
    REQUEST_TYPES,
    FIRST_PARTY_REQUEST_TYPES,
    buildAdRules
  };
});
