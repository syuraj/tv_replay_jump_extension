# TradingView Replay Session Jumper

Local Chrome extension helper for jumping TradingView Bar Replay to the next configured session time.

## Install

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this folder: `tv_replay_jump_chrome`.

## Use

1. Open TradingView chart in Chrome.
2. Start Bar Replay. The extension will open the replay toolbar if it is hidden.
3. Click **Set Date** and enter the current replay session date as `YYYY-MM-DD`.
4. Click **Next 08:00** or press `Alt+Shift+N`.
5. Use **Prev** or press `Alt+Shift+P` to move backward one session.
6. Press `Alt+Shift+H` to show or hide the overlay.

## Settings

- Default time: `08:00`
- Weekend skipping: on

Use **Settings** in the overlay to change the target time.

## Notes

This extension uses the Chrome debugger API only while executing the click/type sequence, then detaches. Chrome may show a temporary warning that the extension is debugging the browser.
