export function initHUD(game){
  const dayLabelEl = document.getElementById('dayLabel');
  const clockEl = document.getElementById('dayClock');
  const btnPause = document.getElementById('btnPause');
  const btnPlay = document.getElementById('btnPlay');
  const btnFast = document.getElementById('btnFast');
  const invTrains = document.getElementById('invTrains');
  const invTunnels = document.getElementById('invTunnels');
  const invCarriages = document.getElementById('invCarriages');
  const swatchRow = document.getElementById('lineSwatches');

  function setTimeScale(scale){ const clamped=Math.max(0,Math.min(4,scale||0)); game.timeScale = clamped; game.paused = clamped===0; updateHUD(); }
  if (btnPause) btnPause.addEventListener('click', () => setTimeScale(0));
  if (btnPlay) btnPlay.addEventListener('click', () => setTimeScale(1));
  if (btnFast) btnFast.addEventListener('click', () => setTimeScale(2));

  function renderSwatches(){
    if (!swatchRow) return;
    swatchRow.innerHTML='';

    const total = game.config.lineColors.length;

    for (let i = 0; i < total; i++) {
      const el = document.createElement('span');
      el.className = 'swatch';
      el.style.backgroundColor = game.config.lineColors[i];
      el.title = `Color ${i + 1} - Click to select`;

      // FIXED: Clean selected state using CSS class
      if (game.selectedLineColorIndex === i) {
        el.classList.add('selected');
      }

      // SIMPLE CLICK: Just select the color
      el.addEventListener('click', () => {
        game.selectedLineColorIndex = i;
        updateHUD();
      });

      swatchRow.appendChild(el);
    }
  }

  function recolorLine(game, lineId, newIdx){ const line=game.lines.find(l=>l && l.id===lineId); if (!line || newIdx==null) return; if (line.colorIndex===newIdx) return; const other=game.lines.find(l=>l && l.colorIndex===newIdx); if (other){ const t=other.colorIndex; other.colorIndex=line.colorIndex; line.colorIndex=t; } else { line.colorIndex=newIdx; } }

  function updateHUD(){
    const DAYS=['MON','TUE','WED','THU','FRI','SAT','SUN']; dayLabelEl.textContent = DAYS[(game.day-1)%7]; const deg = Math.floor((game.weekProgress||0)*360); clockEl.style.background = `conic-gradient(#ffd166 0deg ${deg}deg, rgba(255,255,255,0.12) ${deg}deg 360deg)`;
    if (btnPause) btnPause.classList.toggle('active', game.paused || game.timeScale===0);
    if (btnPlay) btnPlay.classList.toggle('active', !game.paused && game.timeScale===1);
    if (btnFast) btnFast.classList.toggle('active', !game.paused && game.timeScale>1);
    if (invTrains) invTrains.textContent = game.trainsAvailable; if (invTunnels) invTunnels.textContent = game.tunnels||0; if (invCarriages) invCarriages.textContent = game.carriages||0;

    // Update achievement progress
    if (game.achievements) {
      const progress = game.achievements.getProgress();
      const countEl = document.getElementById('achievementCount');
      const barEl = document.getElementById('achievementBar');
      if (countEl) countEl.textContent = `${progress.unlocked}/${progress.total}`;
      if (barEl) barEl.style.width = `${progress.percentage}%`;
    }

    // Update complexity indicator
    if (game.autoRouting) {
      const complexity = game.autoRouting.getComplexityInfo();
      const levelEl = document.getElementById('complexityLevel');
      const barEl = document.getElementById('complexityBar');
      const iconEl = document.getElementById('complexityIcon');

      if (levelEl) {
        levelEl.textContent = complexity.level.toUpperCase();
        // Color coding based on complexity level
        switch (complexity.level) {
          case 'low':
            levelEl.style.color = '#10b981';
            break;
          case 'medium':
            levelEl.style.color = '#f59e0b';
            break;
          case 'high':
            levelEl.style.color = '#ef4444';
            break;
          case 'extreme':
            levelEl.style.color = '#dc2626';
            break;
        }
      }

      if (barEl) {
        const percentage = Math.min(100, (complexity.score / 30) * 100);
        barEl.style.width = `${percentage}%`;
      }

      if (iconEl) {
        iconEl.textContent = complexity.enabled ? '🤖' : '🧠';
      }

      // Update auto-routing button
      const autoBtn = document.getElementById('btnAutoRoute');
      if (autoBtn) {
        autoBtn.style.opacity = complexity.enabled ? '1' : '0.6';
        autoBtn.title = complexity.enabled ?
          'Auto-Routing ON (A) - Click to disable' :
          'Auto-Routing OFF (A) - Click to enable';
      }

      // Update suggestions panel
      updateSuggestionsPanel(game.autoRouting);
    }

    // UPDATE FINAL DESTINATION ANALYTICS in day badge
    updateFinalDestinationDisplay();

    // Auto-select next available color if none is selected
    autoSelectNextColor();
    renderSwatches();
  }

  function updateFinalDestinationDisplay(){
    const dayBadge = document.getElementById('dayBadge');
    if (!dayBadge) return;

    const finals = game.finalDeliveries || 0;
    const avgTime = finals > 0 ? Math.round((game.totalFinalDeliveryTime || 0) / finals / 1000) : 0;
    const efficiency = finals > 0 ? Math.min(100, Math.round((finals / Math.max(1, game.totalPassengers)) * 100)) : 0;

    // Add analytics tooltip with engaging metrics
    dayBadge.title = `🎯 Finals Delivered: ${finals}\n⚡ Avg Time: ${avgTime}s\n📊 Efficiency: ${efficiency}%\n🏆 Total Score: ${game.score}`;

    // Visual feedback for efficiency
    const dayLabel = dayBadge.querySelector('#dayLabel');
    if (dayLabel) {
      if (efficiency >= 80) dayLabel.style.color = '#10b981'; // Great
      else if (efficiency >= 60) dayLabel.style.color = '#f59e0b'; // Good
      else if (efficiency >= 40) dayLabel.style.color = '#ef4444'; // Poor
      else dayLabel.style.color = '#e5e7eb'; // Default
    }
  }

  function autoSelectNextColor(){
    // SIMPLIFIED: Always auto-select color 0 at start
    if (game.selectedLineColorIndex === null && game.lines.length === 0) {
      game.selectedLineColorIndex = 0;
    }
  }

  function updateSuggestionsPanel(autoRouting) {
    const panel = document.getElementById('suggestionsPanel');
    const list = document.getElementById('suggestionsList');

    if (!panel || !list || !autoRouting) return;

    const suggestions = autoRouting.getSuggestions();
    const complexity = autoRouting.getComplexityInfo();

    // Show panel when complexity is medium or higher and there are suggestions
    const shouldShow = complexity.level !== 'low' && suggestions.length > 0;

    if (shouldShow) {
      panel.style.transform = 'translateY(0)';
      panel.style.opacity = '1';

      // Update suggestions list
      list.innerHTML = '';
      suggestions.slice(0, 3).forEach((suggestion, index) => {
        const suggestionEl = document.createElement('div');
        suggestionEl.style.cssText = `
          background: rgba(31, 41, 55, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          padding: 8px 10px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 12px;
          color: #e5e7eb;
        `;

        const priorityColor = suggestion.priority === 'high' ? '#ef4444' :
                            suggestion.priority === 'medium' ? '#f59e0b' : '#10b981';

        suggestionEl.innerHTML = `
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="width: 4px; height: 4px; border-radius: 50%; background: ${priorityColor};"></div>
            <span>${suggestion.description}</span>
          </div>
        `;

        suggestionEl.addEventListener('click', () => {
          if (suggestion.action) {
            suggestion.action();
          }
        });

        suggestionEl.addEventListener('mouseenter', () => {
          suggestionEl.style.background = 'rgba(31, 41, 55, 0.8)';
          suggestionEl.style.transform = 'translateY(-1px)';
        });

        suggestionEl.addEventListener('mouseleave', () => {
          suggestionEl.style.background = 'rgba(31, 41, 55, 0.6)';
          suggestionEl.style.transform = 'translateY(0)';
        });

        list.appendChild(suggestionEl);
      });
    } else {
      panel.style.transform = 'translateY(100px)';
      panel.style.opacity = '0';
    }
  }

  game.updateHUD = updateHUD;
  return { setTimeScale, updateHUD };
}
