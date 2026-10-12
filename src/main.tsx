import { createRoot } from 'react-dom/client';
import { SkillPrototypeApp } from './app/SkillPrototypeApp';
import './app/styles.css';
import { createSkillPrototypeV1Definition } from './content/skill-prototype-v1';
import { validateSkillLoopDefinition } from './domain/skill-loop/validation';
import { createPlatform } from './platform/create-platform';
import { SKILL_LOOP_RUNTIME_DOMAIN } from './runtime/skill-loop-runtime-domain';
import { createConfiguredGameRuntime } from './runtime/game-runtime';
import {
  SKILL_PROTOTYPE_V1_THEME,
  validateSkillPrototypeV1Theme,
} from './themes/skill-prototype-v1';

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (container === null) throw new Error('Application root is missing');

  const definition = createSkillPrototypeV1Definition('level-threshold');
  const content = { definition, theme: SKILL_PROTOTYPE_V1_THEME } as const;
  validateSkillLoopDefinition(definition);
  validateSkillPrototypeV1Theme(definition, SKILL_PROTOTYPE_V1_THEME);

  const platform = await createPlatform();
  const runtime = createConfiguredGameRuntime(
    definition,
    platform.storage,
    platform.instanceLease,
    SKILL_LOOP_RUNTIME_DOMAIN,
  );
  createRoot(container).render(
    <SkillPrototypeApp runtime={runtime} content={content} windowPort={platform.window} />,
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
