export function segSegIntersect(p, p2, q, q2) {
  const o1 = orientation(p, p2, q);
  const o2 = orientation(p, p2, q2);
  const o3 = orientation(q, q2, p);
  const o4 = orientation(q, q2, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(p, q, p2)) return true;
  if (o2 === 0 && onSeg(p, q2, p2)) return true;
  if (o3 === 0 && onSeg(q, p, q2)) return true;
  if (o4 === 0 && onSeg(q, p2, q2)) return true;
  return false;
}
function orientation(a, b, c){ const val = (b.y - a.y)*(c.x - b.x) - (b.x - a.x)*(c.y - b.y); if (Math.abs(val) < 1e-9) return 0; return val > 0 ? 1 : 2; }
function onSeg(a, b, c){ return Math.min(a.x,c.x) - 1e-9 <= b.x && b.x <= Math.max(a.x,c.x) + 1e-9 && Math.min(a.y,c.y) - 1e-9 <= b.y && b.y <= Math.max(a.y,c.y) + 1e-9; }

export function segmentCrossesPolygon(A, B, poly){
  const n = poly.length;
  for (let i=0;i<n;i++){
    const C = poly[i]; const D = poly[(i+1)%n]; if (segSegIntersect(A,B,C,D)) return true;
  }
  return false;
}

