import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const outputDir = resolve("test-results");
const serverHost = "127.0.0.1";
const roomsFile = join(outputDir, "e2e-rooms.json");
const createdProcesses = [];
const openedPages = [];
let browserProcess = null;

mkdirSync(outputDir, { recursive: true });
rmSync(roomsFile, { force: true });

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, serverHost, () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

function startNodeProcess(script, env) {
  const child = spawn(process.execPath, [script], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[${script}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${script}] ${chunk}`));
  createdProcesses.push(child);
  return child;
}

async function waitForHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function findChromePath() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }

  const candidates = [];
  const localAppData = process.env.LOCALAPPDATA;

  if (localAppData) {
    const playwrightRoot = join(localAppData, "ms-playwright");
    try {
      for (const entry of readdirSync(playwrightRoot)) {
        if (entry.startsWith("chromium_headless_shell-")) {
          candidates.push(join(playwrightRoot, entry, "chrome-headless-shell-win64", "chrome-headless-shell.exe"));
        }
        if (entry.startsWith("chromium-")) {
          candidates.push(join(playwrightRoot, entry, "chrome-win", "chrome.exe"));
        }
      }
    } catch {
      // Ignore missing local Playwright cache.
    }
  }

  candidates.push(
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  );

  for (const candidate of candidates) {
    try {
      readdirSync(resolve(candidate, ".."));
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error("Could not find Chromium. Set CHROME_PATH to a Chrome/Chromium executable.");
}

class CdpConnection {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.errors = [];
  }

  static async connect(webSocketUrl) {
    const connection = new CdpConnection(webSocketUrl);
    connection.socket = new WebSocket(webSocketUrl);

    await new Promise((resolveOpen, reject) => {
      connection.socket.addEventListener("open", resolveOpen, { once: true });
      connection.socket.addEventListener("error", reject, { once: true });
    });

    connection.socket.addEventListener("message", (event) => connection.onMessage(JSON.parse(event.data)));
    return connection;
  }

  onMessage(message) {
    if (message.id && this.pending.has(message.id)) {
      const { resolveResponse, rejectResponse } = this.pending.get(message.id);
      this.pending.delete(message.id);

      if (message.error) {
        rejectResponse(new Error(`${message.error.message}: ${message.error.data ?? ""}`));
        return;
      }

      resolveResponse(message.result);
      return;
    }

    const handlers = this.handlers.get(message.method) ?? [];
    handlers.forEach((handler) => handler(message.params));
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) ?? [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    const promise = new Promise((resolveResponse, rejectResponse) => {
      this.pending.set(id, { resolveResponse, rejectResponse });
    });

    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }

    return result.result.value;
  }

  async waitFor(expression, timeoutMs = 8000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (await this.evaluate(`Boolean(${expression})`)) {
        return;
      }
      await delay(100);
    }

    throw new Error(`Timed out waiting for expression: ${expression}`);
  }

  async text() {
    return this.evaluate("document.body.innerText");
  }

  async clickButton(text, rootSelector = "document") {
    const expression = `(() => {
      const root = ${rootSelector === "document" ? "document" : `document.querySelector(${JSON.stringify(rootSelector)})`};
      if (!root) throw new Error("Root not found: ${rootSelector}");
      const buttons = [...root.querySelectorAll("button")];
      const button = buttons.find((candidate) => candidate.textContent.trim().includes(${JSON.stringify(text)}));
      if (!button) throw new Error("Button not found: ${text}");
      button.click();
      return true;
    })()`;
    await this.evaluate(expression);
  }

  async clickSelector(selector) {
    await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error("Element not found: ${selector}");
      element.click();
      return true;
    })()`);
  }

  async fillLabel(labelText, value) {
    await this.evaluate(`(() => {
      const labels = [...document.querySelectorAll("label")];
      const label = labels.find((candidate) => candidate.textContent.trim().toLowerCase().startsWith(${JSON.stringify(labelText.toLowerCase())}));
      if (!label) throw new Error("Label not found: ${labelText}");
      const field = label.querySelector("input, select");
      if (!field) throw new Error("Field not found for label: ${labelText}");
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
      setter.call(field, ${JSON.stringify(value)});
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
  }

  async getValueByLabel(labelText) {
    return this.evaluate(`(() => {
      const labels = [...document.querySelectorAll("label")];
      const label = labels.find((candidate) => candidate.textContent.trim().toLowerCase().startsWith(${JSON.stringify(labelText.toLowerCase())}));
      if (!label) throw new Error("Label not found: ${labelText}");
      const field = label.querySelector("input, select");
      if (!field) throw new Error("Field not found for label: ${labelText}");
      return field.value;
    })()`);
  }

  async count(selector) {
    return this.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  }

  async screenshot(path) {
    const result = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await import("node:fs").then(({ writeFileSync }) => writeFileSync(path, Buffer.from(result.data, "base64")));
  }

  close() {
    this.socket.close();
  }
}

async function launchBrowser() {
  const chromePath = findChromePath();
  const remotePort = await getFreePort();
  const userDataDir = join(outputDir, `e2e-chrome-profile-${Date.now()}`);
  const isHeadlessShell = chromePath.toLowerCase().includes("headless-shell");
  const args = [
    `--remote-debugging-port=${remotePort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--disable-gpu",
    "--disable-extensions",
    "--no-sandbox",
    "--window-size=1366,768",
    "about:blank"
  ];

  if (!isHeadlessShell) {
    args.unshift("--headless=new");
  }

  browserProcess = spawn(chromePath, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  });
  browserProcess.stderr.on("data", (chunk) => process.stderr.write(`[chromium] ${chunk}`));

  await waitForHttp(`http://${serverHost}:${remotePort}/json/version`, 10000);
  return { remotePort };
}

