import type {
  ActiveBuff,
  CurrentActivity,
  SkillLoopDefinition,
  SkillLoopState,
} from '../domain/skill-loop/types';
import { getEffectiveCycleMs } from '../domain/skill-loop/rates';
import {
  SkillSaveValidationError,
  validateSkillLoopSave,
  validCycleDuration,
} from './skill-loop-codec';

/** Frozen definitions of every previous content version, used to validate old saves. */
export interface SkillPrototypePreviousDefinitions {
  readonly p1: SkillLoopDefinition;
  readonly p2: SkillLoopDefinition;
  readonly p3: SkillLoopDefinition;
  readonly p4: SkillLoopDefinition;
  readonly p5: SkillLoopDefinition;
  readonly p6: SkillLoopDefinition;
  readonly p7: SkillLoopDefinition;
  readonly p8: SkillLoopDefinition;
  readonly p9: SkillLoopDefinition;
}

function unsupported(message: string): never {
  throw new SkillSaveValidationError('UNSUPPORTED_VERSION', message);
}

function sourceRecord(source: unknown): Record<string, unknown> {
  if (source === null || typeof source !== 'object' || Array.isArray(source))
    return unsupported('技能原型存档不是可识别的对象。');
  return source as Record<string, unknown>;
}

function preserveRecord<T extends Readonly<Record<string, number>>>(
  defaults: T,
  previous: Readonly<Record<string, number>>,
  currentIds: ReadonlySet<string>,
  field: string,
): Record<string, number> {
  for (const id of Object.keys(previous)) {
    if (!currentIds.has(id)) unsupported(`旧存档的 ${field} 含有新版本无法解释的 ID：${id}。`);
  }
  return { ...defaults, ...previous };
}

/**
 * Carry the mastery records forward and zero-initialise only the keys the newer content adds.
 * Replacing them wholesale would wipe mastery progress on every content bump inside schema 4,
 * which is the opposite of the additive promise.
 */
function withMasteryDefaults(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
): SkillLoopState {
  if (definition.schemaVersion !== 4) return state;
  const activityIds = new Set(definition.activities.map((activity) => activity.id));
  const skillIds = new Set(definition.skills.map((skill) => skill.id));
  return {
    ...state,
    masteryXp: preserveRecord(
      Object.fromEntries(definition.activities.map((activity) => [activity.id, 0])),
      state.masteryXp ?? {},
      activityIds,
      '精通经验',
    ),
    masteryPool: preserveRecord(
      Object.fromEntries(definition.skills.map((skill) => [skill.id, 0])),
      state.masteryPool ?? {},
      skillIds,
      '精通池',
    ),
  };
}

/** Re-read a buff's multipliers from current content; drop a buff whose item stopped being edible. */
function carryBuffs(previous: SkillLoopState, definition: SkillLoopDefinition): ActiveBuff[] {
  return (previous.buffs ?? []).flatMap((buff) => {
    const item = definition.items.find((candidate) => candidate.id === buff.sourceItemId);
    const effect = item?.consumable;
    if (item === undefined || effect === undefined) return [];
    return [
      {
        sourceItemId: item.id,
        ...(effect.speedMultiplierPermille !== undefined
          ? { speedMultiplierPermille: effect.speedMultiplierPermille }
          : {}),
        ...(effect.xpMultiplierPermille !== undefined
          ? { xpMultiplierPermille: effect.xpMultiplierPermille }
          : {}),
        remainingMs: buff.remainingMs,
      },
    ];
  });
}

/**
 * A running cycle keeps its captured duration unless the newer content can no longer reproduce it
 * (a numeric retune changes the base); then it is recomputed from the one duration formula and the
 * partial progress is clamped inside the new cycle instead of invalidating the whole save.
 */
function carryCurrentActivity(
  previous: SkillLoopState,
  definition: SkillLoopDefinition,
): CurrentActivity | null {
  const captured = previous.currentActivity;
  if (captured === null) return null;
  const activity = definition.activities.find((entry) => entry.id === captured.activityId);
  if (activity === undefined) return captured;
  if (validCycleDuration(captured.cycleDurationMs, activity, definition)) return captured;
  const normalized = {
    ...previous,
    buffs: carryBuffs(previous, definition),
  };
  const cycleDurationMs = getEffectiveCycleMs(normalized, definition, activity);
  return {
    ...captured,
    cycleDurationMs,
    progressMs: Math.min(captured.progressMs, Math.max(0, cycleDurationMs - 1)),
  };
}

/** Zero-fill a pending return report's delta records so added IDs never invalidate the receipt. */
function carryReturnReport(
  previous: SkillLoopState,
  definition: SkillLoopDefinition,
): SkillLoopState['returnReport'] {
  const report = previous.returnReport;
  if (report === null) return null;
  const fill = (
    defaults: Readonly<Record<string, number>>,
    delta: Readonly<Record<string, number>>,
  ): Record<string, number> => {
    const merged: Record<string, number> = { ...defaults };
    for (const [id, value] of Object.entries(delta)) if (id in merged) merged[id] = value;
    return merged;
  };
  return {
    ...report,
    inventoryDelta: fill(
      Object.fromEntries(definition.items.map((item) => [item.id, 0])),
      report.inventoryDelta,
    ),
    skillXpDelta: fill(
      Object.fromEntries(definition.skills.map((skill) => [skill.id, 0])),
      report.skillXpDelta,
    ),
    unlockedActivityIds: report.unlockedActivityIds.filter((id) =>
      definition.activities.some((activity) => activity.id === id),
    ),
  };
}

