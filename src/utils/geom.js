export function dist(ax, ay, bx, by){
  const dx = ax - bx, dy = ay - by; return Math.hypot(dx, dy);
}

export function lerp(a, b, t){ return a + (b - a) * t; }

