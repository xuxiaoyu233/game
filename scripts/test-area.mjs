// 区域 → 测试文件显式映射。新增或移动测试文件时在此登记。
// 不用关键词模糊匹配：跨层影响（例如 domain 变更需联动 runtime/persistence 测试）无法由关键词推出。
//
// 用法：npm run test:area -- <区域> [vitest 额外参数]
// 区域：skill-loop（现行玩法全链）/ legacy（冻结旧规则与 codec）/ platform / all
// 单层或单文件定向：npm test -- <路径过滤>
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const SKILL_LOOP = [
  'src/domain/skill-loop/engine.test.ts',
  'src/domain/skill-loop/p2-progression.test.ts',
  'src/domain/skill-loop/return-report.test.ts',
  'src/content/skill-prototype-v2.test.ts',
  'src/content/narrative/story-archive.test.ts',
  'src/app/warehouse-relations.test.ts',
  'src/runtime/skill-loop-runtime.test.ts',
  'src/themes/themes.test.ts',
];

const LEGACY = [
  'src/domain/engine.test.ts',
  'src/domain/expedition/engine.test.ts',
  'src/domain/expedition/strategy.test.ts',
  'src/domain/expedition/v14-baseline.test.ts',
  'src/domain/outpost/engine.test.ts',
  'src/persistence/expedition-codec.test.ts',
  'src/persistence/expedition-migration.test.ts',
  'src/persistence/save-codec.test.ts',
  'src/runtime/expedition-runtime.test.ts',
  'src/runtime/game-runtime.test.ts',
];

const PLATFORM = [
  'src/platform/browser/browser-instance-lease.test.ts',
  'src/platform/browser/browser-save-storage.test.ts',
  'src/platform/desktop/create-desktop-platform.test.ts',
];

const AREAS = {
  'skill-loop': SKILL_LOOP,
  legacy: LEGACY,
  platform: PLATFORM,
  all: [...SKILL_LOOP, ...LEGACY, ...PLATFORM],
};

const area = process.argv[2];
if (!area || !AREAS[area]) {
  console.error(
    [
      '用法：npm run test:area -- <区域>',
      '',
      '可用区域：',
      ...Object.entries(AREAS).map(([name, files]) => `  ${name}（${files.length} 个测试文件）`),
      '',
      '单层或单文件定向：npm test -- <路径过滤>',
    ].join('\n'),
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
let bin;
try {
  bin = require.resolve('vitest/vitest.mjs');
} catch {
  // 解析不到 vitest 入口时回落到 npx
}

const args = ['run', ...AREAS[area], ...process.argv.slice(3)];
const result = bin
  ? spawnSync(process.execPath, [bin, ...args], { stdio: 'inherit' })
  : spawnSync('npx', ['vitest', ...args], { stdio: 'inherit', shell: true });

process.exit(result.status ?? 1);
