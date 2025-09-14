import { estimateETA, neighborsOnLineFrom, stepReducesETA, buildStationGraph } from './routing.js';
import { createScorePopup } from './trains.js';

export function spawnPassenger(game){
  if (game.gameOver) return; if (game.stations.length<2) return;
  // Prefer origins that are not near capacity
  function dynamicCap(s){
    const baseCap = s.isFinal ? 14 : (s.isInterchange ? 11 : 9);
    let boost = 1.0;
    // More generous early-game buffers; taper to slight bonus later
    if (game.day <= 2) boost = 2.0;
    else if (game.day === 3) boost = 1.6;
    else if (game.day === 4) boost = 1.3;
    else boost = 1.1;
    return Math.round(baseCap * boost);
  }
  const candidates = game.stations.filter(s => s);
  let origins = candidates.filter(s => (s.queue ? s.queue.length : 0) < dynamicCap(s) - 1);
  if (origins.length === 0) origins = candidates; // fallback
  const origin = origins[Math.floor(Math.random()*origins.length)];
  const originIndex = origin.id;

  // BALANCED FINAL AIRPORT FOCUS - sustainable demand distribution
  const finals = game.stations.filter(Boolean).filter(s => s.id !== originIndex && s.isFinal);
  const others = game.stations.filter(Boolean).filter(s => s.id !== originIndex && !s.isFinal);

  let destStation;
  if (finals.length > 0) {
    // Hub-and-spoke: still serve finals, but prefer hubs strongly for non-final demand
    const finalBias = (game.day <= 3) ? 0.45 : 0.6;
    if (Math.random() < finalBias || others.length === 0) {
      destStation = finals[Math.floor(Math.random() * finals.length)];
    } else {
      const interchanges = others.filter(s => s.isInterchange);
      const bias = (game.config && (game.config.hubSpokeBias || (game.config.hubAndSpokeMode ? 1.2 : 1))) || 1;
      const baseP = 0.7; // baseline preference for interchanges
      const boosted = Math.max(0.7, Math.min(0.97, baseP + 0.2 * (bias - 1))); // cap at 97%
      const pickHub = interchanges.length > 0 && (Math.random() < (game.config.hubAndSpokeMode ? boosted : baseP));
      if (pickHub) {
        destStation = interchanges[Math.floor(Math.random() * interchanges.length)];
      } else {
        destStation = others[Math.floor(Math.random() * others.length)];
      }
    }
  } else {
    // No finals available yet, use any destination
    if (others.length === 0) return;
    destStation = others[Math.floor(Math.random() * others.length)];
  }

  const now = game.gameTime;
  const passenger = {
    id: Math.random().toString(36).slice(2,9),
    destStation: destStation.id,
    // Keep destShape for UI coloring in station queues
    destShape: destStation.shape,
    spawnTime: now,
    startTime: now,
    waitTime: 0,
    originStation: originIndex,
    transferReadyAt: now
  };
  origin.queue.push(passenger);
  game.totalPassengers++;
}

