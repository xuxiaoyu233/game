/**
 * The three window shapes this prototype supports. The front end only declares the mode and the
 * geometry it needs; the host (Tauri) performs the resize, and the browser build just switches
 * `data-mode` because a web page cannot resize its own OS window.
 *
 * Sizes come from docs/设计/产品形态.md: active 960x720 (the three-column threshold), idle 280x72
 * (one row: artwork, activity, progress, rate, pause), tree 720x640 (sidebar plus canvas).
 */
export type WindowMode = 'active' | 'idle' | 'tree';

export interface WindowModeSpec {
  readonly width: number;
  readonly height: number;
  readonly alwaysOnTop: boolean;
  readonly minWidth: number;
  readonly minHeight: number;
}

export const WINDOW_MODES: Readonly<Record<WindowMode, WindowModeSpec>> = {
  active: { width: 960, height: 720, alwaysOnTop: false, minWidth: 360, minHeight: 480 },
  idle: { width: 280, height: 72, alwaysOnTop: true, minWidth: 236, minHeight: 72 },
  tree: { width: 720, height: 640, alwaysOnTop: false, minWidth: 480, minHeight: 560 },
};

/** Toggling goes between the working window and the idle strip only; tree has its own entry. */
export function toggleIdle(mode: WindowMode): WindowMode {
  return mode === 'idle' ? 'active' : 'idle';
}
