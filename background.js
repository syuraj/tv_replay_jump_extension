const CDP_VERSION = "1.3";

function chromeCall(fn) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome debugger command timed out.")), 15000);
    try {
      fn((result) => {
        clearTimeout(timer);
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(result);
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

function attach(tabId) {
  return chromeCall((cb) => chrome.debugger.attach({ tabId }, CDP_VERSION, cb));
}

function detach(tabId) {
  return chromeCall((cb) => chrome.debugger.detach({ tabId }, cb)).catch(() => undefined);
}

function send(tabId, method, params = {}) {
  return chromeCall((cb) => chrome.debugger.sendCommand({ tabId }, method, params, cb));
}

function storageGet(key) {
  return chromeCall((cb) => chrome.storage.local.get(key, cb));
}

function storageSet(obj) {
  return chromeCall((cb) => chrome.storage.local.set(obj, cb));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cdpClick(tabId, x, y) {
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none",
    buttons: 0
  });
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1
  });
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 0,
    clickCount: 1
  });
}

async function cdpSelectAll(tabId, modifier = "control") {
  const isMeta = modifier === "meta";
  const modKey = isMeta ? "Meta" : "Control";
  const modCode = isMeta ? "MetaLeft" : "ControlLeft";
  const modVirtualKey = isMeta ? 91 : 17;
  const modMask = isMeta ? 4 : 2;

  await send(tabId, "Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: modKey,
    code: modCode,
    windowsVirtualKeyCode: modVirtualKey,
    nativeVirtualKeyCode: modVirtualKey,
    modifiers: modMask,
    commands: []
  });
  await send(tabId, "Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "A",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: modMask,
    commands: ["selectAll"]
  });
  await send(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "A",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: modMask
  });
  await send(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: modKey,
    code: modCode,
    windowsVirtualKeyCode: modVirtualKey,
    nativeVirtualKeyCode: modVirtualKey,
    modifiers: 0
  });
}

function keyParams(ch) {
  if (/^\d$/.test(ch)) {
    return {
      key: ch,
      code: `Digit${ch}`,
      windowsVirtualKeyCode: ch.charCodeAt(0),
      nativeVirtualKeyCode: ch.charCodeAt(0),
      text: ch,
      unmodifiedText: ch
    };
  }

  if (ch === "-") {
    return {
      key: "-",
      code: "Minus",
      windowsVirtualKeyCode: 189,
      nativeVirtualKeyCode: 189,
      text: "-",
      unmodifiedText: "-"
    };
  }

  if (ch === ":") {
    return {
      key: ":",
      code: "Semicolon",
      windowsVirtualKeyCode: 186,
      nativeVirtualKeyCode: 186,
      text: ":",
      unmodifiedText: ":"
    };
  }

  const upper = ch.toUpperCase();
  return {
    key: upper,
    code: `Key${upper}`,
    windowsVirtualKeyCode: upper.charCodeAt(0),
    nativeVirtualKeyCode: upper.charCodeAt(0),
    text: ch,
    unmodifiedText: ch
  };
}

async function cdpTypeText(tabId, text) {
  for (const ch of String(text ?? "")) {
    const params = {
      ...keyParams(ch),
      type: "keyDown",
      modifiers: 0,
      commands: [],
      autoRepeat: false,
      location: 0,
      isKeypad: false
    };
    await send(tabId, "Input.dispatchKeyEvent", params);
    await send(tabId, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: params.key,
      code: params.code,
      windowsVirtualKeyCode: params.windowsVirtualKeyCode,
      nativeVirtualKeyCode: params.nativeVirtualKeyCode,
      modifiers: 0,
      location: 0
    });
  }
}

async function runSteps(tabId, steps) {
  await attach(tabId);
  try {
    for (const step of steps) {
      if (step.kind === "click") {
        await cdpClick(tabId, step.x, step.y);
      } else if (step.kind === "sleep") {
        await sleep(step.ms ?? 250);
      } else if (step.kind === "selectAll") {
        await cdpSelectAll(tabId, step.modifier);
      } else if (step.kind === "type") {
        await cdpTypeText(tabId, step.text);
      } else {
        throw new Error(`Unknown step kind: ${step.kind}`);
      }
    }
  } finally {
    await detach(tabId);
  }
}

async function evaluate(tabId, expression) {
  await attach(tabId);
  try {
    const result = await send(tabId, "Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: 10000
    });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error(details || "TradingView runtime evaluation failed.");
    }
    return result.result?.value;
  } finally {
    await detach(tabId);
  }
}

