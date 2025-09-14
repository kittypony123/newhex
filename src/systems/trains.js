import { shouldBoardLineHere } from './passengers.js';

export function createTrain(game, lineId){
  const line = game.lines[lineId]; if (!line || line.stations.length<2) return null;
  const train = {
    id: game.trains.length,
    lineId,
    position: 0.0,
    direction: 1,
    passengers: [],
    capacity: 10 + (game.carriages || 0),
    speed: game.config.trainSpeed * ((game.day && game.day <= 2) ? 1.15 : 1.0),
    lastStationVisited: -1,
    stationCooldown: 0,
    dwellRemaining: 0,
    scale: 1,
    opacity: 1
  };
  line.trains.push(train.id);
  game.trains.push(train);
  if (game.needsRedraw !== undefined) game.needsRedraw = true;
  return train;
}

export function getTrainWorldPosition(game, train){
  const line = game.lines[train.lineId];
  if (!line || line.stations.length < 2) return {x:0, y:0, angle:0};
  if (line.waypoints && line.waypoints.length >= 2) {
    return getPositionAlongWaypoints(line.waypoints, train.position);
  } else {
    return getPositionAlongStations(game, line, train.position);
  }
}

function getPositionAlongWaypoints(waypoints, position) {
  if (waypoints.length < 2) return {x: 0, y: 0, angle: 0};
  let totalLength = 0; const segments = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const A = waypoints[i], B = waypoints[i + 1];
    const length = Math.hypot(B.x - A.x, B.y - A.y);
    segments.push({ A, B, length, startPos: totalLength, endPos: totalLength + length });
    totalLength += length;
  }
  if (totalLength === 0) return {x: waypoints[0].x, y: waypoints[0].y, angle: 0};
  const targetDistance = position * totalLength;
  for (let i = 0; i < segments.length; i++){
    const seg = segments[i];
    if (targetDistance >= seg.startPos && targetDistance <= seg.endPos){
      const t = seg.length > 0 ? (targetDistance - seg.startPos) / seg.length : 0;
      const x = seg.A.x + (seg.B.x - seg.A.x) * t;
      const y = seg.A.y + (seg.B.y - seg.A.y) * t;
      const angle = Math.atan2(seg.B.y - seg.A.y, seg.B.x - seg.A.x);
      return {x, y, angle, currentSegment: seg, segmentIndex: i, segmentProgress: t};
    }
  }
  const first = waypoints[0];
  return {x: first.x, y: first.y, angle: 0};
}

function getPositionAlongStations(game, line, position) {
  const segments = []; let totalLength = 0;
  for (let i = 0; i < line.stations.length - 1; i++) {
    const A = game.stations[line.stations[i]];
    const B = game.stations[line.stations[i + 1]];
    if (!A || !B) continue;
    const length = Math.hypot(B.x - A.x, B.y - A.y);
    segments.push({ A, B, length, startPos: totalLength, endPos: totalLength + length }); totalLength += length;
  }
  if (segments.length === 0) {
    for (const si of line.stations) { const s = game.stations[si]; if (s) return {x: s.x, y: s.y, angle: 0}; }
    return {x: 0, y: 0, angle: 0};
  }
  const targetDistance = position * totalLength;
  for (let i = 0; i < segments.length; i++){
    const seg = segments[i];
    if (targetDistance >= seg.startPos && targetDistance <= seg.endPos){
      const t = seg.length > 0 ? (targetDistance - seg.startPos) / seg.length : 0;
      const x = seg.A.x + (seg.B.x - seg.A.x) * t;
      const y = seg.A.y + (seg.B.y - seg.A.y) * t;
      const angle = Math.atan2(seg.B.y - seg.A.y, seg.B.x - seg.A.x);
      return {x, y, angle, currentSegment: seg, segmentIndex: i, segmentProgress: t};
    }
  }
  const first = segments[0];
  return {x: first.A.x, y: first.A.y, angle: 0};
}

