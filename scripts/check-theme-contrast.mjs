import { readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

/**
 * Contrast gate for every palette the shell can inject. Era palettes replace the base theme's
 * nine tokens wholesale, so each one has to stand on its own: body text at 4.5:1 and secondary
 * text at 3:1 against every surface it can land on (background, surface, surfaceRaised), which
 * is the level the small 11px lines rely on. The committed-colour strategy paints panels with
 * the era hue, so panel surfaces are gated too, not just the page background. Each era's three
 * semantic tones are gated at 3:1 against the surface their icon bubbles and kickers sit on.
 *
 * Palettes are authored in OKLCH, so the gate parses both OKLCH and legacy 6-digit hex. OKLCH is
 * converted through OKLab to linear sRGB, gamma-encoded back to sRGB, then run through the WCAG
 * relative-luminance formula.
 */

const ERA_SOURCE = path.resolve('src/themes/eras.ts');
const BASE_THEME_SOURCE = path.resolve('src/themes/skill-prototype-v1.ts');

const REQUIRED_COLORS = [
  'background',
  'surface',
  'surfaceRaised',
  'text',
  'muted',
  'accent',
  'accentSoft',
  'border',
];

const BODY_CONTRAST = 4.5;
const SECONDARY_CONTRAST = 3;
const HEX = /^#[0-9a-f]{6}$/i;
const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i;

/**
 * The palettes live in TypeScript, so they are transpiled to ESM in a temp file and imported.
 * Both sources use `import type` only, so the emitted module has no runtime dependencies.
 */
async function loadPaletteModule(file) {
  const source = await readFile(file, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const temp = path.join(
    os.tmpdir(),
    `theme-contrast-${process.pid}-${path.basename(file, '.ts')}.mjs`,
  );
  await writeFile(temp, outputText, 'utf8');
  try {
    return await import(`file:///${temp.split(path.sep).join('/')}`);
  } finally {
    await rm(temp, { force: true });
  }
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function srgbGammaEncode(channel) {
  return clamp01(channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055);
}

/** OKLCH(L, C, H) -> linear sRGB triplet in [-?, 1]; may fall outside 0..1 for wide gamuts. */
function oklchToLinearSrgb(lightness, chroma, hue) {
  const hueRad = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(hueRad);
  const b = chroma * Math.sin(hueRad);
  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function parseColor(value) {
  const text = String(value).trim();
  const hexMatch = HEX.exec(text);
  if (hexMatch) {
    const r = Number.parseInt(text.slice(1, 3), 16) / 255;
    const g = Number.parseInt(text.slice(3, 5), 16) / 255;
    const b = Number.parseInt(text.slice(5, 7), 16) / 255;
    return [r, g, b];
  }
  const oklchMatch = OKLCH.exec(text);
  if (oklchMatch) {
    const [linearR, linearG, linearB] = oklchToLinearSrgb(
      Number.parseFloat(oklchMatch[1]),
      Number.parseFloat(oklchMatch[2]),
      Number.parseFloat(oklchMatch[3]),
    );
    return [srgbGammaEncode(linearR), srgbGammaEncode(linearG), srgbGammaEncode(linearB)];
  }
  throw new Error(`not a 6-digit hex or oklch() colour: ${value}`);
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground, background) {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function isColour(value) {
  return typeof value === 'string' && (HEX.test(value.trim()) || OKLCH.test(value.trim()));
}

const errors = [];
const rows = [];

function checkPalette(name, colors, tones) {
  for (const key of REQUIRED_COLORS) {
    const value = colors?.[key];
    if (!isColour(value))
      errors.push(`${name}: ${key} must be a 6-digit hex or oklch() colour (got ${String(value)})`);
  }
  if (errors.length > 0) return;

  // Text colours are gated against every surface they can land on: the page background and the
  // two panel fills (the committed strategy gives panels an era hue of their own).
  const surfaces = [
    ['背景', parseColor(colors.background)],
    ['面板', parseColor(colors.surface)],
    ['浮层', parseColor(colors.surfaceRaised)],
  ];
  const texts = [
    ['正文 text', parseColor(colors.text), BODY_CONTRAST],
    ['次要 muted', parseColor(colors.muted), SECONDARY_CONTRAST],
    ['强调 accent', parseColor(colors.accent), SECONDARY_CONTRAST],
  ];
  for (const [surfaceLabel, surface] of surfaces) {
    for (const [label, foreground, minimum] of texts) {
      const ratio = contrastRatio(foreground, surface);
      rows.push(
        `${name.padEnd(22)} ${surfaceLabel}·${label.padEnd(12)} ${ratio.toFixed(2).padStart(6)}:1  (最低 ${minimum})`,
      );
      if (ratio < minimum)
        errors.push(
          `${name}: ${label} on ${surfaceLabel} contrast ${ratio.toFixed(2)}:1 is below the ${minimum}:1 minimum`,
        );
    }
  }

  if (tones === undefined) return;
  const surface = parseColor(colors.surface);
  for (const [toneId, value] of Object.entries(tones)) {
    if (!isColour(value)) {
      errors.push(
        `${name}: tone ${toneId} must be a 6-digit hex or oklch() colour (got ${String(value)})`,
      );
      continue;
    }
    const ratio = contrastRatio(parseColor(value), surface);
    rows.push(
      `${name.padEnd(22)} 面板·tone/${toneId.padEnd(8)} ${ratio.toFixed(2).padStart(6)}:1  (最低 ${SECONDARY_CONTRAST})`,
    );
    if (ratio < SECONDARY_CONTRAST)
      errors.push(
        `${name}: tone ${toneId} on surface contrast ${ratio.toFixed(2)}:1 is below the ${SECONDARY_CONTRAST}:1 minimum`,
      );
  }
}

const eras = await loadPaletteModule(ERA_SOURCE);
const eraDefinitions = eras.ERA_DEFINITIONS;
if (eraDefinitions === undefined || typeof eraDefinitions !== 'object')
  errors.push('src/themes/eras.ts must export ERA_DEFINITIONS');

const eraIds = Object.keys(eraDefinitions ?? {});
for (const eraId of eraIds) {
  const definition = eraDefinitions?.[eraId];
  if (definition === undefined) {
    errors.push(`missing era palette: ${eraId}`);
    continue;
  }
  if (definition.id !== eraId) errors.push(`era palette key/id mismatch: ${eraId}`);
  if (typeof definition.label !== 'string' || definition.label.trim() === '')
    errors.push(`${eraId}: label is empty`);
  if (typeof definition.description !== 'string' || definition.description.trim() === '')
    errors.push(`${eraId}: description is empty`);
  if (typeof definition.backdrop !== 'string' || definition.backdrop.trim() === '')
    errors.push(`${eraId}: backdrop is empty`);
  if (typeof definition.glow !== 'string' || definition.glow.trim() === '')
    errors.push(`${eraId}: glow is empty`);
  if (typeof definition.scene !== 'string' || definition.scene.trim() === '')
    errors.push(`${eraId}: scene is empty`);
  const tones = definition.tones;
  if (tones === null || typeof tones !== 'object') errors.push(`${eraId}: tones must be an object`);
  else
    for (const toneId of ['gather', 'craft', 'support'])
      if (typeof tones[toneId] !== 'string') errors.push(`${eraId}: missing tone ${toneId}`);
  checkPalette(`era/${eraId}`, definition.colors, tones);
}

const base = await loadPaletteModule(BASE_THEME_SOURCE);
checkPalette('base/skill-prototype-v1', base.SKILL_PROTOTYPE_V1_THEME?.colors);

for (const row of rows) console.log(row);

if (errors.length > 0) {
  console.error(`\n${errors.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(
    `\nTheme contrast passed: ${eraIds.length} era palettes + base theme (OKLCH). Body >= ${BODY_CONTRAST}:1 and secondary/accent/tone >= ${SECONDARY_CONTRAST}:1 against background, surface and surfaceRaised.`,
  );
}
