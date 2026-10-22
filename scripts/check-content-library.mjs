import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Lean gate for the surviving engineering docs: local Markdown links must resolve, and
// backticked src/scripts/tests paths must exist. Replaces the retired 0.8 narrative registry.
const root = process.cwd();
const checkedDirectories = ['docs/内容资料库', 'docs/规划'];
const errors = [];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

async function collectMarkdown(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdown(absolute)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(absolute);
    }
  }
  return files;
}

function maskCode(text) {
  let inFence = false;
  let fenceCharacter = '';
  let fenceLength = 0;
  return text
    .split(/\r?\n/)
    .map((line) => {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (!inFence && marker) {
        inFence = true;
        fenceCharacter = marker[1][0];
        fenceLength = marker[1].length;
        return '';
      }
      if (
        inFence &&
        new RegExp(
          '^\\s{0,3}' + (fenceCharacter === '`' ? '`' : '~') + '{' + fenceLength + ',}\\s*$',
        ).test(line)
      ) {
        inFence = false;
        fenceCharacter = '';
        fenceLength = 0;
        return '';
      }
      if (inFence) return '';
      return line.replace(/(`+)[^`]*?\1/g, (match) => ' '.repeat(match.length));
    })
    .join('\n');
}

async function pathExists(relative) {
  try {
    await access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

function collectLinkTargets(text) {
  const targets = [];
  const pattern = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) targets.push(match[1]);
  return targets;
}

function collectSourcePaths(text) {
  const paths = [];
  const pattern = /(?:^|[\s(])((?:src|scripts|tests)\/[^\s`)]+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) paths.push(match[1]);
  return paths;
}

for (const directory of checkedDirectories) {
  for (const file of await collectMarkdown(path.join(root, directory))) {
    const relative = toPosix(path.relative(root, file));
    const masked = maskCode(await readFile(file, 'utf8'));
    for (const target of collectLinkTargets(masked)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue;
      const [pathPart] = target.split('#');
      if (pathPart === undefined || pathPart === '') continue;
      const resolved = toPosix(path.relative(root, path.resolve(path.dirname(file), pathPart)));
      if (!(await pathExists(resolved)))
        errors.push(`${relative}: link target does not exist: ${target}`);
    }
    for (const sourcePath of collectSourcePaths(masked)) {
      const cleaned = sourcePath.replace(/[),.;:]+$/, '');
      if (!(await pathExists(cleaned)))
        errors.push(`${relative}: implementation path does not exist: ${cleaned}`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log('Content library links and implementation paths passed.');
