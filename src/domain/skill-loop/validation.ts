import type {
  ActivityDefinition,
  MaterialAmount,
  SkillLevelEffect,
  SkillLoopDefinition,
  SkillLoopId,
  ToolDefinition,
  ToolUpgradeDefinition,
} from './types';
import { OFFLINE_WINDOW_CAP_MS } from './rates';
import { MASTERY_CHECKPOINT_SPEED_PERMILLE } from './mastery';

const MAXIMUM = Number.MAX_SAFE_INTEGER;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Lowest legal stack of tool x consumable x global x mastery; see the floor comment below. */
const MINIMUM_CYCLE_MULTIPLIER = 0.3;

function requireId(id: string, label: string, allIds: Set<string>): void {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid ${label} ID: ${id}`);
  if (allIds.has(id)) throw new Error(`Duplicate skill-loop content ID: ${id}`);
  allIds.add(id);
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAXIMUM)
    throw new RangeError(`Invalid positive integer for ${label}`);
}

function requireNonnegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAXIMUM)
    throw new RangeError(`Invalid nonnegative integer for ${label}`);
}

function validateMaterials(
  values: readonly MaterialAmount[],
  items: ReadonlySet<SkillLoopId>,
  label: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!items.has(value.itemId)) throw new Error(`Unknown item in ${label}: ${value.itemId}`);
    if (seen.has(value.itemId)) throw new Error(`Duplicate material in ${label}: ${value.itemId}`);
    seen.add(value.itemId);
    requirePositiveInteger(value.amount, `${label}/${value.itemId}`);
  }
}

function validateActivity(
  activity: ActivityDefinition,
  skillIds: ReadonlySet<string>,
  levelCounts: ReadonlyMap<string, number>,
  recipeIds: ReadonlySet<string>,
  itemIds: ReadonlySet<string>,
): void {
  if (!skillIds.has(activity.skillId)) throw new Error(`Unknown activity skill: ${activity.id}`);
  const levelCount = levelCounts.get(activity.skillId) ?? 0;
  requirePositiveInteger(activity.requiredLevel, `activity level/${activity.id}`);
  if (activity.requiredLevel > levelCount)
    throw new Error(`Activity requires an undefined skill level: ${activity.id}`);
  requirePositiveInteger(activity.durationMs, `activity duration/${activity.id}`);
  requireNonnegativeInteger(activity.xpPerCycle, `activity XP/${activity.id}`);
  if (activity.kind === 'gather') {
    validateMaterials(activity.outputs, itemIds, `activity output/${activity.id}`);
    if (activity.outputs.length === 0)
      throw new Error(`Gather activity has no output: ${activity.id}`);
  } else if (!recipeIds.has(activity.recipeId)) {
    throw new Error(`Unknown activity recipe: ${activity.id}/${activity.recipeId}`);
  }
}

function validateTool(tool: ToolDefinition, skillIds: ReadonlySet<string>): void {
  if (!skillIds.has(tool.skillId)) throw new Error(`Unknown tool skill: ${tool.id}`);
  if (tool.levels.length === 0 || tool.levels[0]?.level !== 1)
    throw new Error(`Tool levels must begin at level 1: ${tool.id}`);
  let previousMultiplier = Number.MAX_SAFE_INTEGER;
  tool.levels.forEach((level, index) => {
    if (level.level !== index + 1) throw new Error(`Tool levels must be contiguous: ${tool.id}`);
    requirePositiveInteger(level.durationMultiplierPermille, `tool multiplier/${tool.id}`);
    if (
      (index === 0 && level.durationMultiplierPermille !== 1_000) ||
      (index > 0 && level.durationMultiplierPermille >= previousMultiplier)
    )
      throw new Error(`Tool upgrades must reduce activity duration: ${tool.id}`);
    previousMultiplier = level.durationMultiplierPermille;
  });
}

function validateUpgrade(
  upgrade: ToolUpgradeDefinition,
  tools: ReadonlyMap<string, ToolDefinition>,
  itemIds: ReadonlySet<string>,
): void {
  const tool = tools.get(upgrade.toolId);
  if (tool === undefined) throw new Error(`Unknown tool upgrade target: ${upgrade.id}`);
  requirePositiveInteger(upgrade.sourceLevel, `upgrade source level/${upgrade.id}`);
  requirePositiveInteger(upgrade.targetLevel, `upgrade target level/${upgrade.id}`);
  if (upgrade.targetLevel > tool.levels.length || upgrade.targetLevel !== upgrade.sourceLevel + 1)
    throw new Error(`Invalid tool upgrade level: ${upgrade.id}`);
  if (!itemIds.has(upgrade.requiredItemId))
    throw new Error(`Unknown tool upgrade material: ${upgrade.id}/${upgrade.requiredItemId}`);
  requirePositiveInteger(upgrade.requiredAmount, `upgrade cost/${upgrade.id}`);
}

function validateInitialRecord(
  record: Readonly<Record<string, number>>,
  expectedIds: ReadonlySet<string>,
  label: string,
): void {
  if (Object.keys(record).length !== expectedIds.size)
    throw new Error(`${label} must define every current ID exactly once`);
  for (const [id, value] of Object.entries(record)) {
    if (!expectedIds.has(id)) throw new Error(`Unknown ${label} ID: ${id}`);
    requireNonnegativeInteger(value, `${label}/${id}`);
  }
}

/**
 * Speed ranges are read per schema because the direction changed inside one schema generation:
 * contents up to schema 3 wrote "1150 = 15% faster" and the engine multiplied it onto the duration
 * (so those numbers actually slowed cycles down); the content 8.0.0 retune flipped every speed
 * field onto the cycle convention used by tools. Frozen schema-3 snapshots keep their historical
 * numbers on purpose — `validCycleDuration` reproduces them to accept an old save's captured cycle
 * — so the legacy range stays accepted for them and only current content is held to the new one.
 */
function speedRange(schemaVersion: number): { readonly minimum: number; readonly maximum: number } {
  return schemaVersion <= 3 ? { minimum: 1_001, maximum: 2_000 } : { minimum: 500, maximum: 1_000 };
}

function validateLevelEffect(
  skillId: string,
  level: number,
  effect: SkillLevelEffect,
  schemaVersion: number,
): void {
  const speed = effect.globalSpeedBonusPermille;
  const xp = effect.globalXpBonusPermille;
  const offlineCapBonusMs = effect.offlineCapBonusMs;
  if (speed === undefined && xp === undefined && offlineCapBonusMs === undefined)
    throw new Error(`Skill level effect needs at least one field: ${skillId}/${level}`);
  // Cycle-multiplier convention on current content: below 1000 shortens the cycle, 1000 is the
  // neutral baseline, and 500 matches the tool floor. XP keeps the "above 1000 grants more" sense.
  const range = speedRange(schemaVersion);
  if (
    speed !== undefined &&
    (!Number.isSafeInteger(speed) || speed < range.minimum || speed > range.maximum)
  )
    throw new RangeError(`Invalid global speed bonus: ${skillId}/${level}`);
  if (xp !== undefined && (!Number.isSafeInteger(xp) || xp <= 1_000 || xp > 2_000))
    throw new RangeError(`Invalid global XP bonus: ${skillId}/${level}`);
  if (
    offlineCapBonusMs !== undefined &&
    (!Number.isSafeInteger(offlineCapBonusMs) ||
      offlineCapBonusMs <= 0 ||
      offlineCapBonusMs > OFFLINE_WINDOW_CAP_MS)
  )
    throw new RangeError(`Invalid offline cap bonus: ${skillId}/${level}`);
}

export function validateSkillLoopDefinition(definition: SkillLoopDefinition): void {
  if (
    definition.profileId !== 'skill-prototype-v1' ||
    (definition.schemaVersion !== 1 &&
      definition.schemaVersion !== 2 &&
      definition.schemaVersion !== 3 &&
      definition.schemaVersion !== 4)
  )
    throw new Error('Invalid skill-loop profile or schema version');
  if (definition.contentVersion.length === 0) throw new Error('Missing skill-loop content version');
  if (
    definition.skills.length === 0 ||
    definition.items.length === 0 ||
    definition.activities.length === 0
  )
    throw new Error('Skill-loop content requires skills, items, and activities');
  requirePositiveInteger(definition.maxOfflineMs, 'offline limit');
  const allIds = new Set<string>();
  const skillIds = new Set<string>();
  const levelCounts = new Map<string, number>();
  for (const skill of definition.skills) {
    requireId(skill.id, 'skill', allIds);
    if (skill.levels.length === 0) throw new Error(`Skill has no levels: ${skill.id}`);
    skill.levels.forEach((threshold, index) => {
      if (threshold.level !== index + 1)
        throw new Error(`Skill levels must be contiguous: ${skill.id}`);
      requireNonnegativeInteger(threshold.xpRequired, `skill XP threshold/${skill.id}`);
      if (
        (index === 0 && threshold.xpRequired !== 0) ||
        (index > 0 && threshold.xpRequired <= (skill.levels[index - 1]?.xpRequired ?? 0))
      ) {
        throw new Error(`Skill XP thresholds must rise from zero: ${skill.id}`);
      }
      if (threshold.effect !== undefined)
        validateLevelEffect(skill.id, threshold.level, threshold.effect, definition.schemaVersion);
    });
    skillIds.add(skill.id);
    levelCounts.set(skill.id, skill.levels.length);
  }
  const itemCategoryIds = new Set<string>();
  for (const category of definition.itemCategories) {
    requireId(category.id, 'item category', allIds);
    itemCategoryIds.add(category.id);
  }
  const itemIds = new Set<string>();
  const consumableMultipliers = new Set<number>([1_000]);
  for (const item of definition.items) {
    requireId(item.id, 'item', allIds);
    if (!itemCategoryIds.has(item.categoryId))
      throw new Error(`Unknown item category: ${item.id}/${item.categoryId}`);
    if (item.consumable !== undefined) {
      const effect = item.consumable;
      const speed = effect.speedMultiplierPermille;
      const xp = effect.xpMultiplierPermille;
      const range = speedRange(definition.schemaVersion);
      const speedValid =
        speed !== undefined &&
        Number.isSafeInteger(speed) &&
        speed >= range.minimum &&
        speed <= range.maximum;
      const xpValid = xp !== undefined && Number.isSafeInteger(xp) && xp > 1_000 && xp <= 2_000;
      if (speed !== undefined && !speedValid)
        throw new RangeError(`Invalid consumable speed multiplier: ${item.id}`);
      if (xp !== undefined && !xpValid)
        throw new RangeError(`Invalid consumable xp multiplier: ${item.id}`);
      if (speed === undefined && xp === undefined)
        throw new Error(`Consumable requires at least one effect: ${item.id}`);
      requirePositiveInteger(effect.durationMs, `consumable duration/${item.id}`);
      if (speed !== undefined) consumableMultipliers.add(speed);
    }
    itemIds.add(item.id);
  }
  if (definition.offlineFuel !== undefined) {
    const fuel = definition.offlineFuel;
    if (definition.schemaVersion < 3) throw new Error('Offline fuel requires skill-loop schema 3');
    if (!itemIds.has(fuel.itemId)) throw new Error(`Unknown offline fuel item: ${fuel.itemId}`);
    requirePositiveInteger(fuel.extensionMs, 'offline fuel extension');
    requirePositiveInteger(fuel.maxExtensionMs, 'offline fuel maximum extension');
    if (fuel.maxExtensionMs < fuel.extensionMs)
      throw new Error('Offline fuel maximum extension must cover one unit');
  }
  const recipeIds = new Set<string>();
  for (const recipe of definition.recipes) {
    requireId(recipe.id, 'recipe', allIds);
    recipeIds.add(recipe.id);
    validateMaterials(recipe.inputs, itemIds, `recipe input/${recipe.id}`);
    validateMaterials(recipe.outputs, itemIds, `recipe output/${recipe.id}`);
    if (recipe.inputs.length === 0 || recipe.outputs.length === 0)
      throw new Error(`Recipe must have inputs and outputs: ${recipe.id}`);
  }
  const recipeUseCount = new Map<string, number>();
  for (const activity of definition.activities) {
    requireId(activity.id, 'activity', allIds);
    validateActivity(activity, skillIds, levelCounts, recipeIds, itemIds);
    if (activity.kind === 'craft')
      recipeUseCount.set(activity.recipeId, (recipeUseCount.get(activity.recipeId) ?? 0) + 1);
  }
  for (const recipe of recipeIds) {
    if (recipeUseCount.get(recipe) !== 1)
      throw new Error(`Recipe must be used by exactly one activity: ${recipe}`);
  }
  const tools = new Map<string, ToolDefinition>();
  const toolSkills = new Set<string>();
  for (const tool of definition.tools) {
    requireId(tool.id, 'tool', allIds);
    if (toolSkills.has(tool.skillId))
      throw new Error(`A skill has multiple activity tools: ${tool.skillId}`);
    validateTool(tool, skillIds);
    toolSkills.add(tool.skillId);
    tools.set(tool.id, tool);
  }
  // The mastery checkpoint tiers only exist on schema 4; the duration floor below must hold for
  // every reachable combination of tool x buff x global x mastery.
  const masterySpeedMultipliers = new Set<number>([1_000]);
  if (definition.schemaVersion === 4) {
    for (const multiplier of MASTERY_CHECKPOINT_SPEED_PERMILLE)
      masterySpeedMultipliers.add(multiplier);
  }
  const globalSpeedMultipliers = new Set<number>([1_000]);
  for (const skill of definition.skills) {
    for (const threshold of skill.levels) {
      if (threshold.effect?.globalSpeedBonusPermille !== undefined) {
        globalSpeedMultipliers.add(threshold.effect.globalSpeedBonusPermille);
      }
    }
  }
  for (const activity of definition.activities) {
    const tool = [...tools.values()].find((candidate) => candidate.skillId === activity.skillId);
    const toolLevels = tool?.levels ?? [{ level: 1, durationMultiplierPermille: 1_000 }];
    for (const level of toolLevels) {
      for (const buffMultiplier of consumableMultipliers) {
        for (const globalMultiplier of globalSpeedMultipliers) {
          for (const masteryMultiplier of masterySpeedMultipliers) {
            const scaledDuration =
              (activity.durationMs *
                level.durationMultiplierPermille *
                buffMultiplier *
                globalMultiplier *
                masteryMultiplier) /
              1_000_000_000_000;
            if (scaledDuration <= 0 || !Number.isSafeInteger(Math.ceil(scaledDuration)))
              throw new RangeError(`Activity duration exceeds numeric limits: ${activity.id}`);
            // Safety floor derivation (content 8.0.0 retune, 2026-10-16):
            // 0.5 was set before any speed effect actually shortened a cycle, when >1000 permille
            // still meant "faster" and the four factors could therefore only multiply upwards.
            // With every speed field now on the cycle convention (< 1000 shortens), the worst legal
            // stack is tool Lv5 550 x food-t5 770 x agility Lv3 943 x mastery 95% 800 = 0.319 of the
            // base cycle; on the shortest base in content (T1 gather, 7,000 ms) that is 2,237 ms,
            // still far from the 1 s zone R8 warns about. The real collapse guard stays the
            // `scaled > 0` / safe-integer check just above: the floor only shapes content design.
            const product =
              (level.durationMultiplierPermille *
                buffMultiplier *
                globalMultiplier *
                masteryMultiplier) /
              1_000_000_000_000;
            if (product < MINIMUM_CYCLE_MULTIPLIER)
              throw new RangeError(
                `Cycle multiplier falls below the ${MINIMUM_CYCLE_MULTIPLIER} floor: ${activity.id} (${product.toFixed(3)})`,
              );
          }
        }
      }
    }
  }
  const upgradeTargets = new Set<string>();
  for (const upgrade of definition.toolUpgrades) {
    requireId(upgrade.id, 'tool upgrade', allIds);
    validateUpgrade(upgrade, tools, itemIds);
    const target = `${upgrade.toolId}:${upgrade.targetLevel}`;
    if (upgradeTargets.has(target)) throw new Error(`Duplicate tool upgrade target: ${target}`);
    upgradeTargets.add(target);
  }
  for (const tool of tools.values()) {
    for (let targetLevel = 2; targetLevel <= tool.levels.length; targetLevel += 1) {
      if (!upgradeTargets.has(`${tool.id}:${targetLevel}`))
        throw new Error(`Tool level has no upgrade route: ${tool.id}/${targetLevel}`);
    }
  }
  validateInitialRecord(definition.initialInventory, itemIds, 'initial inventory');
  validateInitialRecord(definition.initialSkillXp, skillIds, 'initial skill XP');
  validateInitialRecord(definition.initialToolLevels, new Set(tools.keys()), 'initial tool levels');
  for (const skill of definition.skills) {
    const initialXp = definition.initialSkillXp[skill.id] ?? 0;
    const xpCeiling = skill.levels.at(-1)?.xpRequired ?? 0;
    if (initialXp > xpCeiling) throw new Error(`Initial XP exceeds the prototype cap: ${skill.id}`);
  }
  for (const tool of definition.tools) {
    const initialLevel = definition.initialToolLevels[tool.id] ?? 0;
    if (initialLevel < 1 || initialLevel > tool.levels.length)
      throw new Error(`Invalid initial tool level: ${tool.id}`);
  }
  if (definition.shopOffers !== undefined) {
    if (definition.schemaVersion < 3) throw new Error('Shop offers require skill-loop schema 3');
    const offerIds = new Set<string>();
    for (const offer of definition.shopOffers) {
      requireId(offer.id, 'shop offer', allIds);
      if (offerIds.has(offer.id)) throw new Error(`Duplicate shop offer: ${offer.id}`);
      offerIds.add(offer.id);
      if (!itemIds.has(offer.itemId))
        throw new Error(`Unknown shop offer item: ${offer.id}/${offer.itemId}`);
      requirePositiveInteger(offer.amount, `shop offer amount/${offer.id}`);
      requirePositiveInteger(offer.coinCost, `shop offer coin cost/${offer.id}`);
      if (offer.requiredLevel !== undefined)
        requirePositiveInteger(offer.requiredLevel, `shop offer level/${offer.id}`);
    }
  }
  if (definition.sellOffers !== undefined) {
    if (definition.schemaVersion < 3) throw new Error('Sell offers require skill-loop schema 3');
    const offerIds = new Set<string>();
    for (const offer of definition.sellOffers) {
      requireId(offer.id, 'sell offer', allIds);
      if (offerIds.has(offer.id)) throw new Error(`Duplicate sell offer: ${offer.id}`);
      offerIds.add(offer.id);
      if (!itemIds.has(offer.itemId))
        throw new Error(`Unknown sell offer item: ${offer.id}/${offer.itemId}`);
      requirePositiveInteger(offer.amount, `sell offer amount/${offer.id}`);
      requirePositiveInteger(offer.coinValue, `sell offer coin value/${offer.id}`);
    }
  }
}
