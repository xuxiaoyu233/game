import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Content JSON gate (replaces the deleted content unit tests): structural schema,
// cross-references and design invariants for src/content/data/*.json. The runtime
// validateSkillLoopDefinition stays as the assembly-time second line of defence.
const root = process.cwd();
const dataDirectory = path.join(root, 'src', 'content', 'data');
const errors = [];

function fail(message) {
  errors.push(message);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKebabCase(value) {
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    fail(`${label} 必须是数组。`);
    return [];
  }
  return value;
}

function requireRecord(value, label) {
  if (!isPlainObject(value)) {
    fail(`${label} 必须是对象。`);
    return null;
  }
  return value;
}

function readId(entry, label, index, seen, idLabel) {
  if (!isPlainObject(entry)) {
    fail(`${label}[${index}] 必须是对象。`);
    return null;
  }
  const id = entry.id;
  if (typeof id !== 'string' || !isKebabCase(id)) {
    fail(`${label}[${index}].id 必须是稳定英文 kebab-case 字符串。`);
    return null;
  }
  if (seen.has(id)) {
    fail(`${idLabel} 重复：${id}`);
    return null;
  }
  seen.add(id);
  return id;
}

async function readJson(fileName) {
  const contents = await readFile(path.join(dataDirectory, fileName), 'utf8');
  return JSON.parse(contents);
}

const profile = requireRecord(await readJson('profile.json'), 'profile.json');
const skills = requireArray(await readJson('skills.json'), 'skills.json');
const items = requireArray(await readJson('items.json'), 'items.json');
const activities = requireArray(await readJson('activities.json'), 'activities.json');
const recipes = requireArray(await readJson('recipes.json'), 'recipes.json');
const tools = requireArray(await readJson('tools.json'), 'tools.json');
const toolUpgrades = requireArray(await readJson('tool-upgrades.json'), 'tool-upgrades.json');

// --- profile -----------------------------------------------------------------
if (profile !== null) {
  if (profile.profileId !== 'skill-prototype-v1')
    fail('profile.profileId 必须是 skill-prototype-v1。');
  if (profile.schemaVersion !== 3 && profile.schemaVersion !== 4)
    fail('profile.schemaVersion 必须是 3 或 4。');
  if (typeof profile.contentVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(profile.contentVersion))
    fail('profile.contentVersion 必须是 semver 字符串。');
  if (!isPositiveInteger(profile.maxOfflineMs)) fail('profile.maxOfflineMs 必须是正整数毫秒。');
  if (profile.offlineFuel !== undefined) {
    const fuel = requireRecord(profile.offlineFuel, 'profile.offlineFuel');
    if (fuel !== null) {
      if (typeof fuel.itemId !== 'string') fail('offlineFuel.itemId 必须是字符串。');
      if (!isPositiveInteger(fuel.extensionMs)) fail('offlineFuel.extensionMs 必须是正整数毫秒。');
      if (!isPositiveInteger(fuel.maxExtensionMs))
        fail('offlineFuel.maxExtensionMs 必须是正整数毫秒。');
      if (fuel.maxExtensionMs < fuel.extensionMs)
        fail('offlineFuel.maxExtensionMs 必须不小于 extensionMs。');
    }
  }
}

