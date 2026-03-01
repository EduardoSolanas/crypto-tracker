# CryptoPortfolio

Mobile crypto portfolio tracker built with Expo + React Native.

## What It Does
- Imports transaction history from CSV and stores it locally.
- Recomputes holdings from transactions (single source of truth).
- Fetches live prices and renders portfolio + per-coin charts for `1H/1D/1W/1M/1Y/ALL`.
- Calculates cost basis, realized gains, and total gains per coin.
- Exports transactions back to CSV.

## Tech Stack
- Expo SDK 54 / React Native 0.81 / React 19
- Expo Router for navigation
- `expo-sqlite` (native) and in-memory web DB adapter
- `react-native-wagmi-charts` for line/candlestick graphs
- Jest + React Native Testing Library

## Project Structure
- `app/`: Route screens (`/`, `/coin/[symbol]`, `/add-transaction`, `/settings`)
- `src/db.native.js`, `src/db.web.js`: Data persistence layer
- `src/csv.js`: CSV parsing/export and import validation report
- `src/cryptoCompare.js`: Market data + FX conversion rates
- `src/utils/transactionCalculations.js`: Cost basis and gain logic
- `src/components/CryptoGraph.js`: Shared chart component

## Data Model
### `transactions`
- `id`
- `date_iso` (UTC ISO)
- `way` (`BUY|SELL|DEPOSIT|WITHDRAW|RECEIVE|SEND`)
- `symbol`
- `amount`
- `quote_amount`
- `quote_currency`

### `holdings`
- `symbol`
- `quantity`

Holdings are recomputed from transactions after insert/update/delete to prevent drift.

## Local Setup
1. Install dependencies
```bash
npm install
```
2. Start dev server
```bash
npm run start
```
3. Android build/run
```bash
npm run android
```

## Quality Commands
- Lint: `npm run lint`
- Tests: `npm test -- --runInBand`
- Generate branding assets: `npm run generate:brand-assets`

## CI/CD (GitHub Actions + Expo EAS)
- `CI`: runs lint and tests on push/PR.
- `EAS OTA Update`: publishes over-the-air updates to Expo EAS Update branch/channel.
- `EAS Build And Submit`: builds Android/iOS release artifacts and can auto-submit to stores.

Detailed setup (secrets, credentials, release flow): see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Known Limitations
- Chart/test runs can print React `act(...)` warnings from async effect timing in component tests (tests still pass).
- FX conversion for mixed quote currencies depends on external rate availability; missing rates are treated as non-convertible for deterministic results.
- Web DB is in-memory only (intended for development/testing).
