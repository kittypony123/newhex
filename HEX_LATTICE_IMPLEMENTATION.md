# Hexagonal Lattice Implementation Guide for Flight Control Game

## Overview
This guide provides comprehensive instructions for transforming your current octilinear (45-degree) routing system into a true hexagonal lattice system with 60-degree angles, A* pathfinding, corridor bundling, and rounded turn rendering.

## Current System Analysis
Your game currently uses:
- **Octilinear routing**: 45-degree angle snapping in `hexgrid.js`
- **Station-to-station direct paths**: Simple two-leg routing
- **Manual line creation**: User draws routes between airports
- **Auto-routing assistance**: Complexity-based automatic route creation

## Target System Features
Based on the hexagonal examples in your PNG files:
1. **True hexagonal grid**: All routes follow 60-degree angles
2. **A* pathfinding**: Intelligent route selection through hex lattice
3. **Corridor bundling**: Parallel routes share airways with visual separation
4. **Terminal bubbles**: Hub airports have 30-degree approach patterns
5. **Rounded corners**: Smooth turns at waypoints with constant radius

## Implementation Steps

### Phase 1: Hexagonal Grid Foundation

#### 1.1 Update `src/systems/hexgrid.js`
Replace the current octilinear system with true hexagonal mathematics:

```javascript
// New hexagonal constants
const HEX_ANGLES = [0, 60, 120, 180, 240, 300].map(deg => deg * Math.PI / 180);
const HEX_SIZE = 44; // Matches your current config.hexGrid.size

// Hexagonal coordinate conversions
export function cubeToPixel(q, r, s) {
  const x = HEX_SIZE * (3/2 * q);
  const y = HEX_SIZE * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
  return {x, y};
}

export function pixelToCube(x, y) {
  const q = (2/3 * x) / HEX_SIZE;
  const r = (-1/3 * x + Math.sqrt(3)/3 * y) / HEX_SIZE;
  const s = -q - r;
  return roundCube(q, r, s);
}

export function roundCube(q, r, s) {
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  
  const q_diff = Math.abs(rq - q);
  const r_diff = Math.abs(rr - r);
  const s_diff = Math.abs(rs - s);
  
  if (q_diff > r_diff && q_diff > s_diff) {
    rq = -rr - rs;
  } else if (r_diff > s_diff) {
    rr = -rq - rs;
  } else {
    rs = -rq - rr;
  }
  
  return {q: rq, r: rr, s: rs};
}

// Snap world coordinates to nearest hex vertex
export function snapToHexVertex(worldX, worldY) {
  const cube = pixelToCube(worldX, worldY);
  return cubeToPixel(cube.q, cube.r, cube.s);
}

// Get six neighboring hex vertices
export function getHexNeighbors(cube) {
  const directions = [
    {q: 1, r: -1, s: 0},  // 0°
    {q: 1, r: 0, s: -1},   // 60°
    {q: 0, r: 1, s: -1},   // 120°
    {q: -1, r: 1, s: 0},  // 180°
    {q: -1, r: 0, s: 1},  // 240°
    {q: 0, r: -1, s: 1}   // 300°
  ];
  
  return directions.map(dir => ({
    q: cube.q + dir.q,
    r: cube.r + dir.r,
    s: cube.s + dir.s
  }));
}
```

#### 1.2 Implement A* Pathfinding
Add hexagonal A* pathfinding to find optimal routes:

