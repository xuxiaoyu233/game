// Read-only checks for a running native build with the temporary CDP config.
// Usage: node src-tauri/scripts/native-smoke.mjs [expected-schema-version]
// The production build does not enable CDP. This script never writes a save,
// imports progress, sends a close event, or calls the native exit command.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

const maxSaveBytes = 8 * 1024 * 1024;
const expectedSchema = process.argv[2] === undefined ? null : Number(process.argv[2]);

function summarize(contents, name) {
  if (contents === null) return null;
  assert.equal(typeof contents, 'string', `${name} must be a JSON string`);
  const bytes = Buffer.byteLength(contents, 'utf8');
  assert.ok(bytes <= maxSaveBytes, `${name} exceeds the native 8 MiB limit`);
  const parsed = JSON.parse(contents);
  assert.ok(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed));
  if (name === 'main' && expectedSchema !== null) {
    assert.equal(parsed.schemaVersion, expectedSchema, 'main schema version');
  }
  return {
    bytes,
    nativeLimitBytes: maxSaveBytes,
    sha256: createHash('sha256').update(contents).digest('hex'),
    schemaVersion: parsed.schemaVersion,
    contentVersion: parsed.contentVersion,
    worldId: parsed.worldId,
    toolCounts: parsed.toolCounts,
    fields: Object.keys(parsed).sort(),
  };
}

try {
  if (expectedSchema !== null)
    assert.ok(Number.isSafeInteger(expectedSchema) && expectedSchema > 0);
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().startsWith('http://tauri.localhost/'));
  assert.ok(page, 'Native game page was not found');
  assert.equal(await page.getByRole('heading', { name: '需要处理存档' }).count(), 0);
  assert.ok(!(await page.locator('body').innerText()).startsWith('启动失败：'));
  const saved = await page.evaluate(async () => {
    const native = globalThis.__TAURI_INTERNALS__;
    if (native === undefined) throw new Error('Native IPC was not found');
    const [main, backup] = await Promise.all([
      native.invoke('save_read'),
      native.invoke('save_read_backup'),
    ]);
    return { main, backup };
  });
  const main = summarize(saved.main, 'main');
  assert.ok(main, 'The running game has no accepted main save');
  console.log(
    JSON.stringify(
      {
        main,
        backup: summarize(saved.backup, 'backup'),
        pinButtonPresent:
          (await page.getByRole('button', { name: '置顶', exact: true }).count()) === 1,
      },
      null,
      2,
    ),
  );
  // End only this CDP client; do not send Browser.close to the host WebView.
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
