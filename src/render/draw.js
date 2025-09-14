// Basic drawing helpers for Phase 0

export function setDPRTransform(ctx, canvas, dpr = window.devicePixelRatio || 1) {
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function clearScreen(ctx, canvas) {
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  // Reapply DPR transform after clearing
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function drawBackground(ctx, color = '#0e172a') {
  const { a, d, e, f } = ctx.getTransform(); // a,d are scaleX/Y under our usage
  const width = (ctx.canvas.width / a);
  const height = (ctx.canvas.height / d);
  ctx.save();
  ctx.setTransform(a, 0, 0, d, 0, 0);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function drawWorldGrid(ctx, cam) {
  // Subtle grid to verify transforms
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.scale(cam.scale, cam.scale);
  ctx.lineWidth = 1 / cam.scale;
  const step = 100;
  const span = 3000;
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  for (let x = -span; x <= span; x += step) {
    ctx.moveTo(x, -span); ctx.lineTo(x, span);
  }
  for (let y = -span; y <= span; y += step) {
    ctx.moveTo(-span, y); ctx.lineTo(span, y);
  }
  ctx.stroke();

  // origin crosshair
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(-span, 0); ctx.lineTo(span, 0);
  ctx.moveTo(0, -span); ctx.lineTo(0, span);
  ctx.stroke();
  ctx.restore();
}