function replayApiExpression(action, payload = {}) {
  return `(${async function (action, payload) {
    const api = window.TradingViewApi?._replayApi;
    if (!api) {
      return { ok: false, error: "TradingView internal replay API not found." };
    }

    const watchedValue = (value) => {
      if (value && typeof value.value === "function") return value.value();
      return value;
    };

    const activeWidget = () => {
      const collection = window._exposed_chartWidgetCollection || api._chartWidgetsCollection;
      const widgetValue = collection?.activeChartWidget;
      return watchedValue(widgetValue) || null;
    };

    const chartTimeZone = () => {
      try {
        return activeWidget()?.getTimezone?.() || Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch (err) {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
    };

    const datePartsInZone = (date, timeZone) => {
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
    };

    const epochSecondsToYMD = (seconds, timeZone) => {
      if (!Number.isFinite(seconds)) return null;
      const parts = datePartsInZone(new Date(seconds * 1000), timeZone);
      return `${parts.year}-${parts.month}-${parts.day}`;
    };

    const epochSecondsToYMDHM = (seconds, timeZone) => {
      if (!Number.isFinite(seconds)) return null;
      const parts = datePartsInZone(new Date(seconds * 1000), timeZone);
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const isTargetEpoch = (seconds, targetSeconds) => {
      return Number.isFinite(seconds) && Math.abs(seconds - targetSeconds) < 60;
    };

    const waitForReplayTarget = async (targetSeconds) => {
      const started = Date.now();
      while (Date.now() - started < 7000) {
        const currentEpoch = watchedValue(api.currentDate?.());
        const selectedEpoch = watchedValue(api.getReplaySelectedDate?.());
        if (isTargetEpoch(currentEpoch, targetSeconds) || isTargetEpoch(selectedEpoch, targetSeconds)) return true;
        await sleep(150);
      }
      return false;
    };

    const zonedTimeToEpochMs = (ymd, timeText, timeZone) => {
      const dateMatch = String(ymd ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const timeMatch = String(timeText ?? "08:00").match(/^(\d{2}):(\d{2})$/);
      if (!dateMatch || !timeMatch) throw new Error("Bad replay date/time.");

      const target = {
        year: Number(dateMatch[1]),
        month: Number(dateMatch[2]),
        day: Number(dateMatch[3]),
        hour: Number(timeMatch[1]),
        minute: Number(timeMatch[2]),
        second: 0
      };
      let epoch = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, 0);
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
        const wanted = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);
        epoch -= seen - wanted;
      }
      return epoch;
    };

    const status = () => {
      const widget = activeWidget();
      const timeZone = chartTimeZone();
      const currentEpoch = watchedValue(api.currentDate?.());
      const selectedEpoch = watchedValue(api.getReplaySelectedDate?.());
      const depthEpoch = watchedValue(api.getReplayDepth?.());
      return {
        ok: true,
        available: watchedValue(api.isReplayAvailable?.()),
        ready: watchedValue(api.isReadyToPlay?.()),
        toolbarVisible: watchedValue(api.isReplayToolbarVisible?.()),
        started: watchedValue(api.isReplayStarted?.()),
        symbol: api.symbolInfo ? watchedValue(api.symbolInfo())?.symbol : widget?.getSymbol?.(),
        resolution: widget?.getResolution?.() || watchedValue(api.autoReplayResolution?.()),
        replayResolution: watchedValue(api.currentReplayResolution?.()) || watchedValue(api.autoReplayResolution?.()),
        timeZone,
        currentEpoch,
        currentDate: epochSecondsToYMD(currentEpoch, timeZone),
        currentDateTime: epochSecondsToYMDHM(currentEpoch, timeZone),
        selectedEpoch,
        selectedDate: epochSecondsToYMD(selectedEpoch, timeZone),
        selectedDateTime: epochSecondsToYMDHM(selectedEpoch, timeZone),
        firstAvailableEpoch: depthEpoch,
        firstAvailableDate: epochSecondsToYMD(depthEpoch, timeZone),
        firstAvailableDateTime: epochSecondsToYMDHM(depthEpoch, timeZone)
      };
    };

    if (action === "status") return status();

    if (action === "selectFirstAvailable") {
      await api.selectFirstAvailableDate();
      return status();
    }

    if (action === "selectDate") {
      const timeZone = chartTimeZone();
      const epochMs = zonedTimeToEpochMs(payload.ymd, payload.timeText, timeZone);
      const targetSeconds = Math.floor(epochMs / 1000);
      await api.selectDate(epochMs);
      if (await waitForReplayTarget(targetSeconds)) return status();

      const info = status();
      return {
        ...info,
        ok: false,
        error: `TradingView did not move to ${payload.ymd} ${payload.timeText}. Current replay point: ${info.currentDateTime || "unknown"}.`
      };
    }

    throw new Error(`Unknown replay API action: ${action}`);
  }})(${JSON.stringify(action)}, ${JSON.stringify(payload)})`;
}

async function runReplayApi(tabId, action, payload) {
  const result = await evaluate(tabId, replayApiExpression(action, payload));
  if (!result?.ok) throw new Error(result?.error || "TradingView replay API failed.");
  return result;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "tvReplayStorageGet") {
      return await storageGet(msg.key);
    }

    if (msg?.type === "tvReplayStorageSet") {
      await storageSet(msg.value ?? {});
      return { ok: true };
    }

    if (msg?.type === "tvReplayRunSteps") {
      const tabId = sender?.tab?.id ?? msg.tabId;
      if (!tabId) throw new Error("No active TradingView tab id found.");
      await runSteps(tabId, msg.steps ?? []);
      return { ok: true };
    }

    if (msg?.type === "tvReplayInternalApi") {
      const tabId = sender?.tab?.id ?? msg.tabId;
      if (!tabId) throw new Error("No active TradingView tab id found.");
      return await runReplayApi(tabId, msg.action, msg.payload ?? {});
    }

    throw new Error(`Unknown message type: ${msg?.type}`);
  })()
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "tvReplayCommand", command }).catch(() => undefined);
});
