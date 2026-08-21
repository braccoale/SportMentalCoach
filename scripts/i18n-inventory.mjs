import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(PROJECT_ROOT, 'docs', 'i18n-inventory.md');
const SCAN_ROOTS = ['app', 'components', 'lib/core', 'lib/verticals', 'mobile/src'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const USER_FACING_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'placeholder',
  'title',
]);
const NON_COPY_ATTRIBUTES = new Set([
  'class',
  'classname',
  'href',
  'id',
  'key',
  'name',
  'src',
  'testid',
  'type',
  'value',
]);
const COPY_NAME = /(title|label|text|copy|message|description|subject|body|placeholder|error|success|hint|caption|heading)/i;
const MESSAGE_SETTER = /^set(?:Error|Message|Notice|Status|Feedback)$/;
const VALIDATION_METHODS = new Set(['email', 'max', 'min', 'refine', 'regex']);

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function isCandidateText(value) {
  const text = normalizeText(value);
  if (text.length < 2 || !/\p{L}/u.test(text)) return false;
  if (/^(?:https?:\/\/|mailto:|tel:)/i.test(text)) return false;
  return true;
}

function nodeString(node, sourceFile) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return [
      node.head.text,
      ...node.templateSpans.flatMap((span) => [
        '${…}',
        span.literal.text,
      ]),
    ].join('');
  }
  return sourceFile.text.slice(node.getStart(sourceFile), node.end);
}

function propertyNameText(name) {
  if (!name) return '';
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return '';
}

function nearestJsxAttribute(node) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isJsxAttribute(current)) return current;
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) return null;
    current = current.parent;
  }
  return null;
}

function isWithinJsxExpression(node) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isJsxExpression(current)) return true;
    if (ts.isBlock(current) || ts.isStatement(current)) return false;
    current = current.parent;
  }
  return false;
}

function variableName(node) {
  if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name)) return '';
  return node.name.text;
}

function candidateKind(node) {
  const parent = node.parent;

  if (ts.isJsxAttribute(parent)) return null;

  const jsxAttribute = nearestJsxAttribute(node);
  if (jsxAttribute) {
    const attributeName = jsxAttribute.name.getText().toLowerCase();
    if (NON_COPY_ATTRIBUTES.has(attributeName)) return null;
    return USER_FACING_ATTRIBUTES.has(attributeName) ? `attribute:${attributeName}` : null;
  }

  if (isWithinJsxExpression(node)) return 'jsx-expression';

  if (ts.isPropertyAssignment(parent)) {
    const name = propertyNameText(parent.name);
    return COPY_NAME.test(name) ? `property:${name}` : null;
  }

  if (ts.isVariableDeclaration(parent)) {
    const name = variableName(parent);
    return COPY_NAME.test(name) ? `constant:${name}` : null;
  }

  if (ts.isCallExpression(parent) && parent.arguments.includes(node)) {
    if (ts.isIdentifier(parent.expression) && MESSAGE_SETTER.test(parent.expression.text)) {
      return `state:${parent.expression.text}`;
    }
    if (
      ts.isPropertyAccessExpression(parent.expression) &&
      VALIDATION_METHODS.has(parent.expression.name.text)
    ) {
      return `validation:${parent.expression.name.text}`;
    }
  }

  return null;
}

export function classifyArea(relativePath) {
  const file = relativePath.replaceAll('\\', '/').toLowerCase();
  if (file.startsWith('mobile/')) return 'mobile';
  if (file.includes('ai-session-notes') || file.includes('session-compass')) return 'ai';
  if (file.includes('notification') || file.includes('/email') || file.includes('/push')) {
    return 'notifications-email';
  }
  if (file.includes('/admin')) return 'admin';
  if (file.includes('/dashboard/athlete') || file.includes('athlete-')) return 'athlete';
  if (file.includes('/dashboard/coach') || file.includes('coach-')) return 'coach';
  if (file.includes('(login)') || file.includes('/auth/') || file.includes('sign-in') || file.includes('sign-up')) {
    return 'authentication';
  }
  if (
    file.includes('(marketing)') ||
    file.includes('(marketplace)') ||
    file.includes('/landing/') ||
    file.endsWith('/footer.tsx')
  ) {
    return 'public';
  }
  return 'shared';
}

