# E2E Tests — Maestro

Real end-to-end tests that run against the **actual app on a real Android emulator or device**.  
No mocks, no stubs — taps real UI, reads real text.

## Why Maestro?

| | Maestro | Detox |
|---|---|---|
| Setup | Install one CLI | Native build config required |
| Expo support | Works with dev client or Expo Go | Needs ejected build |
| Test format | Simple YAML | JavaScript |
| Speed | Fast (no build step) | Slower (requires build) |
| Windows | ✅ | ⚠️ |

## Prerequisites

| Tool | Min version | Check |
|---|---|---|
| Java | 11 | `java -version` |
| Android emulator or device | API 26+ | `adb devices` |
| Maestro CLI | 1.40+ | `maestro --version` |

## Install Maestro (Windows)

```powershell
# Option 1 — direct download (recommended)
$ver = "1.40.0"
curl.exe -L -o "$env:TEMP\maestro.zip" `
  "https://github.com/mobile-dev-inc/maestro/releases/download/cli-$ver/maestro.zip"
Expand-Archive "$env:TEMP\maestro.zip" -DestinationPath "$env:USERPROFILE\.maestro" -Force

# Add to PATH (run once, then restart your terminal)
$path = [Environment]::GetEnvironmentVariable("PATH","User")
if ($path -notlike "*\.maestro\maestro\bin*") {
    [Environment]::SetEnvironmentVariable("PATH", "$path;$env:USERPROFILE\.maestro\maestro\bin","User")
}
```

```powershell
# Option 2 — Scoop
scoop install maestro
```

Verify:

```powershell
maestro --version
# If PATH isn't refreshed yet:
& "$env:USERPROFILE\.maestro\maestro\bin\maestro.bat" --version
```

## Running the tests

### 1. Start the app on the emulator

```powershell
# Start your emulator, then:
cd CryptoPortfolio
npx expo run:android          # builds and installs the dev client
# OR if the dev client is already installed:
npx expo start --dev-client   # start the bundle server
```

### 2. Run all E2E flows

```powershell
npm run e2e
```

`npm run e2e` now runs a preflight guard first (`npm run e2e:preflight`) that checks:
- `maestro` and `adb` are available in PATH
- exactly one authorized Android target is connected
- no `unauthorized` devices are attached
- app package is installed on the selected target

The npm scripts also use a launcher (`scripts/run-maestro.mjs`) that:
- uses `maestro` from PATH when available
- falls back to `~/.maestro/maestro/bin/maestro.bat` on Windows
- sets `MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true` by default

### 3. Run a single flow

```powershell
npm run e2e:single -- e2e/02_add_transaction.yaml
```

### 4. Run by tag

```powershell
maestro test --include-tags smoke e2e/
```

## Test flows

| File | What it tests |
|---|---|
| `01_home_loads.yaml` | App opens, shows Portfolio + Assets + empty state |
| `02_add_transaction.yaml` | FAB → form → save → BTC appears in portfolio |
| `03_coin_screen.yaml` | Tap BTC → coin screen KPIs, chart, transaction list |
| `04_delete_transaction.yaml` | Open options → Delete → confirm → transaction gone |
| `05_chart_ranges.yaml` | Switch 1H / 1D / 1W range buttons on coin screen |

Later flows chain earlier ones with `runFlow:` so each suite starts fresh with
`launchApp: clearState: true`.

## Debugging

```powershell
# Watch the device screen in the Maestro Studio UI
maestro studio

# Verbose output
maestro test --debug e2e/02_add_transaction.yaml

# Take a screenshot mid-flow (add to YAML)
# - takeScreenshot: "after_save"
```

### Common preflight failure: unauthorized device

If you see an `unauthorized` phone in `adb devices`, disconnect it (or authorize it), then run:

```powershell
adb kill-server
adb start-server
adb devices
```

## CI (GitHub Actions)

Add to `.github/workflows/ci.yml` after the test job:

```yaml
e2e:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Install Maestro
      run: curl -Ls "https://get.maestro.mobile.dev" | bash
    - name: Start Android emulator
      uses: reactivecircus/android-emulator-runner@v2
      with:
        api-level: 33
        script: maestro test e2e/
```

