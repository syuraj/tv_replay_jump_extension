# Repository Guidelines

## Project Structure & Module Organization

Local Chrome/Opera MV3 extension for TradingView Bar Replay session jumps.

- `manifest.json`: metadata, permissions, content script registration, and keyboard commands.
- `background.js`: service worker for debugger attachment, CDP input, storage fallback, and command forwarding.
- `content.js`: TradingView overlay UI, replay date dialog automation, date math, state persistence, and background messages.
- `README.md`: install and usage instructions.

## Build, Test, and Development Commands

- `node --check background.js && node --check content.js`: check JavaScript syntax.
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"`: check `manifest.json`.
- `chrome://extensions`: enable Developer mode, click **Load unpacked**, and select this repository folder.
- Reload the unpacked extension after editing `manifest.json`, `background.js`, or `content.js`.

Manual smoke test: open TradingView, start Bar Replay, set a `YYYY-MM-DD` date, then test `Alt+Shift+N`, `Alt+Shift+P`, `Alt+Shift+I`, and `Alt+Shift+H`.

## Coding Style & Naming Conventions

Use plain JavaScript with two-space indentation and semicolons. Prefer small functions such as `cdpClick`, `runSteps`, `nextBusinessDate`, and `findReplayDateButton`. Keep Chrome message types stable and namespaced with `tvReplay...`.

Avoid dependencies or build tooling unless clearly needed. Keep overlay text short because it renders inside TradingView.

## TradingView Automation Notes

Do not assume TradingView's public Charting Library APIs are available on `tradingview.com` Supercharts. `setVisibleRange` changes embedded-widget viewport, not Bar Replay state. Use the replay-dialog path unless live testing proves a stable internal API exists.

The replay date dialog can reset fields to the current date when opened. Automation must set both date and time before submitting. Current flow: open toolbar, click **Select date**, fill date/time through CDP key events, submit, then detach.

Settings stay minimal: target time defaults to `08:00`, and weekend skipping is optional. Do not reintroduce calibration or date-format settings without a verified need.

## Testing Guidelines

There is no automated test framework yet. Keep logic pure where practical. For behavior changes, verify in Chrome or Opera against TradingView and note the browser, target page, and shortcut or button path.

## Commit & Pull Request Guidelines

History uses short, lowercase imperative summaries, for example `first commit, extension for tv replay jump`. Keep commits focused.

Pull requests should describe replay workflow changes, list manual browser validation, and include screenshots or recordings for overlay UI changes. Call out `manifest.json` permission changes.

## Security & Configuration Tips

Current permissions are `debugger`, `tabs`, `activeTab`, `storage`, and `https://www.tradingview.com/*`. Do not broaden them without a concrete need. Attach debugger only for click/type sequences and detach in `finally`.
