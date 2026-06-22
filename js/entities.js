/* =========================================================================
   Operation: Kohlebunker Defense — entities.js
   Player, APT enemies, collectibles, interactables and FX.
   Pure Vanilla JS. All entities draw procedurally on a 2D canvas context.
   Coordinates are in canvas pixels; movement is delta-time based.
   ========================================================================= */
"use strict";

/* ------------------------------------------------------------------ utils */
const KB = {
  rand: (min, max) => min + Math.random() * (max - min),
  clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
  dist2: (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  },
  // Lightweight WebAudio blips (no asset files needed for the MVP).
  audio: null,
  initAudio() {
    if (this.audio) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.audio = new Ctx();
    } catch (e) {
      this.audio = null;
    }
  },
  beep(freq = 440, dur = 0.08, type = "sine", gain = 0.06) {
    const ac = this.audio;
    if (!ac) return;
    if (ac.state === "suspended") ac.resume();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g).connect(ac.destination);
    const t = ac.currentTime;
    osc.start(t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.stop(t + dur + 0.02);
  },
};

/* ============================================================ Particle FX */
class Particle {
  constructor(x, y, color) {
    const a = KB.rand(0, Math.PI * 2);
    const sp = KB.rand(40, 220);
    this.x = x;
    this.y = y;
    this.vx = Math.cos(a) * sp;
    this.vy = Math.sin(a) * sp;
    this.life = KB.rand(0.3, 0.7);
    this.maxLife = this.life;
    this.size = KB.rand(1.5, 4);
    this.color = color;
    this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.92;
    this.vy *= 0.92;
  }
  draw(ctx) {
    const a = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* =================================================================== Player
   The Dragos Defender. Smooth velocity-based movement with input vector. */
class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 14;
    this.speed = 240; // px/s
    this.vx = 0;
    this.vy = 0;
    this.dir = { x: 0, y: -1 }; // facing
    this.shieldTime = 0; // seconds of invulnerability remaining
    this.invulnHit = 0; // brief i-frames after losing a life
    this.pulse = 0;
  }

  get shielded() {
    return this.shieldTime > 0 || this.invulnHit > 0;
  }

  // input: normalized-ish vector {x,y}
  update(dt, input, bounds) {
    this.pulse += dt;
    if (this.shieldTime > 0) this.shieldTime -= dt;
    if (this.invulnHit > 0) this.invulnHit -= dt;

    let ix = input.x;
    let iy = input.y;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }
    if (mag > 0.05) {
      this.dir.x = ix / (mag || 1);
      this.dir.y = iy / (mag || 1);
    }

    // accelerate toward target velocity for a smooth feel
    const targetVx = ix * this.speed;
    const targetVy = iy * this.speed;
    const accel = 14 * dt;
    this.vx += (targetVx - this.vx) * Math.min(1, accel);
    this.vy += (targetVy - this.vy) * Math.min(1, accel);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.x = KB.clamp(this.x, this.r, bounds.w - this.r);
    this.y = KB.clamp(this.y, this.r, bounds.h - this.r);
  }

  draw(ctx) {
    const { x, y, r } = this;
    ctx.save();
    ctx.translate(x, y);

    // shield aura
    if (this.shieldTime > 0) {
      const sp = 0.5 + 0.5 * Math.sin(this.pulse * 8);
      ctx.beginPath();
      ctx.arc(0, 0, r + 8 + sp * 2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(74, 222, 128, ${0.5 + sp * 0.4})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = "#4ade80";
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // blink during hit i-frames
    if (this.invulnHit > 0 && Math.floor(this.pulse * 20) % 2 === 0) {
      ctx.globalAlpha = 0.35;
    }

    // rotate toward facing
    const ang = Math.atan2(this.dir.y, this.dir.x) + Math.PI / 2;
    ctx.rotate(ang);

    // body — hex "defender" core
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
    grad.addColorStop(0, "#bff4ff");
    grad.addColorStop(1, "#2ee6ff");
    ctx.fillStyle = grad;
    ctx.shadowColor = "#2ee6ff";
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;

    // inner shield emblem
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.55);
    ctx.lineTo(r * 0.42, -r * 0.2);
    ctx.lineTo(r * 0.42, r * 0.25);
    ctx.lineTo(0, r * 0.6);
    ctx.lineTo(-r * 0.42, r * 0.25);
    ctx.lineTo(-r * 0.42, -r * 0.2);
    ctx.closePath();
    ctx.fillStyle = "#06283a";
    ctx.fill();

    // directional "scanner" tip
    ctx.beginPath();
    ctx.moveTo(0, -r - 4);
    ctx.lineTo(-3, -r + 2);
    ctx.lineTo(3, -r + 2);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.restore();
  }
}

