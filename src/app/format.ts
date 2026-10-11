const NUMBER_FORMAT = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const RATE_FORMAT = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 });

export function formatAmount(value: number): string {
  return NUMBER_FORMAT.format(value);
}

export function formatRate(value: number): string {
  return RATE_FORMAT.format(value);
}
