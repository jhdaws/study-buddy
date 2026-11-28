// D12 (#165): the most complex functions in src/, by ESLint's `complexity`
// rule (cyclomatic complexity: 1 + one per if, loop, case, &&, ||, ??, ?:
// and catch). Run with `npm run complexity` (top 5) or
// `npm run complexity -- 15` (top 15). Test files are left out: they are
// not the code the report is about.
//
// It does not change the lint config: the rule is switched on just for this
// run, with a threshold of 0 so every function reports its score.

import { relative } from "node:path";

import { ESLint } from "eslint";

const top = Number(process.argv[2] ?? 5);

const eslint = new ESLint({
  overrideConfig: { rules: { complexity: ["warn", { max: 0 }] } },
  ignorePatterns: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/lib/database.types.ts"],
});
const results = await eslint.lintFiles(["src/**/*.ts", "src/**/*.tsx"]);

// "Function 'joinSession' has a complexity of 12. Maximum allowed is 0."
// "Async arrow function has a complexity of 3. ..." (no name)
const MESSAGE = /^(.*?) has a complexity of (\d+)\./;

const rows = [];
for (const result of results) {
  for (const message of result.messages) {
    if (message.ruleId !== "complexity") continue;
    const match = MESSAGE.exec(message.message);
    if (!match) continue;
    // "Function 'joinSession'" -> joinSession; an unnamed one keeps its kind.
    const name = /'([^']+)'/.exec(match[1])?.[1] ?? `(${match[1].toLowerCase()})`;
    rows.push({
      fn: name,
      component: result.filePath.includes("/src/components/") || /\.tsx$/.test(result.filePath),
      score: Number(match[2]),
      where: `${relative(process.cwd(), result.filePath)}:${message.line}`,
    });
  }
}

rows.sort((a, b) => b.score - a.score || a.where.localeCompare(b.where));
const total = rows.length;
const mean = rows.reduce((sum, row) => sum + row.score, 0) / (total || 1);
const over10 = rows.filter((row) => row.score > 10).length;

function table(title, list) {
  console.log(`\n${title}\n`);
  console.log(`| # | Function | Complexity | Where |`);
  console.log(`| --- | --- | --- | --- |`);
  list.slice(0, top).forEach((row, i) => console.log(`| ${i + 1} | \`${row.fn}\` | ${row.score} | \`${row.where}\` |`));
}

table("All of src/", rows);
// JSX conditionals (`&&`, `?:` in markup) count like any branch, so React
// components dominate the first table. The logic on its own:
table("Without React components (.tsx files)", rows.filter((row) => !row.component));
console.log(`\n${total} functions in src/ (tests excluded); mean complexity ${mean.toFixed(1)}; ${over10} above 10.`);
