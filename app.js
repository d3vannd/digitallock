/**
 * ChronoGlass Digital Clock Website Logic
 * Handles real-time clock, timezone conversions, world clocks, alarms, stopwatch, timer,
 * Local Storage state, keyboard shortcuts, and Web Audio synthesis.
 */

// Global State
const state = {
  theme: 'dark',
  view: 'digital', // 'digital' or 'analog'
  format24h: false,
  activeColor: 'cyan',
  selectedTimezone: 'local',
  alarms: [],
  activeTab: 'alarms'
};

// ----------------------------------------------------
// 1. Audio Synthesizer Class
// ----------------------------------------------------
class AudioSynthesizer {
  constructor() {
    this.ctx = null;
    this.alarmInterval = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playShortBeep(freq = 800, duration = 0.15) {
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      
      // Smooth attack and release to prevent clipping clicks
      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio Context playback warning:", e);
    }
  }

  startAlarmRing() {
    this.init();
    if (this.alarmInterval) return;

    let toggle = true;
    const playAlarmStep = () => {
      // Alternate frequencies for classic alarm sound
      const freq = toggle ? 987.77 : 880; // B5 and A5 notes
      this.playShortBeep(freq, 0.25);
      toggle = !toggle;
    };

    playAlarmStep();
    this.alarmInterval = setInterval(playAlarmStep, 500);
  }

  stopAlarmRing() {
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
  }
}

const synthesizer = new AudioSynthesizer();

// Unlock audio context on first user interaction (safari / chrome policies)
const unlockAudio = () => {
  synthesizer.init();
  document.removeEventListener('click', unlockAudio);
  document.removeEventListener('keydown', unlockAudio);
};
document.addEventListener('click', unlockAudio);
document.addEventListener('keydown', unlockAudio);


