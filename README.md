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
A top-10 **Bestenliste** with name entry on game over, also viewable any time
from the **Bestenliste** button on the start screen.

- **Out of the box:** a per-device board stored in `localStorage`.
- **Global + non-deletable:** add a Firebase Realtime Database URL (below) and
  the board becomes shared across all players and **append-only** — entries can
  never be edited or deleted (enforced server-side by the security rules, not
  by the client). If the network is unavailable the game falls back to the
  local board automatically.

#### Enabling the global Bestenliste (Firebase, free)
1. Create a project at <https://console.firebase.google.com> → **Build →
   Realtime Database → Create database** (pick a region, start in *locked
   mode*).
2. Open the **Rules** tab, paste the contents of [`firebase.rules.json`](firebase.rules.json),
   and **Publish**. These rules allow anyone to *read* and *create* a score but
   **forbid updates and deletes** (`".write": "!data.exists() && newData.exists()"`),
   making the board global and tamper-resistant.
3. Copy the database URL shown at the top of the Realtime Database page
   (e.g. `https://your-project-default-rtdb.europe-west1.firebasedatabase.app`).
4. Paste it into [`js/leaderboard-config.js`](js/leaderboard-config.js) as
   `firebaseUrl` and push. Done — the URL is **not** a secret; protection comes
   from the rules.

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
