import { screenToWorld } from '../core/camera.js';
import { stationAtPoint } from '../systems/stations.js';
import { createHexPath, applyCorridorBundling, applyTerminalBubbles } from '../systems/hexgrid.js';
import { createLine, addStationToLine, findLineNearPoint, rebuildWaypointsForLine } from '../systems/lines_final.js';
import { segmentCrossesPolygon } from '../utils/intersections.js';

export function attachInput(canvas, game, onPreview){
  let isDown=false; let dragStartStation=null; let selectedLine=null; let insertPosition=null; let isShiftHeld=false;
  let lineInsertAnchor=null; // world point on the selected segment used as preview start
  let isPanning=false; let panStartX=0; let panStartY=0; let panStartCamX=0; let panStartCamY=0;
  const DEBUG = false;
  function rect(){ return canvas.getBoundingClientRect(); }
  function worldOf(ev){ const r=rect(); return screenToWorld(game.camera, ev.clientX - r.left, ev.clientY - r.top); }

  // Cursor state management
  function updateCursor(newState) {
    canvas.className = `canvas-${newState}`;
    game.needsRedraw = true;
  }

  document.addEventListener('keydown', (e)=>{
    if (e.key==='Shift') isShiftHeld=true;
    if (e.key==='Escape'){ onPreview(null); }
    if (e.key==='Alt') game.removalMode=true;

    // SIMPLIFIED: Number keys 1-7 just select color directly
    if (e.key >= '1' && e.key <= '7') {
      const colorIndex = parseInt(e.key) - 1;
      if (colorIndex < game.config.lineColors.length) {
        game.selectedLineColorIndex = colorIndex;
        game.updateHUD();
      }
    }

    // SIMPLIFIED: Tab cycles through colors easily
    if (e.key === 'Tab') {
      e.preventDefault();
      const current = game.selectedLineColorIndex || 0;
      game.selectedLineColorIndex = (current + 1) % game.config.lineColors.length;
      game.updateHUD();
    }
  });

  document.addEventListener('keyup', (e)=>{
    if (e.key==='Shift') isShiftHeld=false;
    if (e.key==='Alt') game.removalMode=false;
    if (e.key==='c' || e.key==='C') game.colorKeyHeld = false;
  });


  canvas.addEventListener('pointerdown', (ev)=>{
    isDown=true; canvas.setPointerCapture(ev.pointerId);
    const r = rect();
    const screenX = ev.clientX - r.left;
    const screenY = ev.clientY - r.top;
    const world = worldOf(ev);
    const hit = stationAtPoint(game.stations, world.x, world.y, 20);
    if (hit!==-1){ if (DEBUG) console.log('pointerdown: start station', hit); dragStartStation=hit; return; }
    // line hit for removal or extension
    const lineHit=findLineNearPoint(game, world.x, world.y, game.config.linePickTolerancePx);
    if (lineHit){
      if (game.removalMode){ if (DEBUG) console.log('remove line', lineHit.line.id); game.removeLine(lineHit.line.id); return; }
      selectedLine=lineHit.line; insertPosition=lineHit.segmentIndex+1;
      // Compute anchor as projection of pointer onto the segment for a smooth one-gesture insert
      const a = game.stations[selectedLine.stations[lineHit.segmentIndex]];
      const b = game.stations[selectedLine.stations[lineHit.segmentIndex+1]];
      lineInsertAnchor = projectPointToSegment(world.x, world.y, a.x, a.y, b.x, b.y);
      if (DEBUG) console.log('insert mode on segment', insertPosition, 'anchor', lineInsertAnchor);
      return;
    }
    // Start panning if no station or line hit
    isPanning = true;
    panStartX = screenX;
    panStartY = screenY;
    panStartCamX = game.camera.targetX;
    panStartCamY = game.camera.targetY;
  });
  canvas.addEventListener('pointermove', (ev)=>{
    const r = rect();
    const screenX = ev.clientX - r.left;
    const screenY = ev.clientY - r.top;
    const world=worldOf(ev);
    const prevHoveredIdx = game.hoveredStationIdx;
    const prevHoveredLine = game.hoveredLineId;

    // Handle panning
    if (isPanning && isDown) {
      const deltaX = screenX - panStartX;
      const deltaY = screenY - panStartY;
      game.camera.targetX = panStartCamX + deltaX;
      game.camera.targetY = panStartCamY + deltaY;

      // Track manual camera movement
      if (typeof window.trackManualZoom === 'function') {
        window.trackManualZoom();
      }

      game.needsRedraw = true;
      return;
    }

    game.hoveredStationIdx = stationAtPoint(game.stations, world.x, world.y, 20);

    // Update hovered line for visual feedback
    const lineHit = findLineNearPoint(game, world.x, world.y, game.config.linePickTolerancePx);
    game.hoveredLineId = lineHit ? lineHit.line.id : null;

    // Update cursor based on context
    if (!isDown) {
      if (game.removalMode) {
        updateCursor(lineHit ? 'removing' : 'drawing');
      } else if (game.recolorMode || game.colorKeyHeld) {
        updateCursor(lineHit ? 'recoloring' : 'drawing');
      } else if (game.hoveredStationIdx !== -1) {
        updateCursor('hovering-station');
      } else {
        updateCursor(lineHit ? 'hovering-line' : 'drawing');
      }
    }

    // Trigger redraw if hover state changed
    if (game.hoveredStationIdx !== prevHoveredIdx || game.hoveredLineId !== prevHoveredLine) {
      game.needsRedraw = true;
    }

    if (dragStartStation!=null){
      const start=game.stations[dragStartStation];
      const endIdx = game.hoveredStationIdx;
      const end = (endIdx!==-1? game.stations[endIdx] : world);
      let points = createHexPath(start.x, start.y, end.x, end.y, game.config.hexGrid.size);
      if (endIdx!==-1){
        points = applyTerminalBubbles(points, start, end, game);
      }
      // Apply bundling preview against existing lines
      points = applyCorridorBundling(points, game, null);
      onPreview({ points, valid: true, snapStation: endIdx, isHexSnapped: true });
      if (DEBUG) console.log('preview from', dragStartStation, 'to', endIdx);
    } else if (selectedLine && isDown){
      const endIdx = game.hoveredStationIdx; const end = (endIdx!==-1? game.stations[endIdx] : world);
      const start = lineInsertAnchor || world;
      let points = createHexPath(start.x, start.y, end.x, end.y, game.config.hexGrid.size);
      if (endIdx!==-1){
        // If inserting into a line towards a station, show arrival bubble preview
        const endStation = game.stations[endIdx];
        points = applyTerminalBubbles(points, null, endStation, game);
      }
      points = applyCorridorBundling(points, game, selectedLine);
      // Validate river crossing + duplicates before user releases
      let valid = true;
      if (endIdx !== -1) {
        const v = canInsertStationAt(game, selectedLine, endIdx, insertPosition);
        valid = v.valid;
      }
      onPreview({ points, valid, snapStation: endIdx, isHexSnapped: true });
    }
  });
  // Mouse wheel zoom handling
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const world = worldOf(ev);
    const zoomFactor = 0.1;
    const delta = ev.deltaY > 0 ? -zoomFactor : zoomFactor;

    const oldScale = game.camera.targetScale;
    game.camera.targetScale = Math.max(game.camera.minScale, Math.min(game.camera.maxScale, oldScale + delta));

    if (game.camera.targetScale !== oldScale) {
      // Zoom towards mouse cursor
      const scaleDiff = game.camera.targetScale - oldScale;
      game.camera.targetX -= world.x * scaleDiff;
      game.camera.targetY -= world.y * scaleDiff;

      // Track manual zoom to prevent auto-adjustment interference
      if (typeof window.trackManualZoom === 'function') {
        window.trackManualZoom();
      }

      game.needsRedraw = true;
    }
  });

  canvas.addEventListener('pointerup', (ev)=>{
    isDown=false; isPanning=false; try{ canvas.releasePointerCapture(ev.pointerId);}catch(e){}
    const world=worldOf(ev); const hit = stationAtPoint(game.stations, world.x, world.y, 20);
    if (dragStartStation!=null){ if (hit!==-1 && hit!==dragStartStation){ if (DEBUG) console.log('pointerup connect', dragStartStation, '->', hit); // extend existing if endpoint belongs to a line and not forcing new
        // IMPROVED: Allow extension from endpoints OR create new line if available
        const extendable = game.lines.filter(l=> (l.stations[0]===dragStartStation || l.stations[l.stations.length-1]===dragStartStation));

        // If no lines can be extended from this station, provide helpful feedback
        if (extendable.length === 0 && game.linesAvailable === 0) {
          const connectedLines = game.lines.filter(l => l.stations.includes(dragStartStation));
          if (connectedLines.length > 0) {
            console.log('Station is connected but not at endpoint - cannot extend existing routes');
            if (game.showToast) {
              game.showToast('Cannot extend from hub station - need endpoint station');
            }
          }
        }

        if (extendable.length>0 && !isShiftHeld){
          // Extend existing line from endpoint
          const line=extendable[0];
          if (DEBUG) console.log('extend line', line.id);
          if (line.stations[0]===dragStartStation) line.stations.unshift(hit);
          else line.stations.push(hit);
          rebuildWaypointsForLine(game, line);
          line.totalLength = game.calculateLineLength(line);
          if (line.trains.length===0 && game.trainsAvailable>0){
            game.createTrain(line.id);
            game.trainsAvailable--;
          }
          // Add connection to the new station
          if (!game.stations[hit].connections.includes(line.id)) {
            game.stations[hit].connections.push(line.id);
          }
          // Trigger train reallocation for extended line
          if (game.optimizeTrainAllocation) {
            game.optimizeTrainAllocation();
          }
        }
        else {
          // Try to create new line if available
          if (game.linesAvailable>0){
            const A=game.stations[dragStartStation], B=game.stations[hit];
            // River crossing requires tunnels
            const crosses = segmentCrossesPolygon({x:A.x,y:A.y},{x:B.x,y:B.y}, game.config.thamesPolygon);
            if (crosses && (game.tunnels||0) <= 0){ if (DEBUG) console.log('blocked: no tunnels'); onPreview(null); dragStartStation=null; return; }
            const line = createLine(game, [dragStartStation, hit], game.selectedLineColorIndex);
            if (line){
              line.waypoints = createHexPath(A.x,A.y,B.x,B.y,game.config.hexGrid.size);
              game.calculateLineLength(line);
              game.createTrain(line.id);
              if (game.trainsAvailable>0) game.trainsAvailable--; game.linesAvailable--; if (DEBUG) console.log('created line', line.id);
              if (crosses) { game.tunnels = Math.max(0, (game.tunnels||0)-1); if (DEBUG) console.log('used tunnel, remain', game.tunnels); }
            }
          } else {
            // HELPFUL: Show user why connection failed
            console.log('Cannot create new route: No lines available. Try extending from an endpoint station or hold Shift to force new line.');
            // Visual feedback for the user
            if (game.showToast) {
              game.showToast('No routes available - extend from endpoint station');
            }
          }
        }
      }
      dragStartStation=null; onPreview(null); game.updateHUD(); return;
    }
    if (selectedLine){
      if (hit!==-1){
        const v = canInsertStationAt(game, selectedLine, hit, insertPosition);
        if (v.valid){
          addStationToLine(game, selectedLine.id, hit, insertPosition);
          game.updateHUD();
        } else {
          // Provide helpful feedback on why insertion failed
          let message = 'Cannot add station to route';
          if (v.reason === 'duplicate') {
            message = 'Station already on this route';
          } else if (v.reason === 'tunnels') {
            message = 'Need tunnel permit to cross restricted airspace';
          }
          console.log(message);
          if (game.showToast) {
            game.showToast(message);
          }
        }
      }
      selectedLine=null; insertPosition=null; lineInsertAnchor=null; onPreview(null); return;
    }
  });
}

