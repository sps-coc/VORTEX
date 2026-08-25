import { readFileSync } from "node:fs";
import {
  ExperimentRecordKind,
  MeasurableQuantities,
  RequiredExperimentFields
} from "../src/data/experimentLog.ts";

// Checks data/experiment-log.jsonl (or a path given as the first argument) against
// the schema in src/data/experimentLog.ts and reports what a contributor has logged
// so far. Lines carrying "status": "template" are the shipped examples and are
// skipped — delete them once the file holds real entries.

const logPath = process.argv[2] ?? "data/experiment-log.jsonl";
const problems: string[] = [];

function report(lineNumber: number, message: string): void {
  problems.push(`${logPath}:${lineNumber} — ${message}`);
}

const parsedLines = readFileSync(logPath, "utf8")
  .split("\n")
  .map((text, index) => ({ text: text.trim(), lineNumber: index + 1 }))
  .filter(({ text }) => text.length > 0)
  .map(({ text, lineNumber }) => {
    try {
      return { record: JSON.parse(text) as Record<string, unknown>, lineNumber };
    } catch (error) {
      report(lineNumber, `not valid JSON (${(error as Error).message})`);
      return null;
    }
  })
  .filter((entry) => entry !== null);

const knownKinds = Object.values(ExperimentRecordKind) as string[];
const records = parsedLines.filter(({ record, lineNumber }) => {
  if (record.status === "template") return false;
  if (typeof record.kind !== "string" || !knownKinds.includes(record.kind)) {
    report(lineNumber, `unknown kind ${JSON.stringify(record.kind)} — expected one of ${knownKinds.join(", ")}`);
    return false;
  }
  return true;
});

records.forEach(({ record, lineNumber }) => {
  const missing = RequiredExperimentFields[record.kind as ExperimentRecordKind].filter(
    (field) => record[field] === undefined || record[field] === null
  );
  if (missing.length > 0) report(lineNumber, `${record.kind} is missing ${missing.join(", ")}`);
});

const apparatusIds = new Set(
  records.filter(({ record }) => record.kind === ExperimentRecordKind.Apparatus).map(({ record }) => record.apparatusId)
);
const runIds = new Set(
  records.filter(({ record }) => record.kind === ExperimentRecordKind.Run).map(({ record }) => record.runId)
);

records
  .filter(({ record }) => record.kind === ExperimentRecordKind.Run)
  .forEach(({ record, lineNumber }) => {
    if (!apparatusIds.has(record.apparatusId)) {
      report(lineNumber, `run ${record.runId} references unknown apparatusId ${JSON.stringify(record.apparatusId)}`);
    }
  });

records
  .filter(({ record }) => record.kind === ExperimentRecordKind.Measurement || record.kind === ExperimentRecordKind.Note)
  .forEach(({ record, lineNumber }) => {
    if (!runIds.has(record.runId)) {
      report(lineNumber, `${record.kind} references unknown runId ${JSON.stringify(record.runId)}`);
    }
  });

const measurements = records.filter(({ record }) => record.kind === ExperimentRecordKind.Measurement);
measurements.forEach(({ record, lineNumber }) => {
  const quantity = MeasurableQuantities[record.quantity as string];
  if (!quantity) {
    report(
      lineNumber,
      `unknown quantity ${JSON.stringify(record.quantity)} — add it to MeasurableQuantities in src/data/experimentLog.ts if it is real`
    );
    return;
  }
  if (record.unit !== quantity.unit) {
    report(lineNumber, `${record.quantity} must be logged in ${quantity.unit}, found ${JSON.stringify(record.unit)}`);
  }
  if (typeof record.value !== "number" || !Number.isFinite(record.value)) {
    report(lineNumber, `${record.quantity} has a non-numeric value ${JSON.stringify(record.value)}`);
  }
  if (typeof record.elapsedSeconds !== "number") {
    report(lineNumber, `${record.quantity} has a non-numeric elapsedSeconds`);
  }
  if (quantity.requiresRadius && typeof record.radiusMetres !== "number") {
    report(lineNumber, `${record.quantity} is radius-resolved and needs a numeric radiusMetres`);
  }
  if (record.uncertainty !== undefined && typeof record.uncertainty !== "number") {
    report(lineNumber, `${record.quantity} has a non-numeric uncertainty`);
  }
});

const quantityCounts = measurements.reduce<Record<string, number>>((counts, { record }) => {
  const quantity = String(record.quantity);
  return { ...counts, [quantity]: (counts[quantity] ?? 0) + 1 };
}, {});
const comparableCount = measurements.filter(
  ({ record }) => MeasurableQuantities[record.quantity as string]?.telemetryPath
).length;

console.log(`${logPath}: ${records.length} record(s) — ${apparatusIds.size} apparatus, ${runIds.size} run(s), ${measurements.length} measurement(s)`);
Object.entries(quantityCounts)
  .sort(([, left], [, right]) => right - left)
  .forEach(([quantity, count]) => {
    const telemetryPath = MeasurableQuantities[quantity]?.telemetryPath;
    console.log(`  ${String(count).padStart(5)}  ${quantity}${telemetryPath ? `  ->  ${telemetryPath}` : "  (no simulation counterpart)"}`);
  });
if (measurements.length > 0) {
  console.log(`  ${comparableCount} of ${measurements.length} measurement(s) have a predicted counterpart to plot against`);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  problems.forEach((problem) => console.error(`  ${problem}`));
  process.exit(1);
}
console.log("\nexperiment log is valid");
