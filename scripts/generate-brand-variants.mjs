import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const ROOT = process.cwd();
const OUT_ROOT = resolve(ROOT, 'assets', 'branding-variants');

const variants = [
  {
    id: 'institutional',
    name: 'Institutional',
    bg0: '#1B3B63',
    bg1: '#0F2743',
    bg2: '#081526',
    card: '#F3F8FF',
    ring: '#38BDF8',
    ringInner: '#0A1A2E',
    chart: '#22C55E',
    line: '#86EFAC',
    symbol: '#CFE8FF',
    adaptiveBg0: '#193559',
    adaptiveBg1: '#0A1626',
  },
  {
    id: 'retail-friendly',
    name: 'Retail-friendly',
    bg0: '#2F5B9A',
    bg1: '#1C3870',
    bg2: '#0F1F42',
    card: '#F6F8FF',
    ring: '#F59E0B',
    ringInner: '#13203A',
    chart: '#22C55E',
    line: '#FCD34D',
    symbol: '#FFE7B3',
    adaptiveBg0: '#274D86',
    adaptiveBg1: '#101E3A',
  },
  {
    id: 'dark-premium',
    name: 'Dark-premium',
    bg0: '#1C2230',
    bg1: '#0F131D',
    bg2: '#07090F',
    card: '#ECE7D8',
    ring: '#D4AF37',
    ringInner: '#0E121B',
    chart: '#10B981',
    line: '#FDE68A',
    symbol: '#F3E7BA',
    adaptiveBg0: '#1A202D',
    adaptiveBg1: '#080B12',
  },
];

function render(svg, width, height, outPath) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true },
  });
  const png = resvg.render({ width, height }).asPng();
  writeFileSync(outPath, png);
}

function iconSvg(v) {
  return `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="35%" cy="20%" r="100%">
      <stop offset="0%" stop-color="${v.bg0}"/>
      <stop offset="50%" stop-color="${v.bg1}"/>
      <stop offset="100%" stop-color="${v.bg2}"/>
    </radialGradient>
    <filter id="drop" x="-20%" y="-20%" width="150%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="512" cy="512" r="330" fill="${v.chart}" opacity="0.08"/>

  <rect x="170" y="170" width="684" height="684" rx="170" fill="${v.card}" filter="url(#drop)"/>

  <circle cx="512" cy="512" r="245" fill="${v.ring}"/>
  <circle cx="512" cy="512" r="200" fill="${v.ringInner}"/>

  <line x1="390" y1="610" x2="390" y2="455" stroke="${v.chart}" stroke-width="14" stroke-linecap="round"/>
  <rect x="371" y="500" width="38" height="84" rx="8" fill="${v.chart}"/>
  <line x1="475" y1="650" x2="475" y2="420" stroke="${v.chart}" stroke-width="14" stroke-linecap="round"/>
  <rect x="456" y="460" width="38" height="152" rx="8" fill="${v.chart}"/>
  <line x1="560" y1="590" x2="560" y2="380" stroke="${v.chart}" stroke-width="14" stroke-linecap="round"/>
  <rect x="541" y="430" width="38" height="118" rx="8" fill="${v.chart}"/>

  <path d="M340 700 L430 615 L512 560 L592 490 L680 410"
        fill="none" stroke="${v.line}" stroke-width="22"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="680" cy="410" r="18" fill="${v.line}"/>

  <text x="515" y="555" text-anchor="middle" font-size="150" font-weight="700" fill="${v.symbol}" opacity="0.20" font-family="Arial, Helvetica, sans-serif">?</text>
</svg>
`;
}

function bgSvg(v) {
  return `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="35%" cy="20%" r="100%">
      <stop offset="0%" stop-color="${v.adaptiveBg0}"/>
      <stop offset="100%" stop-color="${v.adaptiveBg1}"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
</svg>
`;
}

function fgSvg(v, mono = false) {
  const base = mono ? '#FFFFFF' : v.card;
  const accent = mono ? '#FFFFFF' : v.chart;
  return `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect x="170" y="170" width="684" height="684" rx="170" fill="${base}"/>
  <circle cx="512" cy="512" r="245" fill="${accent}"/>
  <circle cx="512" cy="512" r="200" fill="${base}"/>
  <line x1="390" y1="610" x2="390" y2="455" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>
  <rect x="371" y="500" width="38" height="84" rx="8" fill="${accent}"/>
  <line x1="475" y1="650" x2="475" y2="420" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>
  <rect x="456" y="460" width="38" height="152" rx="8" fill="${accent}"/>
  <line x1="560" y1="590" x2="560" y2="380" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>
  <rect x="541" y="430" width="38" height="118" rx="8" fill="${accent}"/>
  <path d="M340 700 L430 615 L512 560 L592 490 L680 410" fill="none" stroke="${accent}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="680" cy="410" r="18" fill="${accent}"/>
</svg>
`;
}

for (const v of variants) {
  const dir = resolve(OUT_ROOT, v.id);
  mkdirSync(dir, { recursive: true });
  render(iconSvg(v), 1024, 1024, resolve(dir, 'icon.png'));
  render(iconSvg(v), 512, 512, resolve(dir, 'splash-icon.png'));
  render(iconSvg(v), 192, 192, resolve(dir, 'favicon.png'));
  render(bgSvg(v), 1024, 1024, resolve(dir, 'android-icon-background.png'));
  render(fgSvg(v, false), 1024, 1024, resolve(dir, 'android-icon-foreground.png'));
  render(fgSvg(v, true), 1024, 1024, resolve(dir, 'android-icon-monochrome.png'));
}

console.log('Generated 3 branding variants in assets/branding-variants');
