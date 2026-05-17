# TradingView Replay Session Jumper

Local Chrome extension helper for jumping TradingView Bar Replay to the next configured session time.

## Install

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this folder: `tv_replay_jump_chrome`.

## Use

1. Open TradingView chart in Chrome or Opera.
2. Start Bar Replay and choose the initial replay point in TradingView.
3. Click **Next 08:00** or press `Alt+Shift+N`; the extension reads the current replay date automatically.
4. Use **Prev** or press `Alt+Shift+P` to move backward one session.
5. Press `Alt+Shift+H` to show or hide the overlay.

## Settings

- Default time: `08:00`
- Weekend skipping: on

Use **Settings** in the overlay to change the target time.

## Notes

The extension first uses TradingView's internal replay API through Chrome debugger `Runtime.evaluate`. If that fails, it falls back to the replay date dialog click/type sequence, then detaches the debugger.
