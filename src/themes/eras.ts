import type { EraId } from '../domain/skill-loop/eras';
import type { SkillLoopTheme } from './skill-prototype-v1';

/**
 * Scene artwork URLs use Vite's documented `new URL(..., import.meta.url)` asset pattern: the
 * bundler rewrites each one to the hashed asset URL, and the expression stays inert (no file
 * access at module evaluation) for tooling that imports this module outside the bundler. The
 * value is a complete `url(...)` CSS fragment, so it can drop straight into `background-image`.
 */
const sceneCss = (file: string): string =>
  `url("${new URL(`./assets/eras/${file}`, import.meta.url).href}")`;

/**
 * Physical scene (the one sentence every colour below must answer to):
 * 「深夜熄灯的书桌前，只有屏幕亮着，一个人在挂机。」
 * A desk late at night with the lights off, one glowing screen, one person leaving a game running.
 * That sentence forces the whole theme: a near-black base (the room is dark), a single light
 * source (the screen, so one accent hue per era, never a rainbow), low ambient light (nothing
 * competes with the text), and colour that behaves like monitor glow in a dark room rather than
 * daylight. Any future recolour must be derivable from this sentence; if it is not, the sentence
 * or the colour is wrong.
 *
 * Era palettes are presentation only. The shell picks one from the derived era id and injects it
 * over the base theme, so every era inherits the same nine token names and nothing in mechanics
 * changes. `backdrop` and `glow` are raw CSS fragments: the backdrop sits behind the whole shell
 * and the glow is the one accent halo allowed per era. `scene` is the era's background artwork
 * (a very dark, low-contrast bitmap) and `tones` are the three semantic hues (gather / craft /
 * support) that tint icon bubbles, group kickers and status marks.
 *
 * Colours are described in OKLCH. The `committed` strategy means the surface itself carries the
 * era hue (chroma on background/surface/surfaceRaised, not only the accent), and the neutrals are
 * nudged toward the era's hue so a bronze screen reads warm and a synthetic screen reads violet
 * even before the accent appears. The accent is one saturated hue that carries 30-60% of what the
 * eye lands on (borders, progress, links, the aurora, the scene glow). Lightness stays away from
 * 0/100 so chroma is allowed to breathe without clipping, and every text colour is gated by
 * `scripts/check-theme-contrast.mjs` against background, surface and surfaceRaised alike.
 */

export type EraColors = SkillLoopTheme['colors'];

/** Semantic tone hues (cosmic-glass tone system): one per skill/segment family, per era. */
export type ToneId = 'gather' | 'craft' | 'support';

export interface EraDefinition {
  readonly id: EraId;
  readonly label: string;
  readonly description: string;
  readonly colors: EraColors;
  /** CSS background painted behind the shell; replaces the base theme's ambient gradient. */
  readonly backdrop: string;
  /** CSS colour used for the one accent halo per screen; already alpha-reduced. */
  readonly glow: string;
  /** URL of the era's dark low-contrast background artwork (bundled by Vite). */
  readonly scene: string;
  /** Semantic tone hues for panels, icon bubbles and kickers; high lightness for text use. */
  readonly tones: Readonly<Record<ToneId, string>>;
}

