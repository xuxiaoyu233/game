import type {
  SkillLoopCommand,
  SkillLoopDefinition,
  SkillLoopErrorCode,
  SkillLoopState,
  SkillLoopSummary,
} from '../domain/skill-loop/types';
import type { SkillLoopTheme } from '../themes/skill-prototype-v1';
import type { GameRuntime } from '../runtime/game-runtime';

export interface SkillPrototypeV1Package {
  readonly definition: SkillLoopDefinition;
  readonly theme: SkillLoopTheme;
}

/** 原型运行时：通用 GameRuntime 在技能循环域上的具体化，供 app 层共享。 */
export type PrototypeRuntime = GameRuntime<
  SkillLoopDefinition,
  SkillLoopState,
  SkillLoopCommand,
  SkillLoopSummary,
  SkillLoopErrorCode
>;
