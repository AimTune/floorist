// Read coverage.lcov produced by `node --test --experimental-test-coverage`,
// summarise per-file + total line/branch/function coverage, and inject a
// markdown table + a shields.io-style badge into README.md between two
// HTML comment markers. Idempotent — safe to re-run on every build.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LCOV = join(ROOT, 'coverage.lcov');
const README = join(ROOT, 'README.md');
const START = '<!-- coverage-start -->';
const END = '<!-- coverage-end -->';

const pct = (hit, total) => (total === 0 ? 100 : (hit / total) * 100);
const fmt = (n) => `${n.toFixed(1)}%`;
const badgeColor = (n) => (n >= 80 ? 'brightgreen' : n >= 60 ? 'yellow' : 'red');

async function parseLcov(text) {
  const records = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line === 'end_of_record') {
      if (cur) records.push(cur);
      cur = null;
      continue;
    }
    if (!cur) cur = { file: '', lf: 0, lh: 0, brf: 0, brh: 0, fnf: 0, fnh: 0 };
    const [tag, rest = ''] = line.split(/:(.+)/);
    switch (tag) {
      case 'SF': cur.file = rest; break;
      case 'LF': cur.lf = +rest; break;
      case 'LH': cur.lh = +rest; break;
      case 'BRF': cur.brf = +rest; break;
      case 'BRH': cur.brh = +rest; break;
      case 'FNF': cur.fnf = +rest; break;
      case 'FNH': cur.fnh = +rest; break;
      default: /* ignore DA / BRDA / FN / FNDA / TN */ break;
    }
  }
  if (cur) records.push(cur);
  return records;
}

function renderTable(records) {
  // group by directory under dist/
  const rows = records
    .map((r) => {
      const file = relative(ROOT, r.file).replace(/^dist\//, '');
      return {
        file,
        lines: pct(r.lh, r.lf),
        branches: pct(r.brh, r.brf),
        funcs: pct(r.fnh, r.fnf),
        ...r,
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file));

  const total = records.reduce(
    (acc, r) => ({
      lf: acc.lf + r.lf, lh: acc.lh + r.lh,
      brf: acc.brf + r.brf, brh: acc.brh + r.brh,
      fnf: acc.fnf + r.fnf, fnh: acc.fnh + r.fnh,
    }),
    { lf: 0, lh: 0, brf: 0, brh: 0, fnf: 0, fnh: 0 },
  );
  const tLines = pct(total.lh, total.lf);
  const tBranches = pct(total.brh, total.brf);
  const tFuncs = pct(total.fnh, total.fnf);

  const headerRow = '| File | Lines | Branches | Functions |';
  const sepRow = '| :--- | ---: | ---: | ---: |';
  const dataRows = rows.map(
    (r) => `| \`${r.file}\` | ${fmt(r.lines)} | ${fmt(r.branches)} | ${fmt(r.funcs)} |`,
  );
  const totalRow = `| **All covered modules** | **${fmt(tLines)}** | **${fmt(tBranches)}** | **${fmt(tFuncs)}** |`;

  const headlineBadge = `![coverage](https://img.shields.io/badge/coverage-${fmt(tLines).replace(
    '%',
    '%25',
  )}-${badgeColor(tLines)})`;

  const block = [
    headlineBadge,
    '',
    `*Last updated by \`npm run build\` — ${rows.length} covered module(s).*`,
    '',
    headerRow,
    sepRow,
    ...dataRows,
    totalRow,
    '',
    '> Files not in this table (\`dist/component/\`, \`dist/render/\`, \`dist/editor/controller.js\`) are browser-only — they need DOM/Canvas and are exercised by the headless smoke test, not by `npm test`.',
  ].join('\n');

  return { block, totals: { lines: tLines, branches: tBranches, funcs: tFuncs } };
}

async function main() {
  let lcov;
  try {
    lcov = await readFile(LCOV, 'utf8');
  } catch {
    console.error(`coverage-readme: ${LCOV} not found — run "npm run test:cov" first.`);
    process.exit(1);
  }
  const records = await parseLcov(lcov);
  if (!records.length) {
    console.error('coverage-readme: no records in coverage.lcov');
    process.exit(1);
  }
  const { block, totals } = renderTable(records);

  const readme = await readFile(README, 'utf8');
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    console.error(`coverage-readme: ${START} ... ${END} markers not found in README.md`);
    process.exit(1);
  }
  const next = `${readme.slice(0, start + START.length)}\n\n${block}\n\n${readme.slice(end)}`;
  if (next === readme) {
    console.log('coverage-readme: README unchanged.');
  } else {
    await writeFile(README, next);
    console.log(
      `coverage-readme: updated README — lines ${fmt(totals.lines)}, branches ${fmt(
        totals.branches,
      )}, funcs ${fmt(totals.funcs)}.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