```javascript
export function hexAStar(startWorld, endWorld, game) {
  // Convert world coordinates to cube coordinates
  const startCube = pixelToCube(startWorld.x, startWorld.y);
  const endCube = pixelToCube(endWorld.x, endWorld.y);
  
  const openSet = [startCube];
  const cameFrom = new Map();
  const gScore = new Map();
  const fScore = new Map();
  
  const hash = (cube) => `${cube.q},${cube.r},${cube.s}`;
  
  gScore.set(hash(startCube), 0);
  fScore.set(hash(startCube), hexDistance(startCube, endCube));
  
  // Track edge usage for bundling
  const edgeUsage = calculateEdgeUsage(game);
  
  while (openSet.length > 0) {
    // Get node with lowest fScore
    let current = openSet.reduce((min, node) => 
      (fScore.get(hash(node)) || Infinity) < (fScore.get(hash(min)) || Infinity) ? node : min
    );
    
    if (hexDistance(current, endCube) < 1) {
      // Reconstruct path
      return reconstructPath(cameFrom, current);
    }
    
    // Remove current from openSet
    openSet.splice(openSet.findIndex(n => hash(n) === hash(current)), 1);
    
    // Check all neighbors
    for (const neighbor of getHexNeighbors(current)) {
      const neighborHash = hash(neighbor);
      
      // Calculate edge cost with bundling incentive
      const edgeKey = `${hash(current)}-${neighborHash}`;
      const usage = edgeUsage.get(edgeKey) || 0;
      const bundlingBonus = Math.max(0.3, 1 - 0.4 * Math.min(usage, 3));
      const baseCost = 1.0;
      const edgeCost = baseCost * bundlingBonus;
      
      const tentativeG = (gScore.get(hash(current)) || Infinity) + edgeCost;
      
      if (tentativeG < (gScore.get(neighborHash) || Infinity)) {
        cameFrom.set(neighborHash, current);
        gScore.set(neighborHash, tentativeG);
        fScore.set(neighborHash, tentativeG + hexDistance(neighbor, endCube));
        
        if (!openSet.some(n => hash(n) === neighborHash)) {
          openSet.push(neighbor);
        }
      }
    }
  }
  
  // No path found - return direct connection
  return [startCube, endCube];
}

function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
}

function reconstructPath(cameFrom, current) {
  const path = [current];
  let key = hash(current);
  
  while (cameFrom.has(key)) {
    current = cameFrom.get(key);
    path.unshift(current);
    key = hash(current);
  }
  
  // Convert cube coordinates back to world coordinates
  return path.map(cube => cubeToPixel(cube.q, cube.r, cube.s));
}
```

### Phase 2: Corridor Bundling System

#### 2.1 Track Edge Usage
Add to `src/systems/hexgrid.js`:

```javascript
export function calculateEdgeUsage(game) {
  const usage = new Map();
  
  for (const line of game.lines) {
    if (!line.waypoints || line.waypoints.length < 2) continue;
    
    for (let i = 0; i < line.waypoints.length - 1; i++) {
      const a = pixelToCube(line.waypoints[i].x, line.waypoints[i].y);
      const b = pixelToCube(line.waypoints[i + 1].x, line.waypoints[i + 1].y);
      
      const edgeKey = `${hash(a)}-${hash(b)}`;
      const reverseKey = `${hash(b)}-${hash(a)}`;
      
      usage.set(edgeKey, (usage.get(edgeKey) || 0) + 1);
      usage.set(reverseKey, (usage.get(reverseKey) || 0) + 1);
    }
  }
  
  return usage;
}

export function applyCorridorBundling(path, existingLines, lineDirection) {
  const BUNDLE_DISTANCE = 15; // Pixels offset for parallel routes
  const bundledPath = [];
  
  for (let i = 0; i < path.length - 1; i++) {
    const segment = {
      start: path[i],
      end: path[i + 1]
    };
    
    // Find parallel segments in existing lines
    const parallels = findParallelSegments(segment, existingLines);
    
    if (parallels.length > 0) {
      // Calculate offset for this route
      const offset = calculateBundleOffset(segment, parallels, lineDirection);
      
      // Apply perpendicular offset to segment
      const angle = Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x);
      const perpAngle = angle + Math.PI / 2;
      
      bundledPath.push({
        x: segment.start.x + Math.cos(perpAngle) * offset,
        y: segment.start.y + Math.sin(perpAngle) * offset
      });
      
      if (i === path.length - 2) {
        bundledPath.push({
          x: segment.end.x + Math.cos(perpAngle) * offset,
          y: segment.end.y + Math.sin(perpAngle) * offset
        });
      }
    } else {
      bundledPath.push(segment.start);
      if (i === path.length - 2) {
        bundledPath.push(segment.end);
      }
    }
  }
  
  return bundledPath;
}
```

### Phase 3: Terminal Bubble Pattern

#### 3.1 Hub Approach System
Add to `src/systems/hexgrid.js`:

```javascript
export function createTerminalBubble(hubStation, approachingStations, game) {
  const BUBBLE_RADIUS = HEX_SIZE * 2;
  const routes = [];
  
  for (const station of approachingStations) {
    // Calculate direct angle to hub
    const directAngle = Math.atan2(
      hubStation.y - station.y,
      hubStation.x - station.x
    );
    
    // Snap to nearest 30-degree increment for terminal approach
    const snappedAngle = Math.round(directAngle / (Math.PI / 6)) * (Math.PI / 6);
    
    // Create bubble entry point
    const bubbleEntry = {
      x: hubStation.x - Math.cos(snappedAngle) * BUBBLE_RADIUS,
      y: hubStation.y - Math.sin(snappedAngle) * BUBBLE_RADIUS
    };
    
    // Route from station to bubble entry via hex grid
    const pathToBubble = hexAStar(station, bubbleEntry, game);
    
    // Add final approach segment
    pathToBubble.push(hubStation);
    
    routes.push({
      station: station.id,
      path: pathToBubble,
      approachAngle: snappedAngle
    });
  }
  
  return routes;
}
```

