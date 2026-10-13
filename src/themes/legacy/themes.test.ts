import { describe, expect, it } from 'vitest';
import { BASE_GAME_DEFINITION } from '../../content/legacy/base-game';
import {
  advanceTime,
  applyCommand,
  createNewGame,
  getGameSummary,
} from '../../domain/legacy/engine';
import type { GameCommand } from '../../domain/legacy/types';
import { DEFAULT_THEME_ID, GAME_THEMES, validateTheme } from './index';
import { OUTPOST_THEME } from './outpost-theme';

describe('replaceable presentation themes', () => {
  it('provides two complete label sets for the same stable mechanical IDs', () => {
    expect(GAME_THEMES.map((theme) => theme.id)).toEqual([
      'theme-world-rescue-bureau',
      'theme-world-rescue-bureau-astral',
    ]);
    expect(DEFAULT_THEME_ID).toBe('theme-world-rescue-bureau');
    for (const theme of GAME_THEMES) {
      expect(() => validateTheme(theme, BASE_GAME_DEFINITION)).not.toThrow();
      expect(Object.keys(theme.tools)).toEqual(['extractor', 'processor', 'drone']);
    }
    expect(GAME_THEMES.map((theme) => theme.resourceName)).toEqual(['行动物资', '行动物资']);
  });

  it('keeps a live game unchanged through a theme switch and gives the same subsequent outcome', () => {
    const definition = BASE_GAME_DEFINITION;
    let state = { ...createNewGame(definition, 1_000), balance: 1_000, totalGathered: 1_000 };
    const commands: readonly GameCommand[] = [
      { kind: 'buy-tool', toolId: 'extractor' },
      { kind: 'claim-task', taskId: 'foothold' },
      { kind: 'buy-tool', toolId: 'processor' },
      { kind: 'claim-task', taskId: 'automation' },
      { kind: 'choose-event', eventId: 'supply-cache', optionId: 'repair' },
    ];
    for (const command of commands) {
      const result = applyCommand(state, definition, command);
      expect(result.ok).toBe(true);
      state = result.state;
    }
    const beforeSwitch = JSON.stringify(state);
    const summary = getGameSummary(state, definition);
    const expectedNext = advanceTime(state, definition, 11_000);
    for (const theme of GAME_THEMES) {
      validateTheme(theme, definition);
      expect(theme.tools.extractor?.name).toBeTruthy();
      expect(getGameSummary(state, definition)).toEqual(summary);
      expect(advanceTime(state, definition, 11_000)).toEqual(expectedNext);
      expect(JSON.stringify(state)).toBe(beforeSwitch);
    }
    expect(state.worldId).toBe('frontier');
    expect(Object.hasOwn(state, 'themeId')).toBe(false);
  });

  it('rejects incomplete labels instead of silently showing missing display text', () => {
    expect(() => validateTheme({ ...OUTPOST_THEME, tools: {} }, BASE_GAME_DEFINITION)).toThrow(
      /configured IDs/,
    );
    const extraLabel = { ...OUTPOST_THEME.tools, unknown: { name: 'extra', description: 'extra' } };
    expect(() =>
      validateTheme({ ...OUTPOST_THEME, tools: extraLabel }, BASE_GAME_DEFINITION),
    ).toThrow(/configured IDs/);
    const missingOption = {
      ...OUTPOST_THEME,
      events: { 'supply-cache': { name: '箱', description: '箱', options: {} } },
    };
    expect(() => validateTheme(missingOption, BASE_GAME_DEFINITION)).toThrow(/configured IDs/);
  });

  it.each([
    'https://example.com/image.png',
    '//example.com/image.png',
    '../secret.png',
    '/assets/../secret.png',
    'C:\\secret.png',
    'data:image/png;base64,abc',
    '/assets/image.png?remote=1',
    '/assets/%2e%2e/secret.png',
    "image.png');color:red;('",
  ])('rejects an unsafe background path %s', (backgroundImage) => {
    expect(() =>
      validateTheme(
        { ...OUTPOST_THEME, scene: { variant: 'outpost', backgroundImage } },
        BASE_GAME_DEFINITION,
      ),
    ).toThrow(/safe local asset/);
  });

  it('accepts packaged local image paths and rejects invalid color strings', () => {
    expect(() =>
      validateTheme(
        {
          ...OUTPOST_THEME,
          scene: { variant: 'outpost', backgroundImage: '/assets/outpost-scene.webp' },
        },
        BASE_GAME_DEFINITION,
      ),
    ).not.toThrow();
    expect(() =>
      validateTheme(
        {
          ...OUTPOST_THEME,
          colors: { ...OUTPOST_THEME.colors, accent: 'url(https://example.com)' },
        },
        BASE_GAME_DEFINITION,
      ),
    ).toThrow(/hex color/);
  });
});
