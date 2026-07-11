import { writeFileSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { AppOrigin, connect, createTab } from "./chromeDevtools.mjs";

const appUrl = `${AppOrigin}/?validation=${Date.now()}`;

function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function analyzePng(path) {
  const bytes = readFileSync(path);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (type === "IHDR") {
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      colorType = bytes[dataStart + 9];
    }
    if (type === "IDAT") idat.push(bytes.subarray(dataStart, dataEnd));
    offset = dataEnd + 4;
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * channels);
  let input = 0;
  let output = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[input++];
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[input++];
      const left = x >= channels ? pixels[output - channels] : 0;
      const above = y > 0 ? pixels[output - stride] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[output - stride - channels] : 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      if (filter === 2) value = raw + above;
      if (filter === 3) value = raw + Math.floor((left + above) / 2);
      if (filter === 4) value = raw + paeth(left, above, upperLeft);
      pixels[output++] = value & 255;
    }
  }

  let litPixels = 0;
  let luminanceSum = 0;
  let maxLuminance = 0;
  const sampledColors = new Set();
  const step = Math.max(1, Math.floor((width * height) / 20000));

  for (let index = 0; index < width * height; index += step) {
    const pixel = index * channels;
    const r = pixels[pixel];
    const g = pixels[pixel + 1];
    const b = pixels[pixel + 2];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luminanceSum += luminance;
    maxLuminance = Math.max(maxLuminance, luminance);
    if (luminance > 8) litPixels += 1;
    sampledColors.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }

  const samples = Math.ceil((width * height) / step);
  return {
    width,
    height,
    colorType,
    sampledColors: sampledColors.size,
    litFraction: litPixels / samples,
    meanLuminance: luminanceSum / samples,
    maxLuminance
  };
}

const tab = await createTab(appUrl);
const cdp = await connect(tab.webSocketDebuggerUrl);
await cdp.send("Runtime.enable");
await cdp.send("Page.enable");
await cdp.send("Log.enable");
await cdp.send("Page.navigate", { url: appUrl });
await new Promise((resolve) => setTimeout(resolve, 5000));

const inspected = await cdp.send("Runtime.evaluate", {
  expression: `JSON.stringify({
    title: document.title,
    bodyText: document.body.innerText,
    panel: (() => {
      const panel = document.querySelector('.panel');
      if (!panel) return null;
      const rect = panel.getBoundingClientRect();
      const style = getComputedStyle(panel);
      return {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        color: style.color,
        background: style.backgroundColor,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity
      };
    })(),
    canvas: (() => {
      const canvas = document.querySelector('canvas');
      return canvas && { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight };
    })(),
    state: window.kerrVaidyaState || null
  })`,
  returnByValue: true
});

const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false });
const screenshotPath = "/private/tmp/kerr-vaidya-cdp.png";
writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

const logEvents = cdp.events
  .filter((event) => event.method === "Log.entryAdded" || event.method === "Runtime.exceptionThrown" || event.method === "Runtime.consoleAPICalled")
  .map((event) => event.params)
  .filter((entry) => {
    const text = JSON.stringify(entry);
    return /error|warning|Shader|WebGL|exception/i.test(text);
  });

const page = JSON.parse(inspected.result.value);
const pixels = analyzePng(screenshotPath);
cdp.close();

console.log(JSON.stringify({ appUrl, screenshotPath, page, pixels, logEvents }, null, 2));