### Phase 4: Update Line Creation System

#### 4.1 Modify `src/systems/lines_final.js`
Update the `createHexPath` usage:

```javascript
import { hexAStar, applyCorridorBundling, snapToHexVertex } from './hexgrid.js';

export function rebuildWaypointsForLine(game, line) {
  if (!line || !line.stations || line.stations.length < 2) {
    line.waypoints = null;
    return;
  }
  
  const waypoints = [];
  
  for (let i = 0; i < line.stations.length - 1; i++) {
    const stationA = game.stations[line.stations[i]];
    const stationB = game.stations[line.stations[i + 1]];
    
    if (!stationA || !stationB) continue;
    
    // Snap stations to nearest hex vertices for routing
    const startSnapped = snapToHexVertex(stationA.x, stationA.y);
    const endSnapped = snapToHexVertex(stationB.x, stationB.y);
    
    // Use A* to find hex path
    let hexPath = hexAStar(startSnapped, endSnapped, game);
    
    // Apply corridor bundling
    hexPath = applyCorridorBundling(hexPath, game.lines, line.id);
    
    // Add station connectors (short segments from actual station to hex grid)
    if (i === 0) {
      waypoints.push(stationA); // Start from actual station position
    }
    
    waypoints.push(...hexPath);
    waypoints.push(stationB); // End at actual station position
  }
  
  // Remove duplicate points
  line.waypoints = deduplicateWaypoints(waypoints);
}

function deduplicateWaypoints(waypoints) {
  const result = [];
  for (const wp of waypoints) {
    const last = result[result.length - 1];
    if (!last || Math.hypot(wp.x - last.x, wp.y - last.y) > 1) {
      result.push(wp);
    }
  }
  return result;
}
```

### Phase 5: Rendering Updates

#### 5.1 Update `src/render/lines_final.js`
Add rounded corner rendering:

```javascript
export function drawLineWithRoundedCorners(ctx, waypoints, radius = 20) {
  if (waypoints.length < 2) return;
  
  ctx.beginPath();
  
  // Start from first point
  ctx.moveTo(waypoints[0].x, waypoints[0].y);
  
  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];
    
    // Calculate vectors
    const v1 = {
      x: curr.x - prev.x,
      y: curr.y - prev.y
    };
    const v2 = {
      x: next.x - curr.x,
      y: next.y - curr.y
    };
    
    // Normalize vectors
    const len1 = Math.hypot(v1.x, v1.y);
    const len2 = Math.hypot(v2.x, v2.y);
    
    if (len1 > 0 && len2 > 0) {
      v1.x /= len1;
      v1.y /= len1;
      v2.x /= len2;
      v2.y /= len2;
      
      // Calculate angle between vectors
      const angle = Math.acos(v1.x * v2.x + v1.y * v2.y);
      
      // Only round if angle is significant (not nearly straight)
      if (angle > 0.1 && angle < Math.PI - 0.1) {
        // Calculate corner points
        const cornerRadius = Math.min(radius, len1 / 2, len2 / 2);
        
        const p1 = {
          x: curr.x - v1.x * cornerRadius,
          y: curr.y - v1.y * cornerRadius
        };
        
        const p2 = {
          x: curr.x + v2.x * cornerRadius,
          y: curr.y + v2.y * cornerRadius
        };
        
        // Draw line to corner start
        ctx.lineTo(p1.x, p1.y);
        
        // Draw rounded corner
        ctx.quadraticCurveTo(curr.x, curr.y, p2.x, p2.y);
      } else {
        // Sharp corner or nearly straight - just draw to point
        ctx.lineTo(curr.x, curr.y);
      }
    } else {
      ctx.lineTo(curr.x, curr.y);
    }
  }
  
  // Draw to last point
  if (waypoints.length > 1) {
    const last = waypoints[waypoints.length - 1];
    ctx.lineTo(last.x, last.y);
  }
  
  ctx.stroke();
}

// Update drawMultiStationLine to use rounded corners
export function drawMultiStationLine(ctx, camera, game, line, overlapMap) {
  // ... existing setup code ...
  
  if (line.waypoints && line.waypoints.length >= 2) {
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.scale, camera.scale);
    
    // Set line style
    ctx.strokeStyle = line.color;
    ctx.lineWidth = game.config.lineInnerWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw with rounded corners
    drawLineWithRoundedCorners(ctx, line.waypoints, game.config.lineCornerRadius);
    
    ctx.restore();
  }
}
```

