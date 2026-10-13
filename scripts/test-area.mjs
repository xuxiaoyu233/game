// 区域 → 测试文件显式映射。新增或移动测试文件时在此登记。
// 不用关键词模糊匹配：跨层影响（例如 domain 变更需联动 runtime/persistence 测试）无法由关键词推出。
//
// 移动或重命名测试文件后必须同步本表：脚本在启动前校验登记路径是否存在，
// 并校验 src 下每个测试文件都登记过——避免分区移动后定向门禁静默漏跑。
//
// 用法：npm run test:area -- <区域> [vitest 额外参数]
// 区域：skill-loop（现行玩法全链）/ legacy（冻结旧规则与 codec）/ platform / all
// 单层或单文件定向：npm test -- <路径过滤>
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const SKILL_LOOP = [
  'src/domain/skill-loop/engine.test.ts',
  'src/domain/skill-loop/p2-progression.test.ts',
  'src/domain/skill-loop/return-report.test.ts',
  'src/content/skill-prototype-v2.test.ts',
  'src/app/warehouse-relations.test.ts',
  'src/runtime/skill-loop-runtime.test.ts',
  // 通用 Runtime 的保存/独占/屏障语义由现行 runtime 提供，改 game-runtime.ts 必须跑到。
  'src/runtime/game-runtime.test.ts',
];

const LEGACY = [
  'src/domain/legacy/engine.test.ts',
  'src/domain/legacy/expedition/engine.test.ts',
  'src/domain/legacy/expedition/strategy.test.ts',
  'src/domain/legacy/expedition/v14-baseline.test.ts',
  'src/domain/legacy/outpost/engine.test.ts',
  'src/persistence/legacy/expedition-codec.test.ts',
  'src/persistence/legacy/expedition-migration.test.ts',
  'src/persistence/legacy/save-codec.test.ts',
  'src/runtime/legacy/expedition-runtime.test.ts',
  'src/content/legacy/narrative/story-archive.test.ts',
  'src/themes/legacy/themes.test.ts',
  // 用冻结旧域驱动通用 Runtime，旧域或 codec 变化也会反映到这里。
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
  all: [...new Set([...SKILL_LOOP, ...LEGACY, ...PLATFORM])],
};

// 防漂移护栏：登记的路径必须存在，且 src 下每个测试文件都必须登记过。
function collectTestFiles(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collectTestFiles(file, found);
    else if (/\.test\.tsx?$/.test(entry.name))
      found.push(path.relative(process.cwd(), file).split(path.sep).join('/'));
  }
  return found;
}

const registered = new Set(Object.values(AREAS).flat());
const missing = [...registered].filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error(
    [
      '登记的测试路径不存在（分区或重命名后未同步本表）：',
      ...missing.map((file) => `  - ${file}`),
      '',
      '修复：把 scripts/test-area.mjs 中对应条目改为实际路径，不要用删除条目绕过——删除会让定向门禁静默漏跑。',
    ].join('\n'),
  );
  process.exit(1);
}

const unregistered = collectTestFiles('src').filter(
  (file) => !registered.has(file) && !statSync(file).isDirectory(),
);
if (unregistered.length > 0) {
  console.error(
    [
      '以下测试文件未登记到任何区域（跑 `all` 也会被漏掉）：',
      ...unregistered.map((file) => `  - ${file}`),
      '',
      '修复：按它覆盖的对象登记到 scripts/test-area.mjs 的 skill-loop / legacy / platform 之一。',
    ].join('\n'),
  );
  process.exit(1);
}

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