// ----------------------------------------------------
// 2. Local Storage & Settings Manager
// ----------------------------------------------------
const SettingsManager = {
  load() {
    if (localStorage.getItem('chrono_theme')) {
      state.theme = localStorage.getItem('chrono_theme');
      state.view = localStorage.getItem('chrono_view') || 'digital';
      state.format24h = localStorage.getItem('chrono_format24h') === 'true';
      state.activeColor = localStorage.getItem('chrono_color') || 'cyan';
      state.selectedTimezone = localStorage.getItem('chrono_timezone') || 'local';
    }
    
    // Load alarms
    const storedAlarms = localStorage.getItem('chrono_alarms');
    if (storedAlarms) {
      try {
        state.alarms = JSON.parse(storedAlarms);
      } catch (e) {
        state.alarms = [];
      }
    }
  },

  save() {
    localStorage.setItem('chrono_theme', state.theme);
    localStorage.setItem('chrono_view', state.view);
    localStorage.setItem('chrono_format24h', state.format24h);
    localStorage.setItem('chrono_color', state.activeColor);
    localStorage.setItem('chrono_timezone', state.selectedTimezone);
    localStorage.setItem('chrono_alarms', JSON.stringify(state.alarms));
  },

  apply() {
    // Theme
    document.documentElement.setAttribute('data-theme', state.theme);
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      themeBtn.setAttribute('title', `Toggle Theme (T) - Current: ${state.theme}`);
    }

    // View
    const clockPanel = document.getElementById('hero-clock-panel');
    const digitalView = document.getElementById('digital-clock-view');
    const analogView = document.getElementById('analog-clock-view');
    
    if (state.view === 'analog') {
      clockPanel.classList.add('analog-mode');
      digitalView.classList.remove('active');
      analogView.classList.add('active');
    } else {
      clockPanel.classList.remove('analog-mode');
      digitalView.classList.add('active');
      analogView.classList.remove('active');
    }

    // Format
    const formatBtn = document.getElementById('format-toggle');
    if (formatBtn) {
      formatBtn.textContent = state.format24h ? '24H' : '12H';
    }

    // Color Preset Accent
    document.documentElement.style.setProperty('--accent-color', `var(--${state.activeColor}-glow)`);
    document.documentElement.style.setProperty('--accent-rgb', `var(--${state.activeColor}-rgb)`);
    
    // Set active class on color picker dropdown
    document.querySelectorAll('.color-preset').forEach(btn => {
      if (btn.dataset.color === state.activeColor) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Timezone Selector
    const tzSelect = document.getElementById('timezone-select');
    if (tzSelect) {
      tzSelect.value = state.selectedTimezone;
    }
    
    // Update timezone offset label
    ClockManager.updateOffsetLabel();
  }
};


// ----------------------------------------------------
// 3. Timezone Dropdown Builder
// ----------------------------------------------------
const Timezones = [
  { value: 'local', label: 'Local Time' },
  { value: 'UTC', label: 'UTC / GMT (Coordinated Universal)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Africa/Cairo', label: 'Cairo (EET)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'Kolkata / New Delhi (IST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' }
];

function populateTimezoneDropdown() {
  const select = document.getElementById('timezone-select');
  if (!select) return;

  // Clear existing
  select.innerHTML = '';

  // Detect local zone
  let localZone = 'UTC';
  try {
    localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (e) {
    console.warn("Could not detect local timezone, falling back to UTC");
  }

  Timezones.forEach(tz => {
    const opt = document.createElement('option');
    opt.value = tz.value;
    if (tz.value === 'local') {
      opt.textContent = `Local Time (${localZone})`;
    } else {
      opt.textContent = tz.label;
    }
    select.appendChild(opt);
  });
}


// ----------------------------------------------------
// 4. Clock Manager (Main Clock & Hands)
// ----------------------------------------------------
const ClockManager = {
  lastTzSecond: -1,
  secondRotations: 0,
  lastSelectedTz: '',

  init() {
    populateTimezoneDropdown();
    this.update();
    setInterval(() => this.update(), 1000);
  },

  updateOffsetLabel() {
    const offsetEl = document.getElementById('timezone-offset');
    if (!offsetEl) return;
    
    let tz = state.selectedTimezone;
    if (tz === 'local') {
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch (e) {
        tz = 'UTC';
      }
    }
    
    try {
      const date = new Date();
      // Fetch timezone offset string
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset'
      });
      const parts = formatter.formatToParts(date);
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      
      let offsetStr = tzPart ? tzPart.value : 'GMT';
      offsetStr = offsetStr.replace('GMT', 'UTC'); // Match UI specs
      offsetEl.textContent = offsetStr;
    } catch (e) {
      offsetEl.textContent = 'UTC+00:00';
    }
  },

  getFormattedTimeParts(date, timeZone, use24Hour) {
    const options = {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: !use24Hour,
    };
    if (timeZone && timeZone !== 'local') {
      options.timeZone = timeZone;
    }
    
    try {
      const formatter = new Intl.DateTimeFormat('en-US', options);
      const parts = formatter.formatToParts(date);
      const partObj = {};
      parts.forEach(p => partObj[p.type] = p.value);
      return partObj;
    } catch (e) {
      // Fallback
      return {
        hour: String(date.getHours()).padStart(2, '0'),
        minute: String(date.getMinutes()).padStart(2, '0'),
        second: String(date.getSeconds()).padStart(2, '0')
      };
    }
  },

  getFormattedDate(date, timeZone) {
    const options = {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    };
    if (timeZone && timeZone !== 'local') {
      options.timeZone = timeZone;
    }
    try {
      return new Intl.DateTimeFormat('en-US', options).format(date);
    } catch (e) {
      return date.toDateString();
    }
  },

  update() {
    const now = new Date();
    const tz = state.selectedTimezone;

    // Reset continuous second rotation rotations index if timezone changed
    if (tz !== this.lastSelectedTz) {
      this.secondRotations = 0;
      this.lastTzSecond = -1;
      this.lastSelectedTz = tz;
      this.updateOffsetLabel();
    }

    // 1. Update Digital View
    const parts = this.getFormattedTimeParts(now, tz, state.format24h);
    
    // Normalize hour formatting (24 vs 00)
    let displayHour = parts.hour;
    if (state.format24h && displayHour === '24') {
      displayHour = '00';
    }

    document.getElementById('clock-hours').textContent = displayHour;
    document.getElementById('clock-minutes').textContent = parts.minute;
    document.getElementById('clock-seconds').textContent = parts.second;

    const ampmIndicator = document.getElementById('clock-ampm');
    if (!state.format24h) {
      ampmIndicator.style.display = 'inline-block';
      ampmIndicator.textContent = parts.dayPeriod || 'AM';
    } else {
      ampmIndicator.style.display = 'none';
    }

    // 2. Update Date
    document.getElementById('date-display').textContent = this.getFormattedDate(now, tz);

    // 3. Update Analog View Hands
    let hNum, mNum, sNum;
    if (!tz || tz === 'local') {
      hNum = now.getHours();
      mNum = now.getMinutes();
      sNum = now.getSeconds();
    } else {
      // Fetch 24h format parts of timezone to get direct numeric components
      const numericParts = this.getFormattedTimeParts(now, tz, true);
      hNum = parseInt(numericParts.hour) % 12;
      mNum = parseInt(numericParts.minute);
      sNum = parseInt(numericParts.second);
    }

    // Track continuous second ticks to avoid wrapping transitions jumps
    if (sNum < this.lastTzSecond) {
      this.secondRotations++;
    }
    this.lastTzSecond = sNum;

    const continuousSecondDeg = (this.secondRotations * 360) + (sNum * 6);
    const continuousMinuteDeg = (mNum * 6) + (sNum * 0.1);
    const continuousHourDeg = ((hNum % 12) * 30) + (mNum * 0.5);

    document.getElementById('analog-second').style.transform = `rotate(${continuousSecondDeg}deg)`;
    document.getElementById('analog-minute').style.transform = `rotate(${continuousMinuteDeg}deg)`;
    document.getElementById('analog-hour').style.transform = `rotate(${continuousHourDeg}deg)`;

    // 4. Trigger Alarm Checks (relies on user's active local time ticking)
    AlarmManager.checkAlarms(now);
  }
};


// ----------------------------------------------------
// 5. World Clock Manager
// ----------------------------------------------------
const WorldClockManager = {
  init() {
    this.update();
    setInterval(() => this.update(), 1000);
  },

  update() {
    const now = new Date();
    const cards = document.querySelectorAll('.world-clock-card');
    
    cards.forEach(card => {
      const tz = card.dataset.timezone;
      if (!tz) return;

      // Time Parts (force 24h display in small tiles)
      const timeParts = ClockManager.getFormattedTimeParts(now, tz, true);
      let hr = timeParts.hour;
      if (hr === '24') hr = '00';
      
      const timeStr = `${hr}:${timeParts.minute}:${timeParts.second}`;
      card.querySelector('.world-time').textContent = timeStr;

      // Date Format: Monday, Jun 8
      const dateOptions = { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz };
      try {
        const dateStr = new Intl.DateTimeFormat('en-US', dateOptions).format(now);
        card.querySelector('.world-date').textContent = dateStr;
      } catch (e) {
        card.querySelector('.world-date').textContent = now.toDateString();
      }

      // UTC offset
      try {
        const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
        const parts = formatter.formatToParts(now);
        const tzPart = parts.find(p => p.type === 'timeZoneName');
        let offsetStr = tzPart ? tzPart.value : '';
        offsetStr = offsetStr.replace('GMT', 'UTC');
        card.querySelector('.world-offset').textContent = offsetStr;
      } catch (e) {}
    });
  }
};


// ----------------------------------------------------
// 6. Alarms Manager
// ----------------------------------------------------
const AlarmManager = {
  activeRingingAlarm: null,

  init() {
    this.render();

    // Form submission listener
    const form = document.getElementById('alarm-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const timeInput = document.getElementById('alarm-time');
        const labelInput = document.getElementById('alarm-label');
        
        if (timeInput) {
          const id = Date.now().toString();
          const time = timeInput.value; // e.g. "07:30"
          const label = labelInput.value.trim() || 'Alarm';
          
          state.alarms.push({ id, time, label, enabled: true });
          SettingsManager.save();
          this.render();
          
          // Clear form label
          labelInput.value = '';
          synthesizer.playShortBeep(600, 0.1);
        }
      });
    }

    // Dismiss alarm overlay action
    const dismissBtn = document.getElementById('dismiss-alarm-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        this.dismissRinging();
      });
    }
  },

  render() {
    const listEl = document.getElementById('alarms-list');
    if (!listEl) return;

    if (state.alarms.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No alarms scheduled yet.</div>';
      return;
    }

    // Sort alarms by time
    const sorted = [...state.alarms].sort((a, b) => a.time.localeCompare(b.time));

    listEl.innerHTML = '';
    sorted.forEach(alarm => {
      const item = document.createElement('div');
      item.className = 'alarm-item';
      item.dataset.id = alarm.id;

      // Format time for 12h representation if necessary
      let timeDisplay = alarm.time;
      if (!state.format24h) {
        const [h, m] = alarm.time.split(':');
        const hr = parseInt(h);
        const ampm = hr >= 12 ? 'PM' : 'AM';
        const hr12 = hr % 12 || 12;
        timeDisplay = `${String(hr12).padStart(2, '0')}:${m} ${ampm}`;
      }

      item.innerHTML = `
        <div class="alarm-item-info">
          <div class="alarm-time-display">${timeDisplay}</div>
          <div class="alarm-label-display">${escapeHtml(alarm.label)}</div>
        </div>
        <div class="alarm-item-controls">
          <label class="switch">
            <input type="checkbox" class="alarm-toggle" ${alarm.enabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
          <button class="delete-alarm-btn" title="Delete Alarm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      `;

      // Event Listener: Toggle Enable / Disable
      item.querySelector('.alarm-toggle').addEventListener('change', (e) => {
        alarm.enabled = e.target.checked;
        SettingsManager.save();
        synthesizer.playShortBeep(600, 0.05);
      });

      // Event Listener: Delete
      item.querySelector('.delete-alarm-btn').addEventListener('click', () => {
        state.alarms = state.alarms.filter(a => a.id !== alarm.id);
        SettingsManager.save();
        this.render();
        synthesizer.playShortBeep(400, 0.1);
      });

      listEl.appendChild(item);
    });
  },

  checkAlarms(now) {
    if (this.activeRingingAlarm) return; // Already ringing

    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMin = String(now.getMinutes()).padStart(2, '0');
    const currentSec = now.getSeconds();
    const currentTimeStr = `${currentHour}:${currentMin}`;

    // Alarms check on seconds trigger 0
    if (currentSec === 0) {
      state.alarms.forEach(alarm => {
        if (alarm.enabled && alarm.time === currentTimeStr) {
          this.triggerAlarm(alarm);
        }
      });
    }
  },

  triggerAlarm(alarm) {
    this.activeRingingAlarm = alarm;
    
    // Play ringing chime
    synthesizer.startAlarmRing();

    // Trigger overlay modal
    const overlay = document.getElementById('alarm-trigger-overlay');
    const title = document.getElementById('alarm-trigger-title');
    const label = document.getElementById('alarm-trigger-label');

    if (overlay) {
      label.textContent = `Label: ${alarm.label}`;
      overlay.classList.add('show');
    }
  },

  dismissRinging() {
    if (!this.activeRingingAlarm) return;

    synthesizer.stopAlarmRing();

    // Close overlay modal
    const overlay = document.getElementById('alarm-trigger-overlay');
    if (overlay) {
      overlay.classList.remove('show');
    }

    // Auto-disable alarm if triggered once (prevent loops)
    const alarm = state.alarms.find(a => a.id === this.activeRingingAlarm.id);
    if (alarm) {
      alarm.enabled = false;
      SettingsManager.save();
      this.render();
    }

    this.activeRingingAlarm = null;
  }
};


