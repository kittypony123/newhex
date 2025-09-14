// 2-space indentation; simple camera with smoothing and conversions

export function createCamera(initialX = 0, initialY = 0, initialScale = 1) {
  return {
    x: initialX,
    y: initialY,
    scale: initialScale,
    targetX: initialX,
    targetY: initialY,
    targetScale: initialScale,
    smoothing: 0.12,
    minScale: 0.4,
    maxScale: 3.0
  };
}

export function clampScale(cam) {
  cam.scale = Math.max(cam.minScale, Math.min(cam.maxScale, cam.scale));
  cam.targetScale = Math.max(cam.minScale, Math.min(cam.maxScale, cam.targetScale));
}

export function updateCamera(cam) {
  const epsilon = 0.001;
  const prevX = cam.x;
  const prevY = cam.y;
  const prevScale = cam.scale;

  cam.x += (cam.targetX - cam.x) * cam.smoothing;
  cam.y += (cam.targetY - cam.y) * cam.smoothing;
  cam.scale += (cam.targetScale - cam.scale) * cam.smoothing;
  clampScale(cam);

  // Return true if camera changed significantly
  return (
    Math.abs(cam.x - prevX) > epsilon ||
    Math.abs(cam.y - prevY) > epsilon ||
    Math.abs(cam.scale - prevScale) > epsilon
  );
}

export function screenToWorld(cam, px, py) {
  return { x: (px - cam.x) / cam.scale, y: (py - cam.y) / cam.scale };
}

export function worldToScreen(cam, wx, wy) {
  return { x: wx * cam.scale + cam.x, y: wy * cam.scale + cam.y };
}

