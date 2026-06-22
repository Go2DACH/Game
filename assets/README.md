# Assets

This directory is reserved for image and audio assets.

The MVP renders **everything procedurally** on the HTML5 Canvas (shapes,
gradients, glows) and generates sound effects with the WebAudio API, so the
game is fully playable with **zero binary assets** — ideal for an instant,
lightweight GitHub Pages deployment.

Drop sprites (`.png`/`.webp`) or sound files (`.mp3`/`.ogg`) here when you
want to upgrade the visuals, and wire them up in `js/entities.js`.
