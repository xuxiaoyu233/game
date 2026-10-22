/** Shared display formatting for the prototype UI. Numbers stay exact; only presentation rounds. */

// En dash, not the em dash the design contract forbids in copy. Used as the "nothing produced"
// placeholder for rates and as a neutral value for unrecorded stats.
const DASH = '–';

export function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
}

/** Rates are fractional by nature; keep two significant decimals without showing noise. */
export function formatRate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return DASH;
  if (value >= 1_000)
    return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value)}`;
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

/** Hourly rate with unit, e.g. "720/小时"; a dash when nothing is produced. */
export function formatPerHour(value: number): string {
  const formatted = formatRate(value);
  return formatted === DASH ? DASH : `${formatted}/小时`;
}

export function formatSeconds(milliseconds: number): string {
  const seconds = milliseconds / 1_000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} 秒`;
}

export function formatElapsed(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return '不足 1 分钟';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return hours === 0 ? `${minutes} 分钟` : `${hours} 小时 ${remainingMinutes} 分钟`;
  const days = Math.floor(hours / 24);
  return `${days} 天 ${hours % 24} 小时`;
}

/**
 * Compact duration for one-line summaries, e.g. "12 分钟" or "1 小时 5 分钟".
 * Boundary rules: zero and below render as "0 分钟" (never an extension that does not exist),
 * a non-zero span under a full minute renders as "不足 1 分钟", and whole minutes are floored so
 * 90s reads "1 分钟" instead of rounding up to a minute the player has not waited yet.
 */
export function formatShortDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0 分钟';
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return '不足 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days} 天` : `${days} 天 ${restHours} 小时`;
}

/** Permille bonus rendered as a signed percentage, e.g. 1150 -> "+15%". */
export function formatPercent(permille: number): string {
  const percent = (permille - 1_000) / 10;
  // 1000‰ is a no-op, not a zero bonus: a signed "+0%" reads as a change that does not exist.
  if (percent === 0) return '±0%';
  const rounded = Number.isInteger(percent) ? percent : Number(percent.toFixed(1));
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

/**
 * Cycle multiplier of a tool, a level effect or a consumable speed buff. Every speed field in
 * content is a cycle multiplier (below 1000 shortens), so the copy says the factor and the gain
 * instead of a bare signed percentage that used to read as a slow-down.
 */
export function formatCycleMultiplier(permille: number): string {
  if (permille === 1_000) return '基准周期';
  const gainPercent = (1_000 - permille) / 10;
  const rounded = Number.isInteger(gainPercent) ? gainPercent : Number(gainPercent.toFixed(1));
  return `周期 ×${(permille / 1_000).toFixed(2)}（快 ${rounded}%）`;
}

export { DASH };