/** Carry older facts forward and zero-initialise keys the newer content adds. */
function fillNewerKeys(previous: SkillLoopState, definition: SkillLoopDefinition): SkillLoopState {
  return withMasteryDefaults(
    {
      ...previous,
      schemaVersion: definition.schemaVersion,
      contentVersion: definition.contentVersion,
      ...mergeNewerRecords(previous, definition),
      returnReport: null,
      buffs: [],
    },
    definition,
  );
}

/**
 * Keep every schema-3 fact (inventory/XP/tools/current activity/pending receipt/buffs) and
 * only zero-initialise keys that the newer content adds. Used for content-only bumps inside
 * the same schema (3.0.0 -> ... -> 7.0.0) and for the 7.0.0/3 -> 8.0.0/4 mastery bump, where a
 * pending return report must survive and the mastery keys start at zero.
 */
function extendSameSchema(
  previous: SkillLoopState,
  definition: SkillLoopDefinition,
): SkillLoopState {
  return withMasteryDefaults(
    {
      ...previous,
      // Restated so a bump that also raises the schema (7.0.0/3 -> 8.0.0/4) lands on the new one.
      schemaVersion: definition.schemaVersion,
      contentVersion: definition.contentVersion,
      ...mergeNewerRecords(previous, definition),
      // Server-side facts a numeric retune would otherwise invalidate on load: the active buff's
      // multipliers, the running cycle's captured duration and the pending receipt's delta keys.
      buffs: carryBuffs(previous, definition),
      currentActivity: carryCurrentActivity(previous, definition),
      returnReport: carryReturnReport(previous, definition),
    },
    definition,
  );
}

function mergeNewerRecords(
  previous: SkillLoopState,
  definition: SkillLoopDefinition,
): Pick<SkillLoopState, 'inventory' | 'skillXp' | 'toolLevels'> {
  const itemIds = new Set(definition.items.map((item) => item.id));
  const skillIds = new Set(definition.skills.map((skill) => skill.id));
  const toolIds = new Set(definition.tools.map((tool) => tool.id));
  return {
    inventory: preserveRecord(definition.initialInventory, previous.inventory, itemIds, '库存'),
    skillXp: preserveRecord(definition.initialSkillXp, previous.skillXp, skillIds, '技能经验'),
    toolLevels: preserveRecord(
      definition.initialToolLevels,
      previous.toolLevels,
      toolIds,
      '工具等级',
    ),
  };
}

/**
 * Explicit, additive migrations into the current JSON-assembled content. Every branch
 * validates the source against its own frozen definition first; unrecognised versions are
 * refused and the original file is left untouched.
 */
export function migrateSkillPrototypeSave(
  value: unknown,
  previous: SkillPrototypePreviousDefinitions,
  definition: SkillLoopDefinition,
): SkillLoopState {
  const source = sourceRecord(value);
  if (
    definition.profileId !== 'skill-prototype-v1' ||
    (definition.schemaVersion !== 3 && definition.schemaVersion !== 4)
  ) {
    return unsupported('此迁移只支持 skill-prototype-v1 的当前 schema 3/4。');
  }
  if (source.profileId !== definition.profileId) {
    return unsupported('存档 profile 或格式版本不兼容，原存档未被覆盖。');
  }

  if (source.contentVersion === '1.0.0' && source.schemaVersion === 1) {
    return fillNewerKeys(validateSkillLoopSave(source, previous.p1), definition);
  }

  if (source.contentVersion === '2.0.0' && source.schemaVersion === 1) {
    const frozen: SkillLoopDefinition = { ...previous.p2, schemaVersion: 1 };
    return fillNewerKeys(validateSkillLoopSave(source, frozen), definition);
  }

  if (source.contentVersion === '2.0.0' && source.schemaVersion === 2) {
    return fillNewerKeys(validateSkillLoopSave(source, previous.p2), definition);
  }

  if (source.contentVersion === '3.0.0' && source.schemaVersion === 3) {
    return extendSameSchema(validateSkillLoopSave(source, previous.p3), definition);
  }

  if (source.contentVersion === '4.0.0' && source.schemaVersion === 3) {
    return extendSameSchema(validateSkillLoopSave(source, previous.p4), definition);
  }

  if (source.contentVersion === '5.0.0' && source.schemaVersion === 3) {
    return extendSameSchema(validateSkillLoopSave(source, previous.p5), definition);
  }

  if (source.contentVersion === '6.0.0' && source.schemaVersion === 3) {
    // Rules batch 7.0.0 adds the sell command and two level-effect fields; neither changes the
    // state shape, so the same additive path carries every schema-3 fact forward.
    return extendSameSchema(validateSkillLoopSave(source, previous.p6), definition);
  }

  if (source.contentVersion === '7.0.0' && source.schemaVersion === 3) {
    // Mastery batch 8.0.0 is the first schema bump: the two new record keys zero-initialise and
    // every schema-3 fact survives.
    return extendSameSchema(validateSkillLoopSave(source, previous.p7), definition);
  }

  if (source.contentVersion === '8.0.0' && source.schemaVersion === 4) {
    // T3–T5 batch 9.0.0 stays on schema 4: mastery progress and the pending receipt carry over,
    // new item/skill/tool keys zero-initialise, and a captured cycle that the retuned numbers can
    // no longer reproduce is recomputed instead of refusing the save.
    return extendSameSchema(validateSkillLoopSave(source, previous.p8), definition);
  }

  if (source.contentVersion === '9.0.0' && source.schemaVersion === 4) {
    // Pacing-retune batch 10.0.0 stays on schema 4: the curve tail was re-tuned (R_TAIL=1.04), so
    // the only change is the XP thresholds; mastery progress and the pending receipt carry over, and
    // a captured cycle that the retuned numbers can no longer reproduce is recomputed, never refused.
    return extendSameSchema(validateSkillLoopSave(source, previous.p9), definition);
  }

  return unsupported('此技能原型存档版本没有经过验证的迁移路径，原存档未被覆盖。');
}
