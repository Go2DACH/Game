/* Deep functional test for Operation: Kohlebunker Defense.
   Serves the static files, loads the game in headless Chromium, captures
   console/page errors, and drives gameplay via the exposed game state. */
import { chromium } from "playwright";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "..", ".."));
const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".md": "text/markdown",
};

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const full = join(ROOT, p);
    if (!full.startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(full);
    res.writeHead(200, { "content-type": MIME[extname(full)] || "text/plain" });
    res.end(body);
  } catch (e) {
    res.writeHead(404).end("not found");
  }
});

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

// Use an explicit binary if provided (CI / sandboxed envs), else let
// Playwright resolve its managed Chromium download.
const launchOpts = { args: ["--no-sandbox"] };
if (process.env.KB_CHROMIUM) launchOpts.executablePath = process.env.KB_CHROMIUM;
const browser = await chromium.launch(launchOpts);

// ---- Desktop pass ----
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => pageErrors.push(e.message));

await page.goto(base + "/index.html", { waitUntil: "networkidle" });

// 1. No load-time errors
check("page loads without JS errors", pageErrors.length === 0, pageErrors.join("; "));

// 2. Intro "Security Notice" shows first, start screen hidden behind it
check("intro screen visible on load", await page.isVisible("#intro-screen"));
check("intro shows the security-notice text", /trusted link/i.test(await page.textContent("#intro-screen")));
check("start screen hidden behind intro", !(await page.isVisible("#start-screen")));
// dismiss the intro → start screen appears
await page.click("#intro-btn");
await page.waitForTimeout(200);
check("intro dismissed reveals start screen", !(await page.isVisible("#intro-screen")) && (await page.isVisible("#start-screen")));
check(
  "game-over hidden on load",
  !(await page.isVisible("#gameover-screen"))
);

// 3. Canvas sized to viewport
const canvasOk = await page.evaluate(() => {
  const c = document.getElementById("game-canvas");
  return c.width > 0 && c.height > 0;
});
check("canvas has non-zero dimensions", canvasOk);

// 4. Best score loaded from localStorage (seed a value, reload)
await page.evaluate(() => localStorage.setItem("kohlebunker_best_v1", "1234"));
await page.reload({ waitUntil: "networkidle" });
const bestShown = await page.textContent("#hud-best");
check("high score read from localStorage", bestShown.replace(/[^0-9]/g, "") === "1234", `shown="${bestShown}"`);

// 5. Start the mission (dismiss the intro that re-appears after reload)
await page.click("#intro-btn");
await page.waitForTimeout(150);
await page.click("#start-btn");
await page.waitForTimeout(300);
check("start screen hidden after Start", !(await page.isVisible("#start-screen")));

// Probe internal game state by hooking the closure is not possible (IIFE),
// so we observe via DOM + simulated input instead.

// 6. Keyboard movement moves the player (compare canvas pixel hash region).
//    We instead verify the score increases over time by colliding with intel.
//    Drive the player around with arrow keys and check score rises.
// verify keyboard actually moves the player
const posBefore = await page.evaluate(() => window.KBGame.player);
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(500);
await page.keyboard.up("ArrowRight");
const posAfter = await page.evaluate(() => window.KBGame.player);
check("keyboard moves the player", Math.abs(posAfter.x - posBefore.x) > 30, `dx=${(posAfter.x - posBefore.x).toFixed(1)}`);