// --- skills ------------------------------------------------------------------
const skillIds = new Set();
for (const [index, skill] of skills.entries()) {
  const id = readId(skill, 'skills.json', index, skillIds, '技能');
  if (id === null) continue;
  const levels = requireArray(skill.levels, `skills.json/${id}.levels`);
  if (levels.length === 0) {
    fail(`技能 ${id} 至少需要一个等级。`);
    continue;
  }
  let previousLevel = 0;
  let previousXp = -1;
  const levelSet = new Set();
  for (const level of levels) {
    if (!isPlainObject(level)) {
      fail(`技能 ${id} 的等级条目必须是对象。`);
      continue;
    }
    if (level.level !== previousLevel + 1) fail(`技能 ${id} 的等级必须从 1 连续递增。`);
    previousLevel = level.level;
    if (!isNonNegativeInteger(level.xpRequired))
      fail(`技能 ${id} Lv${level.level} 的 xpRequired 必须是非负整数。`);
    if (level.xpRequired <= previousXp) fail(`技能 ${id} 的 XP 门槛必须严格递增。`);
    previousXp = level.xpRequired;
    levelSet.add(level.level);
    if (level.effect !== undefined) {
      const effect = requireRecord(level.effect, `skills.json/${id} Lv${level.level}.effect`);
      if (effect !== null) {
        const speed = effect.globalSpeedBonusPermille;
        const xp = effect.globalXpBonusPermille;
        const offlineCap = effect.offlineCapBonusMs;
        if (speed === undefined && xp === undefined && offlineCap === undefined)
          fail(`技能 ${id} Lv${level.level} 的 effect 至少需要一个字段。`);
        // 周期倍率口径：<1000 表示更快，1000 表示不慢于基准，下限 500 与工具倍率一致。
        if (speed !== undefined && (!Number.isSafeInteger(speed) || speed < 500 || speed > 1_000))
          fail(
            `技能 ${id} Lv${level.level} 的 globalSpeedBonusPermille 必须在 500–1000 permille（周期倍率，<1000 更快）。`,
          );
        if (xp !== undefined && (!Number.isSafeInteger(xp) || xp <= 1_000 || xp > 2_000))
          fail(`技能 ${id} Lv${level.level} 的 globalXpBonusPermille 必须在 1001–2000 permille。`);
        if (offlineCap !== undefined && (!isPositiveInteger(offlineCap) || offlineCap > 86_400_000))
          fail(
            `技能 ${id} Lv${level.level} 的 offlineCapBonusMs 必须是 1–86400000 毫秒（24 小时）的正整数。`,
          );
      }
    }
  }
  if (!levelSet.has(1)) fail(`技能 ${id} 必须定义 Lv1。`);
}

// --- items -------------------------------------------------------------------
const itemIds = new Set();
const categoryIds = new Set();
const consumableItems = new Map();
for (const [index, item] of items.entries()) {
  const id = readId(item, 'items.json', index, itemIds, '物品');
  if (id === null) continue;
  if (typeof item.categoryId !== 'string' || !isKebabCase(item.categoryId))
    fail(`物品 ${id} 的 categoryId 必须是 kebab-case 字符串。`);
  else categoryIds.add(item.categoryId);
  if (item.consumable !== undefined) {
    const effect = requireRecord(item.consumable, `items.json/${id}.consumable`);
    if (effect !== null) {
      const speed = effect.speedMultiplierPermille;
      const xp = effect.xpMultiplierPermille;
      // 周期倍率口径：与工具倍率同向，<1000 缩短周期；经验倍率仍保持 1001–2000。
      const speedValid =
        speed === undefined || (Number.isSafeInteger(speed) && speed >= 500 && speed <= 1_000);
      const xpValid = xp === undefined || (Number.isSafeInteger(xp) && xp > 1_000 && xp <= 2_000);
      if (speed !== undefined && !speedValid)
        fail(
          `物品 ${id} 的 speedMultiplierPermille 必须在 500–1000 permille（周期倍率，<1000 更快）。`,
        );
      if (xp !== undefined && !xpValid)
        fail(`物品 ${id} 的 xpMultiplierPermille 必须在 1001–2000 permille。`);
      if (speed === undefined && xp === undefined) fail(`物品 ${id} 的消耗品必须至少有一种效果。`);
      if (!isPositiveInteger(effect.durationMs))
        fail(`物品 ${id} 的 durationMs 必须是正整数毫秒。`);
      consumableItems.set(id, { speed, xp });
    }
  }
}

// --- recipes -----------------------------------------------------------------
const recipeIds = new Set();
const materialShapeOk = (materials, label) => {
  for (const material of requireArray(materials, label)) {
    if (
      !isPlainObject(material) ||
      typeof material.itemId !== 'string' ||
      !isPositiveInteger(material.amount)
    )
      fail(`${label} 的条目必须是 { itemId, amount>0 }。`);
  }
};
for (const [index, recipe] of recipes.entries()) {
  const id = readId(recipe, 'recipes.json', index, recipeIds, '配方');
  if (id === null) continue;
  materialShapeOk(recipe.inputs, `recipes.json/${id}.inputs`);
  materialShapeOk(recipe.outputs, `recipes.json/${id}.outputs`);
  if (!Array.isArray(recipe.inputs) || recipe.inputs.length === 0) fail(`配方 ${id} 必须有输入。`);
  if (!Array.isArray(recipe.outputs) || recipe.outputs.length === 0)
    fail(`配方 ${id} 必须有输出。`);
}