#### 5.2 Add Hex Grid Visualization
Update `src/render/draw.js`:

```javascript
export function drawHexGrid(ctx, camera, config) {
  if (!config.hexGrid.showGrid) return;
  
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.scale, camera.scale);
  
  const hexSize = config.hexGrid.size;
  const bounds = getViewportHexBounds(camera, hexSize);
  
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.06)';
  ctx.lineWidth = 1 / camera.scale;
  
  for (let q = bounds.minQ; q <= bounds.maxQ; q++) {
    for (let r = bounds.minR; r <= bounds.maxR; r++) {
      const center = cubeToPixel(q, r, -q - r);
      drawHexagon(ctx, center.x, center.y, hexSize);
    }
  }
  
  ctx.restore();
}

function drawHexagon(ctx, x, y, size) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const px = x + size * Math.cos(angle);
    const py = y + size * Math.sin(angle);
    
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.stroke();
}

function getViewportHexBounds(camera, hexSize) {
  // Calculate visible hex grid bounds based on camera
  const viewWidth = camera.canvas.width / camera.scale;
  const viewHeight = camera.canvas.height / camera.scale;
  
  const topLeft = {
    x: -camera.x / camera.scale - viewWidth / 2,
    y: -camera.y / camera.scale - viewHeight / 2
  };
  
  const bottomRight = {
    x: topLeft.x + viewWidth,
    y: topLeft.y + viewHeight
  };
  
  // Convert to cube coordinates
  const tlCube = pixelToCube(topLeft.x, topLeft.y);
  const brCube = pixelToCube(bottomRight.x, bottomRight.y);
  
  return {
    minQ: tlCube.q - 2,
    maxQ: brCube.q + 2,
    minR: tlCube.r - 2,
    maxR: brCube.r + 2
  };
}
```

### Phase 6: Auto-Routing Integration

#### 6.1 Update `src/systems/auto_routing.js`
Modify the auto-routing to use hex pathfinding:

```javascript
// In createAutoLine method
createAutoLine(stationIds, reason) {
  try {
    const Lines = window.Lines;
    if (Lines && Lines.createLine && this.game.linesAvailable > 0) {
      // Create line with proper hex routing
      const line = Lines.createLine(this.game, stationIds);
      
      if (line) {
        // Ensure waypoints use hex pathfinding
        Lines.rebuildWaypointsForLine(this.game, line);
        
        // ... rest of existing code ...
      }
    }
  } catch (error) {
    console.warn('Auto-routing line creation failed:', error);
  }
  return false;
}
```

### Phase 7: Configuration Updates

#### 7.1 Update `src/maps/airspace.js`
Add hexagonal-specific configuration:

```javascript
export const AIRSPACE_CONFIG = {
  // ... existing config ...
  
  hexGrid: {
    size: 44,
    snapRadius: 60,
    showGrid: false, // Set to true for debugging
    enabled: true,
    
    // Hexagonal routing parameters
    bundleThreshold: 30,     // Distance to consider routes parallel
    corridorSpacing: 15,      // Offset between parallel routes
    terminalBubbleRadius: 88, // 2x hex size for hub approaches
    
    // Pathfinding weights
    bundlingBonus: 0.4,       // Cost reduction for shared corridors
    hubApproachAngles: 12,    // Number of approach angles (30° each)
    
    // Rendering
    cornerRadius: 20,         // Radius for rounded turns
    gridOpacity: 0.06,        // Hex grid visibility
    gridColor: '#3b82f6'      // Grid color (blue)
  },
  
  // ... rest of config ...
};
```

### Phase 8: Testing & Debugging

#### 8.1 Add Debug Visualizations
Create `src/utils/hex_debug.js`:

