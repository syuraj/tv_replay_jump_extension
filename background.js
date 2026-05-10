const CDP_VERSION = "1.3";

function chromeCall(fn) {
  return new Promise((resolve, reject) => {
    fn((result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cdpClick(tabId, x, y) {
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none"
  });
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1
  });
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1
  });
}

async function cdpSelectAll(tabId) {
  await send(tabId, "Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Control",
    code: "ControlLeft",
    windowsVirtualKeyCode: 17,
    nativeVirtualKeyCode: 17,
    modifiers: 2
  });
  await send(tabId, "Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 2
  });
  await send(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 2
  });
  await send(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Control",
    code: "ControlLeft",
    windowsVirtualKeyCode: 17,
    nativeVirtualKeyCode: 17,
    modifiers: 0
  });
}

async function cdpInsertText(tabId, text) {
  await send(tabId, "Input.insertText", { text });
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
        await cdpSelectAll(tabId);
      } else if (step.kind === "type") {
        await cdpInsertText(tabId, String(step.text ?? ""));
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