async function newPage(remotePort, url) {
  const response = await fetch(`http://${serverHost}:${remotePort}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const target = await response.json();
  const page = await CdpConnection.connect(target.webSocketDebuggerUrl);

  page.on("Runtime.exceptionThrown", (params) => {
    page.errors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  });
  page.on("Log.entryAdded", (params) => {
    if (params.entry.level === "error") {
      page.errors.push(params.entry.text);
    }
  });

  await page.send("Runtime.enable");
  await page.send("Log.enable");
  await page.send("Page.enable");
  await page.waitFor("document.readyState === 'complete'");
  openedPages.push(page);
  return page;
}

async function runTest(name, fn) {
  process.stdout.write(`E2E ${name} ... `);
  await fn();
  process.stdout.write("ok\n");
}

async function main() {
  const serverPort = await getFreePort();
  const webPort = await getFreePort();
  const serverUrl = `http://${serverHost}:${serverPort}`;
  const webUrl = `http://${serverHost}:${webPort}`;

  startNodeProcess("apps/server/dist/index.js", {
    HOST: serverHost,
    PORT: String(serverPort),
    SHAPES_ROOMS_FILE: roomsFile
  });
  startNodeProcess("scripts/serve-dist.mjs", {
    HOST: serverHost,
    PORT: String(webPort)
  });

  await waitForHttp(`${serverUrl}/health`);
  await waitForHttp(webUrl);

  const { remotePort } = await launchBrowser();

  await runTest("local draw pile shows hidden card backs", async () => {
    const page = await newPage(remotePort, webUrl);
    await page.waitFor("document.body.innerText.includes('Shapes')");
    await page.clickButton("Draw");
    await page.waitFor("document.body.innerText.includes('Draw Pile')");
    assert((await page.count(".deck-panel .draw-back-card")) === 35, "Expected 35 hidden draw card backs.");
    assert((await page.text()).includes("Unseen pool"), "Expected unseen pool summary.");
    assert(page.errors.length === 0, `Console errors: ${page.errors.join("\n")}`);
  });

  let roomId = "";
  let roomCode = "";
  let inviteLink = "";

  await runTest("host creates room and guest joins by invite link", async () => {
    const host = await newPage(remotePort, webUrl);
    await host.fillLabel("Mode", "online");
    await host.fillLabel("Name", "Ada");
    await host.fillLabel("Server", serverUrl);
    await host.clickButton("Create room");
    await host.waitFor("document.body.innerText.includes('Lobby')");

    const lobbyText = await host.text();
    roomCode = await host.evaluate("document.querySelector('h2').textContent.replace('Lobby ', '').trim()");
    roomId = lobbyText.match(/Room id:\s*(room-[^\s]+)/)?.[1] ?? "";
    inviteLink = await host.getValueByLabel("Invite link");

    assert(roomId, "Expected lobby room id.");
    assert(roomCode, "Expected lobby room code.");
    assert(inviteLink.includes(`room=${roomCode}`), "Expected invite link to include short room code.");
    assert(inviteLink.includes(encodeURIComponent(serverUrl)), "Expected invite link to include encoded server URL.");

    const guest = await newPage(remotePort, inviteLink);
    await guest.waitFor("document.body.innerText.includes('Online Room')");
    await guest.fillLabel("Name", "Ben");
    await guest.clickButton("Join room");
    await guest.waitFor("document.body.innerText.includes('Lobby') && document.body.innerText.includes('Ben')");
    await host.waitFor("document.body.innerText.includes('Ben')");

    assert(host.errors.length === 0, `Host console errors: ${host.errors.join("\n")}`);
    assert(guest.errors.length === 0, `Guest console errors: ${guest.errors.join("\n")}`);
  });

  await runTest("host starts game and both players get private views", async () => {
    const pages = openedPages;
    const host = pages[1];
    const guest = pages[2];

    await host.clickButton("Start game");
    await host.waitFor("document.body.innerText.toLowerCase().includes('action tray')");
    await guest.waitFor("document.body.innerText.toLowerCase().includes('action tray')");

    assert((await host.count(".viewer-seat .hidden-card")) === 5, "Host should have 5 hidden own cards.");
    assert((await host.count(".opponent-seats .card-face")) >= 5, "Host should see guest card faces.");
    assert((await guest.count(".viewer-seat .hidden-card")) === 5, "Guest should have 5 hidden own cards.");
    assert((await guest.count(".opponent-seats .card-face")) >= 5, "Guest should see host card faces.");

    const redacted = await fetch(`${serverUrl}/rooms/${roomId}?playerId=room-player-1`).then((response) => response.json());
    assert(!("gameState" in redacted), "Room client response must not include gameState.");
    assert(redacted.gameView, "Room client response should include gameView.");
    assert(redacted.gameView.players[0].hand[0].actual === null, "Host's own first card should be hidden.");
    assert(redacted.gameView.players[1].hand[0].actual !== null, "Host should see guest's first card.");
  });

  await runTest("online action syncs to both browser sessions", async () => {
    const host = openedPages[1];
    const guest = openedPages[2];

    await host.clickSelector(".viewer-seat .card-select-button");
    await host.clickButton("Discard", ".selected-action-bar");
    await host.waitFor("document.body.innerText.includes(\"Ben's Turn\")");
    await guest.waitFor("document.body.innerText.includes(\"Ben's Turn\")");
    assert((await host.text()).includes("DECK") || (await host.text()).includes("Deck"), "Expected game status to remain visible.");
  });

  await runTest("server reloads persisted active room", async () => {
    for (const child of createdProcesses.splice(0)) {
      child.kill();
    }
    await delay(500);
    startNodeProcess("apps/server/dist/index.js", {
      HOST: serverHost,
      PORT: String(serverPort),
      SHAPES_ROOMS_FILE: roomsFile
    });
    await waitForHttp(`${serverUrl}/health`);
    const persisted = await fetch(`${serverUrl}/rooms/${roomId}?playerId=room-player-1`).then((response) => response.json());
    assert(persisted.id === roomId, "Expected persisted room to reload.");
    assert(persisted.gameView, "Expected persisted active room to include redacted game view.");
  });
}

try {
  await main();
} catch (error) {
  for (const [index, page] of openedPages.entries()) {
    try {
      await page.screenshot(join(outputDir, `e2e-failure-${index + 1}.png`));
    } catch {
      // Ignore screenshot failures during cleanup.
    }
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const page of openedPages) {
    page.close();
  }
  if (browserProcess) {
    browserProcess.kill();
  }
  for (const child of createdProcesses) {
    child.kill();
  }
}