/* ==================================================================== Enemy
   APT — chases the player. Variants flavored after real threat groups. */
const APT_NAMES = ["XENOTIME", "ELECTRUM", "KAMACITE", "ERYTHRITE", "WASSONITE"];

class Enemy {
  constructor(x, y, speed) {
    this.x = x;
    this.y = y;
    this.r = 13;
    this.speed = speed;
    this.name = APT_NAMES[(Math.random() * APT_NAMES.length) | 0];
    this.wob = KB.rand(0, Math.PI * 2);
    this.vx = 0;
    this.vy = 0;
    this.spawnGrace = 0.6; // fade-in so it can't insta-kill on spawn
  }

  update(dt, target, bounds) {
    if (this.spawnGrace > 0) this.spawnGrace -= dt;
    this.wob += dt * 6;

    let dx = target.x - this.x;
    let dy = target.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;

    // a little wobble so movement reads as "malicious traffic"
    const perpX = -dy;
    const perpY = dx;
    const wob = Math.sin(this.wob) * 0.35;

    const desiredVx = (dx + perpX * wob) * this.speed;
    const desiredVy = (dy + perpY * wob) * this.speed;
    this.vx += (desiredVx - this.vx) * Math.min(1, 6 * dt);
    this.vy += (desiredVy - this.vy) * Math.min(1, 6 * dt);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.x = KB.clamp(this.x, this.r, bounds.w - this.r);
    this.y = KB.clamp(this.y, this.r, bounds.h - this.r);
  }

