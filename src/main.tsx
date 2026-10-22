import { createRoot } from 'react-dom/client';
import { SkillPrototypeApp } from './app/SkillPrototypeApp';
import { SKILL_TREES } from './content/trees';
import './app/styles.css';
import { loadPrototypeContent } from './content/load-prototype-content';
import { createSkillPrototypeV1Definition } from './content/skill-prototype-v1';
import { createSkillPrototypeV2Definition } from './content/skill-prototype-v2';
import { createSkillPrototypeV3Definition } from './content/skill-prototype-v3';
import { createSkillPrototypeV5Definition } from './content/skill-prototype-v5';
import { createSkillPrototypeV6Definition } from './content/skill-prototype-v6';
import { createSkillPrototypeV7Definition } from './content/skill-prototype-v7';
import { createSkillPrototypeV8Definition } from './content/skill-prototype-v8';
import { createSkillPrototypeV9Definition } from './content/skill-prototype-v9';
import { validateSkillLoopDefinition } from './domain/skill-loop/validation';
import { createPlatform } from './platform/create-platform';
import { createSkillLoopRuntimeDomain } from './runtime/skill-loop-runtime-domain';
import { createConfiguredGameRuntime } from './runtime/game-runtime';
import { migrateSkillPrototypeSave } from './persistence/skill-prototype-save-migrations';
import {
  SKILL_PROTOTYPE_V1_THEME,
  validateSkillPrototypeV1Theme,
} from './themes/skill-prototype-v1';

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (container === null) throw new Error('Application root is missing');

  const definition = loadPrototypeContent();
  const p3 = createSkillPrototypeV3Definition();
  const runtimeDomain = createSkillLoopRuntimeDomain((source, targetDefinition) =>
    migrateSkillPrototypeSave(
      source,
      {
        p1: createSkillPrototypeV1Definition(),
        p2: createSkillPrototypeV2Definition(),
        p3,
        // Content 4.0.0 re-expressed the P3 content as JSON with identical IDs.
        p4: { ...p3, contentVersion: '4.0.0' },
        // Content 5.0.0/6.0.0/7.0.0 snapshots frozen under data-v5/, data-v6/ and data-v7/ so
        // they cannot drift with data/.
        p5: createSkillPrototypeV5Definition(),
        p6: createSkillPrototypeV6Definition(),
        p7: createSkillPrototypeV7Definition(),
        p8: createSkillPrototypeV8Definition(),
        // Pacing-retune batch: 10.0.0 re-tunes the curve tail but adds no IDs, so the frozen 9.0.0
        // snapshot under data-v9/ carries the pre-retune numbers as the migration source.
        p9: createSkillPrototypeV9Definition(),
      },
      targetDefinition,
    ),
  );
  const content = { definition, theme: SKILL_PROTOTYPE_V1_THEME } as const;
  validateSkillLoopDefinition(definition);
  validateSkillPrototypeV1Theme(definition, SKILL_PROTOTYPE_V1_THEME);

  const platform = await createPlatform();
  const runtime = createConfiguredGameRuntime(
    definition,
    platform.storage,
    platform.instanceLease,
    runtimeDomain,
  );
  createRoot(container).render(
    <SkillPrototypeApp
      runtime={runtime}
      content={content}
      windowPort={platform.window}
      trees={SKILL_TREES}
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
