export function drawRestrictedAirspace(ctx, cam, pathD){
  if (!pathD) return;
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.scale(cam.scale, cam.scale);
  ctx.lineCap = 'round';
  ctx.globalAlpha = 1.0;
  const path = new Path2D(pathD);
  // Outer haze
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)'; // rose-500
  ctx.lineWidth = 48 / cam.scale;
  ctx.stroke(path);
  // Core corridor
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)'; // red-500
  ctx.lineWidth = 28 / cam.scale;
  ctx.stroke(path);
  ctx.restore();
}