// ----------------------------------------------------
// 7. Stopwatch Manager
// ----------------------------------------------------
const StopwatchManager = {
  startTime: 0,
  elapsedTime: 0,
  timerId: null,
  running: false,
  laps: [],

  init() {
    const startBtn = document.getElementById('stopwatch-start');
    const lapBtn = document.getElementById('stopwatch-lap');
    const resetBtn = document.getElementById('stopwatch-reset');

    if (startBtn) {
      startBtn.addEventListener('click', () => this.toggle());
    }
    if (lapBtn) {
      lapBtn.addEventListener('click', () => this.recordLap());
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.reset());
    }
  },

  toggle() {
    const startBtn = document.getElementById('stopwatch-start');
    const lapBtn = document.getElementById('stopwatch-lap');
    
    synthesizer.playShortBeep(700, 0.08);

    if (this.running) {
      // Pause
      this.running = false;
      this.elapsedTime += performance.now() - this.startTime;
      cancelAnimationFrame(this.timerId);
      
      startBtn.textContent = 'Resume';
      startBtn.classList.remove('primary-btn');
      lapBtn.disabled = true;
    } else {
      // Start/Resume
      this.running = true;
      this.startTime = performance.now();
      this.timerId = requestAnimationFrame(() => this.tick());

      startBtn.textContent = 'Pause';
      startBtn.classList.add('primary-btn');
      lapBtn.disabled = false;
    }
  },

  tick() {
    if (!this.running) return;

    const now = performance.now();
    const totalMs = this.elapsedTime + (now - this.startTime);
    this.display(totalMs);

    this.timerId = requestAnimationFrame(() => this.tick());
  },

  display(totalMs) {
    const displayEl = document.getElementById('stopwatch-time');
    if (!displayEl) return;

    displayEl.innerHTML = this.formatTime(totalMs);
  },

  formatTime(totalMs) {
    const ms = Math.floor(totalMs % 1000);
    const totalSeconds = Math.floor(totalMs / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);

    const hrStr = String(hours).padStart(2, '0');
    const minStr = String(minutes).padStart(2, '0');
    const secStr = String(seconds).padStart(2, '0');
    const msStr = String(ms).padStart(3, '0');

    return `${hrStr}:${minStr}:${secStr}<span class="ms-part">.${msStr}</span>`;
  },

  recordLap() {
    if (!this.running) return;

    synthesizer.playShortBeep(800, 0.05);

    const now = performance.now();
    const cumulative = this.elapsedTime + (now - this.startTime);
    
    let lapTime = cumulative;
    if (this.laps.length > 0) {
      lapTime = cumulative - this.laps[this.laps.length - 1].cumulative;
    }

    const lapObj = {
      lapNum: this.laps.length + 1,
      lapTime: lapTime,
      cumulative: cumulative
    };

    this.laps.push(lapObj);
    this.renderLaps();
  },

  renderLaps() {
    const tbody = document.getElementById('lap-list-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    
    // Display recent lap at the top
    const reversedLaps = [...this.laps].reverse();
    reversedLaps.forEach(lap => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>Lap ${lap.lapNum}</td>
        <td>${this.formatTime(lap.lapTime)}</td>
        <td>${this.formatTime(lap.cumulative)}</td>
      `;
      tbody.appendChild(tr);
    });
  },

  reset() {
    synthesizer.playShortBeep(500, 0.1);

    this.running = false;
    cancelAnimationFrame(this.timerId);
    this.startTime = 0;
    this.elapsedTime = 0;
    this.laps = [];

    this.display(0);

    const startBtn = document.getElementById('stopwatch-start');
    const lapBtn = document.getElementById('stopwatch-lap');
    if (startBtn) {
      startBtn.textContent = 'Start';
      startBtn.classList.add('primary-btn');
    }
    if (lapBtn) {
      lapBtn.disabled = true;
    }

    this.renderLaps();
  }
};


// ----------------------------------------------------
// 8. Countdown Timer Manager
// ----------------------------------------------------
const TimerManager = {
  running: false,
  totalDurationMs: 0,
  remainingMs: 0,
  endTime: 0,
  intervalId: null,

  init() {
    const startBtn = document.getElementById('timer-start');
    const pauseBtn = document.getElementById('timer-pause');
    const resetBtn = document.getElementById('timer-reset');

    if (startBtn) {
      startBtn.addEventListener('click', () => this.start());
    }
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => this.pause());
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.reset());
    }

    // Input validations
    const inputs = ['timer-hours', 'timer-minutes', 'timer-seconds'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          let val = parseInt(el.value) || 0;
          if (val < 0) val = 0;
          if (id !== 'timer-hours' && val > 59) val = 59;
          if (id === 'timer-hours' && val > 23) val = 23;
          el.value = String(val).padStart(2, '0');
        });
      }
    });
  },

  getDurationFromInputs() {
    const hr = parseInt(document.getElementById('timer-hours').value) || 0;
    const min = parseInt(document.getElementById('timer-minutes').value) || 0;
    const sec = parseInt(document.getElementById('timer-seconds').value) || 0;

    return (hr * 3600 + min * 60 + sec) * 1000;
  },

  start() {
    synthesizer.playShortBeep(700, 0.08);

    if (this.remainingMs <= 0) {
      const dur = this.getDurationFromInputs();
      if (dur <= 0) {
        alert("Please set a duration greater than 0 seconds.");
        return;
      }
      this.totalDurationMs = dur;
      this.remainingMs = dur;
    }

    this.running = true;
    this.endTime = Date.now() + this.remainingMs;

    // Toggle forms display
    document.querySelector('.timer-selector-container').style.display = 'none';
    document.querySelector('.timer-running-display-wrapper').style.display = 'flex';

    document.getElementById('timer-start').style.display = 'none';
    document.getElementById('timer-pause').style.display = 'inline-flex';
    document.getElementById('timer-reset').disabled = false;

    this.tick();
    this.intervalId = setInterval(() => this.tick(), 100);
  },

  pause() {
    synthesizer.playShortBeep(600, 0.08);

    if (!this.running) return;

    this.running = false;
    clearInterval(this.intervalId);
    this.remainingMs = this.endTime - Date.now();

    document.getElementById('timer-start').style.display = 'inline-flex';
    document.getElementById('timer-start').textContent = 'Resume';
    document.getElementById('timer-pause').style.display = 'none';
  },

  reset() {
    synthesizer.playShortBeep(500, 0.1);

    this.running = false;
    clearInterval(this.intervalId);
    this.remainingMs = 0;
    this.totalDurationMs = 0;

    // Toggle forms display back
    document.querySelector('.timer-selector-container').style.display = 'flex';
    document.querySelector('.timer-running-display-wrapper').style.display = 'none';

    document.getElementById('timer-start').style.display = 'inline-flex';
    document.getElementById('timer-start').textContent = 'Start';
    document.getElementById('timer-pause').style.display = 'none';
    document.getElementById('timer-reset').disabled = true;

    // Reset progress fill
    document.getElementById('timer-progress-fill').style.width = '100%';
  },

  tick() {
    if (!this.running) return;

    const diff = this.endTime - Date.now();

    if (diff <= 0) {
      // Finished
      this.remainingMs = 0;
      this.display(0);
      this.reset();
      this.triggerFinishAlert();
      return;
    }

    this.remainingMs = diff;
    this.display(diff);
  },

  display(diffMs) {
    const displayEl = document.getElementById('timer-running-display');
    const fillEl = document.getElementById('timer-progress-fill');
    if (!displayEl) return;

    const totalSeconds = Math.ceil(diffMs / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);

    const hrStr = String(hours).padStart(2, '0');
    const minStr = String(minutes).padStart(2, '0');
    const secStr = String(seconds).padStart(2, '0');

    displayEl.textContent = `${hrStr}:${minStr}:${secStr}`;

    // Fill percent
    if (fillEl && this.totalDurationMs > 0) {
      const pct = (diffMs / this.totalDurationMs) * 100;
      fillEl.style.width = `${pct}%`;
    }
  },

  triggerFinishAlert() {
    // Show Alarm modal
    AlarmManager.triggerAlarm({
      id: 'timer-finished',
      label: 'Timer Countdown Finished!'
    });
  }
};


// ----------------------------------------------------
// 9. Tab Control / Header Manager
// ----------------------------------------------------
const UIManager = {
  init() {
    // Tab switching
    const tabBtns = document.querySelectorAll('.nav-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        this.switchTab(tabName);
        synthesizer.playShortBeep(750, 0.05);
      });
    });

    // Theme Toggle click
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // View Analog/Digital Toggle click
    const viewBtn = document.getElementById('view-toggle');
    if (viewBtn) {
      viewBtn.addEventListener('click', () => this.toggleView());
    }

    // 12H/24H Format Toggle click
    const formatBtn = document.getElementById('format-toggle');
    if (formatBtn) {
      formatBtn.addEventListener('click', () => this.toggleFormat());
    }

    // Color presets dropdown toggle
    const colorPickerTrigger = document.getElementById('color-picker-trigger');
    const colorDropdown = document.getElementById('color-dropdown-menu');
    if (colorPickerTrigger && colorDropdown) {
      colorPickerTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        colorDropdown.classList.toggle('show');
        synthesizer.playShortBeep(650, 0.05);
      });
      
      // Close color dropdown on click outside
      document.addEventListener('click', () => {
        colorDropdown.classList.remove('show');
      });
    }

    // Select Accent Preset
    const colorPresets = document.querySelectorAll('.color-preset');
    colorPresets.forEach(preset => {
      preset.addEventListener('click', () => {
        state.activeColor = preset.dataset.color;
        SettingsManager.save();
        SettingsManager.apply();
        synthesizer.playShortBeep(850, 0.08);
      });
    });

    // Main timezone picker drop selection
    const tzSelect = document.getElementById('timezone-select');
    if (tzSelect) {
      tzSelect.addEventListener('change', () => {
        state.selectedTimezone = tzSelect.value;
        SettingsManager.save();
        SettingsManager.apply();
        ClockManager.update();
        synthesizer.playShortBeep(700, 0.08);
      });
    }

    // Fullscreen action
    const fullscreenBtn = document.getElementById('fullscreen-toggle');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    }

    // Help Modals triggers
    const helpBtn = document.querySelector('.footer-info');
    const helpModal = document.getElementById('help-modal');
    const closeHelpBtn = document.getElementById('close-modal-btn');
    
    if (helpBtn && helpModal) {
      helpBtn.addEventListener('style', () => {}); // placeholder styling
      helpBtn.addEventListener('click', () => {
        helpModal.classList.add('show');
        synthesizer.playShortBeep(700, 0.08);
      });
    }
    if (closeHelpBtn && helpModal) {
      closeHelpBtn.addEventListener('click', () => {
        helpModal.classList.remove('show');
        synthesizer.playShortBeep(600, 0.08);
      });
    }
  },

  switchTab(tabName) {
    state.activeTab = tabName;
    
    // Toggle active buttons
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Toggle panels visibility
    document.querySelectorAll('.tab-content-panel').forEach(panel => {
      if (panel.id === `panel-${tabName}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });
  },

  toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    SettingsManager.save();
    SettingsManager.apply();
    synthesizer.playShortBeep(state.theme === 'dark' ? 550 : 850, 0.1);
  },

  toggleView() {
    state.view = state.view === 'digital' ? 'analog' : 'digital';
    SettingsManager.save();
    SettingsManager.apply();
    synthesizer.playShortBeep(700, 0.1);
  },

  toggleFormat() {
    state.format24h = !state.format24h;
    SettingsManager.save();
    SettingsManager.apply();
    ClockManager.update();
    AlarmManager.render(); // Re-render alarm times in current 12/24 state
    synthesizer.playShortBeep(800, 0.08);
  },

  toggleFullscreen() {
    synthesizer.playShortBeep(900, 0.15);
    
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        document.body.classList.add('fullscreen-active');
      }).catch(err => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  }
};

