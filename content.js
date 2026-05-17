(() => {
  const STORE_KEY = "tvReplayJumpState";
  const DEFAULT_STATE = {
    currentDate: null,
    settings: {
      timeText: "08:00",
      skipWeekends: true
    }
  };

  let state = structuredClone(DEFAULT_STATE);
  let panel;
  let statusEl;
  let lastReplayInfo = null;

  init();

  async function init() {
    await loadState();
    injectPanel();
    updatePanel();
  }

  async function loadState() {
    const obj = await storageGet(STORE_KEY);
    state = mergeState(DEFAULT_STATE, obj[STORE_KEY] ?? {});
  }

  async function saveState() {
    await storageSet({ [STORE_KEY]: state });
    updatePanel();
  }

  async function storageGet(key) {
    if (chrome.storage?.local) return await chrome.storage.local.get(key);
    return await chrome.runtime.sendMessage({ type: "tvReplayStorageGet", key });
  }

  async function storageSet(value) {
    if (chrome.storage?.local) return await chrome.storage.local.set(value);
    const response = await chrome.runtime.sendMessage({ type: "tvReplayStorageSet", value });
    if (!response?.ok) throw new Error(response?.error || "Storage save failed");
    return response;
  }

  function mergeState(base, incoming) {
    return {
      currentDate: incoming.currentDate ?? base.currentDate,
      settings: {
        timeText: incoming.settings?.timeText ?? base.settings.timeText,
        skipWeekends: incoming.settings?.skipWeekends ?? base.settings.skipWeekends
      }
    };
  }

  function injectPanel() {
    if (document.getElementById("tv-replay-jumper-panel")) return;

    panel = document.createElement("div");
    panel.id = "tv-replay-jumper-panel";
    panel.innerHTML = `
      <div class="tv-rj-title">TV Replay Jump</div>
      <div class="tv-rj-line" id="tv-rj-state"></div>
      <div class="tv-rj-buttons">
        <button id="tv-rj-next">Next 08:00</button>
        <button id="tv-rj-prev">Prev</button>
        <button id="tv-rj-settings">Settings</button>
        <button id="tv-rj-hide">Hide</button>
      </div>
      <div class="tv-rj-status" id="tv-rj-status"></div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #tv-replay-jumper-panel {
        position: fixed;
        right: 14px;
        bottom: 82px;
        width: 230px;
        z-index: 2147483647;
        background: rgba(18, 18, 22, 0.94);
        color: #fff;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        font-size: 12px;
        border: 1px solid rgba(255,255,255,0.24);
        border-radius: 10px;
        padding: 10px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.35);
      }
      #tv-replay-jumper-panel .tv-rj-title {
        font-weight: 700;
        margin-bottom: 6px;
      }
      #tv-replay-jumper-panel .tv-rj-line,
      #tv-replay-jumper-panel .tv-rj-status {
        opacity: 0.92;
        line-height: 1.35;
        margin-bottom: 7px;
        white-space: pre-line;
      }
      #tv-replay-jumper-panel .tv-rj-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-bottom: 6px;
      }
      #tv-replay-jumper-panel button {
        background: #2b2f36;
        color: #fff;
        border: 1px solid #555b65;
        border-radius: 6px;
        padding: 5px 6px;
        cursor: pointer;
        font: inherit;
      }
      #tv-replay-jumper-panel button:hover {
        background: #3a404a;
      }
    `;

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(panel);

    statusEl = document.getElementById("tv-rj-status");
    document.getElementById("tv-rj-next").addEventListener("click", () => runSafely(() => jump(1)));
    document.getElementById("tv-rj-prev").addEventListener("click", () => runSafely(() => jump(-1)));
    document.getElementById("tv-rj-settings").addEventListener("click", () => runSafely(editSettings));
    document.getElementById("tv-rj-hide").addEventListener("click", hidePanel);
  }

  function updatePanel() {
    const stateLine = document.getElementById("tv-rj-state");
    if (!stateLine) return;

    const details = lastReplayInfo?.resolution ? ` | TF: ${formatResolution(lastReplayInfo.resolution)}` : "";
    stateLine.textContent = `Date: ${state.currentDate ?? "not synced"}\nTime: ${state.settings.timeText}${details}`;

    const nextButton = document.getElementById("tv-rj-next");
    if (nextButton) nextButton.textContent = `Next ${state.settings.timeText}`;
  }

  function setStatus(text) {
    if (!statusEl) statusEl = document.getElementById("tv-rj-status");
    if (statusEl) statusEl.textContent = text;
  }

  function hidePanel() {
    if (!panel) panel = document.getElementById("tv-replay-jumper-panel");
    if (panel) panel.style.display = "none";
  }

  function showPanel() {
    if (!panel) panel = document.getElementById("tv-replay-jumper-panel");
    if (panel) panel.style.display = "block";
  }

  function togglePanel() {
    if (!panel) panel = document.getElementById("tv-replay-jumper-panel");
    if (!panel) return;
    if (panel.style.display === "none") showPanel();
    else hidePanel();
  }

  async function syncCurrentDate(options = {}) {
    const quiet = options.quiet ?? false;
    await loadState();
    if (!quiet) setStatus("Reading TradingView replay date...");

    const info = await getReplayInfo();
    lastReplayInfo = info;
    if (!info.available) throw new Error("Bar Replay is not available for this chart.");
    if (!info.started || !isValidYMD(info.currentDate)) {
      updatePanel();
      const message = "Start Bar Replay and choose a date first.";
      if (!quiet) setStatus(message);
      return false;
    }

    state.currentDate = info.currentDate;
    await saveState();
    if (!quiet) setStatus(`Synced: ${info.currentDate} ${formatResolution(info.resolution)}`);
    return true;
  }

  async function editSettings() {
    await loadState();

    const timeText = prompt("Target replay time as HH:MM, 24-hour format:", state.settings.timeText);
    if (timeText === null) return;

    const cleanTime = normalizeTimeText(timeText);
    if (!isValidTimeText(cleanTime)) {
      alert("Bad time. Use HH:MM, example: 08:00");
      return;
    }

    const skip = confirm("Skip weekends? OK=yes, Cancel=no");

    state.settings.timeText = cleanTime;
    state.settings.skipWeekends = skip;
    await saveState();
    setStatus("Settings saved.");
  }

  async function jump(step) {
    await loadState();

    const synced = await syncCurrentDate({ quiet: true });
    await loadState();
    if (!synced && !isValidYMD(state.currentDate)) {
      setStatus("Start Bar Replay and choose a date first.");
      return;
    }

    const target = nextBusinessDate(state.currentDate, step, state.settings.skipWeekends);
    const timeText = state.settings.timeText;

    setStatus(`Jumping to ${target} ${timeText}...`);

    const info = await jumpWithInternalApi(target, timeText).catch(async (err) => {
      console.warn("TV Replay Jump internal API failed, falling back to dialog:", err);
      await jumpWithReplayDialog(target, timeText);
      const fallbackInfo = await getReplayInfo();
      if (!isReplayAtTarget(fallbackInfo, target, timeText)) {
        const current = fallbackInfo.currentDateTime || fallbackInfo.currentDate || "unknown";
        throw new Error(`TradingView did not move to ${target} ${timeText}. Current replay point: ${current}.`);
      }
      return fallbackInfo;
    });

    lastReplayInfo = info;
    state.currentDate = target;
    await saveState();
    setStatus(`Done: ${target} ${timeText}`);
  }

  async function jumpWithInternalApi(target, timeText) {
    return await runReplayApi("selectDate", { ymd: target, timeText: normalizeTimeText(timeText) });
  }

  async function jumpWithReplayDialog(target, timeText) {
    await ensureReplayToolbar();
    await openReplayDateDialog();
    await fillReplayDateDialog(target, timeText);
  }

  async function ensureReplayToolbar() {
    if (findReplayDateButton() || findReplayDateDialog()) return;

    const replayButton = findVisibleElement("button[aria-label='Bar replay']", (el) => {
      return el.getAttribute("aria-pressed") !== "true";
    });
    if (!replayButton) throw new Error("Bar Replay button not found.");

    await clickElement(replayButton);
    await waitFor(() => findReplayDateButton() || findReplayDateDialog(), 5000, "Bar Replay toolbar did not appear.");
  }

  async function openReplayDateDialog() {
    if (findReplayDateDialog()) return;

    const selectDateButton = findReplayDateButton();
    if (!selectDateButton) throw new Error("Replay Select date button not found.");

    await clickElement(selectDateButton);
    await waitFor(() => findReplayDateDialog(), 5000, "Replay date dialog did not open.");
  }

  async function fillReplayDateDialog(target, timeText) {
    const dialog = findReplayDateDialog();
    if (!dialog) throw new Error("Replay date dialog not found.");

    const inputs = Array.from(dialog.querySelectorAll("input")).filter(isVisibleElement);
    if (inputs.length < 2) throw new Error("Replay date/time inputs not found.");

    const submitButton = findVisibleElement("[data-name='submit-button']", undefined, dialog);
    if (!submitButton) throw new Error("Replay Select button not found.");

    const selectAllModifier = getSelectAllModifier();

    await runSteps([
      clickStep(centerPoint(inputs[0])),
      sleepStep(100),
      { kind: "selectAll", modifier: selectAllModifier },
      { kind: "type", text: target },
      sleepStep(100),
      clickStep(centerPoint(inputs[1])),
      sleepStep(100),
      { kind: "selectAll", modifier: selectAllModifier },
      { kind: "type", text: normalizeTimeText(timeText) },
      sleepStep(150),
      clickStep(centerPoint(submitButton))
    ]);

    await waitFor(() => !findReplayDateDialog(), 7000, "TradingView did not accept the replay date.");
  }

  function clickStep(point) {
    return { kind: "click", x: point.x, y: point.y };
  }

  function centerPoint(el) {
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2)
    };
  }

  async function clickElement(el) {
    await runSteps([clickStep(centerPoint(el))]);
  }

  function findReplayDateDialog() {
    return findVisibleElement("[data-name='select-date-dialog']");
  }

  function findReplayDateButton() {
    const toolbar = findVisibleElement("[data-name='replay-bottom-toolbar']");
    if (!toolbar) return null;

    const candidates = Array.from(toolbar.querySelectorAll("button, div, span"))
      .filter(isVisibleElement)
      .filter((el) => getText(el) === "Select date")
      .map((el) => {
        let candidate = el;
        let parent = el.parentElement;
        while (parent && toolbar.contains(parent) && getText(parent) === "Select date") {
          candidate = parent;
          parent = parent.parentElement;
        }
        return candidate;
      });

    return candidates.sort((a, b) => visibleArea(b) - visibleArea(a))[0] ?? null;
  }

  function findVisibleElement(selector, predicate, root = document) {
    return Array.from(root.querySelectorAll(selector)).find((el) => {
      return isVisibleElement(el) && (!predicate || predicate(el));
    }) ?? null;
  }

  function isVisibleElement(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function visibleArea(el) {
    const rect = el.getBoundingClientRect();
    return rect.width * rect.height;
  }

  function getText(el) {
    return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function waitFor(fn, timeoutMs, errorMessage) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (fn()) {
          resolve();
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          reject(new Error(errorMessage));
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  function normalizeTimeText(timeText) {
    const match = String(timeText ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return "08:00";
    const hh = String(Number(match[1])).padStart(2, "0");
    return `${hh}:${match[2]}`;
  }

  function isValidTimeText(timeText) {
    const match = String(timeText ?? "").trim().match(/^(\d{2}):(\d{2})$/);
    if (!match) return false;
    return Number(match[1]) <= 23 && Number(match[2]) <= 59;
  }

  function sleepStep(ms) {
    return { kind: "sleep", ms };
  }

  async function runSteps(steps) {
    const response = await chrome.runtime.sendMessage({ type: "tvReplayRunSteps", steps });
    if (!response?.ok) throw new Error(response?.error || "Replay jump failed");
    return response;
  }

  async function runReplayApi(action, payload = {}) {
    const response = await chrome.runtime.sendMessage({ type: "tvReplayInternalApi", action, payload });
    if (!response?.ok) throw new Error(response?.error || "TradingView replay API failed");
    return response;
  }

  async function getReplayInfo() {
    return await runReplayApi("status");
  }

  function getSelectAllModifier() {
    return navigator.platform.toLowerCase().includes("mac") ? "meta" : "control";
  }

  function isValidYMD(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
  }

  function isReplayAtTarget(info, target, timeText) {
    const targetSeconds = Math.floor(zonedTimeToEpochMs(target, normalizeTimeText(timeText), info?.timeZone) / 1000);
    return isTargetEpoch(info?.currentEpoch, targetSeconds) || isTargetEpoch(info?.selectedEpoch, targetSeconds);
  }

  function isTargetEpoch(seconds, targetSeconds) {
    return Number.isFinite(seconds) && Math.abs(seconds - targetSeconds) < 60;
  }

  function zonedTimeToEpochMs(ymd, timeText, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    const dateMatch = String(ymd ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timeMatch = String(timeText ?? "08:00").match(/^(\d{2}):(\d{2})$/);
    if (!dateMatch || !timeMatch) return NaN;

    const targetYear = Number(dateMatch[1]);
    const targetMonth = Number(dateMatch[2]);
    const targetDay = Number(dateMatch[3]);
    const targetHour = Number(timeMatch[1]);
    const targetMinute = Number(timeMatch[2]);
    let epoch = Date.UTC(targetYear, targetMonth - 1, targetDay, targetHour, targetMinute, 0);

    for (let i = 0; i < 3; i++) {
      const parts = datePartsInZone(new Date(epoch), timeZone);
      const seen = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second)
      );
      const wanted = Date.UTC(targetYear, targetMonth - 1, targetDay, targetHour, targetMinute, 0);
      epoch -= seen - wanted;
    }

    return epoch;
  }

  function datePartsInZone(date, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  }

  function parseYMD(ymd) {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  function toYMD(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function nextBusinessDate(ymd, step, skipWeekends) {
    let d = parseYMD(ymd);
    do {
      d.setUTCDate(d.getUTCDate() + step);
    } while (skipWeekends && (d.getUTCDay() === 0 || d.getUTCDay() === 6));
    return toYMD(d);
  }

  function formatResolution(resolution) {
    if (resolution === null || resolution === undefined || resolution === "") return "?";
    const text = String(resolution);
    if (/^\d+$/.test(text)) {
      const minutes = Number(text);
      if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
      return `${minutes}m`;
    }
    return text;
  }

  window.addEventListener("keydown", (e) => {
    if (!e.altKey || !e.shiftKey) return;

    const key = e.key.toLowerCase();
    if (!["n", "p", "i", "h"].includes(key)) return;

    e.preventDefault();
    e.stopPropagation();

    if (key === "n") jump(1).catch(showError);
    if (key === "p") jump(-1).catch(showError);
    if (key === "i") syncCurrentDate().catch(showError);
    if (key === "h") togglePanel();
  }, true);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "tvReplayCommand") return;

    const command = msg.command;
    if (command === "tv-replay-next") jump(1).catch(showError);
    if (command === "tv-replay-prev") jump(-1).catch(showError);
    if (command === "tv-replay-init") syncCurrentDate().catch(showError);
    if (command === "tv-replay-toggle") togglePanel();
  });

  function showError(err) {
    console.error("TV Replay Jump error:", err);
    setStatus(`Error: ${err.message || err}`);
    alert(`TV Replay Jump error:\n${err.message || err}`);
  }

  function runSafely(fn) {
    Promise.resolve().then(fn).catch(showError);
  }
})();
