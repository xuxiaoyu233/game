import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const excludedDirectories = new Set([
  '.git',
  '.cache',
  'artifacts',
  'dist',
  'dist-desktop',
  'node_modules',
]);
const errors = [];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

async function collectMarkdown(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdown(absolute)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(absolute);
    }
  }
  return files;
}

async function collectProjectMarkdown() {
  const rootFiles = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => path.join(root, entry.name));
  const projectDirectories = ['docs', 'story-library'];
  const projectFiles = await Promise.all(
    projectDirectories.map((directory) => collectMarkdown(path.join(root, directory))),
  );
  return [...rootFiles, ...projectFiles.flat()];
}

function maskCode(text) {
  let inFence = false;
  let fenceCharacter = '';
  let fenceLength = 0;
  return text
    .split(/\r?\n/)
    .map((line) => {
      const marker = line.match(/^\s{0,3}(\x60{3,}|~{3,})/);
      if (!inFence && marker) {
        inFence = true;
        fenceCharacter = marker[1][0];
        fenceLength = marker[1].length;
        return '';
      }
      if (
        inFence &&
        new RegExp(
          '^\\s{0,3}' + (fenceCharacter === '\x60' ? '\x60' : '~') + '{' + fenceLength + ',}\\s*$',
        ).test(line)
      ) {
        inFence = false;
        fenceCharacter = '';
        fenceLength = 0;
        return '';
      }
      if (inFence) return '';
      return line.replace(/(\x60+)[^\x60]*?\1/g, (match) => ' '.repeat(match.length));
    })
    .join('\n');
}

function parseLinkDestination(raw) {
  const value = raw.trim();
  if (value.startsWith('<')) {
    const closing = value.indexOf('>');
    return closing >= 0 ? value.slice(1, closing) : value.slice(1);
  }
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\\') {
      index += 1;
      continue;
    }
    if (value[index] === '(') depth += 1;
    if (value[index] === ')') depth -= 1;
    if (/\s/.test(value[index]) && depth === 0) return value.slice(0, index);
  }
  return value;
}

function findMarkdownLinks(text) {
  const links = [];
  let cursor = 0;
  while (cursor < text.length) {
    const marker = text.indexOf('](', cursor);
    if (marker < 0) break;
    let depth = 0;
    let end = -1;
    for (let index = marker + 2; index < text.length; index += 1) {
      if (text[index] === '\\') {
        index += 1;
        continue;
      }
      if (text[index] === '(') depth += 1;
      if (text[index] === ')') {
        if (depth === 0) {
          end = index;
          break;
        }
        depth -= 1;
      }
    }
    if (end < 0) break;
    links.push({ start: marker, destination: parseLinkDestination(text.slice(marker + 2, end)) });
    cursor = end + 1;
  }
  return links;
}

function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

async function checkMarkdownLinks(markdownFiles, contents) {
  for (const file of markdownFiles) {
    const text = contents.get(file);
    const visibleText = maskCode(text);
    for (const link of findMarkdownLinks(visibleText)) {
      const destination = link.destination.replace(/\\([\\()])/g, '$1');
      if (
        destination.length === 0 ||
        destination.startsWith('#') ||
        destination.startsWith('//') ||
        /^[a-z][a-z\d+.-]*:/i.test(destination)
      )
        continue;
      let decoded;
      try {
        decoded = decodeURIComponent(destination);
      } catch {
        errors.push(
          toPosix(path.relative(root, file)) +
            ':' +
            lineAt(visibleText, link.start) +
            ': malformed percent escape in local link ' +
            destination,
        );
        continue;
      }
      const localPath = decoded.split('#')[0].split('?')[0];
      if (!localPath) continue;
      const target = path.resolve(path.dirname(file), localPath.replaceAll('/', path.sep));
      try {
        await access(target);
      } catch {
        errors.push(
          toPosix(path.relative(root, file)) +
            ':' +
            lineAt(visibleText, link.start) +
            ': missing local link target ' +
            destination,
        );
      }
    }
  }
}

function tableRowsInSection(text, heading) {
  const lines = text.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  if (headingIndex < 0) return [];
  const rows = [];
  let inTable = false;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^#{1,6}\s/.test(line)) break;
    if (!line.trim().startsWith('|')) {
      if (inTable) break;
      continue;
    }
    inTable = true;
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    rows.push(cells);
  }
  return rows;
}

function firstCellIds(rows, pattern) {
  return rows.map((row) => row[0]?.match(pattern)?.[1]).filter((id) => id !== undefined);
}

function addDefinitions(definitions, namespace, ids) {
  if (!definitions.has(namespace)) definitions.set(namespace, new Map());
  const registry = definitions.get(namespace);
  for (const id of ids) registry.set(id, (registry.get(id) ?? 0) + 1);
}

