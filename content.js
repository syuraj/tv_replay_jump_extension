(() => {
  const STORE_KEY = "tvReplayJumpState";
  const POINT_KEYS = ["selectDateButton", "dateField", "timeField", "okButton"];
  const DEFAULT_STATE = {
    points: {},
    currentDate: null,
    settings: {
      dateFormat: "MM/dd/yyyy",
      timeText: "08:00",
      skipWeekends: true
    }
  };

  let state = structuredClone(DEFAULT_STATE);
  let lastMouse = { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) };
  let panel;
  let statusEl;

  window.addEventListener("mousemove", (e) => {
    lastMouse = { x: Math.round(e.clientX), y: Math.round(e.clientY) };
  }, true);

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
      ...structuredClone(base),
      ...incoming,
      points: { ...base.points, ...(incoming.points ?? {}) },
      settings: { ...base.settings, ...(incoming.settings ?? {}) }
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
        <button id="tv-rj-set">Set Date</button>
        <button id="tv-rj-cal">Calibrate</button>
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
      #tv-rj-hide { grid-column: span 2; }
    `;

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(panel);

    statusEl = document.getElementById("tv-rj-status");
    document.getElementById("tv-rj-next").addEventListener("click", () => runSafely(() => jump(1)));
    document.getElementById("tv-rj-prev").addEventListener("click", () => runSafely(() => jump(-1)));
    document.getElementById("tv-rj-set").addEventListener("click", () => runSafely(setCurrentDate));
    document.getElementById("tv-rj-cal").addEventListener("click", () => runSafely(calibrate));
    document.getElementById("tv-rj-settings").addEventListener("click", () => runSafely(editSettings));
    document.getElementById("tv-rj-hide").addEventListener("click", () => panel.style.display = "none");
  }

  function updatePanel() {
    const stateLine = document.getElementById("tv-rj-state");
    if (!stateLine) return;

    stateLine.textContent = `Date: ${state.currentDate ?? "not set"}\nTime: ${state.settings.timeText} | Mode: auto`;
  }

  function setStatus(text) {
    if (!statusEl) statusEl = document.getElementById("tv-rj-status");
    if (statusEl) statusEl.textContent = text;
  }

  async function calibrate() {
    panel.style.display = "block";
    setStatus("No calibration needed. The extension now uses TradingView's replay date dialog.");
    alert("Calibration is no longer needed.\n\nUse Set Date to sync the extension date, then use Next 08:00 or Prev.");
  }

  function capturePoint(promptText) {
    setStatus(promptText);

    return new Promise((resolve) => {
      const handler = (e) => {
        if (e.key !== "F8") return;
        e.preventDefault();
        e.stopPropagation();
        window.removeEventListener("keydown", handler, true);
        const point = { x: lastMouse.x, y: lastMouse.y };
        setStatus(`Captured ${point.x}, ${point.y}`);
        resolve(point);
      };
      window.addEventListener("keydown", handler, true);
    });
  }

  async function setCurrentDate() {
    await loadState();
    const current = prompt(
      "Enter CURRENT replay session date as YYYY-MM-DD\nExample: 2024-05-13",
      state.currentDate ?? ""
    );
    if (current === null) return;
    const clean = current.trim();
    if (!isValidYMD(clean)) {
      alert("Bad date. Use YYYY-MM-DD, example: 2024-05-13");
      return;
    }
    state.currentDate = clean;
    await saveState();
    setStatus(`Current session date set to ${clean}.`);
  }

  async function editSettings() {
    await loadState();

    const dateFormat = prompt(
      "Date format to paste into TradingView:\nMM/dd/yyyy, yyyy-MM-dd, or dd/MM/yyyy",
      state.settings.dateFormat
    );
    if (dateFormat === null) return;

    const fmt = dateFormat.trim();
    if (!["MM/dd/yyyy", "yyyy-MM-dd", "dd/MM/yyyy"].includes(fmt)) {
      alert("Unsupported format. Use MM/dd/yyyy, yyyy-MM-dd, or dd/MM/yyyy.");
      return;
    }

    const timeText = prompt("Time text to paste into TradingView:", state.settings.timeText);
    if (timeText === null) return;

    const skip = confirm("Skip weekends? OK=yes, Cancel=no");

    state.settings.dateFormat = fmt;
    state.settings.timeText = timeText.trim() || "08:00";
    state.settings.skipWeekends = skip;
    await saveState();
    setStatus("Settings saved.");
  }

  async function jump(step) {
    await loadState();

    if (!isValidYMD(state.currentDate)) {
      await setCurrentDate();
      await loadState();
      if (!isValidYMD(state.currentDate)) return;
    }

    const target = nextBusinessDate(state.currentDate, step, state.settings.skipWeekends);
    const timeText = state.settings.timeText;

    setStatus(`Jumping to ${target} ${timeText}...`);

    await jumpWithReplayDialog(target, timeText);

    state.currentDate = target;
    await saveState();
    setStatus(`Done: ${target} ${timeText}`);
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

  function allPointsReady() {
    return POINT_KEYS.every((k) => {
      const point = getPoint(k);
      return point && Number.isFinite(point.x) && Number.isFinite(point.y);
    });
  }

  function getPoint(key) {
    if (key === "selectDateButton") return state.points.selectDateButton ?? state.points.replayMenu;
    return state.points[key];
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
    const hh = String(Math.min(23, Number(match[1]))).padStart(2, "0");
    return `${hh}:${match[2]}`;
  }

  function sleepStep(ms) {
    return { kind: "sleep", ms };
  }

  async function runSteps(steps) {
    const response = await chrome.runtime.sendMessage({ type: "tvReplayRunSteps", steps });
    if (!response?.ok) throw new Error(response?.error || "Replay jump failed");
    return response;
  }

  function getSelectAllModifier() {
    return navigator.platform.toLowerCase().includes("mac") ? "meta" : "control";
  }

  function isValidYMD(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
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

  function formatDateForTV(ymd, fmt) {
    const [yyyy, mm, dd] = ymd.split("-");
    if (fmt === "yyyy-MM-dd") return `${yyyy}-${mm}-${dd}`;
    if (fmt === "dd/MM/yyyy") return `${dd}/${mm}/${yyyy}`;
    return `${mm}/${dd}/${yyyy}`;
  }

  window.addEventListener("keydown", (e) => {
    if (!e.altKey || !e.shiftKey) return;

    const key = e.key.toLowerCase();
    if (!["j", "p", "i", "c"].includes(key)) return;

    e.preventDefault();
    e.stopPropagation();

    if (key === "j") jump(1).catch(showError);
    if (key === "p") jump(-1).catch(showError);
    if (key === "i") setCurrentDate().catch(showError);
    if (key === "c") calibrate().catch(showError);
  }, true);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "tvReplayCommand") return;

    const command = msg.command;
    if (command === "tv-replay-next") jump(1).catch(showError);
    if (command === "tv-replay-prev") jump(-1).catch(showError);
    if (command === "tv-replay-init") setCurrentDate().catch(showError);
    if (command === "tv-replay-calibrate") calibrate().catch(showError);
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
