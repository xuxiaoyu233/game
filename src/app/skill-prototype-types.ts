import type { SkillLoopDefinition } from '../domain/skill-loop/types';
import type { SkillLoopTheme } from '../themes/skill-prototype-v1';

export interface SkillPrototypeV1Package {
  readonly definition: SkillLoopDefinition;
  readonly theme: SkillLoopTheme;
}