export const ERA_DEFINITIONS: Readonly<Record<EraId, EraDefinition>> = {
  primitive: {
    id: 'primitive',
    label: '原始',
    description: '起步阶段：手工采集，工具尚未提升。',
    colors: {
      background: 'oklch(0.16 0.022 55)',
      surface: 'oklch(0.21 0.028 55)',
      surfaceRaised: 'oklch(0.26 0.034 52)',
      text: 'oklch(0.96 0.010 60)',
      muted: 'oklch(0.77 0.024 55)',
      accent: 'oklch(0.80 0.15 60)',
      accentSoft: 'oklch(0.24 0.050 55)',
      border: 'oklch(0.35 0.038 55)',
    },
    backdrop:
      'radial-gradient(120% 80% at 50% -10%, oklch(0.30 0.06 55 / 0.85) 0%, transparent 60%)',
    glow: 'oklch(0.82 0.16 60 / 0.50)',
    scene: sceneCss('primitive.jpg'),
    tones: {
      gather: 'oklch(0.82 0.14 55)',
      craft: 'oklch(0.82 0.13 130)',
      support: 'oklch(0.80 0.14 28)',
    },
  },
  bronze: {
    id: 'bronze',
    label: '青铜',
    description: '已有技能进入 T2，或第一条工具线完成提升。',
    colors: {
      background: 'oklch(0.17 0.024 42)',
      surface: 'oklch(0.22 0.030 42)',
      surfaceRaised: 'oklch(0.27 0.036 40)',
      text: 'oklch(0.96 0.010 46)',
      muted: 'oklch(0.78 0.026 42)',
      accent: 'oklch(0.79 0.16 42)',
      accentSoft: 'oklch(0.25 0.052 42)',
      border: 'oklch(0.36 0.040 42)',
    },
    backdrop:
      'radial-gradient(120% 80% at 50% -10%, oklch(0.32 0.07 42 / 0.85) 0%, transparent 62%)',
    glow: 'oklch(0.81 0.17 42 / 0.50)',
    scene: sceneCss('bronze.jpg'),
    tones: {
      gather: 'oklch(0.81 0.15 45)',
      craft: 'oklch(0.82 0.12 165)',
      support: 'oklch(0.80 0.15 20)',
    },
  },
  verdant: {
    id: 'verdant',
    label: '青翠',
    description: '已有技能跨入 T2 中段，生产链向外铺开绿意。',
    colors: {
      background: 'oklch(0.17 0.026 95)',
      surface: 'oklch(0.22 0.032 95)',
      surfaceRaised: 'oklch(0.27 0.038 95)',
      text: 'oklch(0.96 0.010 95)',
      muted: 'oklch(0.78 0.030 95)',
      accent: 'oklch(0.82 0.15 95)',
      accentSoft: 'oklch(0.25 0.055 95)',
      border: 'oklch(0.37 0.042 95)',
    },
    backdrop:
      'radial-gradient(130% 80% at 50% -10%, oklch(0.32 0.07 95 / 0.85) 0%, transparent 62%)',
    glow: 'oklch(0.82 0.16 95 / 0.50)',
    scene: sceneCss('verdant.jpg'),
    tones: {
      gather: 'oklch(0.83 0.14 95)',
      craft: 'oklch(0.82 0.13 160)',
      support: 'oklch(0.80 0.14 40)',
    },
  },
  industrial: {
    id: 'industrial',
    label: '工业',
    description: '全部技能达到 Lv 7，生产链全线运转。',
    colors: {
      background: 'oklch(0.17 0.024 255)',
      surface: 'oklch(0.22 0.030 255)',
      surfaceRaised: 'oklch(0.27 0.034 255)',
      text: 'oklch(0.96 0.010 255)',
      muted: 'oklch(0.77 0.028 255)',
      accent: 'oklch(0.80 0.15 255)',
      accentSoft: 'oklch(0.25 0.052 255)',
      border: 'oklch(0.37 0.040 255)',
    },
    backdrop:
      'radial-gradient(130% 80% at 50% -10%, oklch(0.32 0.07 255 / 0.85) 0%, transparent 62%)',
    glow: 'oklch(0.82 0.16 255 / 0.48)',
    scene: sceneCss('industrial.jpg'),
    tones: {
      gather: 'oklch(0.81 0.14 255)',
      craft: 'oklch(0.82 0.13 195)',
      support: 'oklch(0.82 0.13 40)',
    },
  },
  precision: {
    id: 'precision',
    label: '精密',
    description: '全部技能达到 Lv 10，开始压缩每一处周期损耗。',
    colors: {
      background: 'oklch(0.16 0.026 200)',
      surface: 'oklch(0.21 0.032 200)',
      surfaceRaised: 'oklch(0.26 0.036 200)',
      text: 'oklch(0.96 0.010 200)',
      muted: 'oklch(0.78 0.030 200)',
      accent: 'oklch(0.82 0.15 200)',
      accentSoft: 'oklch(0.24 0.055 200)',
      border: 'oklch(0.36 0.042 200)',
    },
    backdrop:
      'radial-gradient(130% 85% at 50% -10%, oklch(0.31 0.07 200 / 0.85) 0%, transparent 62%)',
    glow: 'oklch(0.84 0.15 200 / 0.48)',
    scene: sceneCss('precision.jpg'),
    tones: {
      gather: 'oklch(0.83 0.14 200)',
      craft: 'oklch(0.82 0.13 265)',
      support: 'oklch(0.82 0.12 150)',
    },
  },
  aurora: {
    id: 'aurora',
    label: '极光',
    description: '全部技能深入 T3，冷色极光在屏幕边缘流动。',
    colors: {
      background: 'oklch(0.17 0.026 285)',
      surface: 'oklch(0.22 0.032 285)',
      surfaceRaised: 'oklch(0.27 0.036 285)',
      text: 'oklch(0.96 0.010 285)',
      muted: 'oklch(0.78 0.030 285)',
      accent: 'oklch(0.80 0.16 285)',
      accentSoft: 'oklch(0.26 0.060 285)',
      border: 'oklch(0.38 0.044 285)',
    },
    backdrop:
      'radial-gradient(130% 85% at 50% -10%, oklch(0.33 0.08 285 / 0.85) 0%, transparent 62%)',
    glow: 'oklch(0.82 0.17 285 / 0.50)',
    scene: sceneCss('aurora.jpg'),
    tones: {
      gather: 'oklch(0.81 0.15 285)',
      craft: 'oklch(0.83 0.14 200)',
      support: 'oklch(0.80 0.16 330)',
    },
  },
  synthetic: {
    id: 'synthetic',
    label: '科技',
    description: '全部技能满级，五条工具线全部到顶。',
    colors: {
      background: 'oklch(0.17 0.026 305)',
      surface: 'oklch(0.22 0.032 305)',
      surfaceRaised: 'oklch(0.27 0.036 305)',
      text: 'oklch(0.96 0.010 305)',
      muted: 'oklch(0.78 0.032 305)',
      accent: 'oklch(0.80 0.16 305)',
      accentSoft: 'oklch(0.26 0.060 305)',
      border: 'oklch(0.38 0.044 305)',
    },
    backdrop:
      'radial-gradient(130% 85% at 50% -10%, oklch(0.33 0.08 305 / 0.85) 0%, transparent 62%)',
    glow: 'oklch(0.82 0.17 305 / 0.50)',
    scene: sceneCss('synthetic.jpg'),
    tones: {
      gather: 'oklch(0.81 0.15 305)',
      craft: 'oklch(0.83 0.14 195)',
      support: 'oklch(0.80 0.16 335)',
    },
  },
};

export function getEraDefinition(eraId: EraId): EraDefinition {
  return ERA_DEFINITIONS[eraId];
}
