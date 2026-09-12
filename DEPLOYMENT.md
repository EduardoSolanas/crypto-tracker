# Expo CI/CD Setup

## Required accounts
- Expo account with access to this project
- Apple Developer account (for iOS release)
- Google Play Console account (for Android release)

## Required GitHub secrets
- `EXPO_TOKEN`: Expo access token used by GitHub Actions

Create it in Expo dashboard:
1. Expo account settings -> Access Tokens
2. Create token
3. Add to GitHub repository settings -> Secrets and variables -> Actions

## One-time local setup
1. Login and link project:
   - `npx eas-cli login`
   - `npx eas-cli project:info`
2. Ensure credentials are configured:
   - `npx eas-cli credentials`
3. Validate config:
   - `npx eas-cli build:configure`

## Workflows
- `CI` (`.github/workflows/ci.yml`): lint + tests on PR/push
- `EAS OTA Update` (`.github/workflows/eas-update.yml`): publishes updates to an EAS branch/channel (default: `production`)
- `EAS Build And Submit` (`.github/workflows/eas-build-submit.yml`): builds Android/iOS/all with `production` profile, optional auto-submit

## Typical release flow
1. Merge to `main` -> optional OTA update workflow run
2. Run `EAS Build And Submit` with:
   - `platform=android` / `ios` / `all`
   - `profile=production`
   - `auto_submit=true` when store credentials are already configured

## Branding assets
Android release builds enable R8 code shrinking, resource shrinking, and compressed
native libraries through `expo-build-properties` in `app.json`. Keep these settings
in the Expo config: the ignored local `android/` directory is regenerated in CI.
Native-library compression reduces the APK download size, but Android extracts
those libraries during installation, so installed size does not fall by the same
amount. All default CPU architectures remain supported. The production Play Store
bundle allows Google Play to deliver only the libraries needed by each device;
the preview APK is universal. Measure the next native build to confirm its size
and smoke-test launch, charts, CSV import, and sharing with release shrinking enabled.

Android uses a transparent native splash drawable on a dark background, avoiding
the system's circular crop of the branding artwork. While the home screen loads,
`StartupScreen` displays `assets/images/branding-source.png` in a full-screen,
opaque view. Aspect-fit scaling keeps the complete CryptoTracker name visible,
with a dark background filling any remaining space. No artificial delay is added.

Verify launch-screen changes in a new native preview or production build (for
example, `npx eas-cli build --platform android --profile preview`). OTA updates and
Metro reloads cannot update the native launch screen. Expo Go and development
clients have their own loading overlays, which can display a circular app icon
and do not accurately preview this screen.

Regenerate professional icon/splash assets with:
- `npm run generate:brand-assets`

This updates:
- `assets/images/icon.png`
- `assets/images/splash-icon.png`
- `assets/images/favicon.png`
- `assets/images/android-icon-background.png`
- `assets/images/android-icon-foreground.png`
- `assets/images/android-icon-monochrome.png`
