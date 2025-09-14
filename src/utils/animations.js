// Animation utilities for smooth transitions and effects

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function lerp(start, end, t) {
  return start + (end - start) * t;
}

export function createAnimation(duration, easingFn = easeOutCubic) {
  return {
    duration,
    easingFn,
    startTime: null,
    isComplete: false,

    update(currentTime) {
      if (this.startTime === null) {
        this.startTime = currentTime;
      }

      const elapsed = currentTime - this.startTime;
      const progress = Math.min(elapsed / this.duration, 1);

      if (progress >= 1) {
        this.isComplete = true;
        return 1;
      }

      return this.easingFn(progress);
    },

    reset() {
      this.startTime = null;
      this.isComplete = false;
    }
  };
}

export function createStationSpawnAnimation(station, duration = 600, targetRadius = null) {
  const animation = createAnimation(duration, easeOutBack);
  // If station.r is 0 (newly spawned), grow to targetRadius; otherwise, grow from current r
  const finalRadius = targetRadius != null ? targetRadius : (station.r || 12);

  return {
    ...animation,
    finalRadius,

    apply(progress) {
      station.r = finalRadius * progress;
      station.opacity = progress;
      station.glowIntensity = progress * 0.5;
    }
  };
}

export function createScorePopupAnimation(popup, duration = 1000) {
  const animation = createAnimation(duration, easeOutCubic);
  const startY = popup.y;

  return {
    ...animation,
    startY,

    apply(progress) {
      popup.y = startY - (40 * progress);
      popup.scale = 1 + (0.2 * progress);
      popup.opacity = 1 - progress;
    }
  };
}

export function createLineDrawAnimation(line, duration = 400) {
  const animation = createAnimation(duration, easeOutCubic);

  return {
    ...animation,

    apply(progress) {
      line.drawProgress = progress;
      line.opacity = 0.7 + (0.3 * progress);
    }
  };
}

export function createTrainSpawnAnimation(train, duration = 500) {
  const animation = createAnimation(duration, easeOutBack);
  const originalScale = 1;

  return {
    ...animation,
    originalScale,

    apply(progress) {
      train.scale = originalScale * progress;
      train.opacity = progress;
    }
  };
}
