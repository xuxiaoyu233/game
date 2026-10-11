import { createRoot } from 'react-dom/client';
import { ExpeditionApp } from './app/ExpeditionApp';
import './app/styles.css';
import './app/expedition.css';
import { BASE_GAME_DEFINITION } from './content/base-game';
import { EXPEDITION_V13_DEFINITION } from './content/expedition-v13';
import { EXPEDITION_V14_DEFINITION } from './content/expedition-v14';
import {
  STORY_ARCHIVE_V13_PROJECTION,
  validateStoryArchiveProjection,
} from './content/narrative/story-archive';
import { createPlatform } from './platform/create-platform';
import { createExpeditionRuntime } from './runtime/expedition-runtime';
import { GAME_THEMES } from './themes';
import { CLUE_COPY } from './themes/story-copy-v13';
import { validateTheme } from './themes/validation';

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (container === null) throw new Error('Application root is missing');
  for (const theme of GAME_THEMES) validateTheme(theme, BASE_GAME_DEFINITION);
  const storyArchiveEntries = validateStoryArchiveProjection(
    EXPEDITION_V14_DEFINITION,
    STORY_ARCHIVE_V13_PROJECTION,
    Object.keys(CLUE_COPY),
  );
  const platform = await createPlatform();
  const runtime = createExpeditionRuntime(
    EXPEDITION_V14_DEFINITION,
    platform.storage,
    platform.instanceLease,
    Date.now,
    BASE_GAME_DEFINITION,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    EXPEDITION_V13_DEFINITION,
  );
  createRoot(container).render(
    <ExpeditionApp
      runtime={runtime}
      definition={EXPEDITION_V14_DEFINITION}
      windowPort={platform.window}
      storyArchiveEntries={storyArchiveEntries}
    />,
  );
  if (platform.window.isDesktop) {
    await platform.window.onCloseRequested(() => {
      const snapshot = runtime.getSnapshot();
      // A rejected source save has no accepted in-memory progress to persist.
      if (snapshot.status === 'error' && snapshot.state === null) return platform.window.hide();
      return runtime.withSaveBarrier(() => platform.window.hide());
    });
  }
  // Runtime publishes a recoverable error to the already-mounted UI.
  await runtime.start().catch(() => undefined);
}

void bootstrap().catch((error: unknown) => {
  const container = document.getElementById('root');
  if (container !== null)
    container.textContent = `启动失败：${error instanceof Error ? error.message : String(error)}`;
});
