/* =========================================================================
   Operation: Kohlebunker Defense — game.js
   Main loop, state machine, input, spawning, collisions, HUD & rendering.
   Dragos EMEA Forum 2026 · Munich
   ========================================================================= */
"use strict";

(function () {
  /* --------------------------------------------------------------- DOM refs */
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const elScore = document.getElementById("hud-score");
  const elBest = document.getElementById("hud-best");
  const elLives = document.getElementById("hud-lives");
  const elStatusBar = document.getElementById("status-bar");
  const elStatusText = document.getElementById("status-text");
  const elStatusFill = document.getElementById("status-meter-fill");

  const startScreen = document.getElementById("start-screen");
  const gameoverScreen = document.getElementById("gameover-screen");
  const startBtn = document.getElementById("start-btn");
  const restartBtn = document.getElementById("restart-btn");
  const elFinalScore = document.getElementById("final-score");
  const elFinalBest = document.getElementById("final-best");
  const elNewBest = document.getElementById("newbest-banner");
  const elGoSummary = document.getElementById("go-summary");

  const touchControls = document.getElementById("touch-controls");
  const joystick = document.getElementById("joystick");
  const joyThumb = document.getElementById("joystick-thumb");

  const BEST_KEY = "kohlebunker_best_v1";

  /* ----------------------------------------------------------- world state */
  const world = { w: 0, h: 0, dpr: 1 };
  let state = "start"; // start | playing | gameover

  const game = {
    player: null,
    enemies: [],
    intel: [],
    sensors: [],
    plcs: [],
    particles: [],
    popups: [],
    score: 0,
    best: loadBest(),
    lives: 3,
    elapsed: 0, // seconds since mission start
    plcsSecured: 0,
    intelCollected: 0,
    // spawn timers
    tIntel: 0,
    tSensor: 0,
    tEnemy: 0,
    tPLC: 0,
  };

  /* ============================================================ Canvas size */
  function resize() {
    const wrap = canvas.parentElement;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    world.w = w;
    world.h = h;
    world.dpr = dpr;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // keep the player inside the field after orientation changes
    if (game.player) {
      game.player.x = KB.clamp(game.player.x, game.player.r, w - game.player.r);
      game.player.y = KB.clamp(game.player.y, game.player.r, h - game.player.r);
    }
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 150));

  /* ============================================================ Persistence */
  function loadBest() {
    try {
      return parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0;
    } catch (e) {
      return 0;
    }
  }
  function saveBest(v) {
    try {
      localStorage.setItem(BEST_KEY, String(v));
    } catch (e) {
      /* storage unavailable — ignore */
    }
  }

  /* ================================================================= Input */
  const keys = Object.create(null);
  const input = { x: 0, y: 0 }; // movement vector fed to the player

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k))
      e.preventDefault();
    keys[k] = true;
    if (k === "enter" && state !== "playing") {
      state === "start" ? startGame() : restartGame();
    }
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  function readKeyboard() {
    let x = 0;
    let y = 0;
    if (keys["arrowleft"] || keys["a"]) x -= 1;
    if (keys["arrowright"] || keys["d"]) x += 1;
    if (keys["arrowup"] || keys["w"]) y -= 1;
    if (keys["arrowdown"] || keys["s"]) y += 1;
    return { x, y };
  }

  /* --------------------------------------------------- virtual joystick */
  let joyId = null;
  const joyOrigin = { x: 0, y: 0 };
  const JOY_R = 52; // max thumb travel
  const touchVec = { x: 0, y: 0 };

  function onTouchStart(e) {
    for (const t of e.changedTouches) {
      if (joyId !== null) break;
      joyId = t.identifier;
      joyOrigin.x = t.clientX;
      joyOrigin.y = t.clientY;
      const rect = canvas.getBoundingClientRect();
      joystick.style.left = t.clientX - rect.left - 60 + "px";
      joystick.style.top = t.clientY - rect.top - 60 + "px";
      joystick.classList.add("active");
      joyThumb.style.transform = "translate(0px,0px)";
    }
    e.preventDefault();
  }
  function onTouchMove(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      let dx = t.clientX - joyOrigin.x;
      let dy = t.clientY - joyOrigin.y;
      const d = Math.hypot(dx, dy);
      const clamped = Math.min(d, JOY_R);
      const ang = Math.atan2(dy, dx);
      const tx = Math.cos(ang) * clamped;
      const ty = Math.sin(ang) * clamped;
      joyThumb.style.transform = `translate(${tx}px,${ty}px)`;
      // normalize against full travel; small dead zone
      touchVec.x = Math.abs(dx) < 6 && Math.abs(dy) < 6 ? 0 : tx / JOY_R;
      touchVec.y = Math.abs(dx) < 6 && Math.abs(dy) < 6 ? 0 : ty / JOY_R;
    }
    e.preventDefault();
  }
  function onTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      joyId = null;
      touchVec.x = 0;
      touchVec.y = 0;
      joystick.classList.remove("active");
    }
  }
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

  /* ============================================================ Spawn helpers
     Find a position away from the player so nothing spawns on top of them. */
  function safeSpawn(minDistFromPlayer = 120, margin = 40) {
    const p = game.player;
    for (let i = 0; i < 30; i++) {
      const x = KB.rand(margin, world.w - margin);
      const y = KB.rand(margin, world.h - margin);
      if (!p || KB.dist2(x, y, p.x, p.y) > minDistFromPlayer * minDistFromPlayer)
        return { x, y };
    }
    return { x: KB.rand(margin, world.w - margin), y: margin };
  }

  function spawnEnemy() {
    // enemies enter from an edge
    const edge = (Math.random() * 4) | 0;
    let x, y;
    if (edge === 0) {
      x = KB.rand(0, world.w);
      y = -20;
    } else if (edge === 1) {
      x = world.w + 20;
      y = KB.rand(0, world.h);
    } else if (edge === 2) {
      x = KB.rand(0, world.w);
      y = world.h + 20;
    } else {
      x = -20;
      y = KB.rand(0, world.h);
    }
    const speed = enemySpeed();
    game.enemies.push(new Enemy(x, y, speed));
  }

  // difficulty: enemy base speed ramps with elapsed time
  function enemySpeed() {
    return 70 + Math.min(150, game.elapsed * 2.2) + KB.rand(-8, 12);
  }
  // target enemy count grows over time
  function targetEnemyCount() {
    return Math.min(14, 2 + Math.floor(game.elapsed / 12));
  }
  // enemy spawn cadence shrinks over time
  function enemyInterval() {
    return Math.max(1.1, 3.5 - game.elapsed * 0.03);
  }

  /* ============================================================ Game control */
  function resetGame() {
    game.enemies.length = 0;
    game.intel.length = 0;
    game.sensors.length = 0;
    game.plcs.length = 0;
    game.particles.length = 0;
    game.popups.length = 0;
    game.score = 0;
    game.lives = 3;
    game.elapsed = 0;
    game.plcsSecured = 0;
    game.intelCollected = 0;
    game.tIntel = 0;
    game.tSensor = 4;
    game.tEnemy = 1.5;
    game.tPLC = 5;

    game.player = new Player(world.w / 2, world.h / 2);

    // seed the field
    for (let i = 0; i < 6; i++) {
      const s = safeSpawn(80);
      game.intel.push(new ThreatIntel(s.x, s.y));
    }
    for (let i = 0; i < 2; i++) {
      const s = safeSpawn(140);
      game.plcs.push(new PLC(s.x, s.y));
    }
    spawnEnemy();
    spawnEnemy();
    syncHud();
  }

  function startGame() {
    KB.initAudio();
    resize();
    resetGame();
    state = "playing";
    startScreen.classList.add("hidden");
    gameoverScreen.classList.add("hidden");
    if (isTouch()) touchControls.classList.remove("hidden");
    KB.beep(660, 0.1, "triangle");
  }

  function restartGame() {
    startGame();
  }

  function gameOver() {
    state = "gameover";
    touchControls.classList.add("hidden");
    elStatusBar.classList.add("hidden");

    const isNew = game.score > game.best;
    if (isNew) {
      game.best = game.score;
      saveBest(game.best);
    }
    elFinalScore.textContent = formatScore(game.score);
    elFinalBest.textContent = formatScore(game.best);
    elNewBest.classList.toggle("hidden", !isNew);
    elGoSummary.textContent =
      `You secured ${game.plcsSecured} ICS asset` +
      (game.plcsSecured === 1 ? "" : "s") +
      ` and collected ${game.intelCollected} threat-intel package` +
      (game.intelCollected === 1 ? "" : "s") +
      ` over ${Math.floor(game.elapsed)}s before the breach.`;
    gameoverScreen.classList.remove("hidden");
    KB.beep(140, 0.5, "sawtooth", 0.08);
  }

  function isTouch() {
    return (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches
    );
  }

  /* ============================================================ Score popups */
  function addPopup(x, y, text, color) {
    game.popups.push({ x, y, text, color, life: 1, vy: -40 });
  }
  function burst(x, y, color, n = 12) {
    for (let i = 0; i < n; i++) game.particles.push(new Particle(x, y, color));
  }

  function addScore(amount) {
    game.score += amount;
    if (game.score > game.best) {
      game.best = game.score; // live-update best while playing
    }
    syncHud();
  }

  /* ================================================================= Update */
  function update(dt) {
    if (state !== "playing") return;
    game.elapsed += dt;

    // ---- input ----
    const kb = readKeyboard();
    input.x = kb.x + touchVec.x;
    input.y = kb.y + touchVec.y;

    const p = game.player;
    p.update(dt, input, world);

    // ---- spawn timers ----
    game.tIntel -= dt;
    if (game.tIntel <= 0 && game.intel.length < 10) {
      const s = safeSpawn(70);
      game.intel.push(new ThreatIntel(s.x, s.y));
      game.tIntel = KB.rand(1.4, 2.8);
    }

    game.tSensor -= dt;
    if (game.tSensor <= 0 && game.sensors.length < 2) {
      const s = safeSpawn(120);
      game.sensors.push(new Sensor(s.x, s.y));
      game.tSensor = KB.rand(9, 14);
    }

    game.tPLC -= dt;
    const activePlcs = game.plcs.filter((q) => !q.patched).length;
    if (game.tPLC <= 0 && activePlcs < 3) {
      const s = safeSpawn(150);
      game.plcs.push(new PLC(s.x, s.y));
      game.tPLC = KB.rand(6, 11);
    }

    game.tEnemy -= dt;
    if (game.tEnemy <= 0 && game.enemies.length < targetEnemyCount()) {
      spawnEnemy();
      game.tEnemy = enemyInterval();
    }

    // ---- update entities ----
    for (const e of game.enemies) e.update(dt, p, world);
    for (const it of game.intel) it.update(dt);
    for (const s of game.sensors) s.update(dt);

    for (const plc of game.plcs) {
      const near =
        !plc.patched &&
        KB.dist2(plc.x, plc.y, p.x, p.y) < (plc.r + p.r + 18) ** 2;
      const wasPatched = plc.patched;
      plc.update(dt, near);
      if (plc.patched && !wasPatched) {
        addScore(plc.value);
        game.plcsSecured++;
        addPopup(plc.x, plc.y - 24, "+" + plc.value + " SECURED", "#2ee6ff");
        burst(plc.x, plc.y, "#2ee6ff", 20);
        KB.beep(880, 0.18, "triangle", 0.07);
        KB.beep(1320, 0.12, "sine", 0.05);
      }
    }

    // ---- collisions: intel ----
    for (const it of game.intel) {
      if (KB.dist2(it.x, it.y, p.x, p.y) < (it.r + p.r) ** 2) {
        it.dead = true;
        addScore(it.value);
        game.intelCollected++;
        addPopup(it.x, it.y - 14, "+" + it.value, "#38bdf8");
        burst(it.x, it.y, "#38bdf8", 8);
        KB.beep(720 + Math.random() * 120, 0.06, "square", 0.04);
      }
    }

    // ---- collisions: sensors (shield) ----
    for (const s of game.sensors) {
      if (KB.dist2(s.x, s.y, p.x, p.y) < (s.r + p.r) ** 2) {
        s.dead = true;
        p.shieldTime = Math.max(p.shieldTime, s.duration);
        addPopup(s.x, s.y - 16, "SHIELD UP", "#4ade80");
        burst(s.x, s.y, "#4ade80", 14);
        KB.beep(520, 0.12, "sine", 0.06);
        KB.beep(780, 0.12, "sine", 0.05);
      }
    }

    // ---- collisions: enemies ----
    for (const e of game.enemies) {
      if (e.spawnGrace > 0) continue;
      if (KB.dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) ** 2) {
        if (p.shielded) {
          if (p.shieldTime > 0) {
            // shield destroys the APT
            e._dead = true;
            addScore(75);
            addPopup(e.x, e.y - 14, "NEUTRALIZED +75", "#4ade80");
            burst(e.x, e.y, "#4ade80", 16);
            KB.beep(300, 0.15, "sawtooth", 0.05);
          }
          // during hit i-frames we just ignore contact
        } else {
          loseLife();
          // knock the enemy back so it doesn't chain-hit
          e._dead = true;
          burst(p.x, p.y, "#ff3b46", 22);
          break;
        }
      }
    }

    // ---- update fx ----
    for (const pt of game.particles) pt.update(dt);
    for (const pop of game.popups) {
      pop.life -= dt;
      pop.y += pop.vy * dt;
      pop.vy *= 0.94;
    }

    // ---- cull ----
    game.intel = game.intel.filter((o) => !o.dead);
    game.sensors = game.sensors.filter((o) => !o.dead);
    game.enemies = game.enemies.filter((o) => !o._dead);
    game.plcs = game.plcs.filter((o) => !(o.patched && o.flash <= 0));
    game.particles = game.particles.filter((o) => !o.dead);
    game.popups = game.popups.filter((o) => o.life > 0);

    // passive survival trickle keeps the score moving
    updateStatusBar();
  }

  function loseLife() {
    const p = game.player;
    game.lives--;
    p.shieldTime = 0;
    p.invulnHit = 1.6; // brief i-frames
    syncHud();
    KB.beep(120, 0.3, "sawtooth", 0.08);
    if (game.lives <= 0) {
      gameOver();
    }
  }

  /* ---------------------------------------------------------- status bar */
  function updateStatusBar() {
    const p = game.player;
    // priority 1: a PLC mid-deploy
    const deploying = game.plcs.find((q) => !q.patched && q.progress > 0.001);
    if (p.shieldTime > 0) {
      elStatusBar.classList.remove("hidden");
      elStatusText.textContent = "DRAGOS SHIELD ACTIVE";
      elStatusFill.style.width = (p.shieldTime / 6) * 100 + "%";
    } else if (deploying) {
      elStatusBar.classList.remove("hidden");
      elStatusText.textContent = "DEPLOYING DRAGOS PLATFORM…";
      elStatusFill.style.width = deploying.progress * 100 + "%";
    } else {
      elStatusBar.classList.add("hidden");
    }
  }

  /* ================================================================== HUD */
  function formatScore(v) {
    return v.toLocaleString("en-US");
  }
  function syncHud() {
    elScore.textContent = formatScore(game.score);
    elBest.textContent = formatScore(Math.max(game.best, game.score));
    renderLives();
  }
  function renderLives() {
    // build 3 shield icons, dim the lost ones
    const total = 3;
    if (elLives.childElementCount !== total) {
      elLives.innerHTML = "";
      for (let i = 0; i < total; i++) {
        elLives.insertAdjacentHTML(
          "beforeend",
          `<svg class="life-shield" viewBox="0 0 24 26" aria-hidden="true">
             <path d="M12 1 L22 5 V13 C22 20 17 24 12 25 C7 24 2 20 2 13 V5 Z"
                   fill="#22c55e"/>
             <path d="M12 7 V18 M7 12 H17" stroke="#06120a" stroke-width="2"
                   stroke-linecap="round"/>
           </svg>`
        );
      }
    }
    const nodes = elLives.children;
    for (let i = 0; i < total; i++) {
      nodes[i].classList.toggle("lost", i >= game.lives);
    }
  }

  /* ============================================================== Rendering */
  function drawBackground() {
    const { w, h } = world;
    // base industrial gradient
    ctx.fillStyle = "#0a0f17";
    ctx.fillRect(0, 0, w, h);

    // subtle vignette glow
    const g = ctx.createRadialGradient(
      w / 2,
      h * 0.35,
      40,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.75
    );
    g.addColorStop(0, "rgba(20, 40, 64, 0.55)");
    g.addColorStop(1, "rgba(6, 8, 13, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // industrial grid (Kohlebunker floor)
    const cell = 48;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(54, 211, 244, 0.06)";
    ctx.beginPath();
    for (let x = (game.elapsed * 6) % cell; x < w; x += cell) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += cell) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // brighter accent grid nodes
    ctx.fillStyle = "rgba(54, 211, 244, 0.10)";
    for (let x = ((game.elapsed * 6) % cell) - cell; x < w + cell; x += cell) {
      for (let y = 0; y < h + cell; y += cell) {
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    // hazard border
    ctx.strokeStyle = "rgba(255, 59, 70, 0.10)";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }

  function render() {
    drawBackground();
    if (state === "start") return;

    // draw order: intel/sensors/plcs (ground), particles, enemies, player, popups
    for (const it of game.intel) it.draw(ctx);
    for (const s of game.sensors) s.draw(ctx);
    for (const plc of game.plcs) plc.draw(ctx);
    for (const pt of game.particles) pt.draw(ctx);
    for (const e of game.enemies) e.draw(ctx);
    if (game.player) game.player.draw(ctx);

    // popups
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const pop of game.popups) {
      ctx.globalAlpha = KB.clamp(pop.life, 0, 1);
      ctx.fillStyle = pop.color;
      ctx.font = "bold 14px " + getComputedStyle(document.body).fontFamily;
      ctx.shadowColor = pop.color;
      ctx.shadowBlur = 8;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  /* ============================================================== Main loop */
  let lastT = 0;
  function frame(now) {
    if (!lastT) lastT = now;
    let dt = (now - lastT) / 1000;
    lastT = now;
    // clamp dt for tab-switches / slow frames so physics stays stable
    if (dt > 0.05) dt = 0.05;

    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  /* ============================================================== Bootstrap */
  startBtn.addEventListener("click", startGame);
  restartBtn.addEventListener("click", restartGame);

  resize();
  syncHud();
  // draw the background once behind the start overlay
  render();
  requestAnimationFrame(frame);
})();