async function checkCoreIds(markdownFiles, contents) {
  const definitions = new Map();
  const library = path.join(root, 'docs', '历史资料', '失落航标-v12', '副本资料库');
  const sourcePath = path.join(root, 'docs', '历史资料', '失落航标-v12', '资料来源与阅读范围.md');
  const crossIndexPath = path.join(library, '交叉索引.md');
  const characterPath = path.join(library, '群像角色卡与成长弧.md');
  const crossScenesPath = path.join(library, '四路径交叉场景.md');

  const sourceText = contents.get(sourcePath);
  if (!sourceText) {
    errors.push(
      'missing archived source registry: docs/历史资料/失落航标-v12/资料来源与阅读范围.md',
    );
  } else {
    addDefinitions(
      definitions,
      'SRC',
      sourceText
        .split(/\r?\n/)
        .map((line) => line.match(/^\|\s*(?:\x60)?(SRC-\d{2})(?:\x60)?\s*\|/)?.[1])
        .filter((id) => id !== undefined),
    );
  }

  const worldIds = markdownFiles
    .map((file) => path.basename(file).match(/^(W-\d{2})-.+\.md$/)?.[1])
    .filter((id) => id !== undefined);
  addDefinitions(definitions, 'W', worldIds);

  const pathCardNames = [
    '科技文明路径调研与故事蓝图.md',
    'PATH-02-神学共同体与合法性.md',
    'PATH-03-灵异记录与异常治理.md',
    'PATH-04-修习与身心传承.md',
  ];
  addDefinitions(
    definitions,
    'PATH',
    pathCardNames
      .map((name) => contents.get(path.join(library, name))?.split(/\r?\n/).slice(0, 12).join('\n'))
      .map((header) => header?.match(/\b(PATH-\d{2})\b/)?.[1])
      .filter((id) => id !== undefined),
  );

  const indexText = contents.get(crossIndexPath);
  if (!indexText) {
    errors.push('missing archived cross index: docs/历史资料/失落航标-v12/副本资料库/交叉索引.md');
  } else {
    addDefinitions(
      definitions,
      'Q',
      firstCellIds(tableRowsInSection(indexText, '## 主线与候选问题 ID'), /^\x60(Q-\d{2})\x60$/),
    );
    addDefinitions(
      definitions,
      'REL-CAND',
      firstCellIds(tableRowsInSection(indexText, '### 关系边'), /^\x60(REL-CAND-\d{2})\x60$/),
    );
    const beatIds = [
      ...firstCellIds(tableRowsInSection(indexText, '### 故事节点'), /^\x60(BEAT-CAND-\d{2})\x60$/),
      ...firstCellIds(
        tableRowsInSection(indexText, '### W-03/04/05 的后续候选故事节点'),
        /^\x60(BEAT-CAND-\d{2})\x60$/,
      ),
    ];
    addDefinitions(definitions, 'BEAT-CAND', beatIds);
  }

  const characterText = contents.get(characterPath);
  if (!characterText) {
    errors.push(
      'missing archived character cards: docs/历史资料/失落航标-v12/副本资料库/群像角色卡与成长弧.md',
    );
  } else {
    addDefinitions(
      definitions,
      'CHAR-CAND',
      [...characterText.matchAll(/^###\s+\x60(CHAR-CAND-\d{2})\x60/gm)].map((match) => match[1]),
    );
  }

  const crossScenesText = contents.get(crossScenesPath);
  if (!crossScenesText) {
    errors.push(
      'missing archived cross-path scenes: docs/历史资料/失落航标-v12/副本资料库/四路径交叉场景.md',
    );
  } else {
    const firstTable = crossScenesText.split(/\r?\n(?=## )/)[0];
    addDefinitions(
      definitions,
      'BEAT-XC',
      [...firstTable.matchAll(/^\|\s*\x60(BEAT-XC-\d{2})\x60/gm)].map((match) => match[1]),
    );
  }

  for (const [namespace, registry] of definitions) {
    for (const [id, count] of registry) {
      if (count > 1) errors.push('duplicate canonical ID ' + id + ' (' + count + ' definitions)');
    }
    if (registry.size === 0) errors.push('empty canonical registry for ' + namespace);
  }

  const namespaces = [...definitions.keys()].sort((left, right) => right.length - left.length);
  const idPattern = new RegExp('\\b(' + namespaces.join('|') + ')-\\d{2}\\b', 'g');
  for (const file of markdownFiles) {
    const text = contents.get(file);
    for (const match of text.matchAll(idPattern)) {
      const id = match[0];
      if (!definitions.get(match[1]).has(id)) {
        errors.push(
          toPosix(path.relative(root, file)) +
            ':' +
            lineAt(text, match.index) +
            ': unresolved canonical ID ' +
            id,
        );
      }
    }
  }
}

function readRelationshipVocabulary(governanceText) {
  const start = governanceText.indexOf('## 三、关系词汇表');
  const end = governanceText.indexOf('## 四、', start + 1);
  if (start < 0 || end < 0) return new Set();
  const section = governanceText.slice(start, end);
  const vocabulary = new Set();
  for (const line of section.split(/\r?\n/)) {
    const firstCell = line.match(/^\|\s*([^|]+)\|/)?.[1] ?? '';
    for (const match of firstCell.matchAll(/\x60([a-z][a-z_]+)\x60/g)) {
      vocabulary.add(match[1]);
    }
  }
  return vocabulary;
}

function splitCells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim().replaceAll('\x60', ''));
}

function checkRelationshipTerms(indexText, vocabulary) {
  if (vocabulary.size === 0) {
    errors.push('relationship vocabulary table is missing or malformed in governance spec');
    return;
  }
  const lines = indexText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim().startsWith('|')) continue;
    const header = splitCells(lines[index]);
    const relationColumn = header.findIndex((cell) => cell === '关系');
    if (relationColumn < 0) continue;
    for (
      let rowIndex = index + 1;
      rowIndex < lines.length && lines[rowIndex].trim().startsWith('|');
      rowIndex += 1
    ) {
      const cells = splitCells(lines[rowIndex]);
      const rawRelation = cells[relationColumn] ?? '';
      if (!rawRelation || /^:?-{3,}:?$/.test(rawRelation)) continue;
      const terms = rawRelation
        .split('/')
        .flatMap((part) => part.split('、'))
        .map((term) => term.trim())
        .filter(Boolean);
      for (const term of terms) {
        if (!/^[a-z][a-z_]+$/.test(term)) {
          errors.push('交叉索引.md:' + (rowIndex + 1) + ': malformed relationship term ' + term);
        } else if (!vocabulary.has(term)) {
          errors.push(
            '交叉索引.md:' + (rowIndex + 1) + ': relationship is not registered: ' + term,
          );
        }
      }
    }
  }
}

