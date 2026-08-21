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
Regenerate professional icon/splash assets with:
- `npm run generate:brand-assets`

This updates:
- `assets/images/icon.png`
- `assets/images/splash-icon.png`
- `assets/images/favicon.png`
- `assets/images/android-icon-background.png`
- `assets/images/android-icon-foreground.png`
- `assets/images/android-icon-monochrome.png`
