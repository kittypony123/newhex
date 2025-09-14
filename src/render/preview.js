export function drawPreview(ctx, cam, preview){
  if (!preview || !preview.points || preview.points.length < 2) return;

  const pts = preview.points;
  const time = performance.now() * 0.003;

  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.scale(cam.scale, cam.scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Animated dash pattern
  const dashLength = 15 / cam.scale;
  const gapLength = 8 / cam.scale;
  const animOffset = (time * 20) % (dashLength + gapLength);

  ctx.setLineDash([dashLength, gapLength]);
  ctx.lineDashOffset = animOffset;

  // Enhanced visual feedback
  if (preview.valid) {
    // Valid preview with glow effect
    ctx.shadowColor = 'rgba(14,165,163,0.4)';
    ctx.shadowBlur = 8 / cam.scale;
    ctx.strokeStyle = 'rgba(14,165,163,0.9)';

    // Pulsing opacity
    const pulseOpacity = 0.7 + 0.3 * Math.sin(time * 2);
    ctx.globalAlpha = pulseOpacity;
  } else {
    // Invalid preview with warning effect
    ctx.shadowColor = 'rgba(255,68,68,0.5)';
    ctx.shadowBlur = 6 / cam.scale;
    ctx.strokeStyle = '#ff4444';

    // Shake effect for invalid
    const shakeIntensity = 1;
    const shakeX = Math.sin(time * 15) * shakeIntensity;
    const shakeY = Math.cos(time * 12) * shakeIntensity;
    ctx.translate(shakeX, shakeY);
  }

  ctx.lineWidth = 12 / cam.scale;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }

  ctx.stroke();

  // Highlight snap target station
  if (preview.snapStation !== undefined && preview.snapStation !== -1) {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.8 + 0.2 * Math.sin(time * 4);
    ctx.strokeStyle = preview.valid ? '#0ea5a3' : '#ff4444';
    ctx.lineWidth = 3 / cam.scale;
    ctx.setLineDash([]);

    const lastPt = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(lastPt.x, lastPt.y, 25 / cam.scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

