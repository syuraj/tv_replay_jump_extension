# TradingView Replay Session Jumper

Local Chrome extension helper for jumping TradingView Bar Replay to the next 08:00 session.

## Install

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this folder: `tv_replay_jump_chrome`.

## Use

1. Open TradingView chart in Chrome.
2. Start Bar Replay and make Replay controls visible.
3. Click **Calibrate** in the small overlay.
4. Hover over each requested UI element and press **F8**:
   - Replay timing/dropdown menu
   - Select date... menu item
   - Date input
   - Time input
   - OK / Apply / Go button
5. Click **Set Date** and enter the current replay session date as `YYYY-MM-DD`.
6. Click **Next 08:00** or press `Alt+Shift+J`.

## Settings

- Default date format: `MM/dd/yyyy`
- Default time: `08:00`
- Weekend skipping: on

Use **Settings** in the overlay to change date format/time.

## Notes

This extension uses the Chrome debugger API only while executing the click/type sequence, then detaches. Chrome may show a temporary warning that the extension is debugging the browser.
