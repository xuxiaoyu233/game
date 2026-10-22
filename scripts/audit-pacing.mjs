import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Pacing audit (content 9.0.0+): the numbers a designer actually argues about, read straight from
 * the content JSON so the report can never disagree with the game.
 *
 *   node scripts/audit-pacing.mjs
 *   node scripts/audit-pacing.mjs --max-total-hours=48 --max-tail-share=25
 *
 * It answers four questions and nothing else:
 *   1. What shape is the XP curve (threshold per level, share of the total)?
 *   2. What does each tier actually pay (activities, median cycle, median XP, best XP/min)?
 *   3. How long does one skill take, and all twelve, at the best rate each tier offers?
 *   4. How much of the curve sits in the tail (last three and last six levels)?
 *
 * Gates are parameters, not constants: content that drifts out of the intended band fails the
 * command instead of failing a playtest three weeks later. Defaults are the targets the current
 * curve was tuned against (see PLAN, stage S11).
 */

const DATA_DIR = path.resolve('src/content/data');
const TIER_SIZE = 6;
const MINUTE_MS = 60_000;

const defaults = { maxTotalHours: 48, maxTailShare: 25 };

function readNumber(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((entry) => entry.startsWith(prefix));
  if (argument === undefined) return fallback;
  const value = Number(argument.slice(prefix.length));
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number`);
  return value;
}

const limits = {
  maxTotalHours: readNumber('max-total-hours', defaults.maxTotalHours),
  maxTailShare: readNumber('max-tail-share', defaults.maxTailShare),
};

async function readJson(fileName) {
  return JSON.parse(await readFile(path.join(DATA_DIR, fileName), 'utf8'));
}

const skills = await readJson('skills.json');
const activities = await readJson('activities.json');

const tiers = [];
{
  const maximumLevel = Math.max(...skills.map((skill) => skill.levels.at(-1)?.level ?? 1));
  for (let start = 1; start <= maximumLevel; start += TIER_SIZE)
    tiers.push({
      index: tiers.length + 1,
      start,
      end: Math.min(start + TIER_SIZE - 1, maximumLevel),
    });
}

/** Every skill shares one curve, so the first one is representative; the rest must agree. */
const curve = skills[0].levels.map((threshold) => threshold.xpRequired);
for (const skill of skills) {
  const other = skill.levels.map((threshold) => threshold.xpRequired);
  if (other.length !== curve.length || other.some((value, index) => value !== curve[index]))
    throw new Error(`技能 ${skill.id} 的经验曲线与其他技能不一致，审计无法给出单一结论。`);
}
const total = curve.at(-1);
const thresholdOf = (level) => curve[level - 1] ?? 0;
const deltaOf = (level) => thresholdOf(level + 1) - thresholdOf(level);
const share = (xp) => (total === 0 ? 0 : (xp / total) * 100);

/** Best sustainable rate in a tier: the highest xpPerCycle/durationMs among its activities. */
function tierRate(tier) {
  const rows = activities.filter(
    (activity) => activity.requiredLevel >= tier.start && activity.requiredLevel <= tier.end,
  );
  let best = null;
  for (const activity of rows) {
    const perMinute = (activity.xpPerCycle / activity.durationMs) * MINUTE_MS;
    if (best === null || perMinute > best.perMinute) best = { activity, perMinute };
  }
  return { rows, best };
}

const median = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

console.log(
  `内容版本 ${JSON.parse(await readFile(path.join(DATA_DIR, 'profile.json'), 'utf8')).contentVersion}`,
);

console.log('\n=== 等级曲线形状 ===');
console.log('等级   门槛 XP     占总量     本级 ΔXP');
for (const level of [1, 7, 12, 13, 18, 19, 24, 25, 27, 28, 29, 30]) {
  if (level > curve.length) continue;
  // The ceiling has no next level, so its row shows no delta instead of a negative one.
  const delta = level < curve.length ? String(deltaOf(level)) : '——';
  console.log(
    `Lv${String(level).padStart(2)}   ${String(thresholdOf(level)).padStart(8)}   ${share(thresholdOf(level)).toFixed(2).padStart(6)}%   ${delta.padStart(8)}`,
  );
}
console.log(`累计总量 ${total} XP，等级上限 Lv${curve.length}`);

console.log('\n=== 各层活动节奏（按 requiredLevel 分带） ===');
for (const tier of tiers) {
  const { rows, best } = tierRate(tier);
  if (best === null) {
    console.log(`T${tier.index}（Lv${tier.start}-${tier.end}）没有活动`);
    continue;
  }
  const gather = rows.filter((activity) => activity.kind === 'gather').length;
  const craft = rows.length - gather;
  console.log(
    `T${tier.index}（Lv${tier.start}-${tier.end}）活动 ${String(rows.length).padStart(3)}（采集 ${gather}/制作 ${craft}）` +
      ` 周期中位 ${String(median(rows.map((a) => a.durationMs))).padStart(5)}ms` +
      ` XP中位 ${String(median(rows.map((a) => a.xpPerCycle))).padStart(3)}` +
      ` 最佳 ${best.activity.id} ${best.activity.durationMs}ms/${best.activity.xpPerCycle}xp = ${best.perMinute.toFixed(1)} XP/分`,
  );
}

console.log('\n=== 每层所需小时（按该层最佳速率） ===');
let skillMinutes = 0;
const tierHours = [];
for (const tier of tiers) {
  const { best } = tierRate(tier);
  if (best === null) continue;
  // XP needed to leave the tier: up to the next tier's first level, or the ceiling for the last one.
  const to = tier.end >= curve.length ? total : thresholdOf(tier.end + 1);
  const needed = to - thresholdOf(tier.start);
  const minutes = needed / best.perMinute;
  skillMinutes += minutes;
  tierHours.push({ tier: tier.index, minutes, needed, perMinute: best.perMinute });
  console.log(
    `T${tier.index} 需 ${String(needed).padStart(7)} XP @ ${best.perMinute.toFixed(1)} XP/分 = ${minutes.toFixed(1)} 分钟（${(minutes / 60).toFixed(2)} 小时）`,
  );
}
const skillHours = skillMinutes / 60;
const allHours = skillHours * skills.length;
console.log(
  `单技能 ≈ ${skillHours.toFixed(2)} 小时；${skills.length} 技能 ≈ ${allHours.toFixed(1)} 小时（按各层最佳速率，不含离线/增益/精通/工具加速）`,
);

console.log('\n=== 尾部占比 ===');
const tailLevels = 3;
const tail6Levels = 6;
const tail = total - thresholdOf(curve.length - tailLevels);
const tail6 = total - thresholdOf(curve.length - tail6Levels);
console.log(
  `最后 ${tailLevels} 级（Lv${curve.length - tailLevels}→Lv${curve.length}）需 ${tail} XP = 总曲线 ${share(tail).toFixed(2)}%（上限 ${limits.maxTailShare}%）`,
);
console.log(
  `最后 ${tail6Levels} 级（Lv${curve.length - tail6Levels}→Lv${curve.length}）需 ${tail6} XP = 总曲线 ${share(tail6).toFixed(2)}%`,
);

const failures = [];
if (allHours > limits.maxTotalHours)
  failures.push(
    `${skills.length} 技能合计 ${allHours.toFixed(1)} 小时，超过上限 ${limits.maxTotalHours} 小时（目标 36–48 小时）。`,
  );
if (share(tail) > limits.maxTailShare)
  failures.push(
    `最后 ${tailLevels} 级占总曲线 ${share(tail).toFixed(2)}%，超过上限 ${limits.maxTailShare}%（这段没有新活动，占比过高等于空跑）。`,
  );

if (failures.length > 0) {
  console.error(`\n节奏审计未通过：\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(
    `\n节奏审计通过：合计 ${allHours.toFixed(1)} 小时 ≤ ${limits.maxTotalHours}；尾部 ${share(tail).toFixed(2)}% ≤ ${limits.maxTailShare}%。`,
  );
}
