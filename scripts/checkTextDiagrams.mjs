import { error, log } from 'node:console';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const FENCED_BLOCK = /^([ \t]*)```([^\r\n]*)\r?\n([\s\S]*?)^\1```[ \t]*$/gm;
const DISALLOWED_CHARACTER = /[^\x20-\x7e\n\r─│┌┐└┘├┤┬┴┼▲▼]/gu;
const BOX_LINE = /^(?:[┌├└│].*[┐┤┘│]|\+[-+]+\+|\|.*\|)$/u;

// PRE: REPOSITORY_ROOT contains README.md, AGENTS.md and a readable docs directory
// POST: returns those root documents and every Markdown path below docs, sorted
function documentPaths() {
  return [
    'README.md',
    'AGENTS.md',
    ...readdirSync(join(REPOSITORY_ROOT, 'docs'), { recursive: true })
      .filter((path) => path.endsWith('.md'))
      .map((path) => join('docs', path)),
  ].sort();
}

// PRE: markdown is the UTF-8 contents of a document
// POST: returns every text block or fenced diagram, with its first content line and unindented lines
function diagramBlocks(markdown) {
  return [...markdown.matchAll(FENCED_BLOCK)]
    .map((match) => ({
      kind: match[2].trim(),
      line: markdown.slice(0, match.index).split('\n').length + 1,
      lines: match[3].split(/\r?\n/).map((line) => line.slice(match[1].length).trimEnd()),
    }))
    .filter((block) => block.kind === 'text' || block.lines.some((line) => BOX_LINE.test(line)));
}

// PRE: path identifies a document; block comes from diagramBlocks
// POST: returns source-located D-21 failures for forbidden characters or unequal closed-box widths
function blockIssues(path, block) {
  const boxWidths = block.lines.filter((line) => BOX_LINE.test(line)).map((line) => line.length);
  const widestBoxLine = Math.max(0, ...boxWidths);
  return block.lines.flatMap((line, index) => {
    const location = `${path}:${block.line + index}`;
    const forbidden = [...new Set(line.match(DISALLOWED_CHARACTER) ?? [])];
    return [
      ...(forbidden.length === 0
        ? []
        : [`${location}: characters outside D-21: ${forbidden.join(' ')}`]),
      ...(BOX_LINE.test(line) && line.length !== widestBoxLine
        ? [`${location}: box width ${line.length}, expected ${widestBoxLine}`]
        : []),
    ];
  });
}

const documents = documentPaths().map((path) => ({
  path,
  blocks: diagramBlocks(readFileSync(join(REPOSITORY_ROOT, path), 'utf8')),
}));
const issues = documents.flatMap(({ path, blocks }) =>
  blocks.flatMap((block) => blockIssues(path, block)),
);

if (issues.length > 0) {
  error(issues.join('\n'));
  process.exitCode = 1;
} else {
  const blockCount = documents.reduce((count, document) => count + document.blocks.length, 0);
  log(`D-21: ${documents.length} documents, ${blockCount} text/diagram blocks; all checks pass.`);
}
