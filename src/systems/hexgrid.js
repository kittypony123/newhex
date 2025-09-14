// Hexagonal lattice routing (true 60°). Provides hex conversions and A* pathfinding.

// Defaults; size is usually supplied via config, but we keep a sane fallback.
const DEFAULT_HEX_SIZE = 44;

// Direction angles (for reference)
export const HEX_ANGLES = [0, 60, 120, 180, 240, 300].map(d => d * Math.PI / 180);

// Cube <-> pixel conversions for pointy-top hex grid
export function cubeToPixel(q, r, s, size = DEFAULT_HEX_SIZE) {
  const x = size * (1.5 * q);
  const y = size * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r);
  return { x, y };
}

export function pixelToCube(x, y, size = DEFAULT_HEX_SIZE) {
  const q = (2 / 3) * (x / size);
  const r = (-1 / 3) * (x / size) + (Math.sqrt(3) / 3) * (y / size);
  const s = -q - r;
  return roundCube(q, r, s);
}

export function roundCube(q, r, s) {
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);

  const qd = Math.abs(rq - q);
  const rd = Math.abs(rr - r);
  const sd = Math.abs(rs - s);

  if (qd > rd && qd > sd) rq = -rr - rs;
  else if (rd > sd) rr = -rq - rs;
  else rs = -rq - rr;

  return { q: rq, r: rr, s: rs };
}

// Snap a world coordinate to nearest hex vertex
export function snapToHexVertex(worldX, worldY, size = DEFAULT_HEX_SIZE) {
  const cube = pixelToCube(worldX, worldY, size);
  return cubeToPixel(cube.q, cube.r, cube.s, size);
}

// Neighbor coordinates in cube space
export function getHexNeighbors(cube) {
  const dirs = [
    { q: 1, r: -1, s: 0 },
    { q: 1, r: 0, s: -1 },
    { q: 0, r: 1, s: -1 },
    { q: -1, r: 1, s: 0 },
    { q: -1, r: 0, s: 1 },
    { q: 0, r: -1, s: 1 }
  ];
  return dirs.map(d => ({ q: cube.q + d.q, r: cube.r + d.r, s: cube.s + d.s }));
}

function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
}

// Minimal A* search on infinite hex lattice. Stateless and game-agnostic for compatibility.
export function hexAStar(startWorld, endWorld, size = DEFAULT_HEX_SIZE) {
  const start = pixelToCube(startWorld.x, startWorld.y, size);
  const goal = pixelToCube(endWorld.x, endWorld.y, size);

  const key = (c) => `${c.q},${c.r},${c.s}`;
  const open = [start];
  const came = new Map();
  const g = new Map();
  const f = new Map();
  g.set(key(start), 0);
  f.set(key(start), hexDistance(start, goal));
  const inOpen = new Set([key(start)]);

  while (open.length) {
    // Node with lowest f-score
    let idx = 0;
    for (let i = 1; i < open.length; i++) {
      if ((f.get(key(open[i])) ?? Infinity) < (f.get(key(open[idx])) ?? Infinity)) idx = i;
    }
    const current = open.splice(idx, 1)[0];
    inOpen.delete(key(current));

    if (hexDistance(current, goal) < 1) {
      // Reconstruct path in cube space
      const pathCubes = [];
      let cur = current;
      let curKey = key(cur);
      pathCubes.unshift(cur);
      while (came.has(curKey)) {
        cur = came.get(curKey);
        curKey = key(cur);
        pathCubes.unshift(cur);
      }
      return pathCubes.map(c => cubeToPixel(c.q, c.r, c.s, size));
    }

    for (const nb of getHexNeighbors(current)) {
      const nk = key(nb);
      const tentativeG = (g.get(key(current)) ?? Infinity) + 1; // uniform cost per edge
      if (tentativeG < (g.get(nk) ?? Infinity)) {
        came.set(nk, current);
        g.set(nk, tentativeG);
        f.set(nk, tentativeG + hexDistance(nb, goal));
        if (!inOpen.has(nk)) { open.push(nb); inOpen.add(nk); }
      }
    }
  }

  // Fallback (shouldn't be hit in an unbounded lattice)
  return [startWorld, endWorld];
}

// Backward-compatible adapter used around the codebase.
// Returns an array of world points following 60° hex directions.
export function createHexPath(ax, ay, bx, by, size = DEFAULT_HEX_SIZE) {
  const start = snapToHexVertex(ax, ay, size);
  const end = snapToHexVertex(bx, by, size);
  const path = hexAStar(start, end, size);
  if (!path || path.length === 0) return [start, end];
  // De-duplicate consecutive equal points
  const out = [];
  for (const p of path) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  return out;
}

// ---------------- Corridor Bundling (Phase 2) ----------------

const DEFAULT_BUNDLE_THRESHOLD = 30; // px
const DEFAULT_CORRIDOR_SPACING = 15; // px