  draw(ctx) {
    const { x, y, r } = this;
    const alpha = this.spawnGrace > 0 ? 1 - this.spawnGrace / 0.6 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.25 + alpha * 0.75;

    // glitchy malware packet — jagged diamond
    const spikes = 4;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (Math.PI / spikes) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.55;
      const wob = 1 + Math.sin(this.wob + i) * 0.08;
      const px = Math.cos(a) * rad * wob;
      const py = Math.sin(a) * rad * wob;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
    grad.addColorStop(0, "#ff8a8f");
    grad.addColorStop(1, "#ff3b46");
    ctx.fillStyle = grad;
    ctx.shadowColor = "#ff3b46";
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;

    // hostile "eye"
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = "#1a0306";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = "#ffe2e3";
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/* ============================================================ Threat Intel
   Blue orb collectible — grants points. */
class ThreatIntel {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 8;
    this.t = KB.rand(0, Math.PI * 2);
    this.dead = false;
    this.value = 50;
  }
  update(dt) {
    this.t += dt * 3;
  }
  draw(ctx) {
    const bob = Math.sin(this.t) * 2;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    const pulse = 0.6 + 0.4 * Math.sin(this.t * 1.5);
    ctx.beginPath();
    ctx.arc(0, 0, this.r + 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(56, 189, 248, ${0.12 * pulse})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, this.r);
    g.addColorStop(0, "#bfeaff");
    g.addColorStop(1, "#38bdf8");
    ctx.fillStyle = g;
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    // data glyph
    ctx.fillStyle = "#063b59";
    ctx.font = "bold 9px " + "monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("01", 0, 1);
    ctx.restore();
  }
}

/* ============================================================ Platform Sensor
   Green shield pickup — grants temporary invulnerability. */
class Sensor {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 11;
    this.t = KB.rand(0, Math.PI * 2);
    this.dead = false;
    this.duration = 6; // seconds of shield
  }
  update(dt) {
    this.t += dt * 2.5;
  }
  draw(ctx) {
    const bob = Math.sin(this.t) * 2.5;
    const spin = this.t * 0.8;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.rotate(spin);

    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2);
    ctx.beginPath();
    ctx.arc(0, 0, this.r + 6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(74, 222, 128, ${0.1 + pulse * 0.12})`;
    ctx.fill();

    // shield shape
    const r = this.r;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.8, -r * 0.5);
    ctx.lineTo(r * 0.8, r * 0.35);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.8, r * 0.35);
    ctx.lineTo(-r * 0.8, -r * 0.5);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, "#bbf7d0");
    g.addColorStop(1, "#22c55e");
    ctx.fillStyle = g;
    ctx.shadowColor = "#4ade80";
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "#063f1f";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.45);
    ctx.lineTo(0, r * 0.5);
    ctx.moveTo(-r * 0.4, 0);
    ctx.lineTo(r * 0.4, 0);
    ctx.stroke();
    ctx.restore();
  }
}

/* ===================================================================== PLC
   Vulnerable asset. Stand near for `patchTime` seconds to deploy the
   Dragos Platform and patch it for a massive score boost. */
class PLC {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 18;
    this.patchTime = 3; // seconds to secure
    this.progress = 0; // 0..1
    this.patched = false;
    this.dead = false;
    this.t = KB.rand(0, Math.PI * 2);
    this.value = 500;
    this.kind = ["PLC", "HMI", "RTU"][(Math.random() * 3) | 0];
    this.flash = 0;
  }
  update(dt, near) {
    this.t += dt;
    if (this.patched) return;
    if (near) {
      this.progress = Math.min(1, this.progress + dt / this.patchTime);
      if (this.progress >= 1) {
        this.patched = true;
        this.flash = 0.5;
      }
    } else {
      // slowly decay if the player walks away
      this.progress = Math.max(0, this.progress - dt * 0.4);
    }
    if (this.flash > 0) this.flash -= dt;
  }
  draw(ctx) {
    const { x, y, r } = this;
    ctx.save();
    ctx.translate(x, y);

    const alert = !this.patched;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * (alert ? 5 : 1.5));

    // warning / secured ring
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
    if (this.patched) {
      ctx.fillStyle = `rgba(46, 230, 255, ${0.08 + pulse * 0.08})`;
    } else {
      ctx.fillStyle = `rgba(250, 204, 21, ${0.07 + pulse * 0.14})`;
    }
    ctx.fill();

    // chassis
    ctx.beginPath();
    const w = r * 1.5;
    const h = r * 1.7;
    roundRect(ctx, -w / 2, -h / 2, w, h, 4);
    ctx.fillStyle = this.patched ? "#0c2230" : "#241d05";
    ctx.strokeStyle = this.patched ? "#2ee6ff" : "#facc15";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = this.patched ? "#2ee6ff" : "#facc15";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // status LEDs
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(-w / 2 + 6 + i * 6, -h / 2 + 6, 2, 0, Math.PI * 2);
      ctx.fillStyle = this.patched
        ? "#2ee6ff"
        : i === ((this.t * 3) | 0) % 3
        ? "#ff3b46"
        : "#5a4a0a";
      ctx.fill();
    }

    // label
    ctx.fillStyle = this.patched ? "#9fe9ff" : "#fde68a";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.kind, 0, 3);

    // patch progress arc
    if (!this.patched && this.progress > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, -Math.PI / 2, -Math.PI / 2 + this.progress * Math.PI * 2);
      ctx.strokeStyle = "#2ee6ff";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#2ee6ff";
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // secured checkmark flash
    if (this.patched) {
      ctx.strokeStyle = "#2ee6ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, -h / 2 - 6);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* rounded-rect helper (some older canvas impls lack roundRect) */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* expose to global scope for game.js (no module system) */
window.KB = KB;
window.Particle = Particle;
window.Player = Player;
window.Enemy = Enemy;
window.ThreatIntel = ThreatIntel;
window.Sensor = Sensor;
window.PLC = PLC;
