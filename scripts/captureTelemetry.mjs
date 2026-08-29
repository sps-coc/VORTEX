import { appendFileSync, writeFileSync } from "node:fs";
import { AppOrigin, connect, createTab, evaluateInPage } from "./chromeDevtools.mjs";

// Headless data collection: drives the running app over the DevTools protocol,
// records for a fixed number of seconds, and streams the JSONL out to a file. This is
// how a figure gets made without anyone clicking anything.
//
//   npm run capture -- data/telemetry/sweep.jsonl 30 '{"spin":0.9,"accretionRate":0.004}'
//
// Needs the dev server up and Chrome listening on the DevTools port, same as
// `npm run validate`.

const DrainIntervalMilliseconds = 1000;
const SettleMilliseconds = 5000;
const DefaultDurationSeconds = 20;
const DefaultSampleIntervalSeconds = 0.05;

const [outputPath, durationArgument, simulationArgument] = process.argv.slice(2);
if (!outputPath) {
  console.error("usage: node scripts/captureTelemetry.mjs <output.jsonl> [seconds] [simulationPartialJson]");
  process.exit(2);
}
const durationSeconds = Number(durationArgument ?? DefaultDurationSeconds);
const simulationPartial = simulationArgument ? JSON.parse(simulationArgument) : null;

const appUrl = `${AppOrigin}/?capture=${Date.now()}`;
const tab = await createTab(appUrl);
const cdp = await connect(tab.webSocketDebuggerUrl);
await cdp.send("Runtime.enable");
await cdp.send("Page.enable");
await cdp.send("Page.navigate", { url: appUrl });
await new Promise((resolve) => setTimeout(resolve, SettleMilliseconds));

// The app boots paused; capture records the free-fall journey unless the caller's
// partial explicitly keeps it paused.
await evaluateInPage(
  cdp,
  `window.kerrVaidyaControls.setSimulation(${JSON.stringify({ paused: false, ...(simulationPartial ?? {}) })}); true`
);
await evaluateInPage(
  cdp,
  `window.kerrVaidyaRecorder.setSampleIntervalSeconds(${DefaultSampleIntervalSeconds});
   window.kerrVaidyaRecorder.setRecording(true); true`
);

writeFileSync(outputPath, "");
const deadline = Date.now() + durationSeconds * 1000;
let lineCount = 0;
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, DrainIntervalMilliseconds));
  const chunk = await evaluateInPage(cdp, "window.kerrVaidyaRecorder.drain()");
  if (chunk.trim().length === 0) continue;
  appendFileSync(outputPath, chunk);
  lineCount += chunk.trim().split("\n").length;
  process.stderr.write(`\r${lineCount} line(s)`);
}

await evaluateInPage(cdp, "window.kerrVaidyaRecorder.setRecording(false); true");
const tail = await evaluateInPage(cdp, "window.kerrVaidyaRecorder.drain()");
if (tail.trim().length > 0) {
  appendFileSync(outputPath, tail);
  lineCount += tail.trim().split("\n").length;
}
const status = await evaluateInPage(cdp, "JSON.stringify(window.kerrVaidyaRecorder.status())");
cdp.close();

console.error(`\n${outputPath}: ${lineCount} line(s) over ${durationSeconds}s — ${status}`);