// --- activities --------------------------------------------------------------
const activityIds = new Set();
const recipeUseCount = new Map();
for (const [index, activity] of activities.entries()) {
  const id = readId(activity, 'activities.json', index, activityIds, '活动');
  if (id === null) continue;
  if (!skillIds.has(activity.skillId)) fail(`活动 ${id} 引用未知技能：${activity.skillId}`);
  if (activity.kind !== 'gather' && activity.kind !== 'craft')
    fail(`活动 ${id} 的 kind 必须是 gather 或 craft。`);
  if (!Number.isSafeInteger(activity.requiredLevel) || activity.requiredLevel < 1)
    fail(`活动 ${id} 的 requiredLevel 必须是不小于 1 的整数。`);
  else {
    const skill = skills.find((entry) => entry.id === activity.skillId);
    if (
      skill !== undefined &&
      !skill.levels.some((level) => level.level === activity.requiredLevel)
    )
      fail(`活动 ${id} 的前置等级超出技能 ${activity.skillId} 已定义等级。`);
  }
  if (!isPositiveInteger(activity.durationMs)) fail(`活动 ${id} 的 durationMs 必须是正整数毫秒。`);
  if (!isPositiveInteger(activity.xpPerCycle)) fail(`活动 ${id} 的 xpPerCycle 必须是正整数。`);
  if (activity.kind === 'gather') {
    materialShapeOk(activity.outputs, `activities.json/${id}.outputs`);
    if (!Array.isArray(activity.outputs) || activity.outputs.length === 0)
      fail(`采集活动 ${id} 必须有输出。`);
  }
  if (activity.kind === 'craft') {
    if (typeof activity.recipeId !== 'string' || !recipeIds.has(activity.recipeId))
      fail(`制作活动 ${id} 引用未知配方：${String(activity.recipeId)}`);
    else recipeUseCount.set(activity.recipeId, (recipeUseCount.get(activity.recipeId) ?? 0) + 1);
  }
}
for (const recipeId of recipeIds) {
  if (recipeUseCount.get(recipeId) !== 1)
    fail(`配方必须被恰好一个活动使用：${recipeId}（实际 ${recipeUseCount.get(recipeId) ?? 0} 次）`);
}

// --- tools and upgrades ------------------------------------------------------
const toolIds = new Set();
const toolSkillIds = new Set();
for (const [index, tool] of tools.entries()) {
  const id = readId(tool, 'tools.json', index, toolIds, '工具');
  if (id === null) continue;
  if (!skillIds.has(tool.skillId)) fail(`工具 ${id} 引用未知技能：${tool.skillId}`);
  if (toolSkillIds.has(tool.skillId)) fail(`一个技能只能有一条工具线：${tool.skillId}`);
  toolSkillIds.add(tool.skillId);
  const levels = requireArray(tool.levels, `tools.json/${id}.levels`);
  if (levels.length < 2) fail(`工具 ${id} 至少需要两个等级。`);
  let previousLevel = 0;
  for (const level of levels) {
    if (!isPlainObject(level)) {
      fail(`工具 ${id} 的等级条目必须是对象。`);
      continue;
    }
    if (level.level !== previousLevel + 1) fail(`工具 ${id} 的等级必须从 1 连续递增。`);
    previousLevel = level.level;
    if (
      !Number.isSafeInteger(level.durationMultiplierPermille) ||
      level.durationMultiplierPermille <= 0 ||
      level.durationMultiplierPermille > 1_000
    )
      fail(`工具 ${id} Lv${level.level} 的倍率必须在 1–1000 permille（只加速不减速）。`);
  }
}
const upgradeTargets = new Set();
for (const [index, upgrade] of toolUpgrades.entries()) {
  const id = readId(upgrade, 'tool-upgrades.json', index, upgradeTargets, '工具升级');
  if (id === null) continue;
  const tool = tools.find((entry) => entry.id === upgrade.toolId);
  if (tool === undefined) {
    fail(`工具升级 ${id} 引用未知工具：${upgrade.toolId}`);
    continue;
  }
  if (!Number.isSafeInteger(upgrade.sourceLevel) || !Number.isSafeInteger(upgrade.targetLevel))
    fail(`工具升级 ${id} 的等级必须是整数。`);
  if (upgrade.targetLevel !== upgrade.sourceLevel + 1)
    fail(`工具升级 ${id} 必须从一个等级升到下一等级。`);
  if (!tool.levels.some((level) => level.level === upgrade.targetLevel))
    fail(`工具升级 ${id} 的目标等级超出工具定义。`);
  if (!itemIds.has(upgrade.requiredItemId))
    fail(`工具升级 ${id} 引用未知物品：${upgrade.requiredItemId}`);
  if (!isPositiveInteger(upgrade.requiredAmount))
    fail(`工具升级 ${id} 的 requiredAmount 必须是正整数。`);
}
for (const tool of tools) {
  const defined = new Set(
    toolUpgrades
      .filter((upgrade) => upgrade.toolId === tool.id)
      .map((upgrade) => upgrade.targetLevel),
  );
  for (const level of tool.levels) {
    if (level.level >= 2 && !defined.has(level.level))
      fail(`工具 ${tool.id} 的 Lv${level.level} 没有升级路由。`);
  }
}