export function updateTrains(game, deltaTime){
  game.trains.forEach(train=>{
    const line=game.lines[train.lineId]; if (!line || line.stations.length<2) return;
    for (const si of line.stations){ if (!game.stations[si]) return; }
    if (train.stationCooldown>0) train.stationCooldown -= deltaTime;
    if (train.dwellRemaining>0){
      train.dwellRemaining -= deltaTime;
      if (train.dwellRemaining <= 0){
        train.dwellRemaining = 0;
        const epsPos = 1e-3;
        if (!line.isLoop){
          if (train.position >= 1.0 - epsPos) train.position = 1.0 - 2*epsPos;
          else if (train.position <= epsPos) train.position = 2*epsPos;
        }
        train.stationCooldown = 0;
      }
      return;
    }
    if (!line.isLoop){
      const epsGuard = 1e-4;
      if (train.position >= 1.0 - epsGuard && train.direction > 0 && train.stationCooldown <= 0){ train.direction = -1; train.position = 1.0 - 2*epsGuard; }
      else if (train.position <= epsGuard && train.direction < 0 && train.stationCooldown <= 0){ train.direction = 1; train.position = 2*epsGuard; }
    }

    const safeLen = Math.max(100, line.totalLength); const step = (train.speed * deltaTime) / safeLen; const prevPos=train.position; let proposed = prevPos + step*train.direction;
    const params=[]; let cum=0; for (let i=0;i<line.stations.length-1;i++){ const a=game.stations[line.stations[i]], b=game.stations[line.stations[i+1]]; cum += Math.hypot(b.x-a.x,b.y-a.y); params.push(cum); }
    const total = Math.max(cum,1e-6); const norm=[0]; for (let i=0;i<params.length;i++) norm.push(params[i]/total);
    const eps=1e-4;
    function arriveAtStationIdx(idx){
      const stationIndex = line.stations[idx];
      const station = game.stations[stationIndex];
      handleStationArrival(game, train, station);
      train.lastStationVisited = stationIndex;
      train.stationCooldown = 600;
      const baseTurn = station.turnaroundMs ?? (game.config.defaultTurnaroundMs||600);
      const earlyFactor = (game.day && game.day <= 3) ? 0.8 : 1.0;
      const crowdFactor = (station.isOvercrowded ? 0.8 : 1.0);
      const typeFactor = (station.isInterchange ? 0.8 : 1.0);
      train.dwellRemaining = baseTurn * earlyFactor * crowdFactor * typeFactor;
      if (!line.isLoop && (idx === 0 || idx === line.stations.length - 1)) { train.direction *= -1; }
    }
    function checkCrossing(startPos,endPos,dir){ if (dir>0){ for (let i=0;i<norm.length;i++){ const sp=norm[i]; const sIdx=line.stations[i]; if (sp>startPos+eps && sp<=endPos+eps){ if (train.lastStationVisited!==sIdx && train.stationCooldown<=0){ train.position=sp; arriveAtStationIdx(i); return true; } } } } else { for (let i=norm.length-1;i>=0;i--){ const sp=norm[i]; const sIdx=line.stations[i]; if (sp<startPos-eps && sp>=endPos-eps){ if (train.lastStationVisited!==sIdx && train.stationCooldown<=0){ train.position=sp; arriveAtStationIdx(i); return true; } } } } return false; }
    if (line.isLoop){ if (proposed>1.0){ const wrapped=proposed-1.0; if (checkCrossing(prevPos,1.0,train.direction)) return; if (checkCrossing(0.0,wrapped,train.direction)) return; train.position=wrapped; return; } else if (proposed<0.0){ const wrapped=proposed+1.0; if (checkCrossing(prevPos,0.0,train.direction)) return; if (checkCrossing(1.0,wrapped,train.direction)) return; train.position=wrapped; return; } }
    if (checkCrossing(prevPos, proposed, train.direction)) return;
    if (line.isLoop){ train.position = proposed; if (train.position>=1.0) train.position -= 1.0; else if (train.position<0.0) train.position += 1.0; }
    else { train.position = Math.max(0, Math.min(1, proposed)); if (train.position>=1.0-eps){ const lastIdx=line.stations[line.stations.length-1]; if (train.lastStationVisited!==lastIdx && train.stationCooldown<=0){ arriveAtStationIdx(line.stations.length-1); return; } train.position=1.0; train.direction=-1; } else if (train.position<=0.0+eps){ const firstIdx=line.stations[0]; if (train.lastStationVisited!==firstIdx && train.stationCooldown<=0){ arriveAtStationIdx(0); return; } train.position=0.0; train.direction=1; } }
  });
}