function vec(ax, ay, bx, by){ return { x: bx-ax, y: by-ay }; }
function vlen(v){ return Math.hypot(v.x, v.y) || 1; }
function vnorm(v){ const l=vlen(v); return { x:v.x/l, y:v.y/l }; }
function dot(a,b){ return a.x*b.x + a.y*b.y; }

function segmentMid(A,B){ return { x:(A.x+B.x)/2, y:(A.y+B.y)/2 }; }

function perpendicular(u){ return { x:-u.y, y:u.x }; }

// Identify segments from existing lines that run parallel and nearby to a given segment
function findParallelSegments(segment, existingLines, bundleThreshold, angleCosThr){
  const { start, end } = segment;
  const u = vnorm(vec(start.x, start.y, end.x, end.y));
  const n = perpendicular(u);
  const mid = segmentMid(start, end);
  const results = [];

  for (const line of existingLines){
    const pts = (line.waypoints && line.waypoints.length>=2) ? line.waypoints : null;
    if (!pts) continue;
    for (let i=0;i<pts.length-1;i++){
      const A = pts[i], B = pts[i+1];
      const v = vnorm(vec(A.x,A.y,B.x,B.y));
      const cosang = Math.abs(dot(u, v));
      if (cosang < angleCosThr) continue; // not parallel enough
      const mid2 = segmentMid(A,B);
      // Perpendicular distance from our mid to other segment line
      const d = Math.abs(dot({x: mid2.x - mid.x, y: mid2.y - mid.y}, n));
      if (d <= bundleThreshold){
        const side = Math.sign(dot({x: mid2.x - mid.x, y: mid2.y - mid.y}, n)) || 1;
        results.push({ lineId: line.id, index: i, side });
      }
    }
  }
  return results;
}

export function applyCorridorBundling(path, game, currentLine){
  if (!path || path.length < 2) return path;
  const cfg = (game && game.config && game.config.hexGrid) || {};
  const bundleThreshold = cfg.bundleThreshold ?? DEFAULT_BUNDLE_THRESHOLD;
  const spacing = cfg.corridorSpacing ?? DEFAULT_CORRIDOR_SPACING;
  const angleCosThr = Math.cos(30 * Math.PI/180); // within 30° considered parallel

  const existing = (game && game.lines ? game.lines : []).filter(l => l && l.id !== (currentLine && currentLine.id));
  const out = [];
  for (let i=0;i<path.length-1;i++){
    const seg = { start: path[i], end: path[i+1] };
    const parallels = findParallelSegments(seg, existing, bundleThreshold, angleCosThr);
    if (parallels.length > 0){
      // Compute consistent side for offset based on average side of neighbors
      const avgSide = parallels.reduce((s,p)=>s+p.side,0) / parallels.length;
      const side = (avgSide >= 0 ? 1 : -1);
      const u = vnorm(vec(seg.start.x, seg.start.y, seg.end.x, seg.end.y));
      const n = perpendicular(u);
      const off = spacing * side;
      const sPt = { x: seg.start.x + n.x * off, y: seg.start.y + n.y * off };
      const ePt = { x: seg.end.x + n.x * off, y: seg.end.y + n.y * off };
      out.push(sPt);
      if (i === path.length-2) out.push(ePt);
    } else {
      out.push(seg.start);
      if (i === path.length-2) out.push(seg.end);
    }
  }
  return out;
}

// ---------------- Terminal Bubble Approaches (Phase 3) ----------------

function snapAngleTo30(rad){
  const step = Math.PI / 6; // 30°
  return Math.round(rad / step) * step;
}

function pointOnCircle(cx, cy, r, ang){
  return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
}

// Add short departure/arrival waypoints at hubs (isInterchange or isFinal)
export function applyTerminalBubbles(path, startStation, endStation, game){
  if (!path || path.length < 2) return path;
  const cfg = (game && game.config && game.config.hexGrid) || {};
  const R = cfg.terminalBubbleRadius ?? 88;

  const out = [...path];

  // Departure bubble at start if station qualifies
  if (startStation && (startStation.isInterchange || startStation.isFinal)){
    const s = { x: startStation.x, y: startStation.y };
    const next = out[1];
    const ang = Math.atan2(next.y - s.y, next.x - s.x);
    const san = snapAngleTo30(ang);
    const p = pointOnCircle(s.x, s.y, R, san);
    // Insert after first point (station position may not be in path list)
    out.splice(1, 0, p);
  }

  // Arrival bubble at end if station qualifies
  if (endStation && (endStation.isInterchange || endStation.isFinal)){
    const e = { x: endStation.x, y: endStation.y };
    const prev = out[out.length-2];
    const ang = Math.atan2(e.y - prev.y, e.x - prev.x);
    const san = snapAngleTo30(ang);
    const p = pointOnCircle(e.x, e.y, R, san);
    // Insert before last point
    out.splice(out.length-1, 0, p);
  }

  return out;
}