// --- source closure ----------------------------------------------------------
const produced = new Set();
for (const activity of activities) {
  if (!isPlainObject(activity)) continue;
  if (activity.kind === 'gather' && Array.isArray(activity.outputs))
    for (const output of activity.outputs) if (isPlainObject(output)) produced.add(output.itemId);
  if (activity.kind === 'craft' && typeof activity.recipeId === 'string') {
    const recipe = recipes.find((entry) => entry.id === activity.recipeId);
    if (recipe !== undefined && Array.isArray(recipe.outputs))
      for (const output of recipe.outputs) if (isPlainObject(output)) produced.add(output.itemId);
  }
}
if (profile !== null && Array.isArray(profile.shopOffers)) {
  for (const offer of profile.shopOffers) {
    if (isPlainObject(offer) && typeof offer.itemId === 'string') produced.add(offer.itemId);
  }
}
for (const itemId of itemIds) {
  if (!produced.has(itemId)) fail(`物品没有来源（采集、配方或商店）：${itemId}`);
}
for (const recipe of recipes) {
  if (!isPlainObject(recipe)) continue;
  for (const input of requireArray(recipe.inputs, `recipes.json/${recipe.id}.inputs`)) {
    if (isPlainObject(input) && !produced.has(input.itemId))
      fail(`配方输入没有来源：${recipe.id}/${input.itemId}`);
  }
}

// --- shop offers (optional in 4.0.0) ------------------------------------------
const shopUnitPrices = new Map();
if (profile !== null && profile.shopOffers !== undefined) {
  const offers = requireArray(profile.shopOffers, 'profile.shopOffers');
  const offerIds = new Set();
  for (const [index, offer] of offers.entries()) {
    const id = readId(offer, 'profile.shopOffers', index, offerIds, '商店报价');
    if (id === null) continue;
    if (!itemIds.has(offer.itemId)) fail(`商店报价 ${id} 引用未知物品：${offer.itemId}`);
    if (!isPositiveInteger(offer.amount)) fail(`商店报价 ${id} 的 amount 必须是正整数。`);
    if (!isPositiveInteger(offer.coinCost)) fail(`商店报价 ${id} 的 coinCost 必须是正整数。`);
    if (offer.requiredLevel !== undefined && !isPositiveInteger(offer.requiredLevel))
      fail(`商店报价 ${id} 的 requiredLevel 必须是正整数。`);
    if (isPositiveInteger(offer.amount) && isPositiveInteger(offer.coinCost))
      shopUnitPrices.set(offer.itemId, offer.coinCost / offer.amount);
  }
}