export function handleStationArrival(game, train, station){
  const now = game.gameTime;
  // Disembark passengers who reached their final airport, or transfer if this line doesn't reach their destination
  const remaining=[]; let dropped=0;
  const line=game.lines[train.lineId]; if (!line) return;

  // Initialize combo system if not exists
  if (!game.combo) game.combo = { count: 0, lastTime: 0, multiplier: 1 };
  for (const p of train.passengers){
    if (p.destStation === station.id){
      // ENHANCED SCORING: More points for final destinations + efficiency bonuses + combos
      const destStation = game.stations[p.destStation];
      const travelTime = now - p.spawnTime;
      let points = 1;
      let popupText = '+1';
      let popupColor = '#10b981';

      // Combo system - bonus for rapid consecutive deliveries
      if (now - game.combo.lastTime < 5000) { // Within 5 seconds
        game.combo.count++;
        game.combo.multiplier = Math.min(3, 1 + (game.combo.count * 0.5));
      } else {
        game.combo.count = 0;
        game.combo.multiplier = 1;
      }
      game.combo.lastTime = now;

      if (destStation && destStation.isFinal) {
        // Base bonus for reaching final destination
        points = 5;
        popupText = '+5 FINAL';
        popupColor = '#f59e0b';

        // Speed bonus for quick delivery to finals
        if (travelTime < 30000) { // Under 30 seconds
          points += 3;
          popupText = '+8 EXPRESS';
          popupColor = '#ef4444';
        } else if (travelTime < 60000) { // Under 1 minute
          points += 1;
          popupText = '+6 FAST';
        }

        // Multi-leg bonus for complex routing
        const hops = (p.transferCount || 0) + 1;
        if (hops >= 3) {
          points += 2;
          popupText += ' +HUB';
        }
      } else {
        // Small bonus for intermediate deliveries (feeders to hubs)
        if (station.isInterchange) {
          points = 2;
          popupText = '+2 HUB';
          popupColor = '#0ea5a3';
        }
      }

      // Apply VIP multiplier
      if (p.isVIP && p.pointMultiplier) {
        points = Math.floor(points * p.pointMultiplier);
        popupText += ' VIP!';
        popupColor = '#ef4444';
      }

      // Apply combo multiplier
      if (game.combo.multiplier > 1) {
        points = Math.floor(points * game.combo.multiplier);
        popupText += ` x${game.combo.multiplier.toFixed(1)}`;
        if (game.combo.count >= 3) {
          popupText += ' COMBO!';
          popupColor = '#ef4444'; // Red for hot streaks
        }
      }

      game.score += points;
      dropped++;
      createScorePopup(game, station.x, station.y, popupText, popupColor);

      // Track final destination completions for analytics
      if (destStation && destStation.isFinal) {
        game.finalDeliveries = (game.finalDeliveries || 0) + 1;
        game.totalFinalDeliveryTime = (game.totalFinalDeliveryTime || 0) + travelTime;
      }

      // Achievement tracking
      if (game.achievements) {
        game.achievements.onPassengerDelivered(travelTime);
      }
      continue;
    }
    if (!line.stations.includes(p.destStation)){
  const mctBase = (station.mctMs ?? (game.config.defaultMCT||12000));
  const mctFactor = (game.day && game.day <= 2) ? 0.7 : (game.day === 3 ? 0.9 : 1.0);
  const mctMult = game.config.mctMultiplier || 1.0;
      p.transferReadyAt = now + Math.round(mctBase * mctFactor * mctMult);
      // Track transfer count for multi-leg journey bonuses
      p.transferCount = (p.transferCount || 0) + 1;
      station.queue.push(p);
      continue;
    }
    remaining.push(p);
  }
  train.passengers = remaining;

  // Board passengers who can make ETA progress and are MCT-eligible
  const capacity = train.capacity - train.passengers.length; if (capacity<=0) return;
  const keep=[]; let picked=0;

  // DEBUG: Track long-waiting passengers for visibility
  if (game.debugPassengerFlow) {
    const longWaitingPassengers = station.queue.filter(p => now - p.spawnTime > 45000);
    if (longWaitingPassengers.length > 0) {
      console.log(`DEBUG: Station ${station.name} has ${longWaitingPassengers.length} passengers waiting 45+ seconds`);
      longWaitingPassengers.forEach(p => {
        const destStation = game.stations[p.destStation];
        const waitTime = Math.round((now - p.spawnTime) / 1000);
        console.log(`  - Passenger to ${destStation ? destStation.name : 'unknown'} waiting ${waitTime}s`);
      });
    }
  }

  for (const p of station.queue){
    if (picked>=capacity){ keep.push(p); continue; }
    if (now < (p.transferReadyAt||0)) { keep.push(p); continue; }

    const shouldBoard = shouldBoardLineHere(game, line, station.id, p);

    // DEBUG: Log boarding decisions for long-waiting passengers
    if (game.debugPassengerFlow && now - p.spawnTime > 45000) {
      const destStation = game.stations[p.destStation];
      console.log(`  - Boarding decision for ${destStation ? destStation.name : 'unknown'}: ${shouldBoard}`);
    }

    if (shouldBoard){
      train.passengers.push(p); picked++;
    } else keep.push(p);
  }
  station.queue=keep;
}