// Fullscreen state listener (to reset CSS class properly if user exits with Esc)
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    document.body.classList.remove('fullscreen-active');
  }
});


// ----------------------------------------------------
// 10. Keyboard Shortcuts Handler
// ----------------------------------------------------
const KeyboardShortcutManager = {
  init() {
    document.addEventListener('keydown', (e) => {
      // Ignore keys if typing in interactive forms
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA')) {
        // If they press Escape, blur focus
        if (e.key === 'Escape') {
          activeEl.blur();
        }
        return;
      }

      const key = e.key.toLowerCase();
      
      switch (key) {
        case 'f':
          e.preventDefault();
          UIManager.toggleFullscreen();
          break;
        case 'v':
          e.preventDefault();
          UIManager.toggleView();
          break;
        case 't':
          e.preventDefault();
          UIManager.toggleTheme();
          break;
        case 'c':
          e.preventDefault();
          const colorDropdown = document.getElementById('color-dropdown-menu');
          if (colorDropdown) colorDropdown.classList.toggle('show');
          break;
        case ' ': // Spacebar
          e.preventDefault();
          // Force active tab to stopwatch to make space control intuitive
          if (state.activeTab !== 'stopwatch') {
            UIManager.switchTab('stopwatch');
          }
          StopwatchManager.toggle();
          break;
        case 'l':
          e.preventDefault();
          if (state.activeTab === 'stopwatch') {
            StopwatchManager.recordLap();
          }
          break;
        case 'r':
          e.preventDefault();
          if (state.activeTab === 'stopwatch') {
            StopwatchManager.reset();
          } else if (state.activeTab === 'timer') {
            TimerManager.reset();
          }
          break;
        case 'h':
          e.preventDefault();
          const helpModal = document.getElementById('help-modal');
          if (helpModal) {
            helpModal.classList.toggle('show');
            synthesizer.playShortBeep(700, 0.08);
          }
          break;
        case 'escape':
          e.preventDefault();
          // Close active modals
          document.getElementById('help-modal').classList.remove('show');
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
          // Dismiss alarm overlay if active
          if (AlarmManager.activeRingingAlarm) {
            AlarmManager.dismissRinging();
          }
          break;
      }
    });
  }
};


// ----------------------------------------------------
// Helpers
// ----------------------------------------------------
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}


// ----------------------------------------------------
// App Bootstrap
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  SettingsManager.load();
  UIManager.init();
  SettingsManager.apply();
  ClockManager.init();
  WorldClockManager.init();
  AlarmManager.init();
  StopwatchManager.init();
  TimerManager.init();
  KeyboardShortcutManager.init();
});
