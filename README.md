# SimpleBudget

A lightweight, iPhone-optimized Progressive Web App (PWA) for tracking monthly expenses against an annual budget.

## Features

- **Large remaining balance** displayed prominently on the main screen
- **Quick transaction entry** with preset amount buttons ($5, $10, $20, $50, $100)
- **Income & expense** tracking
- **Automatic monthly reset** — when a new month starts, the budget resets and the old month is archived
- **Monthly history** tab showing up to two years (last year + current year)
- **Settings** — set annual budget with auto-calculated monthly goal, or set a custom monthly goal
- **Export / Import** via JSON file (includes all settings, transactions, and history)
- **Light & dark mode** — automatically follows iPhone system theme
- **Offline support** — installable as a PWA, works without internet

## How to Use

### Install on iPhone
1. Open the app URL in Safari
2. Tap the Share button → **Add to Home Screen**
3. The app works fully offline after the first visit

### Adding Transactions
- Enter the amount (tap quick buttons for common amounts)
- Add an optional description
- Tap **Add Expense** (or switch to Income mode)

### Monthly Reset
- On the first open of a new month, the budget automatically resets
- Previous month is archived in the **History** tab
- History is kept for the last year and current year only

### Export / Import
- Go to **Settings** → **Export to JSON** to save a backup
- Go to **Settings** → **Import from JSON** to restore from a backup

## Tech Stack

- Vanilla HTML/CSS/JavaScript — no frameworks, no dependencies
- LocalStorage for data persistence
- Service Worker for offline/PWA support
- CSS `prefers-color-scheme` for automatic dark mode

## License

MIT
