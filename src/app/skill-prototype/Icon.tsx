import type { ReactNode } from 'react';

/**
 * Icon rendering for skills, items and categories. Icons are decorative presentation, so they
 * live in the app/theme layer and never in content. Every glyph is an inline SVG drawn on one
 * 24x24 grid with stroke 1.75 and round caps/joins, in `currentColor`, which keeps it crisp at
 * any size, themeable and free of licensing questions; a glyph that has no dedicated shape falls
 * back to a neutral diamond instead of an empty box. Rows wrap a glyph in a tone bubble
 * (`.skill-prototype-icon-bubble`) when the hue should carry meaning.
 */

const GLYPHS: Readonly<Record<string, ReactNode>> = {
  // Skills
  mining: <path d="M12 3 19 8v8l-7 5-7-5V8z" />,
  metalworking: <path d="M4 10h16v6H4zM8 6h8v3H8z" />,
  woodcutting: <path d="M6 18 18 6M9 5h10v10" />,
  fishing: <path d="M3 12c4-5 9-5 13 0-4 5-9 5-13 0zM16 12l5-4v8z" />,
  firemaking: <path d="M12 3c4 5 6 7 6 11a6 6 0 1 1-12 0c0-4 2-6 6-11z" />,
  cooking: <path d="M4 12h16a8 8 0 1 1-16 0zM3 20h18" />,
  crafting: <path d="M5 19 15 9l4 4-10 10zM14 6l4 4M17 3l4 4" />,
  herbalism: <path d="M12 21V9M12 9c0-4 3-6 7-6 0 4-3 6-7 6zM12 13c0-3-2-5-6-5 0 3 2 5 6 5z" />,
  herblore: <path d="M9 3h6v4l4 9a3 3 0 0 1-3 4H8a3 3 0 0 1-3-4l4-9z" />,
  farming: <path d="M12 21V8M12 8c0-3 2-5 5-5 0 3-2 5-5 5zM4 21h16" />,
  agility: <path d="M4 18 10 6l4 6 6-8" />,
  thieving: <path d="M4 10h16l-1 11H5zM9 10V7a3 3 0 0 1 6 0v3" />,
  // Items
  'common-ore': <path d="M12 3 20 9l-3 10H7L4 9z" />,
  'advanced-ore': <path d="M12 2 21 9l-3 11H6L3 9zM12 8v8" />,
  'common-ingot': <path d="M5 11h14l-2 8H7z" />,
  'advanced-ingot': <path d="M4 11h16l-2 9H6zM9 6h6v3H9z" />,
  'common-tool-blank': <path d="M7 5h10v14H7z" />,
  'composite-tool-blank': <path d="M7 5h10v14H7zM9 9h6M9 13h6" />,
  'wood-log': <path d="M5 7h14v10H5zM9 7v10M15 7v10" />,
  hardwood: <path d="M4 7h16v10H4zM8 9v6M13 9v6M17 9v6" />,
  'wood-charcoal': <path d="M8 6h7l4 6-3 7H7l-3-6z" />,
  'raw-fish': <path d="M3 12c4-4 9-4 13 0-4 4-9 4-13 0zM16 12l5-3v6z" />,
  'cooked-fish': <path d="M3 12c4-4 9-4 13 0-4 4-9 4-13 0zM16 9v6M19 10v4" />,
  'wood-handle': <path d="M4 14h10M14 10l6 4-6 4z" />,
  'reinforced-handle': <path d="M4 14h9M13 10l7 4-7 4zM9 11v6" />,
  'clean-herb': <path d="M12 21V11M12 11c0-4 3-6 7-6 0 4-3 6-7 6z" />,
  'moon-herb': <path d="M14 4a8 8 0 1 0 6 13A9 9 0 0 1 14 4z" />,
  'wild-seed': <path d="M12 21a6 6 0 0 1 0-12 6 6 0 0 1 0 12zM12 9V4" />,
  'field-crop': (
    <path d="M12 21V7M12 12c3 0 5-2 5-5-3 0-5 2-5 5zM12 16c-3 0-5-2-5-5 3 0 5 2 5 5z" />
  ),
  'agility-mark': <path d="m12 3 3 7 7 1-5 4 2 7-7-4-7 4 2-7-5-4 7-1z" />,
  vial: <path d="M9 3h6v3l-2 5 2 5v5H9v-5l2-5-2-5z" />,
  coin: <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v8" />,
  gem: <path d="M12 3 20 9l-8 12L4 9z" />,
  'cleansing-potion': <path d="M9 3h6v4l4 9a3 3 0 0 1-3 4H8a3 3 0 0 1-3-4l4-9z" />,
  'clarity-potion': <path d="M9 3h6v4l4 9a3 3 0 0 1-3 4H8a3 3 0 0 1-3-4l4-9zM11 16h4" />,
  'swift-potion': <path d="M9 3h6v4l4 9a3 3 0 0 1-3 4H8a3 3 0 0 1-3-4l4-9zM13 16l-3-1 2-2-2-1" />,
  // Categories
  'raw-material': <path d="M12 4 20 10l-3 9H7L4 10z" />,
  'processed-material': <path d="M5 10h14v9H5zM9 6h6v4H9z" />,
  'tool-component': <path d="M6 6h8v12H6zM14 10l4-4 2 2-4 4z" />,
  fuel: <path d="M12 4c3 4 5 6 5 9a5 5 0 1 1-10 0c0-3 2-5 5-9z" />,
  consumable: <path d="M10 3h4v5l3 7-2 6H9l-2-6 3-7z" />,
  currency: <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v8M9 12h6" />,
  'trade-good': <path d="M12 3 20 9l-8 12L4 9zM8 9h8" />,
  // Milestone / reached-ceiling marker used by the growth stage-end note.
  'stage-end': <path d="M6 3v18M6 4h11l-2 4 2 4H6" />,
};

export interface IconProps {
  readonly iconId: string | undefined;
  /**
   * Coarser id to use when `iconId` has no glyph. Item cells pass their category, so new tier items
   * inherit the category glyph instead of all collapsing into the generic diamond.
   */
  readonly fallbackId?: string;
  readonly className?: string;
  /** Icons are decoration; interactive elements keep their own accessible name. */
  readonly title?: string;
}

export function Icon({ iconId, fallbackId, className, title }: IconProps) {
  const glyph =
    (iconId === undefined ? undefined : GLYPHS[iconId]) ??
    (fallbackId === undefined ? undefined : GLYPHS[fallbackId]);
  return (
    <svg
      className={`skill-prototype-icon${className === undefined ? '' : ` ${className}`}`}
      viewBox="0 0 24 24"
      aria-hidden={title === undefined}
      role={title === undefined ? undefined : 'img'}
      focusable="false"
    >
      {title !== undefined && <title>{title}</title>}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyph ?? <path d="M12 5 19 12l-7 7-7-7z" />}
      </g>
    </svg>
  );
}
