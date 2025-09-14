import { createHexPath } from '../systems/hexgrid.js';

export function buildOverlapMap(game){
  const map = {};
  for (const line of game.lines){
    for (let i=0;i<line.stations.length-1;i++){
      const a = line.stations[i], b = line.stations[i+1];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!map[key]) map[key] = [];
      map[key].push(line.id);
    }
  }
  for (const k in map) map[k].sort((x,y)=>x-y);
  return map;
}

export function drawMultiStationLine(ctx, cam, game, line, overlapMap){
  if (line.stations.length < 2) return;
  ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round'; ctx.translate(cam.x, cam.y); ctx.scale(cam.scale, cam.scale);
  let basePts;
  if (line.waypoints && line.waypoints.length>0){
    basePts = line.waypoints;
  } else {
    basePts = line.stations.map(idx => game.stations[idx]).filter(Boolean).map(s=>({x:s.x,y:s.y}));
  }
  // Only apply parallel offset math when the base points correspond 1:1 to station indices.
  const pts = (basePts.length === line.stations.length)
    ? basePts.map((p,i)=> getOffsetForPoint(i, basePts, line, overlapMap, game))
    : basePts;
  const radius = game.config.lineCornerRadius;

  // Enhanced flight path styling
  const isHovered = game.hoveredLineId === line.id;
  const hasExpress = game.finalExpressActive && line.stations.some(si => {
    const station = game.stations[si];
    return station && station.isFinal;
  });

  // Glow effect for hovered or express routes
  if (isHovered || hasExpress) {
    ctx.beginPath();
    ctx.strokeStyle = hasExpress ? '#f59e0b' : '#0ea5a3';
    ctx.lineWidth = (game.config.lineOutlineWidth + 6) / cam.scale;
    ctx.globalAlpha = isHovered ? 0.4 : 0.25;
    ctx.shadowColor = hasExpress ? '#f59e0b' : '#0ea5a3';
    ctx.shadowBlur = 8 / cam.scale;
    drawRoundedPolyline(ctx, pts, radius, !!line.isLoop);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Dashed outline for flight path aesthetic
  ctx.beginPath();
  ctx.strokeStyle = '#f7f8fa';
  ctx.lineWidth = game.config.lineOutlineWidth / cam.scale;
  ctx.globalAlpha = 0.9;
  ctx.setLineDash([4 / cam.scale, 2 / cam.scale]);
  drawRoundedPolyline(ctx, pts, radius, !!line.isLoop);
  ctx.stroke();
  ctx.setLineDash([]);

  // Main flight corridor
  ctx.beginPath();
  ctx.strokeStyle = line.color;
  ctx.lineWidth = game.config.lineInnerWidth / cam.scale;
  ctx.globalAlpha = 1.0;
  drawRoundedPolyline(ctx, pts, radius, !!line.isLoop);
  ctx.stroke();

  // Directional flow indicators (animated)
  if (pts.length >= 2) {
    drawFlightPathIndicators(ctx, cam, pts, line.color, game.gameTime || 0);
  }

  // Waypoint markers at station connections
  drawWaypointMarkers(ctx, cam, pts, line, game);

  // Aviation-style end caps
  if (!line.isLoop && pts.length >= 2){
    drawAviationEndCap(ctx, cam, pts[0], pts[1], line.color, game);
    drawAviationEndCap(ctx, cam, pts[pts.length-1], pts[pts.length-2], line.color, game);
  }
  ctx.restore();
}

export function drawRoundedPolyline(ctx, points, radius, isLoop){
  if (!points || points.length < 2) return;
  const n = points.length;
  if (!isLoop){
    ctx.moveTo(points[0].x, points[0].y);
    for (let i=1;i<n-1;i++){
      const prev = points[i-1], curr = points[i], next = points[i+1];
      const aLen = Math.hypot(prev.x - curr.x, prev.y - curr.y);
      const bLen = Math.hypot(next.x - curr.x, next.y - curr.y);
      // Calculate turn angle to make sharper turns more rounded
      const dot = ((prev.x - curr.x) * (next.x - curr.x) + (prev.y - curr.y) * (next.y - curr.y)) / (aLen * bLen);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      const sharpnessFactor = Math.max(1, 2 - angle / Math.PI); // More radius for sharper turns
      const effectiveRadius = radius * sharpnessFactor;
      const rA = Math.min(effectiveRadius, aLen*0.4); const rB = Math.min(effectiveRadius, bLen*0.4);
      const from = moveTowards(curr, prev, rA); const to = moveTowards(curr, next, rB);
      ctx.lineTo(from.x, from.y); ctx.quadraticCurveTo(curr.x, curr.y, to.x, to.y);
    }
    ctx.lineTo(points[n-1].x, points[n-1].y);
  } else {
    if (n===2){ ctx.moveTo(points[0].x, points[0].y); ctx.lineTo(points[1].x, points[1].y); }
    else {
      const pN = points[n-1], p0 = points[0], p1 = points[1];
      const rA0 = Math.min(radius, Math.hypot(pN.x - p0.x, pN.y - p0.y)*0.5);
      const rB0 = Math.min(radius, Math.hypot(p1.x - p0.x, p1.y - p0.y)*0.5);
      const start = moveTowards(p0, p1, rB0);
      ctx.moveTo(start.x, start.y);
      for (let i=0;i<n;i++){
        const prev = points[(i-1+n)%n], curr = points[i], next = points[(i+1)%n];
        const aLen = Math.hypot(prev.x - curr.x, prev.y - curr.y); const bLen = Math.hypot(next.x - curr.x, next.y - curr.y);
        // Calculate turn angle to make sharper turns more rounded
        const dot = ((prev.x - curr.x) * (next.x - curr.x) + (prev.y - curr.y) * (next.y - curr.y)) / (aLen * bLen);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        const sharpnessFactor = Math.max(1, 2 - angle / Math.PI); // More radius for sharper turns
        const effectiveRadius = radius * sharpnessFactor;
        const rA = Math.min(effectiveRadius, aLen*0.4); const rB = Math.min(effectiveRadius, bLen*0.4);
        const from = moveTowards(curr, prev, rA); const to = moveTowards(curr, next, rB);
        ctx.lineTo(from.x, from.y); ctx.quadraticCurveTo(curr.x, curr.y, to.x, to.y);
      }
      ctx.closePath();
    }
  }
}
function moveTowards(from, to, dist){ const dx = to.x-from.x, dy = to.y-from.y; const len = Math.hypot(dx,dy)||1; const t = dist/len; return { x: from.x + dx*t, y: from.y + dy*t }; }

function getOffsetForPoint(i, points, line, overlapMap, game){
  const n = points.length; const SPACING = game.config.parallelSpacing;
  function segmentIndex(aIdx,bIdx){ const key = aIdx < bIdx ? `${aIdx}-${bIdx}` : `${bIdx}-${aIdx}`; const group = overlapMap[key]; if (!group) return {offset:0,count:1}; const count=group.length; const pos = Math.max(0, group.indexOf(line.id)); const centered = pos - (count-1)/2; return {offset:centered,count}; }
  let offA={offset:0,count:1}, offB={offset:0,count:1}; if (i>0) offA = segmentIndex(line.stations[i-1], line.stations[i]); if (i<n-1) offB = segmentIndex(line.stations[i], line.stations[i+1]); const off = (offA.offset + offB.offset)/2;
  let dx=0, dy=0; if (i>0){ dx += points[i].x - points[i-1].x; dy += points[i].y - points[i-1].y; } if (i<n-1){ dx += points[i+1].x - points[i].x; dy += points[i+1].y - points[i].y; }
  const len = Math.hypot(dx,dy)||1; const nx = -dy/len, ny = dx/len; return { x: points[i].x + nx*SPACING*off, y: points[i].y + ny*SPACING*off };
}

// Enhanced aviation-themed flight path indicators
function drawFlightPathIndicators(ctx, cam, points, color, gameTime) {
  const time = gameTime * 0.002;
  ctx.save();
  ctx.globalAlpha = 0.6;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);

    if (len < 20) continue; // Skip very short segments

    const ux = dx / len;
    const uy = dy / len;

    // Draw animated direction chevrons
    const chevronCount = Math.floor(len / 40);
    for (let j = 0; j < chevronCount; j++) {
      const t = (j + 1) / (chevronCount + 1);
      const offset = (time + i * 0.5) % 1;
      const animatedT = (t + offset) % 1;

      const px = p1.x + dx * animatedT;
      const py = p1.y + dy * animatedT;

      // Draw chevron pointing in flight direction
      const size = 6 / cam.scale;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 / cam.scale;
      ctx.beginPath();
      ctx.moveTo(px - uy * size, py + ux * size);
      ctx.lineTo(px, py);
      ctx.lineTo(px + uy * size, py - ux * size);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawWaypointMarkers(ctx, cam, points, line, game) {
  ctx.save();
  ctx.globalAlpha = 0.8;

  for (let i = 0; i < points.length; i++) {
    if (i >= line.stations.length) continue;

    const station = game.stations[line.stations[i]];
    if (!station) continue;

    const point = points[i];
    const radius = 4 / cam.scale;

    // Draw waypoint marker
    ctx.beginPath();
    ctx.fillStyle = line.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 / cam.scale;
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Special marker for final destinations
    if (station.isFinal) {
      ctx.beginPath();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2 / cam.scale;
      ctx.arc(point.x, point.y, radius + 3 / cam.scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawAviationEndCap(ctx, cam, point, nextPoint, color, game){
  const dx = nextPoint.x - point.x;
  const dy = nextPoint.y - point.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const out = game.config.endCapOut;
  const half = game.config.endCapHalf;

  ctx.save();
  // Aviation runway-style end cap
  ctx.strokeStyle = '#f7f8fa';
  ctx.lineWidth = game.config.lineOutlineWidth / cam.scale;
  ctx.lineCap = 'round';

  // Main runway threshold
  ctx.beginPath();
  ctx.moveTo(point.x + px * half, point.y + py * half);
  ctx.lineTo(point.x - px * half, point.y - py * half);
  ctx.stroke();

  // Approach lighting
  for (let i = 1; i <= 3; i++) {
    const dist = i * 8;
    ctx.globalAlpha = 1 - i * 0.2;
    ctx.beginPath();
    ctx.moveTo(point.x - ux * dist + px * (half - i), point.y - uy * dist + py * (half - i));
    ctx.lineTo(point.x - ux * dist - px * (half - i), point.y - uy * dist - py * (half - i));
    ctx.stroke();
  }

  // Colored threshold
  ctx.strokeStyle = color;
  ctx.lineWidth = game.config.lineInnerWidth / cam.scale;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(point.x + px * (half - 2), point.y + py * (half - 2));
  ctx.lineTo(point.x - px * (half - 2), point.y - py * (half - 2));
  ctx.stroke();

  ctx.restore();
}

function drawEndCap(ctx, cam, point, nextPoint, color, game){
  drawAviationEndCap(ctx, cam, point, nextPoint, color, game);
}
