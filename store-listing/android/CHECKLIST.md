# Google Play Upload Checklist

## 1) Play Console fields
- App name: from `store-listing/android/en-US.md`
- Short description: from `store-listing/android/en-US.md`
- Full description: from `store-listing/android/en-US.md`

## 2) Graphics (Main Store Listing)
Use images from your selected brand pack in `assets/branding-variants/<variant>/`.

Required:
- App icon (512 x 512 PNG):
  - `assets/images/play-store-icon-512.png`

Recommended:
- Feature graphic (1024 x 500 PNG/JPG):
  - Create from same style direction before publish (not generated yet)

Screenshots (phone):
- At least 2 screenshots required
- PNG or JPEG
- 320 px to 3840 px on each side
- Aspect ratio between 16:9 and 9:16

## 3) What is already configured for app builds
- Android package id in app config:
  - `com.belcebuu.CryptoPortfolio`
- Runtime icon/splash/adaptive icon assets under `assets/images/`

## 4) Where to register app in Play Console
- Go to Google Play Console -> All apps -> Create app
- Fill app details (name, default language, app/game, free/paid)
- Open "Grow -> Store presence -> Main store listing"
- Paste text from `store-listing/android/en-US.md`
- Upload icon + screenshots + feature graphic

## 5) Release flow (Android)
- Run GitHub Action: `EAS Build And Submit`
  - platform: `android`
  - profile: `production`
  - auto_submit: `true` (only after Play credentials are configured in EAS)
