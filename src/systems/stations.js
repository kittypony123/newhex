import { dist } from '../utils/geom.js';

export function createDefaultStations() {
  // 5 simple stations with shapes, loosely based on London map positions
  const R = 18;
  const stations = [
    { id: 0, name: "King's Cross", x: 0,   y: -100, r: R, shape:'circle' },
    { id: 1, name: 'Oxford Circus', x: -90, y: -40,  r: R, shape:'triangle' },
    { id: 2, name: 'Paddington', x: -160, y: -10, r: R, shape:'square' },
    { id: 3, name: 'Liverpool St', x: 120, y: -80, r: R, shape:'square' },
    { id: 4, name: 'Waterloo', x: -10, y: 120, r: R, shape:'circle' }
  ];
  return stations;
}

export function stationAtPoint(stations, wx, wy, extra = 20) {
  for (let i = 0; i < stations.length; i++){
    const s = stations[i];
    if (dist(wx, wy, s.x, s.y) <= s.r + extra) return i;
  }
  return -1;
}

