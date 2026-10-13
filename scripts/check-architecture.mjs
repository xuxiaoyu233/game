import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve('src');
const allowed = {
  domain: new Set(['domain']),
  content: new Set(['content', 'domain']),
  themes: new Set(['themes', 'domain']),
  persistence: new Set(['persistence', 'domain']),
  runtime: new Set(['runtime', 'domain', 'persistence', 'platform']),
  platform: new Set(['platform']),
  app: new Set(['app', 'domain', 'runtime', 'themes', 'platform']),
};

// legacy 分区边界：core-partition / ui-content-partition 建立各层 legacy/ 分区后，现行生产代码不得依赖其中的冻结实现。
// 放行：legacy/ 分区内部互相引用、`*.test.ts`，以及下列白名单（登记时必须注明理由）。
const LEGACY = 'legacy';
const legacyImportWhitelist = new Set([
  // 迁移/归档类生产路径如确需读取旧定义，在此登记并注明理由；不得把现行功能路径加入本白名单。
]);
// 过渡白名单（目录前缀）：core-partition 已把 domain/persistence/runtime 旧件移入 legacy/，
// 但 app/themes/content 三层的旧消费方尚未迁入各自 legacy/ 分区，仍需临时引用 legacy/。
// 清除条件：ui-content-partition 完成（这三层旧件移入各自 legacy/）后删除本数组，届时违规必须为零。
const legacyImportWhitelistDirs = ['app/', 'themes/', 'content/'];
const errors = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(file);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || entry.name === 'vite-env.d.ts') continue;
    const relative = path.relative(root, file).split(path.sep).join('/');
    const layer = relative.split('/')[0];
    if (
      entry.name !== 'main.tsx' &&
      !/^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.test)?\.ts|[A-Z][A-Za-z0-9]*\.tsx)$/.test(entry.name)
    ) {
      errors.push(`${relative}: filename must be kebab-case.ts or PascalCase.tsx`);
    }
    if (entry.name.endsWith('.test.ts') || layer === 'main.tsx') continue;
    const source = ts.createSourceFile(
      file,
      await readFile(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function inspect(node) {
      let specifier;
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        specifier = node.moduleSpecifier.text;
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        specifier = node.arguments[0].text;
      if (specifier?.startsWith('.')) {
        const destination = path
          .relative(root, path.resolve(path.dirname(file), specifier))
          .split(path.sep)
          .join('/');
        const dependency = destination.split('/')[0];
        if (!allowed[layer]?.has(dependency))
          errors.push(`${relative}: ${layer} cannot depend on ${destination}`);
        if (layer === 'runtime' && dependency === 'platform' && destination !== 'platform/ports')
          errors.push(`${relative}: runtime can import platform ports only`);
        if (
          layer === 'content' &&
          dependency === 'domain' &&
          ![
            'domain/skill-loop/types',
            'domain/legacy/types',
            'domain/legacy/expedition/types',
            'domain/legacy/expedition/v2-types',
            'domain/legacy/outpost/types',
          ].includes(destination)
        )
          errors.push(`${relative}: mechanical content can import domain types only`);
        const importerInLegacy = relative.split('/').includes(LEGACY);
        const destinationInLegacy = destination.split('/').includes(LEGACY);
        const whitelisted =
          legacyImportWhitelist.has(relative.replace(/\.tsx?$/, '')) ||
          legacyImportWhitelistDirs.some((dir) => relative.startsWith(dir));
        if (destinationInLegacy && !importerInLegacy && !whitelisted)
          errors.push(
            `${relative}: 现行代码不得依赖 legacy 分区（导入 ${destination}）。修复：改为依赖现行模块；若属迁移/归档必需，先说明理由再把它加入 check-architecture.mjs 的 legacyImportWhitelist，不要绕过检查。`,
          );
      } else if (
        specifier &&
        ['domain', 'content', 'themes', 'persistence', 'runtime'].includes(layer)
      ) {
        errors.push(`${relative}: core layer cannot import external package ${specifier}`);
      }
      if (
        layer === 'domain' &&
        ts.isIdentifier(node) &&
        [
          'Date',
          'window',
          'document',
          'localStorage',
          'fetch',
          'setInterval',
          'setTimeout',
        ].includes(node.text)
      )
        errors.push(`${relative}: rules must not use ${node.text}`);
      if (
        layer === 'domain' &&
        ts.isPropertyAccessExpression(node) &&
        node.expression.getText(source) === 'Math' &&
        node.name.text === 'random'
      )
        errors.push(`${relative}: inject randomness instead of Math.random`);
      ts.forEachChild(node, inspect);
    }
    inspect(source);
  }
}

await visit(root);
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log('Architecture boundaries and source filenames passed.');
