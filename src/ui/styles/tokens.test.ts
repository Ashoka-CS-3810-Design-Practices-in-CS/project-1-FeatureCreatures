// The automated half of TEST_PLAN §7.1's contrast checklist: every text / background token pair the
// stylesheets use reaches WCAG AA (4.5:1) in both themes. The devtools pass on the live page
// remains a manual check.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOKENS_CSS = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const MIN_TEXT_CONTRAST = 4.5; // WCAG AA, body text
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
const CHANNEL_MAX = 255;
// WCAG 2 relative luminance: sRGB channels are linearised, then weighted by how bright each looks.
const LINEAR_THRESHOLD = 0.03928;
const LINEAR_SLOPE = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA = 2.4;
const RED_WEIGHT = 0.2126;
const GREEN_WEIGHT = 0.7152;
const BLUE_WEIGHT = 0.0722;
const LUMINANCE_OFFSET = 0.05; // flare term of the contrast ratio
const CHANNEL_OFFSETS = [1, 3, 5]; // where rr, gg and bb start in '#rrggbb'
const CHANNEL_DIGITS = 2;
const HEX_RADIX = 16;

// Foreground on background, as the stylesheets pair them.
const TEXT_PAIRS: [string, string][] = [
  ['text', 'bg'],
  ['text', 'surface'], // panels and toasts
  ['text', 'prio-high-bg'], // event text on each priority background
  ['text', 'prio-medium-bg'],
  ['text', 'prio-low-bg'],
  ['text', 'barred'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['muted', 'barred'], // barred-slot labels
  ['muted', 'nonwork'], // time labels beside non-working hours
  ['muted', 'prio-high-bg'], // the time line inside each event block
  ['muted', 'prio-medium-bg'],
  ['muted', 'prio-low-bg'],
  ['prio-high', 'prio-high-bg'], // [H]/[M]/[L] tags and pressed filter chips
  ['prio-medium', 'prio-medium-bg'],
  ['prio-low', 'prio-low-bg'],
  ['danger', 'bg'], // field errors and the conflict tag
  ['danger', 'surface'],
  ['accent', 'bg'], // today's date numeral
  ['accent', 'surface'], // links and the focused row in the side column
  ['on-accent', 'accent'], // primary and pressed buttons
];

// PRE:  selector is written as Prettier formats it (single quotes)
// POST: returns the custom properties of the rule it opens in tokens.css, name (without --) →
//       value; throws when no rule opens with it
function tokensOf(selector: string): Map<string, string> {
  const start = TOKENS_CSS.indexOf(`${selector} {`);
  if (start < 0) {
    throw new Error(`tokens.css has no rule for ${selector}`);
  }
  const body = TOKENS_CSS.slice(start, TOKENS_CSS.indexOf('}', start));
  const tokens = new Map<string, string>();

  // INVARIANT: tokens holds every custom property declared before the visited match
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens.set(match[1] ?? '', (match[2] ?? '').trim());
  }
  // POST: tokens holds every custom property of the rule

  return tokens;
}

// PRE:  hex is '#rrggbb'
// POST: returns its WCAG 2 relative luminance, 0 (black) … 1 (white)
function luminance(hex: string): number {
  const channels = CHANNEL_OFFSETS.map((offset) => {
    const value = parseInt(hex.slice(offset, offset + CHANNEL_DIGITS), HEX_RADIX) / CHANNEL_MAX;
    return value <= LINEAR_THRESHOLD
      ? value / LINEAR_SLOPE
      : ((value + GAMMA_OFFSET) / (1 + GAMMA_OFFSET)) ** GAMMA;
  });
  const [red = 0, green = 0, blue = 0] = channels;
  return RED_WEIGHT * red + GREEN_WEIGHT * green + BLUE_WEIGHT * blue;
}

// PRE:  first and second are '#rrggbb'
// POST: returns their WCAG contrast ratio, 1 … 21
function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((lighter ?? 0) + LUMINANCE_OFFSET) / ((darker ?? 0) + LUMINANCE_OFFSET);
}

const light = tokensOf(':root');
const dark = tokensOf(":root[data-theme='dark']");

describe('tokens.css', () => {
  it.each([
    ['light', light],
    ['dark', dark],
  ])('the %s theme reaches 4.5:1 for every text pair', (theme, tokens) => {
    const failing = TEXT_PAIRS.filter(([foreground, background]) => {
      const ratio = contrast(tokens.get(foreground) ?? '', tokens.get(background) ?? '');
      // Negated so a missing token (NaN ratio) counts as failing too.
      return !(ratio >= MIN_TEXT_CONTRAST);
    });

    expect(failing, `${theme} theme`).toEqual([]);
  });

  it('defines every paired token as a hex colour in both themes', () => {
    const names = new Set(TEXT_PAIRS.flat());

    expect([...names].filter((name) => !HEX_COLOUR.test(light.get(name) ?? ''))).toEqual([]);
    expect([...names].filter((name) => !HEX_COLOUR.test(dark.get(name) ?? ''))).toEqual([]);
  });

  it('gives the system dark mode the same values as data-theme="dark"', () => {
    expect(tokensOf(":root:not([data-theme='light'])")).toEqual(dark);
  });
});
