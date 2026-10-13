import type { GameDefinition } from '../../domain/legacy/types';
import type { GameTheme, ThemeText } from './types';

const THEME_ID_PATTERN = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const COLOR_PATTERN = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;
// Local package assets only. The pattern excludes protocols, traversal and CSS URL escapes.
const BACKGROUND_PATH_PATTERN = /^\/?(?:[a-z\d_-]+\/)*[a-z\d_-]+\.(?:png|jpe?g|webp|avif|svg)$/i;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid game theme: ${message}`);
}

function validateText(value: string, label: string): void {
  assert(typeof value === 'string' && value.trim().length > 0, `${label} must be nonempty text`);
}

function validateLabels(
  labels: Readonly<Record<string, ThemeText>>,
  expectedIds: readonly string[],
  label: string,
): void {
  assert(
    typeof labels === 'object' && labels !== null && !Array.isArray(labels),
    `${label} must be a label map`,
  );
  assert(
    Object.keys(labels).length === expectedIds.length,
    `${label} must contain exactly the configured IDs`,
  );
  for (const id of expectedIds) {
    assert(Object.hasOwn(labels, id), `${label} is missing ${id}`);
    const text = labels[id];
    assert(typeof text === 'object' && text !== null, `${label}.${id} must be a text entry`);
    validateText(text.name, `${label}.${id}.name`);
    validateText(text.description, `${label}.${id}.description`);
  }
}

/** Missing labels fail before rendering; themes cannot redirect image loads off device. */
export function validateTheme(theme: GameTheme, definition: GameDefinition): void {
  assert(
    typeof theme.id === 'string' && THEME_ID_PATTERN.test(theme.id),
    'id must be a stable English identifier',
  );
  for (const key of ['title', 'worldName', 'resourceName', 'resourceUnit', 'tagline'] as const) {
    validateText(theme[key], key);
  }
  assert(typeof theme.colors === 'object' && theme.colors !== null, 'colors must be an object');
  for (const key of [
    'background',
    'surface',
    'surfaceRaised',
    'text',
    'muted',
    'accent',
    'accentSoft',
    'border',
  ] as const) {
    assert(
      typeof theme.colors[key] === 'string' && COLOR_PATTERN.test(theme.colors[key]),
      `colors.${key} must be a hex color`,
    );
  }
  assert(typeof theme.scene === 'object' && theme.scene !== null, 'scene must be an object');
  assert(
    theme.scene.variant === 'outpost' || theme.scene.variant === 'astral',
    'scene.variant is unsupported',
  );
  assert(
    theme.scene.backgroundImage === null ||
      (typeof theme.scene.backgroundImage === 'string' &&
        BACKGROUND_PATH_PATTERN.test(theme.scene.backgroundImage)),
    'scene.backgroundImage must be null or a safe local asset path',
  );
  validateLabels(
    theme.tools,
    definition.tools.map((tool) => tool.id),
    'tools',
  );
  validateLabels(
    theme.upgrades,
    definition.upgrades.map((upgrade) => upgrade.id),
    'upgrades',
  );
  validateLabels(
    theme.tasks,
    definition.tasks.map((task) => task.id),
    'tasks',
  );
  validateLabels(
    theme.events,
    definition.events.map((event) => event.id),
    'events',
  );
  for (const event of definition.events) {
    const text = theme.events[event.id];
    assert(text !== undefined, `events is missing ${event.id}`);
    validateLabels(
      text.options,
      event.options.map((option) => option.id),
      `events.${event.id}.options`,
    );
  }
}
