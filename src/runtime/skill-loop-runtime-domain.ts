import {
  advanceSkillLoop,
  applySkillLoopCommand,
  createNewSkillLoop,
  getSkillLoopSummary,
} from '../domain/skill-loop/engine';
import { validateSkillLoopDefinition } from '../domain/skill-loop/validation';
import type {
  SkillLoopCommand,
  SkillLoopDefinition,
  SkillLoopErrorCode,
  SkillLoopState,
  SkillLoopSummary,
} from '../domain/skill-loop/types';
import { decodeSkillLoopSave, encodeSkillLoopSave } from '../persistence/skill-loop-codec';
import type { RuntimeDomain } from './game-runtime';

export const SKILL_LOOP_RUNTIME_DOMAIN: RuntimeDomain<
  SkillLoopDefinition,
  SkillLoopState,
  SkillLoopCommand,
  SkillLoopSummary,
  SkillLoopErrorCode
> = {
  validateDefinition: validateSkillLoopDefinition,
  createNewState: createNewSkillLoop,
  advanceTime: advanceSkillLoop,
  applyCommand: applySkillLoopCommand,
  getSummary: getSkillLoopSummary,
  decodeSave: decodeSkillLoopSave,
  encodeSave: encodeSkillLoopSave,
  isNumericLimit: (error) => error === 'NUMERIC_LIMIT',
  numericLimitError: 'NUMERIC_LIMIT',
  isImmediateCommand: (command) => command.kind !== 'tick',
};
