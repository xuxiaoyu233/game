export interface ThemeText {
  readonly name: string;
  readonly description: string;
}

/** Presentation only. Stable mechanical identifiers remain in GameDefinition. */
export interface GameTheme {
  readonly id: string;
  readonly title: string;
  readonly worldName: string;
  readonly resourceName: string;
  readonly resourceUnit: string;
  readonly tagline: string;
  readonly colors: {
    readonly background: string;
    readonly surface: string;
    readonly surfaceRaised: string;
    readonly text: string;
    readonly muted: string;
    readonly accent: string;
    readonly accentSoft: string;
    readonly border: string;
  };
  readonly scene: {
    readonly backgroundImage: string | null;
    readonly variant: 'outpost' | 'astral';
  };
  readonly tools: Readonly<Record<string, ThemeText>>;
  readonly upgrades: Readonly<Record<string, ThemeText>>;
  readonly tasks: Readonly<Record<string, ThemeText>>;
  readonly events: Readonly<
    Record<string, ThemeText & { readonly options: Readonly<Record<string, ThemeText>> }>
  >;
}