function projectPointToSegment(px, py, x1, y1, x2, y2){
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1; const lenSq = C*C + D*D; if (lenSq === 0) return { x: x1, y: y1 };
  let t = (A*C + B*D) / lenSq; t = Math.max(0, Math.min(1, t)); return { x: x1 + t*C, y: y1 + t*D };
}

function canInsertStationAt(game, line, stationIdx, position){
  // Prevent duplicates: don't insert if station already in line at same position
  if (line.stations.includes(stationIdx)) return { valid:false, reason:'duplicate' };
  const newIdx = position == null ? line.stations.length : Math.max(0, Math.min(position, line.stations.length));
  const S = game.stations[stationIdx]; if (!S) return { valid:false };
  const poly = game.config.thamesPolygon;
  let crossingsNeeded = 0;
  const prevIdx = newIdx - 1; const nextIdx = newIdx;
  if (prevIdx >= 0 && line.stations[prevIdx] != null){
    const A = game.stations[line.stations[prevIdx]];
    if (needsRiverCrossing(A, S, poly)) crossingsNeeded++;
  }
  if (nextIdx < line.stations.length && line.stations[nextIdx] != null){
    const B = game.stations[line.stations[nextIdx]];
    if (needsRiverCrossing(S, B, poly)) crossingsNeeded++;
  }
  if (crossingsNeeded > 0 && (game.tunnels || 0) < crossingsNeeded) return { valid:false, reason:'tunnels' };
  return { valid:true };
}

function needsRiverCrossing(P, Q, poly){
  if (!poly || poly.length < 3) return false;
  // Quick side check using polygon min/max Y band to reduce false positives near the bank
  let minY = Infinity, maxY = -Infinity;
  for (const v of poly){ if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y; }
  const tol = 6; // tolerance near banks
  const ay = P.y, by = Q.y;
  if ((ay < minY - tol && by < minY - tol) || (ay > maxY + tol && by > maxY + tol)) return false;
  // Otherwise do precise polygon-edge intersection test
  return segmentCrossesPolygon({x:P.x,y:P.y},{x:Q.x,y:Q.y}, poly);
}