// --- sell offers (content 7.0.0) ----------------------------------------------
if (profile !== null && profile.sellOffers !== undefined) {
  const offers = requireArray(profile.sellOffers, 'profile.sellOffers');
  const offerIds = new Set();
  for (const [index, offer] of offers.entries()) {
    const id = readId(offer, 'profile.sellOffers', index, offerIds, '出售报价');
    if (id === null) continue;
    if (!itemIds.has(offer.itemId)) fail(`出售报价 ${id} 引用未知物品：${offer.itemId}`);
    if (!isPositiveInteger(offer.amount)) fail(`出售报价 ${id} 的 amount 必须是正整数。`);
    if (!isPositiveInteger(offer.coinValue)) fail(`出售报价 ${id} 的 coinValue 必须是正整数。`);
    // Anti-dupe: an item the shop also buys must sell strictly below the buy unit price, or
    // buy-then-sell loops would mint coins without limit.
    const buyUnit = shopUnitPrices.get(offer.itemId);
    if (
      buyUnit !== undefined &&
      isPositiveInteger(offer.amount) &&
      isPositiveInteger(offer.coinValue)
    )
      if (offer.coinValue / offer.amount >= buyUnit)
        fail(
          `出售报价 ${id} 的单价（${offer.coinValue}/${offer.amount}）不低于商店买入单价（${buyUnit}），存在硬币套利。`,
        );
  }
}

// --- C4 obtainability, C5 downstream, C6 net-gain loops, C7 tool material tier -----
// All four are pure data checks (no randomness): they read sources from activities/recipes/
// shop and compare them with the level or tier that consumes the item.
const TIER_SIZE = 6;
const tierOfLevel = (level) => Math.max(1, Math.ceil(level / TIER_SIZE));

const sourceLevels = new Map();
function recordSource(itemId, level) {
  const previous = sourceLevels.get(itemId);
  if (previous === undefined || level < previous) sourceLevels.set(itemId, level);
}
for (const activity of activities) {
  if (!isPlainObject(activity)) continue;
  const level = Number.isSafeInteger(activity.requiredLevel) ? activity.requiredLevel : 0;
  if (activity.kind === 'gather' && Array.isArray(activity.outputs))
    for (const output of activity.outputs)
      if (isPlainObject(output) && typeof output.itemId === 'string')
        recordSource(output.itemId, level);
  if (activity.kind === 'craft' && typeof activity.recipeId === 'string') {
    const recipe = recipes.find((entry) => entry.id === activity.recipeId);
    if (recipe !== undefined && Array.isArray(recipe.outputs))
      for (const output of recipe.outputs)
        if (isPlainObject(output) && typeof output.itemId === 'string')
          recordSource(output.itemId, level);
  }
}
// A shop offer is buyable from the start, so it counts as a level-0 source.
const shopItemIds = new Set();
if (profile !== null && Array.isArray(profile.shopOffers)) {
  for (const offer of profile.shopOffers) {
    if (isPlainObject(offer) && typeof offer.itemId === 'string') {
      recordSource(offer.itemId, 0);
      shopItemIds.add(offer.itemId);
    }
  }
}
const minSourceLevel = (itemId) => sourceLevels.get(itemId) ?? Number.POSITIVE_INFINITY;

// C4: an activity may only consume what is already obtainable at its own required level.
for (const activity of activities) {
  if (!isPlainObject(activity) || activity.kind !== 'craft') continue;
  const recipe = recipes.find((entry) => entry.id === activity.recipeId);
  if (recipe === undefined || !Array.isArray(recipe.inputs)) continue;
  for (const input of recipe.inputs) {
    if (!isPlainObject(input) || typeof input.itemId !== 'string') continue;
    const source = minSourceLevel(input.itemId);
    if (!(source <= activity.requiredLevel))
      fail(
        `C4 活动 ${activity.id}（Lv${activity.requiredLevel}）的输入 ${input.itemId} 最早只能在 Lv${source} 获得。`,
      );
  }
}

// C5: every item needs at least two places to go. Consumables are terminal sinks by design
// (eating them is the sink), currency is spent by shop offers, and the offline fuel is a sink.
const downstream = new Map();
const addDownstream = (itemId, amount = 1) =>
  downstream.set(itemId, (downstream.get(itemId) ?? 0) + amount);