// deterministically steer toward the nearest intel orb and confirm score rises
const scoreStart = parseInt((await page.textContent("#hud-score")).replace(/\D/g, ""), 10);
let collected = false;
for (let step = 0; step < 80 && !collected; step++) {
  const dir = await page.evaluate(() => {
    const g = window.KBGame;
    const p = g.player;
    const orbs = g.entities.intel;
    if (!orbs.length) return null;
    let best = orbs[0], bd = Infinity;
    for (const o of orbs) {
      const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return { dx: best.x - p.x, dy: best.y - p.y };
  });
  if (!dir) break;
  const kx = dir.dx > 8 ? "ArrowRight" : dir.dx < -8 ? "ArrowLeft" : null;
  const ky = dir.dy > 8 ? "ArrowDown" : dir.dy < -8 ? "ArrowUp" : null;
  if (kx) await page.keyboard.down(kx);
  if (ky) await page.keyboard.down(ky);
  await page.waitForTimeout(60);
  if (kx) await page.keyboard.up(kx);
  if (ky) await page.keyboard.up(ky);
  const sc = parseInt((await page.textContent("#hud-score")).replace(/\D/g, ""), 10);
  if (sc > scoreStart) collected = true;
}
const scoreAfter = parseInt((await page.textContent("#hud-score")).replace(/\D/g, ""), 10);
check("score increases while collecting intel", scoreAfter > scoreStart, `from ${scoreStart} to ${scoreAfter}`);

// patch a PLC: steer onto one and hold for >3s, expect a +500-ish jump
const beforePatch = scoreAfter;
let patched = false;
for (let step = 0; step < 140 && !patched; step++) {
  const info = await page.evaluate(() => {
    const g = window.KBGame;
    const p = g.player;
    const targets = g.entities.plcs.filter((q) => !q.patched);
    if (!targets.length) return { none: true };
    let best = targets[0], bd = Infinity;
    for (const o of targets) {
      const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return { dx: best.x - p.x, dy: best.y - p.y, dist: Math.sqrt(bd), score: g.score };
  });
  if (info.none) break;
  if (info.dist < 20) {
    // stand still on the PLC to let the patch deploy
    await page.waitForTimeout(120);
  } else {
    const kx = info.dx > 6 ? "ArrowRight" : info.dx < -6 ? "ArrowLeft" : null;
    const ky = info.dy > 6 ? "ArrowDown" : info.dy < -6 ? "ArrowUp" : null;
    if (kx) await page.keyboard.down(kx);
    if (ky) await page.keyboard.down(ky);
    await page.waitForTimeout(50);
    if (kx) await page.keyboard.up(kx);
    if (ky) await page.keyboard.up(ky);
  }
  if (info.score >= beforePatch + 400) patched = true;
}
check("PLC patch awards a large score boost", patched, `score reached ${await page.evaluate(() => window.KBGame.score)}`);

// 7. Lives render as 3 shields
const lifeCount = await page.evaluate(
  () => document.querySelectorAll("#hud-lives .life-shield").length
);
check("three life shields rendered", lifeCount === 3, `count=${lifeCount}`);

// 8. No runtime errors accumulated during play (ignore favicon noise)
const realConsoleErrors = consoleErrors.filter((t) => !/favicon/i.test(t));
check("no console errors during play", realConsoleErrors.length === 0, realConsoleErrors.slice(0, 3).join("; "));
check("no page errors during play", pageErrors.length === 0, pageErrors.slice(0, 3).join("; "));

// 9. Force a game-over by steering the player into the nearest APT repeatedly.
let gameOverReached = false;
for (let step = 0; step < 400 && !gameOverReached; step++) {
  gameOverReached = await page.evaluate(() => window.KBGame.state === "gameover");
  if (gameOverReached) break;
  const dir = await page.evaluate(() => {
    const g = window.KBGame;
    const p = g.player;
    const en = g.entities.enemies;
    if (!en.length) return { wait: true };
    let best = en[0], bd = Infinity;
    for (const o of en) {
      const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return { dx: best.x - p.x, dy: best.y - p.y };
  });
  if (!dir.wait) {
    const kx = dir.dx > 6 ? "ArrowRight" : dir.dx < -6 ? "ArrowLeft" : null;
    const ky = dir.dy > 6 ? "ArrowDown" : dir.dy < -6 ? "ArrowUp" : null;
    if (kx) await page.keyboard.down(kx);
    if (ky) await page.keyboard.down(ky);
    await page.waitForTimeout(50);
    if (kx) await page.keyboard.up(kx);
    if (ky) await page.keyboard.up(ky);
  } else {
    await page.waitForTimeout(50);
  }
}
check("game over reached after losing all lives", gameOverReached);

// 10. Game-over screen shows a final score and Play Again works
if (await page.isVisible("#gameover-screen")) {
  const finalShown = await page.textContent("#final-score");
  check("game-over shows final score", finalShown.trim().length > 0, `final="${finalShown}"`);
  // best score should be >= what we had
  const goBest = parseInt((await page.textContent("#final-best")).replace(/\D/g, ""), 10);
  check("game-over best score persisted", goBest >= 1234, `best=${goBest}`);

  // ---- Leaderboard (Bestenliste) ----
  check("name entry shown for a qualifying score", await page.isVisible("#go-nameentry"));
  await page.fill("#name-input", "TESTER");
  await page.click("#name-save");
  await page.waitForTimeout(200);
  const goRows = await page.$$eval("#go-leaderboard .lb-row", (els) => els.map((e) => e.textContent));
  check("leaderboard row added after save", goRows.some((t) => /TESTER/i.test(t)), `rows=${goRows.length}`);
  check("name entry hides after saving", !(await page.isVisible("#go-nameentry")));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("kohlebunker_scores_v1") || "[]"));
  check("leaderboard persisted to localStorage", stored.length > 0 && stored[0].name === "TESTER", JSON.stringify(stored[0] || {}));

  // Play Again restarts cleanly
  await page.click("#restart-btn");
  await page.waitForTimeout(300);
  check("Play Again restarts (overlays hidden)", !(await page.isVisible("#gameover-screen")) && !(await page.isVisible("#start-screen")));
  const livesAfterRestart = await page.evaluate(() => {
    return document.querySelectorAll("#hud-lives .life-shield:not(.lost)").length;
  });
  check("lives reset to 3 on restart", livesAfterRestart === 3, `active=${livesAfterRestart}`);
}

// ---- Leaderboard opens from the start screen and survives reload ----
await page.reload({ waitUntil: "networkidle" });
await page.click("#intro-btn"); // get past the security notice
await page.waitForTimeout(150);
check("start screen visible after reload", await page.isVisible("#start-screen"));
await page.click("#leaderboard-btn");
await page.waitForTimeout(200);
check("leaderboard overlay opens from start screen", await page.isVisible("#leaderboard-screen"));
const lbRows = await page.$$eval("#lb-leaderboard .lb-row", (els) => els.map((e) => e.textContent));
check("leaderboard persists across reload", lbRows.some((t) => /TESTER/i.test(t)), `rows=${lbRows.length}`);
await page.click("#lb-back");
await page.waitForTimeout(150);
check("leaderboard overlay closes via Back", !(await page.isVisible("#leaderboard-screen")));

await ctx.close();

// ---- Mobile pass: touch controls + joystick ----
const mctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const mpage = await mctx.newPage();
const mErrors = [];
mpage.on("pageerror", (e) => mErrors.push(e.message));
await mpage.goto(base + "/index.html", { waitUntil: "networkidle" });
check("intro visible on mobile load", await mpage.isVisible("#intro-screen"));
await mpage.click("#intro-btn");
await mpage.waitForTimeout(150);
await mpage.click("#start-btn");
await mpage.waitForTimeout(200);
check("touch controls shown on mobile", await mpage.isVisible("#touch-controls"));

// Simulate a joystick drag and confirm thumb moves + score can change
await mpage.touchscreen.tap(195, 600).catch(() => {});
// Use a drag gesture via dispatching touch events
const joyMoved = await mpage.evaluate(async () => {
  const canvas = document.getElementById("game-canvas");
  const rect = canvas.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height * 0.7;
  function tev(type, x, y) {
    const t = new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y });
    const e = new TouchEvent(type, {
      cancelable: true, bubbles: true, touches: type === "touchend" ? [] : [t],
      targetTouches: type === "touchend" ? [] : [t], changedTouches: [t],
    });
    canvas.dispatchEvent(e);
  }
  tev("touchstart", cx, cy);
  tev("touchmove", cx + 50, cy + 10);
  await new Promise((r) => setTimeout(r, 400));
  const thumb = document.getElementById("joystick-thumb");
  const moved = thumb.style.transform && thumb.style.transform !== "translate(0px,0px)";
  const active = document.getElementById("joystick").classList.contains("active");
  tev("touchend", cx + 50, cy + 10);
  return { moved, active };
});
check("joystick activates on touch", joyMoved.active);
check("joystick thumb tracks drag", joyMoved.moved, `transform applied`);
check("no errors on mobile pass", mErrors.length === 0, mErrors.slice(0, 3).join("; "));

await mctx.close();
await browser.close();
server.close();

// ---- summary ----
const failed = results.filter((r) => !r.ok);
console.log("\n=== SUMMARY ===");
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILURES:");
  failed.forEach((f) => console.log(" - " + f.name + (f.detail ? " :: " + f.detail : "")));
  process.exit(1);
}
process.exit(0);
