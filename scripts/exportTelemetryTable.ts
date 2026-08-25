import { readFileSync, writeFileSync } from "node:fs";

// Flattens the frame lines of a telemetry JSONL recording into one CSV whose column
// names are the dot paths of the readout — analogue.state.flow.drainStrength and so
// on. Every plotting tool in existence eats this; nothing has to know the schema.
//
//   npm run data:table -- run-12345678.jsonl figures/run-12345678.csv
//
// Other line kinds are summarized on stderr rather than dropped silently: horizon
// profiles are theta-resolved and belong in their own table, events are markers.

const FrameRecordKind = "frame";
const NestedPathSeparator = ".";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("usage: node scripts/exportTelemetryTable.ts <input.jsonl> <output.csv>");
  process.exit(2);
}

function flatten(value: unknown, prefix: string): Record<string, string> {
  if (value === null || typeof value !== "object") return { [prefix]: String(value) };
  if (Array.isArray(value)) {
    return Object.assign({}, ...value.map((entry, index) => flatten(entry, `${prefix}[${index}]`)));
  }
  return Object.assign(
    {},
    ...Object.entries(value).map(([key, entry]) =>
      flatten(entry, prefix ? `${prefix}${NestedPathSeparator}${key}` : key)
    )
  );
}

const lines = readFileSync(inputPath, "utf8")
  .split("\n")
  .filter((line) => line.trim().length > 0)
  .map((line) => JSON.parse(line) as Record<string, unknown>);

const kindCounts = lines.reduce<Record<string, number>>(
  (counts, record) => ({ ...counts, [String(record.kind)]: (counts[String(record.kind)] ?? 0) + 1 }),
  {}
);
const rows = lines.filter((record) => record.kind === FrameRecordKind).map((record) => flatten(record, ""));
if (rows.length === 0) {
  console.error(`no "${FrameRecordKind}" lines in ${inputPath} (found ${JSON.stringify(kindCounts)})`);
  process.exit(1);
}

// A column set that only grows: a run whose apparatus changed mid-flight still
// produces a rectangular table, with blanks where a field was absent.
const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
const escapeCell = (cell: string) => (/[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell);
writeFileSync(
  outputPath,
  [columns.join(","), ...rows.map((row) => columns.map((column) => escapeCell(row[column] ?? "")).join(","))].join("\n") +
    "\n"
);

console.error(
  `${outputPath}: ${rows.length} frame row(s) x ${columns.length} column(s) from ${JSON.stringify(kindCounts)}`
);
