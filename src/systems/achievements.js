// Achievement system for Flight Control game
// Creates progression goals and dopamine hits to increase engagement

export const ACHIEVEMENTS = {
  // Basic progression achievements
  first_route: {
    id: 'first_route',
    name: 'Cleared for Takeoff',
    description: 'Create your first flight route',
    icon: '🛫',
    type: 'milestone',
    condition: (stats) => stats.routesCreated >= 1,
    reward: { type: 'congratulation' }
  },

  first_delivery: {
    id: 'first_delivery',
    name: 'Successful Landing',
    description: 'Deliver your first passenger',
    icon: '✈️',
    type: 'milestone',
    condition: (stats) => stats.passengersDelivered >= 1,
    reward: { type: 'congratulation' }
  },

  hub_master: {
    id: 'hub_master',
    name: 'Hub Master',
    description: 'Connect 5 airports to a single hub',
    icon: '🌟',
    type: 'skill',
    condition: (stats, game) => {
      return game.stations.some(station =>
        station.connections && station.connections.length >= 5
      );
    },
    reward: { type: 'planes', amount: 1 }
  },

  // Score-based achievements
  score_rookie: {
    id: 'score_rookie',
    name: 'Air Traffic Rookie',
    description: 'Reach 100 points',
    icon: '🏅',
    type: 'score',
    condition: (stats) => stats.highScore >= 100,
    reward: { type: 'routes', amount: 1 }
  },

  score_controller: {
    id: 'score_controller',
    name: 'Air Traffic Controller',
    description: 'Reach 500 points',
    icon: '🏆',
    type: 'score',
    condition: (stats) => stats.highScore >= 500,
    reward: { type: 'planes', amount: 2 }
  },

  score_ace: {
    id: 'score_ace',
    name: 'Flight Control Ace',
    description: 'Reach 1000 points',
    icon: '👑',
    type: 'score',
    condition: (stats) => stats.highScore >= 1000,
    reward: { type: 'tunnels', amount: 2 }
  },

  // Efficiency achievements
  speed_demon: {
    id: 'speed_demon',
    name: 'Speed Demon',
    description: 'Deliver 10 passengers in under 30 seconds each',
    icon: '⚡',
    type: 'efficiency',
    condition: (stats) => stats.fastDeliveries >= 10,
    reward: { type: 'speed_boost' }
  },

  no_waste: {
    id: 'no_waste',
    name: 'Zero Waste',
    description: 'Complete Day 3 without any timeouts',
    icon: '💎',
    type: 'efficiency',
    condition: (stats) => stats.day >= 3 && stats.timeouts === 0,
    reward: { type: 'capacity_upgrade' }
  },

  // Creative achievements
  loop_master: {
    id: 'loop_master',
    name: 'Loop Master',
    description: 'Create a circular route with 6+ airports',
    icon: '🔄',
    type: 'creative',
    condition: (stats, game) => {
      return game.lines.some(line =>
        line.isLoop && line.stations.length >= 6
      );
    },
    reward: { type: 'planes', amount: 1 }
  },

  network_architect: {
    id: 'network_architect',
    name: 'Network Architect',
    description: 'Have 8 active routes simultaneously',
    icon: '🏗️',
    type: 'creative',
    condition: (stats, game) => game.lines.length >= 8,
    reward: { type: 'routes', amount: 2 }
  },

  // Survival achievements
  day_survivor: {
    id: 'day_survivor',
    name: 'Week Survivor',
    description: 'Survive until Day 7',
    icon: '🏃',
    type: 'survival',
    condition: (stats) => stats.maxDay >= 7,
    reward: { type: 'planes', amount: 2 }
  },

  marathon_runner: {
    id: 'marathon_runner',
    name: 'Marathon Runner',
    description: 'Survive until Day 14',
    icon: '🏃‍♂️',
    type: 'survival',
    condition: (stats) => stats.maxDay >= 14,
    reward: { type: 'mega_upgrade' }
  }
};

export class AchievementSystem {
  constructor(game) {
    this.game = game;
    this.stats = this.loadStats();
    this.unlockedAchievements = new Set(this.stats.achievements || []);
    this.pendingNotifications = [];
    this.sessionStats = {
      routesCreated: 0,
      passengersDelivered: 0,
      fastDeliveries: 0,
      timeouts: 0
    };
  }

