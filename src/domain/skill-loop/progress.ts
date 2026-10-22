import { getSkillLevel } from './rates';
import type { SkillLoopDefinition, SkillLoopState } from './types';

/**
 * The one place prototype completion is defined. The UI reads it for the records tab, the status
 * bar and anywhere else a percentage appears, so a number can never disagree with itself. It is
 * derived from XP and tool levels only; no flag is stored, and it reaches 100 exactly when every
 * skill is at its content ceiling and every tool line is maxed, which is the same condition the
 * summary's `prototypeComplete` uses.
 */

export interface PrototypeCompletion {
  /** 0–100, rounded to one decimal. */
  readonly percent: number;
  readonly skillXpEarned: number;
  readonly skillXpTotal: number;
  readonly toolStepsEarned: number;
  readonly toolStepsTotal: number;
  readonly maxedSkills: number;
  readonly totalSkills: number;
  readonly maxedToolLines: number;
  readonly totalToolLines: number;
}

export function getPrototypeCompletion(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
): PrototypeCompletion {
  let skillXpEarned = 0;
  let skillXpTotal = 0;
  let maxedSkills = 0;
  for (const skill of definition.skills) {
    const ceiling = skill.levels.at(-1)?.xpRequired ?? 0;
    skillXpEarned += Math.min(state.skillXp[skill.id] ?? 0, ceiling);
    skillXpTotal += ceiling;
    if (getSkillLevel(state, definition, skill.id) >= (skill.levels.at(-1)?.level ?? 1))
      maxedSkills += 1;
  }

  let toolStepsEarned = 0;
  let toolStepsTotal = 0;
  let maxedToolLines = 0;
  for (const tool of definition.tools) {
    const maximum = tool.levels.at(-1)?.level ?? 1;
    const level = Math.min(Math.max(state.toolLevels[tool.id] ?? 0, 0), maximum);
    // A tool starts at level 1, so the steps that matter are the upgrades above that baseline.
    toolStepsEarned += Math.max(0, level - 1);
    toolStepsTotal += Math.max(0, maximum - 1);
    if (level >= maximum) maxedToolLines += 1;
  }

  const skillShare = skillXpTotal === 0 ? 1 : skillXpEarned / skillXpTotal;
  const toolShare = toolStepsTotal === 0 ? 1 : toolStepsEarned / toolStepsTotal;
  const percent = Math.round(((skillShare + toolShare) / 2) * 1000) / 10;

  return {
    percent,
    skillXpEarned,
    skillXpTotal,
    toolStepsEarned,
    toolStepsTotal,
    maxedSkills,
    totalSkills: definition.skills.length,
    maxedToolLines,
    totalToolLines: definition.tools.length,
  };
}