export function updatePassengersAndCheckOvercrowding(game, dt){
  for (const st of game.stations){
    if (!st) continue;
    st.queue.forEach(p=> p.waitTime = game.gameTime - p.spawnTime);

    // EMERGENCY PASSENGER MANAGEMENT - Handle severe overcrowding
    handleEmergencyOvercrowding(game, st);

    // Dynamic capacities: higher on Day 1 to prevent early fails
    const baseCap = st.isFinal ? 14 : (st.isInterchange ? 11 : 9);
    let boost = 1.0;
    if (game.day <= 2) boost = 2.0; else if (game.day === 3) boost = 1.6; else if (game.day === 4) boost = 1.3; else boost = 1.1;
    const cap = Math.round(baseCap * boost);

    if (st.queue.length>=cap){
      st.overflowTimer += dt;
      // Dynamic grace: much longer early; still generous later
      const overflowFailMs = (game.day <= 2) ? 60000 : (game.day === 3 ? 55000 : (game.day === 4 ? 50000 : 45000));
      if (st.overflowTimer > overflowFailMs){
        game.endGame(`${st.name} airport became overcrowded!`);
        return;
      }
      st.isOvercrowded=true;
    } else { st.overflowTimer=0; st.isOvercrowded=false; }

    // Handle stranded passengers more gracefully
    const stranded=[];
    st.queue.forEach((p,idx)=>{
      if (p.waitTime > game.config.maxWaitSeconds*1000){
        // BALANCED: Only fail if there's been reasonable opportunity for service
        const canBeServed = st.connections.length>0 && isFinite(estimateETA(game, st.id, p.destStation));

        if (!canBeServed) {
          // No route possible - silently remove (not player's fault)
          stranded.push(idx);
        } else {
          const missMult = (game.config && game.config.missedConnectionMultiplier) ? game.config.missedConnectionMultiplier : 1.5;
          if (p.waitTime > game.config.maxWaitSeconds * missMult * 1000) {
          // 50% extra grace period before triggering failure
            game.endGame(`A passenger missed their connection at ${st.name}!`);
            return;
          }
        }
      }
    });
    stranded.reverse().forEach(i=> st.queue.splice(i,1));
  }
}

// Helper used by UI debug: whether line contains the destination
export function canTrainReachDestination(game, line, destStationIdx){
  if (!line) return false; return line.stations.includes(destStationIdx);
}

// IMPROVED: Decide if boarding this line from station is beneficial for reaching destination
export function shouldBoardLineHere(game, line, stationIdx, passenger){
  if (!line || !line.stations || line.stations.length < 2) return false;
  if (!passenger) return false;
  const destStationIdx = passenger.destStation;

  // PRIORITY 1: Direct connection - always board if destination is on this line
  if (line.stations.includes(destStationIdx)) {
    return true;
  }

  // PRIORITY 2: ETA improvement via neighbors (original logic)
  const neigh = neighborsOnLineFrom(line, stationIdx);
  if (neigh.length === 0) return false;

  for (const v of neigh) {
    if (stepReducesETA(game, stationIdx, v, destStationIdx)) {
      return true;
    }
  }

  // PRIORITY 3: Connection to network - board if this line connects to other lines
  // that can reach the destination (helpful for complex routing)
  for (const neighborIdx of neigh) {
    const neighborStation = game.stations[neighborIdx];
    if (neighborStation && neighborStation.connections) {
      // Check if any other line from this neighbor can reach the destination
      for (const otherLineId of neighborStation.connections) {
        if (otherLineId !== line.id) {
          const otherLine = game.lines[otherLineId];
          if (otherLine && otherLine.stations.includes(destStationIdx)) {
            return true;
          }
        }
      }
    }
  }

  // EARLY RELIEF: If station is crowded or in early days, allow boarding toward any hub/final on this line
  const currentStation = game.stations[stationIdx];
  const crowd = (currentStation && currentStation.queue) ? currentStation.queue.length : 0;
  const lineHasHub = line.stations.some(si => { const s = game.stations[si]; return s && (s.isInterchange || s.isFinal); });
  if ((game.day <= 2 && crowd >= 4) || crowd >= 6) {
    if (lineHasHub) return true;
  }

  // HUB-AND-SPOKE PRIORITY: If no path is currently known (ETA infinite),
  // prefer boarding toward a hub on this line after a short personal wait.
  // This funnels passengers to hubs to unlock onward connections.
  if (game.config && game.config.hubAndSpokeMode) {
    const etaFrom = estimateETA(game, stationIdx, destStationIdx);
    if (!isFinite(etaFrom) && lineHasHub) {
      const waited = game.gameTime - (passenger.spawnTime || game.gameTime);
      const waitMs = (game.config.hubSpokeBoardingWaitMs || 10000);
      const bias = (game.config.hubSpokeBias || 1);
      const threshold = Math.max(3000, Math.round(waitMs / Math.max(1, bias))); // stronger bias -> sooner boarding
      if (waited > threshold) return true;
    }
  }

  // PRIORITY 4: Last resort - if passenger has been waiting a long time and this
  // line goes to a major hub, allow boarding to prevent complete stalling
  if (currentStation && currentStation.queue) {
    // Prefer boarding after long personal wait to prevent stalling
    const longWaitThreshold = (game.day <= 2) ? 20000 : 30000;
    if (game.gameTime - passenger.spawnTime > longWaitThreshold) { // 20-30+ seconds waiting
      // Check if this line goes to a major hub (interchange or final destination)
      for (const lineStationIdx of line.stations) {
        const station = game.stations[lineStationIdx];
        if (station && (station.isInterchange || station.isFinal)) {
          return true;
        }
      }
    }

    // PRIORITY 5: EMERGENCY - Force boarding after extreme wait times to prevent total stalling
    const emergencyWait = (game.day <= 2) ? 45000 : 60000;
    if (game.gameTime - passenger.spawnTime > emergencyWait) { // 45-60+ seconds waiting
      console.log(`EMERGENCY: Forcing passenger boarding after ${Math.round((game.gameTime - passenger.spawnTime)/1000)}s wait`);
      return true;
    }
  }

  return false;
}

