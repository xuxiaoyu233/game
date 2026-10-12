import type {
  ActivityDefinition,
  MaterialAmount,
  SkillLoopDefinition,
  SkillLoopId,
  ToolDefinition,
  ToolUpgradeDefinition,
} from './types';

const MAXIMUM = Number.MAX_SAFE_INTEGER;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export function validateSkillLoopDefinition(definition: SkillLoopDefinition): void {
  if (definition.profileId !== 'skill-prototype-v1' || definition.schemaVersion !== 1)
    throw new Error('Invalid skill-loop profile or schema version');
  if (definition.contentVersion.length === 0) throw new Error('Missing skill-loop content version');
  if (
    definition.skills.length === 0 ||
    definition.items.length === 0 ||
    definition.activities.length === 0
  )
    throw new Error('Skill-loop content requires skills, items, and activities');
  requirePositiveInteger(definition.maxOfflineMs, 'offline limit');
  if (
    definition.capBehavior !== 'level-threshold' &&
    definition.capBehavior !== 'first-tier-xp-cap' &&
    definition.capBehavior !== 'retain-overflow-xp'
  ) {
    throw new Error('Invalid skill cap behavior');
  }

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
    });
    requirePositiveInteger(skill.firstTierXpCap, `first-tier XP cap/${skill.id}`);
    if (skill.firstTierXpCap < (skill.levels.at(-1)?.xpRequired ?? 0))
      throw new Error(`First-tier XP cap is below a defined level: ${skill.id}`);
    skillIds.add(skill.id);
    levelCounts.set(skill.id, skill.levels.length);
  }
  const itemCategoryIds = new Set<string>();
  for (const category of definition.itemCategories) {
    requireId(category.id, 'item category', allIds);
    itemCategoryIds.add(category.id);
  }
  const itemIds = new Set<string>();
  for (const item of definition.items) {
    requireId(item.id, 'item', allIds);
    if (!itemCategoryIds.has(item.categoryId))
      throw new Error(`Unknown item category: ${item.id}/${item.categoryId}`);
    itemIds.add(item.id);
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
  for (const activity of definition.activities) {
    const tool = [...tools.values()].find((candidate) => candidate.skillId === activity.skillId);
    if (tool === undefined) continue;
    for (const level of tool.levels) {
      const scaledDuration = activity.durationMs * level.durationMultiplierPermille;
      if (
        !Number.isSafeInteger(scaledDuration) ||
        !Number.isSafeInteger(Math.ceil(scaledDuration / 1_000))
      )
        throw new RangeError(`Activity duration exceeds numeric limits: ${activity.id}`);
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
    const xpCeiling =
      definition.capBehavior === 'retain-overflow-xp'
        ? null
        : definition.capBehavior === 'first-tier-xp-cap'
          ? skill.firstTierXpCap
          : (skill.levels.at(-1)?.xpRequired ?? 0);
    if (xpCeiling !== null && initialXp > xpCeiling)
      throw new Error(`Initial XP exceeds the prototype cap: ${skill.id}`);
  }
  for (const tool of definition.tools) {
    const initialLevel = definition.initialToolLevels[tool.id] ?? 0;
    if (initialLevel < 1 || initialLevel > tool.levels.length)
      throw new Error(`Invalid initial tool level: ${tool.id}`);
  }
}
