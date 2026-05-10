# Repository Guidelines

## Project Structure & Module Organization

This repository is a local Chrome Manifest V3 extension for TradingView Bar Replay session jumps.

- `manifest.json`: extension metadata, permissions, content script registration, and keyboard commands.
- `background.js`: service worker that attaches Chrome debugger, dispatches click/type CDP input, and forwards command shortcuts to the active tab.
- `content.js`: TradingView overlay UI, replay date dialog automation, date math, state persistence, and message calls into the background worker.
- `README.md`: user install and usage instructions.

There is no build output directory, bundled asset tree, or test directory in the current repo.

## Build, Test, and Development Commands

- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"`: validate `manifest.json` syntax before loading the extension.
- `chrome://extensions`: enable Developer mode, click **Load unpacked**, and select this repository folder.
- Reload the extension from `chrome://extensions` after editing `manifest.json`, `background.js`, or `content.js`.

Manual smoke test: open `https://www.tradingview.com/`, start Bar Replay, set a `YYYY-MM-DD` date, then test `Alt+Shift+J`, `Alt+Shift+P`, and `Alt+Shift+I`.

## Coding Style & Naming Conventions

Use plain JavaScript with two-space indentation and semicolons, matching the existing files. Prefer small functions with explicit names such as `cdpClick`, `runSteps`, `nextBusinessDate`, and `findReplayDateButton`. Keep Chrome message types stable and namespaced with `tvReplay...`.

Avoid adding dependencies or build tooling unless the extension clearly needs it. Keep user-facing overlay text short because it renders inside TradingView.

## Testing Guidelines

There is no automated test framework yet. For logic-only changes, add small pure functions where practical so they can later be tested without Chrome APIs. For behavior changes, verify in Chrome against TradingView and note the tested browser, target page, and shortcut or button path.

## Commit & Pull Request Guidelines

The current history uses short, lowercase imperative summaries, for example `first commit, extension for tv replay jump`. Keep commits concise and focused.

Pull requests should describe the changed replay workflow, list manual Chrome validation steps, and include screenshots or screen recordings for overlay UI changes. Call out any permission changes in `manifest.json`.

## Security & Configuration Tips

The extension requests `debugger`, `tabs`, `activeTab`, `storage`, and `https://www.tradingview.com/*`. Do not broaden host permissions without a concrete need. The debugger API should attach only for the click/type sequence and detach in `finally`.
