const CDP_VERSION = "1.3";

function chromeCall(fn) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome debugger command timed out.")), 5000);
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
