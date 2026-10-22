export interface Preferences {
  readonly themeId: string;
  readonly compact: boolean;
}

const LEGACY_PREFERENCES_KEY = `zhujie-rescue-bureau:${__APP_TARGET__}:preferences:v1`;

export function readPreferences(defaultThemeId: string, key = LEGACY_PREFERENCES_KEY): Preferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (value !== null && typeof value === 'object' && 'themeId' in value && 'compact' in value) {
      if (typeof value.themeId === 'string' && typeof value.compact === 'boolean') {
        return { themeId: value.themeId, compact: value.compact };
      }
    }
  } catch {
    // Presentation preferences are optional; game progress uses a separate storage port.
  }
  return { themeId: defaultThemeId, compact: false };
}

export function writePreferences(preferences: Preferences, key = LEGACY_PREFERENCES_KEY): void {
  try {
    localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    // A blocked preference store must not block gameplay or game saves.
  }
}
