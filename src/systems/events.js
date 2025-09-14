// Dynamic events system for Flight Control game
// Adds variety, challenge, and engagement through special scenarios

const EVENT_TYPES = {
  rush_hour: {
    name: 'Rush Hour',
    description: 'Increased passenger spawn rate for 30 seconds',
    icon: '🏃‍♂️',
    probability: 0.25,
    duration: 25000,
    minDay: 6,
    cooldown: 45000,
    effect: (game, event) => {
      // Increase passenger spawn rate only if network isn't already congested
      try {
        const waiting = game.stations.reduce((s, st) => s + ((st && st.queue) ? st.queue.length : 0), 0);
        if (waiting > 25) {
          if (game.showToast) game.showToast('Rush Hour deferred due to congestion');
          return; // Skip applying under heavy load
        }
      } catch(_) {}
      if (!event.originalSpawnRate) {
        event.originalSpawnRate = game.config.spawnInterval;
      }
      game.config.spawnInterval = Math.max(1500, event.originalSpawnRate * 0.7);
    },
    cleanup: (game, event) => {
      if (event.originalSpawnRate) {
        game.config.spawnInterval = event.originalSpawnRate;
      }
    }
  },

  vip_flight: {
    name: 'VIP Flight',
    description: 'High-value passenger worth 3x points arrives',
    icon: '⭐',
    probability: 0.4,
    duration: 0, // Instant event
    minDay: 1,
    cooldown: 20000,
    effect: (game, event) => {
      // Spawn a high-value passenger
      const finals = game.stations.filter(s => s.isFinal);
      if (finals.length === 0) return;

      const randomFinal = finals[Math.floor(Math.random() * finals.length)];
      const randomStart = game.stations[Math.floor(Math.random() * game.stations.length)];

      if (randomStart.id === randomFinal.id) return;

      const vipPassenger = {
        id: Math.random(),
        shape: randomFinal.shape,
        destStation: randomFinal.id,
        spawnTime: game.gameTime,
        isVIP: true,
        pointMultiplier: 3
      };

      randomStart.queue.push(vipPassenger);
      game.showToast(`VIP passenger to ${randomFinal.name} - Worth 3x points!`);
    }
  },

  equipment_failure: {
    name: 'Equipment Failure',
    description: 'One random plane temporarily slowed',
    icon: '⚠️',
    probability: 0.2,
    duration: 15000,
    minDay: 6,
    cooldown: 60000,
    effect: (game, event) => {
      if (game.trains.length === 0) return;

      const randomTrain = game.trains[Math.floor(Math.random() * game.trains.length)];
      event.affectedTrain = randomTrain.id;
      event.originalSpeed = randomTrain.speed;
      randomTrain.speed = randomTrain.speed * 0.6;

      game.showToast(`Equipment failure on route - plane slowed`);
    },
    cleanup: (game, event) => {
      const train = game.trains.find(t => t.id === event.affectedTrain);
      if (train && event.originalSpeed) {
        train.speed = event.originalSpeed;
      }
    }
  },

  weather_clear: {
    name: 'Weather Clear',
    description: 'All weather cells temporarily disappear',
    icon: '☀️',
    probability: 0.3,
    duration: 20000,
    minDay: 2,
    cooldown: 40000,
    effect: (game, event) => {
      event.wasWeatherEnabled = weather.enabled;
      weather.enabled = false;
      game.showToast('Weather cleared - perfect flying conditions!');
    },
    cleanup: (game, event) => {
      if (event.wasWeatherEnabled) {
        weather.enabled = true;
      }
    }
  },

  bonus_routes: {
    name: 'Infrastructure Grant',
    description: 'Temporary extra route available',
    icon: '🛤️',
    probability: 0.25,
    duration: 45000,
    minDay: 4,
    cooldown: 80000,
    effect: (game, event) => {
      game.linesAvailable += 1;
      game.showToast('Infrastructure grant - extra route available!');
      if (game.updateHUD) game.updateHUD();
    },
    cleanup: (game, event) => {
      // Don't remove if player hasn't used it
      if (game.linesAvailable > 0) {
        game.linesAvailable -= 1;
        if (game.updateHUD) game.updateHUD();
      }
    }
  }
};

export class EventSystem {
  constructor(game) {
    this.game = game;
    this.activeEvents = [];
    this.eventHistory = [];
    this.lastEventTime = 0;
    this.cooldowns = {};
  }

  update(currentTime) {
    // Update active events
    this.activeEvents = this.activeEvents.filter(event => {
      if (currentTime >= event.endTime) {
        // Event ended, cleanup
        if (EVENT_TYPES[event.type].cleanup) {
          EVENT_TYPES[event.type].cleanup(this.game, event);
        }
        if (this.game.debugLogs) console.log(`Event ended: ${event.name}`);
        return false;
      }
      return true;
    });

    // Consider spawning new events (not too frequently)
    if (currentTime - this.lastEventTime > 15000) { // Min 15 seconds between events
      this.considerSpawningEvent(currentTime);
    }
  }

  considerSpawningEvent(currentTime) {
    // Don't spawn events too early or when game is paused
    if (this.game.day < 2 || this.game.paused || this.game.gameOver) return;

    // Don't spawn if we already have 2 active events
    if (this.activeEvents.length >= 2) return;

    // Check each event type
    for (const [eventType, eventData] of Object.entries(EVENT_TYPES)) {
      // Check cooldown
      if (this.cooldowns[eventType] && currentTime < this.cooldowns[eventType]) {
        continue;
      }

      // Check minimum day requirement
      if (this.game.day < eventData.minDay) {
        continue;
      }

      // Don't spawn if already active
      if (this.activeEvents.some(e => e.type === eventType)) {
        continue;
      }

      // Random chance (affected by day - more events later)
      const dayMultiplier = Math.min(2, 1 + (this.game.day - 1) * 0.1);
      const chance = eventData.probability * dayMultiplier;

      if (Math.random() < chance) {
        this.spawnEvent(eventType, currentTime);
        break; // Only spawn one event at a time
      }
    }
  }

  spawnEvent(eventType, currentTime) {
    const eventData = EVENT_TYPES[eventType];
    if (!eventData) return;

    const event = {
      type: eventType,
      name: eventData.name,
      description: eventData.description,
      icon: eventData.icon,
      startTime: currentTime,
      endTime: currentTime + eventData.duration,
      ...eventData // Copy additional properties
    };

    this.activeEvents.push(event);
    this.eventHistory.push({ ...event });
    this.lastEventTime = currentTime;
    this.cooldowns[eventType] = currentTime + eventData.cooldown;

    // Apply event effect
    if (eventData.effect) {
      eventData.effect(this.game, event);
    }

    // Show notification
    this.showEventNotification(event);

    if (this.game.debugLogs) console.log(`Event spawned: ${event.name}`);
  }

  showEventNotification(event) {
    // Create a special event notification
    const notification = document.createElement('div');
    notification.className = 'event-notification';
    notification.innerHTML = `
      <div class="event-content">
        <div class="event-icon">${event.icon}</div>
        <div class="event-text">
          <div class="event-title">Special Event</div>
          <div class="event-name">${event.name}</div>
          <div class="event-desc">${event.description}</div>
        </div>
      </div>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);

    // Remove after delay
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        if (notification.parentNode) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 5000);
  }

  getActiveEvents() {
    return this.activeEvents;
  }

  forceEvent(eventType) {
    // Debug function to force spawn an event
    this.spawnEvent(eventType, this.game.gameTime);
  }
}

// Weather reference will be passed when needed
let weather = null;

export function setWeatherReference(weatherRef) {
  weather = weatherRef;
}