// 归档交叉索引记录的是当时的源码映射；S1 把旧件迁入各层 legacy/ 分区后，
// 旧路径的“对应位置”变为 legacy/ 下同名文件，视为仍然有效（文件未丢失，只是已归档）。
// 路径彻底消失或拼错仍然报错，不放宽检查。
function legacyVariantOf(target) {
  const relative = toPosix(path.relative(root, target));
  const match = /^src\/(domain|content|themes|persistence|runtime|app)\/([^/].*)$/.exec(relative);
  if (match === null) return null;
  return path.resolve(root, 'src', match[1], 'legacy', match[2].replaceAll('/', path.sep));
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function checkImplementationPaths(indexText) {
  const pattern = /\x60((?:src|docs|scripts|tests)\/[^\x60\s]+)\x60/g;
  for (const match of indexText.matchAll(pattern)) {
    const target = path.resolve(root, match[1].replaceAll('/', path.sep));
    if (await exists(target)) continue;
    const legacyTarget = legacyVariantOf(target);
    if (legacyTarget !== null && (await exists(legacyTarget))) continue;
    errors.push('交叉索引.md: missing referenced project path ' + match[1]);
  }
}

function checkStoryLibraryBoundary(contents) {
  const requirements = [
    ['docs/故事资料库.md', ['当前批准正史', '历史资料']],
    ['docs/故事线设定集.md', ['状态：当前正史']],
    ['docs/历史资料/失落航标-v12/README.md', ['历史归档', '不属于当前正史']],
    ['docs/副本资料库/README.md', ['兼容旧链接', '历史资料库']],
  ];
  for (const [relativePath, phrases] of requirements) {
    const text = contents.get(path.resolve(root, relativePath.replaceAll('/', path.sep)));
    if (!text) {
      errors.push('missing story library boundary document: ' + relativePath);
      continue;
    }
    for (const phrase of phrases) {
      if (!text.includes(phrase)) {
        errors.push(relativePath + ': missing required boundary marker ' + phrase);
      }
    }
  }
}

const markdownFiles = await collectProjectMarkdown();
const contents = new Map();
for (const file of markdownFiles) contents.set(file, await readFile(file, 'utf8'));

await checkMarkdownLinks(markdownFiles, contents);
await checkCoreIds(markdownFiles, contents);
checkStoryLibraryBoundary(contents);

const governancePath = path.join(
  root,
  'docs',
  '历史资料',
  '失落航标-v12',
  '副本资料库',
  '交叉记录与资料治理规范.md',
);
const crossIndexPath = path.join(
  root,
  'docs',
  '历史资料',
  '失落航标-v12',
  '副本资料库',
  '交叉索引.md',
);
const governanceText = contents.get(governancePath);
const crossIndexText = contents.get(crossIndexPath);
if (!governanceText)
  errors.push(
    'missing governance spec: docs/历史资料/失落航标-v12/副本资料库/交叉记录与资料治理规范.md',
  );
if (!crossIndexText)
  errors.push('missing cross index: docs/历史资料/失落航标-v12/副本资料库/交叉索引.md');
if (governanceText && crossIndexText) {
  checkRelationshipTerms(crossIndexText, readRelationshipVocabulary(governanceText));
  await checkImplementationPaths(crossIndexText);
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  console.error('\nNarrative library check failed with ' + errors.length + ' issue(s).');
  process.exitCode = 1;
} else {
  console.log(
    'Narrative library check passed: ' +
      markdownFiles.length +
      ' Markdown files, local links, core ID registries/references, relationship terms, and cross-index implementation paths.',
  );
}
