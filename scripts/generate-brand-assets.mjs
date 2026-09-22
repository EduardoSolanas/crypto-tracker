import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, 'assets', 'images');
const MARK_PATH = resolve(OUT_DIR, 'branding-mark-transparent.png');

function renderSvgToPng(svg, width, height, outPath) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  });

  const pngData = resvg.render({ width, height }).asPng();
  writeFileSync(outPath, pngData);
}

function imageDataUri(path) {
  return `data:image/png;base64,${readFileSync(path).toString('base64')}`;
}

function backgroundDefinition() {
  return `
    <defs>
      <radialGradient id="background" cx="32%" cy="18%" r="105%">
        <stop offset="0%" stop-color="#193456"/>
        <stop offset="48%" stop-color="#101F35"/>
        <stop offset="100%" stop-color="#070F1C"/>
      </radialGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#background)"/>
  `;
}

function buildMainIconSvg(markUri) {
  return `
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      ${backgroundDefinition()}
      <image href="${markUri}" x="0" y="0" width="1024" height="1024" preserveAspectRatio="xMidYMid meet"/>
    </svg>
  `;
}

function buildAndroidBackgroundSvg() {
  return `
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      ${backgroundDefinition()}
    </svg>
  `;
}

function buildAndroidForegroundSvg(markUri) {
  return `
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <image href="${markUri}" x="0" y="0" width="1024" height="1024" preserveAspectRatio="xMidYMid meet"/>
    </svg>
  `;
}

function buildAndroidMonochromeSvg(markUri) {
  return `
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="whiteSilhouette" color-interpolation-filters="sRGB">
          <feColorMatrix type="matrix" values="
            0 0 0 0 1
            0 0 0 0 1
            0 0 0 0 1
            0 0 0 1 0"/>
          <feComponentTransfer>
            <feFuncA type="discrete" tableValues="0 0 0 0 1 1 1 1 1 1"/>
          </feComponentTransfer>
        </filter>
      </defs>
      <image href="${markUri}" x="0" y="0" width="1024" height="1024"
             preserveAspectRatio="xMidYMid meet" filter="url(#whiteSilhouette)"/>
    </svg>
  `;
}

function main() {
  const markUri = imageDataUri(MARK_PATH);
  const iconSvg = buildMainIconSvg(markUri);
  const backgroundSvg = buildAndroidBackgroundSvg();
  const foregroundSvg = buildAndroidForegroundSvg(markUri);
  const monochromeSvg = buildAndroidMonochromeSvg(markUri);

  renderSvgToPng(iconSvg, 1024, 1024, resolve(OUT_DIR, 'icon.png'));
  renderSvgToPng(iconSvg, 512, 512, resolve(OUT_DIR, 'play-store-icon-512.png'));
  renderSvgToPng(iconSvg, 512, 512, resolve(OUT_DIR, 'splash-icon.png'));
  renderSvgToPng(iconSvg, 192, 192, resolve(OUT_DIR, 'favicon.png'));

  renderSvgToPng(backgroundSvg, 1024, 1024, resolve(OUT_DIR, 'android-icon-background.png'));
  renderSvgToPng(foregroundSvg, 1024, 1024, resolve(OUT_DIR, 'android-icon-foreground.png'));
  renderSvgToPng(monochromeSvg, 1024, 1024, resolve(OUT_DIR, 'android-icon-monochrome.png'));

  console.log('Generated safe-area brand assets in assets/images');
}

main();
