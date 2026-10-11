import { ASTRAL_THEME } from './astral-theme';
import { OUTPOST_THEME } from './outpost-theme';
import type { GameTheme } from './types';

export type { GameTheme, ThemeText } from './types';
export { validateTheme } from './validation';

export const GAME_THEMES: readonly GameTheme[] = [OUTPOST_THEME, ASTRAL_THEME];
export const DEFAULT_THEME_ID: string = OUTPOST_THEME.id;
