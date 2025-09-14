// Routing helpers for multi-leg (connecting) travel

// Build adjacency list for all stations based on all player routes (lines)
export function buildStationGraph(game){
  const n = game.stations.length;
  const adj = Array.from({length:n}, ()=> new Set());
  for (const line of game.lines){
    if (!line || !line.stations || line.stations.length < 2) continue;
    for (let i=0;i<line.stations.length-1;i++){
      const a = line.stations[i];
      const b = line.stations[i+1];
      if (a==null || b==null) continue;
      adj[a].add(b); adj[b].add(a);
    }
  }
  return adj.map(s => Array.from(s));
}

// Edge time estimate between two connected stations (ms)
function edgeTimeMs(game, aIdx, bIdx){
  const A = game.stations[aIdx], B = game.stations[bIdx];
  if (!A || !B) return Infinity;
  const dist = Math.hypot(B.x - A.x, B.y - A.y);
  const speed = game.config.trainSpeed || 0.06; // world units per ms (approx)
  const t = dist / Math.max(1e-6, speed);
  return t;
}

function nodeTransferMs(game, nodeIdx, destIdx){
  // Add MCT at intermediate nodes only (not at destination itself)
  if (nodeIdx === destIdx) return 0;
  const s = game.stations[nodeIdx];
  if (!s) return 0;
  const base = s.mctMs ?? (game.config.defaultMCT || 12000);
  const factor = s.isInterchange ? 0.7 : 1.0;
  const mult = game.config.mctMultiplier || 1.0;
  return base * factor * mult;
}

// Dijkstra from destination backwards to get ETA to dest for all nodes
export function computeETAs(game, destIdx){
  const N = game.stations.length;
  const adj = buildStationGraph(game);
  const eta = new Array(N).fill(Infinity);
  const visited = new Array(N).fill(false);
  eta[destIdx] = 0;

  for (;;) {
    let u = -1, best = Infinity;
    for (let i=0;i<N;i++) if (!visited[i] && eta[i] < best){ best = eta[i]; u = i; }
    if (u === -1) break;
    visited[u] = true;
    for (const v of adj[u]){
      // Cost from v to dest could go via u: edge v->u time + transfer at u + eta[u]
      const alt = edgeTimeMs(game, v, u) + nodeTransferMs(game, u, destIdx) + eta[u];
      if (alt < eta[v]) eta[v] = alt;
    }
  }

  return eta;
}

export function estimateETA(game, fromIdx, destIdx){
  if (fromIdx==null || destIdx==null) return Infinity;
  const etas = computeETAs(game, destIdx);
  return etas[fromIdx];
}

// Returns true if stepping from fromIdx to viaIdx is ETA-improving
export function stepReducesETA(game, fromIdx, viaIdx, destIdx){
  const etaFrom = estimateETA(game, fromIdx, destIdx);
  const etaVia = estimateETA(game, viaIdx, destIdx);
  const step = edgeTimeMs(game, fromIdx, viaIdx);
  return isFinite(etaFrom) && isFinite(etaVia) && (step + etaVia + 1 < etaFrom);
}

export function neighborsOnLineFrom(line, stationIdx){
  const out = [];
  for (let i=0;i<line.stations.length;i++){
    if (line.stations[i] === stationIdx){
      if (i>0) out.push(line.stations[i-1]);
      if (i<line.stations.length-1) out.push(line.stations[i+1]);
      break;
    }
  }
  return out;
}