  loadStats() {
    try {
      const saved = localStorage.getItem('flightcontrol_stats');
      return saved ? JSON.parse(saved) : {
        highScore: 0,
        totalScore: 0,
        gamesPlayed: 0,
        passengersDelivered: 0,
        routesCreated: 0,
        maxDay: 0,
        fastDeliveries: 0,
        timeouts: 0,
        achievements: []
      };
    } catch (e) {
      return {
        highScore: 0, totalScore: 0, gamesPlayed: 0,
        passengersDelivered: 0, routesCreated: 0, maxDay: 0,
        fastDeliveries: 0, timeouts: 0, achievements: []
      };
    }
  }

  saveStats() {
    try {
      this.stats.achievements = Array.from(this.unlockedAchievements);
      localStorage.setItem('flightcontrol_stats', JSON.stringify(this.stats));
    } catch (e) {
      console.warn('Could not save achievement stats');
    }
  }

  // Track game events
  onRouteCreated() {
    this.stats.routesCreated++;
    this.sessionStats.routesCreated++;
    this.checkAchievements();
  }

  onPassengerDelivered(deliveryTime) {
    this.stats.passengersDelivered++;
    this.sessionStats.passengersDelivered++;

    if (deliveryTime < 30000) { // Under 30 seconds
      this.stats.fastDeliveries++;
      this.sessionStats.fastDeliveries++;
    }

    this.checkAchievements();
  }

  onGameOver() {
    this.stats.gamesPlayed++;
    this.stats.totalScore += this.game.score;
    this.stats.highScore = Math.max(this.stats.highScore, this.game.score);
    this.stats.maxDay = Math.max(this.stats.maxDay, this.game.day);

    this.checkAchievements();
    this.saveStats();
  }

  onTimeout() {
    this.stats.timeouts++;
    this.sessionStats.timeouts++;
  }

  checkAchievements() {
    for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
      if (!this.unlockedAchievements.has(id)) {
        if (achievement.condition(this.stats, this.game)) {
          this.unlockAchievement(achievement);
        }
      }
    }
  }

  unlockAchievement(achievement) {
    this.unlockedAchievements.add(achievement.id);
    this.pendingNotifications.push(achievement);

    // Apply reward
    this.applyReward(achievement.reward);

    console.log(`🏆 Achievement Unlocked: ${achievement.name}`);

    // Show notification
    this.showAchievementNotification(achievement);

    this.saveStats();
  }

  applyReward(reward) {
    if (!reward || reward.type === 'congratulation') return;

    switch (reward.type) {
      case 'planes':
        this.game.trainsAvailable += (reward.amount || 1);
        break;
      case 'routes':
        this.game.linesAvailable += (reward.amount || 1);
        break;
      case 'tunnels':
        this.game.tunnels += (reward.amount || 1);
        break;
      case 'speed_boost':
        this.game.trains.forEach(train => train.speed *= 1.15);
        break;
      case 'capacity_upgrade':
        this.game.trains.forEach(train => train.capacity += 2);
        break;
      case 'mega_upgrade':
        this.game.trainsAvailable += 3;
        this.game.linesAvailable += 2;
        this.game.tunnels += 2;
        break;
    }

    if (this.game.updateHUD) {
      this.game.updateHUD();
    }
  }

  showAchievementNotification(achievement) {
    const notification = document.createElement('div');
    notification.className = 'achievement-notification';
    notification.innerHTML = `
      <div class="achievement-content">
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-text">
          <div class="achievement-title">Achievement Unlocked!</div>
          <div class="achievement-name">${achievement.name}</div>
          <div class="achievement-desc">${achievement.description}</div>
        </div>
      </div>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);

    // Remove after delay
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => document.body.removeChild(notification), 300);
    }, 4000);
  }

  getProgress() {
    return {
      total: Object.keys(ACHIEVEMENTS).length,
      unlocked: this.unlockedAchievements.size,
      percentage: Math.round((this.unlockedAchievements.size / Object.keys(ACHIEVEMENTS).length) * 100)
    };
  }

  getUnlockedAchievements() {
    return Array.from(this.unlockedAchievements).map(id => ACHIEVEMENTS[id]);
  }

  getNextAchievements() {
    return Object.values(ACHIEVEMENTS)
      .filter(achievement => !this.unlockedAchievements.has(achievement.id))
      .slice(0, 3); // Show next 3 goals
  }
}