// Emergency handler for severe passenger overcrowding
function handleEmergencyOvercrowding(game, station) {
  if (!station.queue || station.queue.length === 0) return;

  const now = game.gameTime;
  const criticalWaitTime = 80000; // Slightly sooner to trigger relief actions
  const severeOvercrowding = station.queue.length >= 12; // Very high passenger count

  // Find passengers stuck for too long
  const stuckPassengers = station.queue.filter(p => now - p.spawnTime > criticalWaitTime);

  if (stuckPassengers.length > 0 || severeOvercrowding) {
    // EMERGENCY ACTION 1: Teleport some passengers to less crowded stations
    if (stuckPassengers.length >= 2 || (severeOvercrowding && station.queue.length > 14)) {
      // Find alternative stations that are less crowded and can serve similar destinations
      const alternativeStations = game.stations.filter(s =>
        s !== station &&
        s.queue &&
        s.queue.length < 4 &&
        s.connections &&
        s.connections.length > 0
      );

      if (alternativeStations.length > 0) {
        // Move up to 2 stuck passengers to alternative stations
        const candidates = stuckPassengers.length > 0 ? stuckPassengers : station.queue.slice(0, 2);
        const passengersToMove = candidates.slice(0, 2);
        passengersToMove.forEach(passenger => {
          const altStation = alternativeStations[Math.floor(Math.random() * alternativeStations.length)];

          // Remove from current station
          const index = station.queue.indexOf(passenger);
          if (index > -1) {
            station.queue.splice(index, 1);

            // Add to alternative station with fresh transfer time (respect MCT multiplier)
            passenger.transferReadyAt = now + Math.round((altStation.mctMs ?? 8000) * ((game.config && game.config.mctMultiplier) || 1));
            altStation.queue.push(passenger);

            if (game.debugPassengerFlow) {
              console.log(`EMERGENCY: Moved passenger from ${station.name} to ${altStation.name}`);
            }
          }
        });

        if (game.showToast) {
          game.showToast(`⚠️ Emergency rerouting at ${station.name}`);
        }
      }
    }

    // EMERGENCY ACTION 2: Express delivery for final destination passengers
    if (station.isFinal && severeOvercrowding) {
      // Immediately deliver passengers who are already at their destination
      const destinationPassengers = station.queue.filter(p => p.destStation === station.id);
      if (destinationPassengers.length > 0) {
        destinationPassengers.forEach(passenger => {
          // Award points and remove passenger
          game.score += 5; // Final destination points
          createScorePopup(game, station.x, station.y + 30, '+5 EXPRESS', '#ef4444');

          // Track achievement
          if (game.achievements) {
            game.achievements.onPassengerDelivered(now - passenger.spawnTime);
          }
        });

        // Remove delivered passengers
        station.queue = station.queue.filter(p => p.destStation !== station.id);

        if (game.showToast && destinationPassengers.length > 0) {
          game.showToast(`⚡ Express delivery at ${station.name}`);
        }
      }
    }
  }
}
