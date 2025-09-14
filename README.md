Flight Control — Global Routes (Standalone)

Overview
- Air-traffic flavored network builder with final-destination focus.
- Draw routes between airports; passengers take multi-leg paths to reach marked finals.
- Visuals: radar styling, weather cells that slow planes, proximity alerts.

What’s new (play area + clarity)
- Larger map area via `worldScale: 1.5` for more breathing room.
- Slimmer stations (`stationRadius: 15`, ~25% smaller) to reduce clutter.
- Wider multi-route separation (`parallelSpacing: 20`) to distinguish overlaps.
- Passenger spawn pacing now uses `spawnIntervalMultiplier: 0.85` for a steady but manageable flow.

How to run
- Quick: open `flight-control/index.html` in a browser.
- If blank, serve locally: `python -m http.server 8000` then visit `http://localhost:8000/flight-control/`.

Quick start tutorial (docs)
- Connect two nearby airports to create your first route; a plane will spawn.
- Deliver passengers to their destination shape; finals (marked hubs) pay extra.
- Crossing the red restricted corridor consumes a Permit (tunnel).
- Each week, pick a reward: extra route, speed, capacity, permit, etc.
- Watch weather cells; they slow planes more near the center.

Controls & hotkeys
- Build: click and drag from one airport to another.
- Modify: insert a station by dragging onto an existing route segment.
- Removal: hold Alt and click a route.
- Colors: number keys 1–7 select a route color; Tab cycles.
- HUD: Pause ⏸, Play ▶, 2x ⏩; Auto‑Routing toggle 🤖 (A); Undo ↶ (Ctrl+Z); Weather (W).

Difficulty & customization
- Two ways to customize without changing core mechanics:
  - Edit config: `src/maps/airspace.js` (see parameters below).
  - Live tune in DevTools: use `window.MM.*` helpers (no reload needed).

Key parameters (config)
- `worldScale` (1.5): expands map coordinate space (visual clarity).
- `stationRadius` (15): station size; smaller reduces overlap.
- `parallelSpacing` (20): visual spacing between overlapping routes.
- `spawnInterval` (3600): base ms between passenger spawns.
- `spawnIntervalMultiplier` (0.85): multiplies spawn interval (lower = more frequent spawns).
- `maxWaitSeconds` (200): acceptable connection wait before risk of fail.
- `missedConnectionMultiplier` (3.0): extra grace beyond `maxWaitSeconds`.
- `defaultMCT` (10000) + `mctMultiplier` (0.5): transfer times and global scale.
- `trainSpeed` (0.085): base plane speed (auto‑scaled with `worldScale`).
- `stationSpawnInitialDelayMs`/`stationSpawnIntervalMs`/`stationSpawnJitterMs`: cadence for adding new airports.
- `hubAndSpokeMode`, `hubSpokeBias`, `hubSpokeBoardingWaitMs`: encourage hub‑centric networks.

Live tuning (DevTools)
- Open DevTools Console and use:
  - `MM.setSpawnMultiplier(0.85)` — passenger spawn interval scale.
  - `MM.setStationSpawnInterval(53333)` — steady airport spawn ms.
  - `MM.setHubAndSpoke(true|false)` — enable/disable hub focus.
  - `MM.setMCTMultiplier(0.5)` — transfer time global scale.
  - `MM.setMaxWaitSeconds(200)` — connection wait tolerance (seconds).
  - `MM.setMissedConnectionMultiplier(3.0)` — missed‑connection grace factor.
  - `MM.setDebugLogs(true|false)` — toggle extra console logs.

Testing (headless sim)
- In DevTools Console: `await MM.simulateWeeks(20, { log: true })`
  - Returns `{ day, score, waiting, overcrowded, trains, lines, finals, avgFinalMs, gameOver }`.
  - Auto‑routing is enabled during sim to keep networks viable.

Notes
- Modules live under `flight-control/src` and are self‑contained.
- This update documents tuning surfaces; it does not introduce significant changes to core mechanics.