for (const recipe of recipes) {
  if (!isPlainObject(recipe) || !Array.isArray(recipe.inputs)) continue;
  for (const input of recipe.inputs)
    if (isPlainObject(input) && typeof input.itemId === 'string') addDownstream(input.itemId);
}
for (const upgrade of toolUpgrades) {
  if (isPlainObject(upgrade) && typeof upgrade.requiredItemId === 'string')
    addDownstream(upgrade.requiredItemId);
}
for (const item of items) {
  if (!isPlainObject(item) || typeof item.id !== 'string') continue;
  if (item.consumable !== undefined) addDownstream(item.id);
}
if (profile !== null && profile.offlineFuel !== undefined && isPlainObject(profile.offlineFuel)) {
  if (typeof profile.offlineFuel.itemId === 'string') addDownstream(profile.offlineFuel.itemId);
}
// A sell offer is one more way out for the item it buys (a sink, never a source).
if (profile !== null && Array.isArray(profile.sellOffers)) {
  for (const offer of profile.sellOffers) {
    if (isPlainObject(offer) && typeof offer.itemId === 'string') addDownstream(offer.itemId);
  }
}
const currencyIds = new Set(
  items.filter((item) => isPlainObject(item) && item.categoryId === 'currency').map((i) => i.id),
);
const shopOfferCount =
  profile !== null && Array.isArray(profile.shopOffers) ? profile.shopOffers.length : 0;
// The purchase command spends `coin`, so every offer is one more way out for the currency.
for (const currencyId of currencyIds) addDownstream(currencyId, shopOfferCount);
for (const item of items) {
  if (!isPlainObject(item) || typeof item.id !== 'string') continue;
  const uses = downstream.get(item.id) ?? 0;
  if (currencyIds.has(item.id)) {
    if (uses < 1 || shopOfferCount < 1)
      fail(
        `C5 通货 ${item.id} 只有 ${uses} 个下游，且必须有商店出口（当前报价 ${shopOfferCount} 条）。`,
      );
    continue;
  }
  if (item.consumable !== undefined) {
    // Terminal sink: the consume command is its designed exit, so one use is enough.
    continue;
  }
  if (uses < 2) fail(`C5 物品 ${item.id} 只有 ${uses} 个下游（需要 ≥2）。`);
}

// C6: a recipe that outputs an item it also consumes is a net-gain loop; the net output must
// stay positive and the item needs a source outside this very recipe.
for (const recipe of recipes) {
  if (!isPlainObject(recipe)) continue;
  const inputs = Array.isArray(recipe.inputs) ? recipe.inputs : [];
  const outputs = Array.isArray(recipe.outputs) ? recipe.outputs : [];
  for (const output of outputs) {
    if (!isPlainObject(output) || typeof output.itemId !== 'string') continue;
    const input = inputs.find(
      (candidate) => isPlainObject(candidate) && candidate.itemId === output.itemId,
    );
    if (input === undefined) continue;
    const net = output.amount - input.amount;
    if (net <= 0) fail(`C6 配方 ${recipe.id} 对 ${output.itemId} 的净产出为 ${net}（必须 > 0）。`);
    const external = activities.some((activity) => {
      if (!isPlainObject(activity) || activity.skillId === undefined) return false;
      if (activity.kind === 'gather')
        return (
          Array.isArray(activity.outputs) &&
          activity.outputs.some(
            (candidate) => isPlainObject(candidate) && candidate.itemId === output.itemId,
          )
        );
      if (activity.recipeId === recipe.id) return false;
      const other = recipes.find((entry) => entry.id === activity.recipeId);
      return (
        other !== undefined &&
        Array.isArray(other.outputs) &&
        other.outputs.some(
          (candidate) => isPlainObject(candidate) && candidate.itemId === output.itemId,
        )
      );
    });
    if (!external) fail(`C6 配方 ${recipe.id} 的 ${output.itemId} 没有本配方之外的来源。`);
  }
}

// C7: a tool upgrade must not need a material from a deeper tier than the tool level itself.
for (const upgrade of toolUpgrades) {
  if (!isPlainObject(upgrade) || typeof upgrade.requiredItemId !== 'string') continue;
  const source = minSourceLevel(upgrade.requiredItemId);
  if (!Number.isFinite(source)) {
    fail(`C7 工具升级 ${upgrade.id} 的材料 ${upgrade.requiredItemId} 没有来源。`);
    continue;
  }
  const materialTier = tierOfLevel(source);
  const toolTier = tierOfLevel(upgrade.targetLevel);
  if (materialTier > toolTier)
    fail(
      `C7 工具升级 ${upgrade.id} 的材料 ${upgrade.requiredItemId} 来自 T${materialTier}（Lv${source}），高于工具等级 T${toolTier}（Lv${upgrade.targetLevel}）。`,
    );
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log('Content JSON schema, references and invariants passed.');
