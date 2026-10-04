(() => {
  "use strict";

  const H = globalThis.YTFBHelpers;
  const ids = [
    "enabled",
    "mode",
    "scrollMode",
    "dockSize",
    "topbarVideo",
    "adBlock",
    "readingCalm",
    "commentGlass",
    "brightness",
    "blur",
    "fps",
    "quality"
  ];
  const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  const brightnessValue = document.getElementById("brightnessValue");
  const blurValue = document.getElementById("blurValue");
  const status = document.getElementById("status");
  const liveDot = document.getElementById("liveDot");
  const tabBlocked = document.getElementById("tabBlocked");
  const totalBlocked = document.getElementById("totalBlocked");
  const networkBlocked = document.getElementById("networkBlocked");
  const cosmeticBlocked = document.getElementById("cosmeticBlocked");
  const playerBlocked = document.getElementById("playerBlocked");
  const counterMode = document.getElementById("counterMode");
  let saveTimer = null;

  function setStatus(message, tone = "idle") {
    status.textContent = message;
    liveDot.classList.toggle("active", tone === "active");
    liveDot.classList.toggle("warn", tone === "warn");
  }

  function formatCount(value) {
    const n = Math.max(0, Number(value) || 0);
    return new Intl.NumberFormat().format(n);
  }

  function renderBlockStats(stats) {
    tabBlocked.textContent = formatCount(stats?.tabTotal);
    totalBlocked.textContent = formatCount(stats?.total);
    networkBlocked.textContent = formatCount(stats?.totals?.network);
    cosmeticBlocked.textContent = formatCount(stats?.totals?.cosmetic);
    playerBlocked.textContent = formatCount(stats?.totals?.player);
  }

  function render(settings) {
    const s = H.normalizeSettings(settings);
    els.enabled.checked = s.enabled;
    els.mode.value = s.mode;
    els.scrollMode.value = s.scrollMode;
    els.dockSize.value = s.dockSize;
    els.topbarVideo.checked = s.topbarVideo;
    els.adBlock.checked = s.adBlock;
    els.readingCalm.checked = s.readingCalm;
    els.commentGlass.checked = s.commentGlass;
    els.brightness.value = String(s.brightness);
    els.blur.value = String(s.blur);
    els.fps.value = String(s.fps);
    els.quality.value = s.quality;
    brightnessValue.value = s.brightness + "%";
    blurValue.value = String(s.blur);
  }

  function readForm() {
    return H.normalizeSettings({
      enabled: els.enabled.checked,
      mode: els.mode.value,
      scrollMode: els.scrollMode.value,
      dockSize: els.dockSize.value,
      topbarVideo: els.topbarVideo.checked,
      adBlock: els.adBlock.checked,
      readingCalm: els.readingCalm.checked,
      commentGlass: els.commentGlass.checked,
      brightness: Number(els.brightness.value),
      blur: Number(els.blur.value),
      fps: Number(els.fps.value),
      quality: els.quality.value
    });
  }

  function saveNow() {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    const next = readForm();
    render(next);
    chrome.storage.sync.set({ ytfbSettings: next }, () => {
      if (chrome.runtime.lastError) setStatus("Could not save settings", "warn");
      else queryStatus();
    });
  }

  function saveSoon() {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 140);
  }

  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function sendToTab(message) {
    const tab = await activeTab();
    if (!tab?.id) return null;

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response || null);
      });
    });
  }

  async function queryAdRuleStatus() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "ytfb-ad-rules-status" }, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response || null);
      });
    });
  }

  async function queryBlockStats(tabId) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "ytfb-block-stats", tabId }, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response?.ok ? response : null);
      });
    });
  }

  async function resetBlockStats() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "ytfb-reset-block-stats" }, (response) => {
        if (chrome.runtime.lastError) resolve(false);
        else resolve(Boolean(response?.ok));
      });
    });
  }

  async function queryStatus() {
    const tab = await activeTab();
    const [response, adRules, blockStats] = await Promise.all([
      tab?.id ? sendToTab({ type: "ytfb-status" }) : Promise.resolve(null),
      queryAdRuleStatus(),
      queryBlockStats(tab?.id ?? -1)
    ]);

    renderBlockStats(blockStats);
    counterMode.textContent = adRules?.counterFeedback
      ? "Exact network matches + page/player handling"
      : "Page/player handling; network counter unavailable";

    if (!response?.ok) {
      setStatus("Open a YouTube watch page", "warn");
      return;
    }

    const parts = [];
    if (response.focus) parts.push("Focus");
    else if (response.docked) parts.push("Docked");
    else parts.push("Ambient");

    if (response.watchMode === "theater") parts.push("Theater");
    else if (response.watchMode === "normal") parts.push("Normal");
    if (response.reading) parts.push("calm");
    if (response.relayLive) parts.push("relay live");
    if (response.unifiedHeader || response.topbarVideo) parts.push("unified header");
    if (response.adBlock) {
      parts.push(adRules?.enabled ? `Ad Shield ${adRules.ruleCount || 0}/${adRules.ruleTotal || adRules.ruleCount || 0}` : "Ad Shield UI only");
    }
    if (response.canvas?.width) parts.push(response.canvas.width + "x" + response.canvas.height);
    if (response.version) parts.push("v" + response.version);

    setStatus(parts.join(" - "), response.active ? "active" : "warn");
  }

  for (const id of ids) {
    const el = els[id];
    if (id === "brightness" || id === "blur") {
      el.addEventListener("input", () => {
        brightnessValue.value = els.brightness.value + "%";
        blurValue.value = els.blur.value;
        saveSoon();
      });
    } else {
      el.addEventListener("change", saveNow);
    }
  }

  document.getElementById("reset").addEventListener("click", () => {
    const defaults = H.normalizeSettings(H.DEFAULT_SETTINGS);
    render(defaults);
    chrome.storage.sync.set({ ytfbSettings: defaults }, () => queryStatus());
  });

  document.getElementById("resetStats").addEventListener("click", async () => {
    const ok = await resetBlockStats();
    if (!ok) {
      setStatus("Could not reset blocked counters", "warn");
      return;
    }
    renderBlockStats(null);
    queryStatus();
  });

  document.getElementById("toggleFocus").addEventListener("click", async () => {
    const response = await sendToTab({ type: "ytfb-toggle-focus" });
    if (!response?.ok) {
      setStatus("Open a YouTube watch page first", "warn");
      return;
    }
    setStatus(response.focus ? "Focus fill on" : "Focus fill off", "active");
  });

  document.getElementById("toggleDock").addEventListener("click", async () => {
    const response = await sendToTab({ type: "ytfb-toggle-dock" });
    if (!response?.ok) {
      setStatus("Enable scroll dock on a watch page", "warn");
      return;
    }
    setStatus(response.docked ? "Docked player on" : "Docked player off", "active");
  });

  chrome.storage.sync.get({ ytfbSettings: H.DEFAULT_SETTINGS }, (result) => {
    render(result.ytfbSettings);
    queryStatus();
  });
})();
