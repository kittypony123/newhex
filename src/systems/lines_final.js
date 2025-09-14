import { segmentCrossesPolygon } from '../utils/intersections.js';
import { createHexPath, applyCorridorBundling, applyTerminalBubbles, clearHexCache } from './hexgrid.js';

export function pickAvailableColorIndex(game){
  const used = new Set(game.lines.map(l => l.colorIndex).filter(i => i !== undefined));
  const total = game.config.lineColors.length;

  // Try to find an unused color, starting from a rotating offset to avoid always defaulting to red
  const startOffset = game.lines.length % total;
  for (let i = 0; i < total; i++) {
    const colorIndex = (startOffset + i) % total;
    if (!used.has(colorIndex)) return colorIndex;
  }

  // If all colors are used, cycle through them based on line count
  return game.lines.length % total;
}

export function createLine(game, stations, colorIndex=null){
  if (!stations || stations.length<2) return null;

  // Save state for undo
  if (game.saveGameState) game.saveGameState();

  // FIXED: Handle undefined/null properly and ensure we always have a valid color
  let finalColorIndex;
  if (colorIndex !== null && colorIndex !== undefined && colorIndex >= 0) {
    finalColorIndex = colorIndex;
  } else {
    finalColorIndex = pickAvailableColorIndex(game);
  }

  const line = {
    id: game.lines.length,
    stations: [...stations],
    colorIndex: finalColorIndex,
    get color(){ return game.config.lineColors[this.colorIndex]; },
    isLoop: false, trains: [], waypoints: null, totalLength: 0
  };
  line.totalLength = calculateLineLength(game, line);
  game.lines.push(line);
  // add connections
  for (const idx of line.stations){
    if (!game.stations[idx].connections.includes(line.id)) game.stations[idx].connections.push(line.id);
  }

  // Trigger train reallocation when line is created
  if (game.optimizeTrainAllocation) {
    game.optimizeTrainAllocation();
  }

  // Achievement tracking
  if (game.achievements) {
    game.achievements.onRouteCreated();
  }

  return line;
}

export function calculateLineLength(game, line){
  let total = 0;
  for (let i=0;i<line.stations.length-1;i++){
    const A=game.stations[line.stations[i]], B=game.stations[line.stations[i+1]];
    total += Math.hypot(B.x-A.x, B.y-A.y);
  }
  return total;
}

export function addStationToLine(game, lineId, stationIdx, position=null){
  const line = game.lines[lineId]; if (!line) return false; const newIdx = position==null? line.stations.length : Math.max(0, Math.min(position, line.stations.length));

  // Save state for undo
  if (game.saveGameState) game.saveGameState();
  // tunnels needed check
  let crossingsNeeded = 0; const S = game.stations[stationIdx]; const poly = game.config.thamesPolygon;
  const prevIdx = newIdx-1, nextIdx = newIdx;
  if (prevIdx >= 0 && line.stations[prevIdx]!=null){ const A = game.stations[line.stations[prevIdx]]; if (segmentCrossesPolygon(A,S,poly)) crossingsNeeded++; }
  if (nextIdx < line.stations.length && line.stations[nextIdx]!=null){ const B = game.stations[line.stations[nextIdx]]; if (segmentCrossesPolygon(S,B,poly)) crossingsNeeded++; }
  if (crossingsNeeded>0 && (game.tunnels||0) < crossingsNeeded) return false;
  if (position==null || position>=line.stations.length) line.stations.push(stationIdx); else line.stations.splice(position,0,stationIdx);
  if (crossingsNeeded>0) game.tunnels = Math.max(0, (game.tunnels||0)-crossingsNeeded);
  if (!game.stations[stationIdx].connections.includes(lineId)) game.stations[stationIdx].connections.push(lineId);
  rebuildWaypointsForLine(game, line);
  line.totalLength = calculateLineLength(game, line);

  // Trigger train reallocation when line is extended
  if (game.optimizeTrainAllocation) {
    game.optimizeTrainAllocation();
  }

  return true;
}

export function findLineNearPoint(game, worldX, worldY, tolerancePx){
  const tol = tolerancePx / game.camera.scale;
  let closestResult = null;
  let closestDistance = Infinity;

  for (let line of game.lines) {
    if (line.stations.length < 2) continue;

    // Check against waypoints if available (more accurate for curved lines)
    if (line.waypoints && line.waypoints.length >= 2) {
      for (let i = 0; i < line.waypoints.length - 1; i++) {
        const A = line.waypoints[i];
        const B = line.waypoints[i + 1];
        const d = distanceToLineSegment(worldX, worldY, A.x, A.y, B.x, B.y);
        if (d < tol && d < closestDistance) {
          closestDistance = d;
          const segmentIndex = findStationSegmentForWaypoint(line, i);
          closestResult = { line, segmentIndex, waypointIndex: i, distance: d };
        }
      }
    } else {
      // Fallback to station-to-station segments
      for (let i = 0; i < line.stations.length - 1; i++) {
        const A = game.stations[line.stations[i]];
        const B = game.stations[line.stations[i + 1]];
        if (!A || !B) continue;
        const d = distanceToLineSegment(worldX, worldY, A.x, A.y, B.x, B.y);
        if (d < tol && d < closestDistance) {
          closestDistance = d;
          closestResult = { line, segmentIndex: i, distance: d };
        }
      }
    }
  }

  return closestResult;
}

function findStationSegmentForWaypoint(line, waypointIndex) {
  // This is a simplified approach - in practice you'd want more sophisticated mapping
  // For now, distribute waypoints evenly across station segments
  const stationSegments = line.stations.length - 1;
  const waypointSegments = line.waypoints.length - 1;
  const ratio = waypointIndex / waypointSegments;
  return Math.floor(ratio * stationSegments);
}

function distanceToLineSegment(px, py, x1, y1, x2, y2){
  const A=px-x1, B=py-y1, C=x2-x1, D=y2-y1; const lenSq=C*C+D*D; if (lenSq===0) return Math.hypot(A,B); let t = Math.max(0, Math.min(1, (A*C+B*D)/lenSq)); const projX=x1+t*C, projY=y1+t*D; return Math.hypot(px-projX, py-projY);
}

export function rebuildWaypointsForLine(game, line){
  clearHexCache();
  if (!line || !line.stations || line.stations.length < 2){ line.waypoints = null; return; }
  const pts = [];
  for (let i=0; i<line.stations.length-1; i++){
    const A = game.stations[line.stations[i]];
    const B = game.stations[line.stations[i+1]];
    if (!A || !B) continue;
    let seg = createHexPath(A.x, A.y, B.x, B.y, game.config.hexGrid.size);
    // Add terminal approach patterns only at ends and only for hubs/finals
    const isFirst = (i === 0);
    const isLast = (i === line.stations.length-2);
    const startSta = isFirst ? A : null;
    const endSta = isLast ? B : null;
    if (startSta || endSta){
      seg = applyTerminalBubbles(seg, startSta, endSta, game);
    }
    if (i>0 && seg.length>0) seg.shift(); // avoid duplicate join point
    pts.push(...seg);
  }
  // Apply corridor bundling offset against existing routes for clarity
  line.waypoints = applyCorridorBundling(pts, game, line);
}
