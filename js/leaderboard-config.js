/* =========================================================================
   Operation: Kohlebunker Defense — Leaderboard configuration
   -------------------------------------------------------------------------
   GLOBAL, NON-DELETABLE leaderboard via a Firebase Realtime Database.

   👉 To enable the global Bestenliste, paste your Realtime Database URL below
      (and nothing else). Until then the game falls back to a LOCAL per-device
      board automatically — everything keeps working.

   The URL looks like one of these (copy it from the Firebase console, on the
   Realtime Database page, WITHOUT a trailing slash):
     https://YOUR-PROJECT-default-rtdb.europe-west1.firebasedatabase.app
     https://YOUR-PROJECT-default-rtdb.firebaseio.com

   This value is NOT a secret — it is meant to live in public client code.
   Write-protection (no edits / no deletes) is enforced by the database
   security rules, NOT by hiding this URL. See firebase.rules.json + README.
   ========================================================================= */
window.KB_LEADERBOARD = {
  // Leave "" to use the local-only board. Paste your DB URL to go global.
  firebaseUrl: "https://game-7ca92-default-rtdb.europe-west1.firebasedatabase.app",

  // Node under which scores are stored, and how many to show.
  path: "scores",
  top: 10,

  // Network timeout for reads/writes (ms) before falling back to local.
  timeoutMs: 6000,
};
