# Operation: Kohlebunker Defense

A fast-paced, top-down 2D arcade game built for the **Dragos EMEA Forum 2026**
(Motorworld & Kohlebunker, Munich).

You play a **Dragos Defender** — an OT cybersecurity analyst — navigating a
stylized industrial facility. Secure vulnerable ICS assets (PLCs / HMIs / RTUs),
harvest Threat Intel, grab Platform Sensors for protection, and evade the APTs
(Xenotime, Electrum, …) hunting your network.

## Play

Open `index.html` in any modern browser, or visit the GitHub Pages deployment.

### Controls
- **Desktop:** `WASD` or arrow keys to move.
- **Mobile:** drag anywhere on the playfield to use the virtual joystick.

### Mechanics
| Element | Effect |
| --- | --- |
| 🔵 **Threat Intel** (blue orb) | +50 points |
| 🛡️ **Platform Sensor** (green shield) | 6s of invulnerability; destroys APTs on contact |
| 🟡 **Vulnerable PLC/HMI/RTU** | stand near it for 3s to *Deploy Dragos Platform* → +500 points |
| 🔴 **APT** (red malware packet) | costs 1 life on contact (you start with 3) |

APTs get faster and more numerous over time. When lives hit 0 the **Network
Compromised** screen shows your score; the high score is saved locally via
`localStorage`.

### Leaderboard (Bestenliste)
A local top-10 **Bestenliste** is stored on the device in `localStorage`. When
a run earns a spot, the game-over screen prompts for a name; the board is also
viewable any time from the **Bestenliste** button on the start screen (with a
"Liste löschen" option to reset it). Scores are per-device — no backend.

## Tech

- **Pure Vanilla** HTML5 Canvas + CSS3 + ES6 — no engines, no build step.
- Mobile-first responsive layout with on-screen joystick + keyboard support.
- Delta-time game loop via `requestAnimationFrame` for smooth motion at any
  refresh rate.
- All visuals drawn procedurally; SFX synthesized with WebAudio — **no binary
  assets required**.

## Structure
```
index.html         Entry point, HUD, overlays, responsive meta
css/style.css      Dark industrial Dragos theme
js/entities.js     Player, APTs, collectibles, PLCs, FX
js/game.js         Loop, state machine, input, spawning, collisions
assets/            Reserved for optional sprites/audio
```

## Testing

A headless end-to-end suite (`test/deep-test.mjs`) drives the real game in
Chromium via Playwright — load, start screen, keyboard movement, intel
collection, PLC patching, lives/HUD, game-over + high-score persistence,
restart, and mobile touch/joystick.

```bash
npx playwright install chromium      # one-time
node test/deep-test.mjs              # runs all 21 checks
# In a sandboxed env, point at a prebuilt binary:
# KB_CHROMIUM=/path/to/chrome node test/deep-test.mjs
```

The game also exposes a read-only `window.KBGame` inspection handle
(state/score/lives/entity positions) used by the suite — it never mutates
gameplay.

## Deploy to GitHub Pages
Push to the repository and enable **Settings → Pages → Deploy from branch**
(root). No build configuration needed — it is fully static.
