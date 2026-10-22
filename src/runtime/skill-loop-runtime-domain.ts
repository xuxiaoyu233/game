import {
  advanceSkillLoop,
  applySkillLoopCommand,
  createNewSkillLoop,
  getSkillLoopSummary,
} from '../domain/skill-loop/engine';
import { validateSkillLoopDefinition } from '../domain/skill-loop/validation';
import { captureSkillLoopReturnReport } from '../domain/skill-loop/return-report';
import type {
  SkillLoopCommand,
  SkillLoopDefinition,
  SkillLoopErrorCode,
  SkillLoopState,
  SkillLoopSummary,
} from '../domain/skill-loop/types';
import {
  decodeSkillLoopSave,
  encodeSkillLoopSave,
  type SkillLoopSaveMigration,
} from '../persistence/skill-loop-codec';
import type { RuntimeDomain } from './game-runtime';

export function createSkillLoopRuntimeDomain(
  migrateSave?: SkillLoopSaveMigration,
): RuntimeDomain<
  SkillLoopDefinition,
  SkillLoopState,
  SkillLoopCommand,
  SkillLoopSummary,
  SkillLoopErrorCode
> {
  return {
    validateDefinition: validateSkillLoopDefinition,
    createNewState: createNewSkillLoop,
    advanceTime: advanceSkillLoop,
    prepareStartupState: (before, advanced, definition) =>
      captureSkillLoopReturnReport(before, advanced, definition),
    applyCommand: applySkillLoopCommand,
    getSummary: getSkillLoopSummary,
    decodeSave: (contents, definition) => decodeSkillLoopSave(contents, definition, migrateSave),
    encodeSave: encodeSkillLoopSave,
    isNumericLimit: (error) => error === 'NUMERIC_LIMIT',
    numericLimitError: 'NUMERIC_LIMIT',
    isImmediateCommand: (command) => command.kind !== 'tick',
  };
}