```javascript
export function drawHexDebugInfo(ctx, camera, game) {
  if (!game.debugHexGrid) return;
  
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.scale, camera.scale);
  
  // Draw hex vertices as dots
  const bounds = getViewportHexBounds(camera, game.config.hexGrid.size);
  
  for (let q = bounds.minQ; q <= bounds.maxQ; q++) {
    for (let r = bounds.minR; r <= bounds.maxR; r++) {
      const pos = cubeToPixel(q, r, -q - r);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3 / camera.scale, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw cube coordinates
      if (camera.scale > 1.5) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = `${8 / camera.scale}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`${q},${r}`, pos.x, pos.y - 5 / camera.scale);
      }
    }
  }
  
  // Highlight edge usage
  const edgeUsage = calculateEdgeUsage(game);
  
  for (const [edgeKey, usage] of edgeUsage) {
    if (usage > 1) {
      // Parse edge key
      const [fromHash, toHash] = edgeKey.split('-');
      const [fq, fr] = fromHash.split(',').map(Number);
      const [tq, tr] = toHash.split(',').map(Number);
      
      const from = cubeToPixel(fq, fr, -fq - fr);
      const to = cubeToPixel(tq, tr, -tq - tr);
      
      // Draw thicker line for bundled corridors
      ctx.strokeStyle = `rgba(255, 200, 0, ${0.2 * usage})`;
      ctx.lineWidth = (2 + usage * 2) / camera.scale;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }
  
  ctx.restore();
}

// Add to main render loop
if (game.debugHexGrid) {
  drawHexDebugInfo(ctx, game.camera, game);
}
```

### Phase 9: Input System Updates

#### 9.1 Update `src/ui/input_final.js`
Modify preview to show hex-snapped paths:

```javascript
canvas.addEventListener('pointermove', (ev) => {
  // ... existing code ...
  
  if (dragStartStation != null) {
    const start = game.stations[dragStartStation];
    const endIdx = game.hoveredStationIdx;
    const end = (endIdx !== -1 ? game.stations[endIdx] : world);
    
    // Snap to hex grid for preview
    const startSnapped = snapToHexVertex(start.x, start.y);
    const endSnapped = snapToHexVertex(end.x, end.y);
    
    // Use hex pathfinding for preview
    const hexPath = hexAStar(startSnapped, endSnapped, game);
    
    // Add station connectors
    const previewPath = [start, ...hexPath];
    if (endIdx !== -1) {
      previewPath.push(game.stations[endIdx]);
    } else {
      previewPath.push(end);
    }
    
    onPreview({
      points: previewPath,
      valid: true,
      snapStation: endIdx,
      isHexSnapped: true
    });
  }
  
  // ... rest of existing code ...
});
```

### Phase 10: Performance Optimization

#### 10.1 Cache Hex Calculations
Add to `src/systems/hexgrid.js`:

```javascript
// Create a cache for frequently used hex calculations
const hexCache = new Map();
const CACHE_SIZE = 1000;

export function getCachedHexPath(start, end, game) {
  const cacheKey = `${start.x},${start.y}-${end.x},${end.y}`;
  
  if (hexCache.has(cacheKey)) {
    return hexCache.get(cacheKey);
  }
  
  const path = hexAStar(start, end, game);
  
  // Limit cache size
  if (hexCache.size >= CACHE_SIZE) {
    const firstKey = hexCache.keys().next().value;
    hexCache.delete(firstKey);
  }
  
  hexCache.set(cacheKey, path);
  return path;
}

// Clear cache when lines change
export function clearHexCache() {
  hexCache.clear();
}
```

## Implementation Checklist

- [ ] Phase 1: Replace octilinear with hexagonal grid math
- [ ] Phase 2: Implement A* pathfinding through hex lattice
- [ ] Phase 3: Add corridor bundling for parallel routes
- [ ] Phase 4: Implement terminal bubble patterns for hubs
- [ ] Phase 5: Update line creation to use hex routing
- [ ] Phase 6: Add rounded corner rendering
- [ ] Phase 7: Integrate with auto-routing system
- [ ] Phase 8: Update configuration parameters
- [ ] Phase 9: Add debug visualizations
- [ ] Phase 10: Optimize performance with caching

## Testing Strategy

1. **Unit Tests**: Test hex coordinate conversions and pathfinding
2. **Visual Tests**: Enable debug grid to verify correct routing
3. **Performance Tests**: Monitor frame rate with complex networks
4. **User Tests**: Ensure intuitive interaction with hex snapping

## Rollback Plan

Keep the original `hexgrid.js` as `hexgrid_octilinear.js` for easy rollback if needed.

## Notes for AI Agent Implementation

1. Start with Phase 1 to establish the mathematical foundation
2. Test each phase independently before moving to the next
3. Use the debug visualizations to verify correct behavior
4. The existing auto-routing system should work with minimal changes
5. Performance is critical - use caching where possible
6. Maintain backward compatibility with saved games if possible

## Expected Outcomes

- Routes will follow clean 60-degree angles
- Parallel routes will automatically bundle into corridors
- Hub airports will have organized approach patterns
- Visual clarity will improve with fewer crossing angles
- Network efficiency will increase through intelligent routing
