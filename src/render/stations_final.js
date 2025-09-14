export function drawStations(ctx, cam, game){
  ctx.save(); ctx.translate(cam.x, cam.y); ctx.scale(cam.scale, cam.scale);
  for (let i = 0; i < game.stations.length; i++) {
    const s = game.stations[i];
    if (!s) continue;

    const isHovered = game.hoveredStationIdx === i;
    const stationOpacity = s.opacity !== undefined ? s.opacity : 1;
    const stationRadius = s.r;

    if (stationOpacity <= 0) continue; // Skip invisible stations

    ctx.globalAlpha = stationOpacity;

    // Enhanced glow effects
    if (s.glowIntensity > 0 || isHovered) {
      const glowRadius = s.r + 16;
      const glowIntensity = Math.max(s.glowIntensity || 0, isHovered ? 0.3 : 0);

      ctx.beginPath();
      ctx.fillStyle = `rgba(14, 165, 163, ${glowIntensity})`;
      ctx.arc(s.x, s.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Queue glow
    if (s.queue && s.queue.length > 0) {
      ctx.beginPath();
      ctx.fillStyle = s.isOvercrowded ? 'rgba(231,76,60,0.35)' : 'rgba(0,0,0,0.1)';
      ctx.arc(s.x, s.y, stationRadius + 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Station circle with hover effect
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = s.isOvercrowded ? '#e74c3c' : (isHovered ? '#0ea5a3' : '#3b3b3b');
    ctx.lineWidth = (s.isOvercrowded ? 3 : (isHovered ? 3 : 2)) / cam.scale;
    ctx.arc(s.x, s.y, stationRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // ENHANCED Final destination visuals - make them unmistakably important!
    if (s.isFinal){
      const time = performance.now() * 0.003;

      // Pulsing outer glow ring
      const pulseRadius = stationRadius + 12 + Math.sin(time + i) * 4;
      const pulseOpacity = 0.4 + Math.sin(time * 0.8 + i) * 0.2;
      ctx.beginPath();
      ctx.fillStyle = `rgba(245, 158, 11, ${pulseOpacity * 0.3})`;
      ctx.arc(s.x, s.y, pulseRadius, 0, Math.PI * 2);
      ctx.fill();

      // Rotating dashed ring - like radar sweep
      ctx.beginPath();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 4 / cam.scale;
      const dashLen = 8 / cam.scale;
      ctx.setLineDash([dashLen, dashLen * 0.5]);
      ctx.lineDashOffset = -time * 20;
      ctx.arc(s.x, s.y, stationRadius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // International hub crown effect
      ctx.save();
      ctx.translate(s.x, s.y - stationRadius - 15);
      ctx.rotate(Math.sin(time * 0.5 + i) * 0.1);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      // Crown peaks
      for(let peak = 0; peak < 5; peak++) {
        const angle = (peak / 5) * Math.PI * 2 - Math.PI/2;
        const innerR = 6;
        const outerR = peak % 2 === 0 ? 12 : 8;
        const x1 = Math.cos(angle) * innerR;
        const y1 = Math.sin(angle) * innerR;
        const x2 = Math.cos(angle) * outerR;
        const y2 = Math.sin(angle) * outerR;
        if(peak === 0) ctx.moveTo(x2, y2);
        else ctx.lineTo(x2, y2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.5 / cam.scale;
      ctx.stroke();
      ctx.restore();
    }

    // Interchange indicator
    if (s.isInterchange) {
      ctx.beginPath();
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 4 / cam.scale;
      ctx.arc(s.x, s.y, stationRadius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Station symbol
    drawSymbol(ctx, cam, s.shape, s.x, s.y);

    // Passenger queue with demand indicators
    if (s.queue && s.queue.length > 0) {
      drawQueue(ctx, cam, game, s);
      drawDemandIndicators(ctx, cam, game, s);
    }

    // STUCK PASSENGER WARNING - visual indicator for debugging passenger flow issues
    if (s.queue && s.queue.length > 0 && game.gameTime) {
      const stuckPassengers = s.queue.filter(p => game.gameTime - p.spawnTime > 45000);
      if (stuckPassengers.length > 0) {
        const warningTime = performance.now() * 0.005;
        const opacity = 0.7 + Math.sin(warningTime) * 0.3; // Pulsing effect

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        // Warning triangle above station
        const size = 8 / cam.scale;
        const offsetY = -(stationRadius + size + 5) / cam.scale;
        ctx.moveTo(s.x, s.y + offsetY);
        ctx.lineTo(s.x - size, s.y + offsetY + size * 1.5);
        ctx.lineTo(s.x + size, s.y + offsetY + size * 1.5);
        ctx.closePath();
        ctx.fill();

        // Exclamation mark
        ctx.fillStyle = '#ffffff';
        ctx.font = `${6 / cam.scale}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('!', s.x, s.y + offsetY + size * 0.8);
        ctx.restore();
      }
    }

    // Station name (when zoomed in) - highlight final airports
    if (cam.scale > 1.0) {
      ctx.fillStyle = s.isFinal ? '#f59e0b' : (isHovered ? '#0ea5a3' : '#334155');
      ctx.font = `${s.isFinal ? 'bold ' : ''}${Math.max(10, 12/cam.scale)}px Inter, Arial, sans-serif`;
      ctx.textAlign = 'center';

      // Add "INTL" suffix for final airports
      const displayName = s.isFinal ? s.name + ' INTL' : s.name;
      ctx.fillText(displayName, s.x, s.y + stationRadius + 20/cam.scale);

      // Subtitle for final airports
      if (s.isFinal) {
        ctx.fillStyle = '#d97706';
        ctx.font = `${Math.max(8, 9/cam.scale)}px Inter, Arial, sans-serif`;
        ctx.fillText('Final Destination', s.x, s.y + stationRadius + 35/cam.scale);
      }
    }

    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawSymbol(ctx, cam, shape, x, y){
  const size=10; ctx.save(); ctx.translate(x,y); ctx.strokeStyle='#2f2f2f'; ctx.lineWidth = 2.5 / cam.scale;
  if (shape==='circle'){ ctx.beginPath(); ctx.arc(0,0,size,0,Math.PI*2); ctx.stroke(); }
  else if (shape==='triangle'){ ctx.beginPath(); ctx.moveTo(0,-size-1); ctx.lineTo(size+1,size); ctx.lineTo(-size-1,size); ctx.closePath(); ctx.stroke(); }
  else { ctx.beginPath(); ctx.rect(-size,-size,size*2,size*2); ctx.stroke(); }
  ctx.restore();
}

function drawQueue(ctx, cam, game, s){
  const startX = s.x + s.r + 15; let y = s.y - (s.queue.length - 1) * 7;
  for (let i=0;i<s.queue.length;i++){ const p=s.queue[i]; const wait = game.gameTime - p.spawnTime; const bob = Math.sin(wait*0.003 + i*0.5)*2; const urgent = Math.min(1, wait / (game.config.maxWaitSeconds*1000)); const dest = game.stations[p.destStation]; const isFinal = dest && dest.isFinal; const base = game.config.passengerColors[p.destShape]||'#fff'; const fill = urgent>0.7? '#ff6b6b' : (isFinal ? '#f59e0b' : base); ctx.save(); ctx.shadowColor='rgba(0,0,0,0.2)'; ctx.shadowBlur=3; ctx.shadowOffsetY=1; if (isFinal) { ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 6; } ctx.beginPath(); ctx.fillStyle=fill; ctx.arc(startX, y+bob, isFinal ? 9 : 7, 0, Math.PI*2); ctx.fill(); ctx.restore(); y += 14; }
}

// NEW: Visual demand indicators showing destination breakdown
function drawDemandIndicators(ctx, cam, game, station) {
  if (cam.scale < 0.8) return; // Only show when zoomed in enough

  // Group passengers by destination
  const destCounts = {};
  station.queue.forEach(p => {
    const dest = game.stations[p.destStation];
    if (!dest) return;
    const key = dest.id;
    if (!destCounts[key]) {
      destCounts[key] = { dest, count: 0, isFinal: dest.isFinal, shape: dest.shape };
    }
    destCounts[key].count++;
  });

  const destinations = Object.values(destCounts);
  if (destinations.length === 0) return;

  // Draw demand breakdown as small indicator bars
  const indicatorX = station.x + station.r + 40;
  const indicatorY = station.y - 15;
  const barWidth = 4;
  const barMaxHeight = 25;

  ctx.save();
  ctx.font = `${Math.max(8, 10/cam.scale)}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'left';

  destinations.sort((a, b) => (b.isFinal ? 1 : 0) - (a.isFinal ? 1 : 0)).forEach((info, idx) => {
    const x = indicatorX + idx * (barWidth + 2);
    const height = Math.min(barMaxHeight, info.count * 5);
    const color = info.isFinal ? '#f59e0b' : game.config.passengerColors[info.shape] || '#94a3b8';

    // Draw demand bar
    ctx.fillStyle = color;
    ctx.globalAlpha = info.isFinal ? 0.9 : 0.6;
    ctx.fillRect(x, indicatorY, barWidth, height);

    // Draw count label
    ctx.fillStyle = info.isFinal ? '#f59e0b' : '#64748b';
    ctx.globalAlpha = 1;
    ctx.fillText(info.count.toString(), x, indicatorY + height + 12);

    // Final destination marker
    if (info.isFinal) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('★', x - 1, indicatorY - 3);
    }
  });

  ctx.restore();
}