export function scanSourceText(sourceText, relativePath = 'fixture.tsx') {
  const sourceFile = ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const candidates = [];
  const seen = new Set();

  function add(node, value, kind) {
    const text = normalizeText(value);
    if (!kind || !isCandidateText(text)) return;
    const start = node.getStart(sourceFile);
    const identity = `${start}:${kind}:${text}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    const { line } = sourceFile.getLineAndCharacterOfPosition(start);
    candidates.push({
      area: classifyArea(relativePath),
      file: relativePath.replaceAll('\\', '/'),
      line: line + 1,
      kind,
      text,
    });
  }

  function visit(node) {
    if (ts.isJsxText(node)) add(node, node.getText(sourceFile), 'jsx-text');

    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile).toLowerCase();
      if (USER_FACING_ATTRIBUTES.has(name) && node.initializer && ts.isStringLiteral(node.initializer)) {
        add(node.initializer, node.initializer.text, `attribute:${name}`);
      }
    }

    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
      add(node, nodeString(node, sourceFile), candidateKind(node));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return candidates;
}

function listSourceFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (['.next', 'migrations', 'node_modules'].includes(entry.name)) continue;
      files.push(...listSourceFiles(fullPath));
      continue;
    }
    const extension = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(extension)) continue;
    if (/\.(?:test|spec)\.[jt]sx?$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
    files.push(fullPath);
  }

  return files;
}

export function scanProject(projectRoot = PROJECT_ROOT) {
  const files = SCAN_ROOTS.flatMap((root) => listSourceFiles(path.join(projectRoot, root)));
  return files
    .flatMap((file) => {
      const relativePath = toPosix(path.relative(projectRoot, file));
      return scanSourceText(fs.readFileSync(file, 'utf8'), relativePath);
    })
    .sort((left, right) =>
      left.area.localeCompare(right.area) ||
      left.file.localeCompare(right.file) ||
      left.line - right.line
    );
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function buildReport(candidates) {
  const areas = [...new Set(candidates.map(({ area }) => area))].sort();
  const files = new Set(candidates.map(({ file }) => file));
  const lines = [
    '# KaiPai i18n inventory',
    '',
    '> Generated by `npm run i18n:inventory`. Do not edit manually.',
    '',
    'This is a deterministic AST-based inventory of likely user-facing literals. It is a migration aid, not a claim that every technical string is translatable: each candidate still needs human review.',
    '',
    `**Current baseline:** ${candidates.length} candidates across ${files.size} files.`,
    '',
    '| Area | Candidates | Files |',
    '|---|---:|---:|',
  ];

  for (const area of areas) {
    const areaCandidates = candidates.filter((candidate) => candidate.area === area);
    lines.push(
      `| ${area} | ${areaCandidates.length} | ${new Set(areaCandidates.map(({ file }) => file)).size} |`
    );
  }

  for (const area of areas) {
    const byFile = new Map();
    for (const candidate of candidates.filter((item) => item.area === area)) {
      const group = byFile.get(candidate.file) ?? [];
      group.push(candidate);
      byFile.set(candidate.file, group);
    }

    lines.push('', `## ${area}`, '', '| File | Candidates | Examples |', '|---|---:|---|');
    for (const [file, items] of [...byFile].sort(
      ([leftFile, left], [rightFile, right]) =>
        right.length - left.length || leftFile.localeCompare(rightFile)
    )) {
      const examples = items
        .slice(0, 3)
        .map(({ line, text }) => `L${line}: ${text}`)
        .join(' · ');
      lines.push(`| \`${file}\` | ${items.length} | ${escapeCell(examples)} |`);
    }
  }

  lines.push(
    '',
    '## Usage',
    '',
    '- Regenerate the baseline: `npm run i18n:inventory`.',
    '- Check whether the committed report is current: `npm run i18n:inventory:check`.',
    '- Inspect every candidate as JSON: `node scripts/i18n-inventory.mjs --json`.',
    '- Migrate shared/public/authentication areas before role dashboards; keep AI, email and mobile as dedicated later phases.',
    ''
  );

  return lines.join('\n');
}

function runCli() {
  const candidates = scanProject();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(candidates, null, 2)}\n`);
    return;
  }

  const report = buildReport(candidates);
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(REPORT_PATH) ? fs.readFileSync(REPORT_PATH, 'utf8') : '';
    if (current !== report) {
      process.stderr.write('docs/i18n-inventory.md is stale. Run npm run i18n:inventory.\n');
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`i18n inventory is current: ${candidates.length} candidates.\n`);
    return;
  }

  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  process.stdout.write(
    `Wrote docs/i18n-inventory.md with ${candidates.length} candidates across ${new Set(candidates.map(({ file }) => file)).size} files.\n`
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) runCli();
