/** 展示用格式化（app 层共享）。不参与规则计算，不写存档。 */

export function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
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
  return hours === 0 ? `${minutes} 分钟` : `${hours} 小时 ${remainingMinutes} 分钟`;
}
