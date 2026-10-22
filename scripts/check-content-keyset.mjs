import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Guards the one invariant a save cannot survive on its own: the set of record keys a content
 * version can produce. `contentVersion` is a manual label, so editing item/skill/tool IDs without
 * bumping it leaves saves that match the version but not the key set. That is exactly how the
 * 2026-10-16 dead save happened, and it slipped past every other gate.
 *
 * Run with `--print` to regenerate the manifest.
 */

const DATA_DIR = path.resolve('src/content/data');
const MANIFEST = path.resolve('src/content/keyset-manifest.json');
const SNAPSHOT_DIRS = ['data-v5', 'data-v6', 'data-v7', 'data-v8', 'data-v9'];

const sortedIds = (entries, field) => entries.map((entry) => entry[field]).sort();

const fingerprint = (ids) => createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 16);

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function fingerprintOf(dir) {
  const [items, skills, tools] = await Promise.all([
    readJson(path.join(dir, 'items.json')),
    readJson(path.join(dir, 'skills.json')),
    readJson(path.join(dir, 'tools.json')),
  ]);
  return {
    items: fingerprint(sortedIds(items, 'id')),
    skills: fingerprint(sortedIds(skills, 'id')),
    tools: fingerprint(sortedIds(tools, 'id')),
  };
}

async function collect() {
  const profile = await readJson(path.join(DATA_DIR, 'profile.json'));
  const versions = { [profile.contentVersion]: await fingerprintOf(DATA_DIR) };
  for (const dir of SNAPSHOT_DIRS) {
    const absolute = path.resolve('src/content', dir);
    const snapshotProfile = await readJson(path.join(absolute, 'profile.json'));
    versions[snapshotProfile.contentVersion] = await fingerprintOf(absolute);
  }
  return { current: profile.contentVersion, versions };
}

const collected = await collect();

if (process.argv.includes('--print')) {
  const ordered = Object.fromEntries(
    Object.entries(collected.versions).sort(([a], [b]) => a.localeCompare(b)),
  );
  process.stdout.write(`${JSON.stringify({ note: '', versions: ordered }, null, 2)}\n`);
} else {
  const manifest = await readJson(MANIFEST).catch(() => null);
  if (manifest === null) {
    console.error(`缺少键集清单 ${path.relative(process.cwd(), MANIFEST)}，先跑 --print 生成。`);
    process.exitCode = 1;
  } else {
    const failures = [];
    for (const [version, actual] of Object.entries(collected.versions)) {
      const expected = manifest.versions?.[version];
      if (expected === undefined) {
        failures.push(
          `内容版本 ${version} 未登记键集指纹（新增版本必须写进 keyset-manifest.json）。`,
        );
        continue;
      }
      for (const field of ['items', 'skills', 'tools']) {
        if (expected[field] !== actual[field]) {
          failures.push(
            `${version} 的 ${field} ID 集合变了（清单 ${expected[field]}，实际 ${actual[field]}）：请 bump contentVersion 并新增清单条目；确需沿用同一版本号时，显式更新清单并在提交信息里说明。`,
          );
        }
      }
    }
    if (failures.length > 0) {
      console.error(failures.join('\n'));
      console.error(
        '记录键集变了却不 bump 内容版本，会产出「版本号相同但键集漂移」的死档（2026-10-16 事故）。',
      );
      process.exitCode = 1;
    } else {
      console.log(
        `Content keyset fingerprints match (${Object.keys(collected.versions).sort().join(', ')}).`,
      );
    }
  }
}