export function createScorePopup(game, x, y, text, color = '#10b981') {
  const popup = { x, y, text, color, age: 0, maxAge: 1000, opacity: 1, scale: 1 };
  game.scorePopups.push(popup);
  if (game.animations !== undefined) {
    import('../utils/animations.js').then(({ createScorePopupAnimation }) => {
      const animation = createScorePopupAnimation(popup, 1000);
      game.animations.push(animation);
      game.needsRedraw = true;
    });
  }
}

export function updateScorePopups(game, dt) {
  game.scorePopups = game.scorePopups.filter(p => {
    p.age += dt; if (game.animations === undefined) { p.y -= dt * 0.05; }
    return p.age < p.maxAge;
  });
}

// Dynamic train allocation based on line length and passenger demand
export function optimizeTrainAllocation(game) {
  if (game.trainsAvailable <= 0) return;

  // Calculate desired trains per line based on length and demand
  const lineStats = game.lines.map(line => {
    const length = line.totalLength || 0;
    const stationCount = line.stations.length;
    const passengerDemand = calculateLineDemand(game, line);
    const connectsHub = line.stations.some(sid => {
      const st = game.stations[sid];
      return st && (st.isInterchange || st.isFinal);
    });

    // Base trains needed: 1 train per 300-400 units of length, but minimum 1
    const baseTrainsForLength = Math.max(1, Math.ceil(length / 350));

    // Additional trains for high passenger demand (more conservative)
    const demandTrains = Math.ceil(passengerDemand / 10); // 1 extra train per 10 passengers demanding this line

    // Station count factor - more stations need more trains for coverage
    const stationTrains = Math.max(1, Math.ceil(stationCount / 3));

    // Cap maximum trains to prevent over-allocation
    const earlyMax = (game.day && game.day <= 3) ? 5 : 4;
    const maxTrains = Math.min(earlyMax, Math.max(2, Math.ceil(stationCount / 2)));

    // IMPLEMENT stationTrains: ensure desired trains account for station coverage, not just length/demand
    let desiredRaw = Math.max(baseTrainsForLength, stationTrains) + demandTrains;
    if ((game.config && game.config.hubAndSpokeMode) && connectsHub) {
      const bonus = (game.config.hubDesiredTrainBonus != null) ? game.config.hubDesiredTrainBonus : 1;
      desiredRaw += bonus; // Favor extra planes on hub-connected lines
    }
    const desiredTrains = Math.max(1, Math.min(desiredRaw, maxTrains));
    const zeroTrainBoost = (line.trains.length === 0) ? 100000 : 0;
    const currentTrains = line.trains.length;

    return {
      line,
      currentTrains,
      desiredTrains,
      deficit: Math.max(0, desiredTrains - currentTrains),
      priority: zeroTrainBoost + length + (passengerDemand * 50) + (connectsHub ? (game.config.hubLinePriorityBonus || 200) : 0) // Favor hub-connected lines
    };
  });

  // Sort by priority (longest lines with highest demand first)
  lineStats.sort((a, b) => b.priority - a.priority);

  // Allocate available trains to lines with the highest deficit and priority
  for (const stats of lineStats) {
    if (game.trainsAvailable <= 0) break;
    if (stats.deficit <= 0) continue;

    const trainsToAdd = Math.min(stats.deficit, game.trainsAvailable);
    for (let i = 0; i < trainsToAdd; i++) {
      if (game.trainsAvailable <= 0) break;

      const newTrain = createTrain(game, stats.line.id);
      if (newTrain) {
        game.trainsAvailable--;
        console.log(`Added plane to line ${stats.line.id} (${stats.currentTrains + i + 1}/${stats.desiredTrains} trains)`);
      }
    }
  }
}

function calculateLineDemand(game, line) {
  let demand = 0;

  // Count passengers at stations who would benefit from this line
  for (const stationId of line.stations) {
    const station = game.stations[stationId];
    if (!station) continue;

    for (const passenger of station.queue) {
      // Check if this line can help get passenger to their destination
      if (line.stations.includes(passenger.destStation)) {
        demand += 2; // Direct connection worth more
      } else {
        // Check if this line connects to a line that can reach destination
        const canTransfer = line.stations.some(sid => {
          const transferStation = game.stations[sid];
          return transferStation && transferStation.connections.some(otherLineId => {
            const otherLine = game.lines[otherLineId];
            return otherLine && otherLine.stations.includes(passenger.destStation);
          });
        });
        if (canTransfer) demand += 1;
      }
    }
  }

  return demand;
}
