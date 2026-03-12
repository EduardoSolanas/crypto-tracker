import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, 'assets', 'images');

function renderSvgToPng(svg, width, height, outPath) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: {
      loadSystemFonts: true,
    },
  });

  const pngData = resvg.render({ width, height }).asPng();
  writeFileSync(outPath, pngData);
}

function buildMainIconSvg() {
  return `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="35%" cy="20%" r="100%">
      <stop offset="0%" stop-color="#203A62"/>
      <stop offset="45%" stop-color="#12243E"/>
      <stop offset="100%" stop-color="#070F1E"/>
    </radialGradient>
    <linearGradient id="coinOuter" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE68A"/>
      <stop offset="100%" stop-color="#F59E0B"/>
    </linearGradient>
    <linearGradient id="coinInner" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#13243B"/>
      <stop offset="100%" stop-color="#0A1424"/>
    </linearGradient>
    <linearGradient id="chartGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#22C55E"/>
      <stop offset="100%" stop-color="#4ADE80"/>
    </linearGradient>
    <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="drop" x="-20%" y="-20%" width="150%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="512" cy="512" r="328" fill="#4ADE80" opacity="0.10" filter="url(#softGlow)"/>

  <rect x="170" y="170" width="684" height="684" rx="170" fill="#EDF5FF" filter="url(#drop)"/>

  <circle cx="512" cy="512" r="245" fill="url(#coinOuter)"/>
  <circle cx="512" cy="512" r="200" fill="url(#coinInner)"/>

  <!-- Premium chart motif -->
  <line x1="390" y1="610" x2="390" y2="455" stroke="url(#chartGrad)" stroke-width="14" stroke-linecap="round"/>
  <rect x="371" y="500" width="38" height="84" rx="8" fill="url(#chartGrad)"/>

  <line x1="475" y1="650" x2="475" y2="420" stroke="url(#chartGrad)" stroke-width="14" stroke-linecap="round"/>
  <rect x="456" y="460" width="38" height="152" rx="8" fill="url(#chartGrad)"/>

  <line x1="560" y1="590" x2="560" y2="380" stroke="url(#chartGrad)" stroke-width="14" stroke-linecap="round"/>
  <rect x="541" y="430" width="38" height="118" rx="8" fill="url(#chartGrad)"/>

  <path d="M340 700 L430 615 L512 560 L592 490 L680 410"
        fill="none" stroke="#A7F3D0" stroke-width="22"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="680" cy="410" r="18" fill="#A7F3D0"/>

  <!-- Subtle BTC sign -->
  <text x="515" y="555" text-anchor="middle" font-size="150" font-weight="700" fill="#F8FAFC" opacity="0.16" font-family="Arial, Helvetica, sans-serif">₿</text>
</svg>
`;
}

function buildAndroidBackgroundSvg() {
  return `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="35%" cy="20%" r="100%">
      <stop offset="0%" stop-color="#203A62"/>
      <stop offset="45%" stop-color="#12243E"/>
      <stop offset="100%" stop-color="#070F1E"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
</svg>
`;
}

function buildAndroidForegroundSvg(color) {
  return `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect x="170" y="170" width="684" height="684" rx="170" fill="${color.base}"/>
  <circle cx="512" cy="512" r="245" fill="${color.accent}"/>
  <circle cx="512" cy="512" r="200" fill="${color.base}"/>
  <line x1="390" y1="610" x2="390" y2="455" stroke="${color.accent}" stroke-width="14" stroke-linecap="round"/>
  <rect x="371" y="500" width="38" height="84" rx="8" fill="${color.accent}"/>
  <line x1="475" y1="650" x2="475" y2="420" stroke="${color.accent}" stroke-width="14" stroke-linecap="round"/>
  <rect x="456" y="460" width="38" height="152" rx="8" fill="${color.accent}"/>
  <line x1="560" y1="590" x2="560" y2="380" stroke="${color.accent}" stroke-width="14" stroke-linecap="round"/>
  <rect x="541" y="430" width="38" height="118" rx="8" fill="${color.accent}"/>
  <path d="M340 700 L430 615 L512 560 L592 490 L680 410"
        fill="none" stroke="${color.accent}" stroke-width="22"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="680" cy="410" r="18" fill="${color.accent}"/>
</svg>
`;
}

function main() {
  const iconSvg = buildMainIconSvg();
  const bgSvg = buildAndroidBackgroundSvg();
  const fgSvg = buildAndroidForegroundSvg({ base: '#F4FBFF', accent: '#22C55E' });
  const monoSvg = buildAndroidForegroundSvg({ base: '#FFFFFF', accent: '#FFFFFF' });

  renderSvgToPng(iconSvg, 1024, 1024, resolve(OUT_DIR, 'icon.png'));
  renderSvgToPng(iconSvg, 512, 512, resolve(OUT_DIR, 'splash-icon.png'));
  renderSvgToPng(iconSvg, 192, 192, resolve(OUT_DIR, 'favicon.png'));

  renderSvgToPng(bgSvg, 1024, 1024, resolve(OUT_DIR, 'android-icon-background.png'));
  renderSvgToPng(fgSvg, 1024, 1024, resolve(OUT_DIR, 'android-icon-foreground.png'));
  renderSvgToPng(monoSvg, 1024, 1024, resolve(OUT_DIR, 'android-icon-monochrome.png'));

  console.log('Generated brand assets in assets/images');
}

main();
