(function () {
  'use strict';

  var KEY = 'drift.profile.v1';
  var REMINDER_KEY = 'drift.reminders.v1';
  var DAY = 1440;
  var app = document.getElementById('app');

  var QUESTIONS = [
    { id: 'name', type: 'text', required: true, maxLength: 24, def: '', placeholder: 'Your first name',
      title: "Hi, I'm Drift. What's your name?", hint: 'So I can greet you properly. It stays on this device.' },
    { id: 'wake', type: 'time', def: '07:00',
      title: 'What time do you need to wake up?', hint: 'Your usual weekday alarm.' },
    { id: 'need', type: 'slider', min: 5, max: 10, step: 0.5, def: 8,
      title: 'How many hours of sleep do you need?', hint: 'Most adults feel their best with 7 to 9 hours.' },
    { id: 'latency', type: 'choice', def: 15,
      title: 'How long does it usually take you to fall asleep?', hint: 'Be honest. The plan leaves you time for it.',
      options: [[5, 'Under 10 minutes'], [15, '10 to 20 minutes'], [25, '20 to 30 minutes'], [40, 'Over 30 minutes']] },
    { id: 'winddown', type: 'choice', def: 30,
      title: 'How long do you want to wind down before bed?', hint: 'Time for a calm routine before lights out.',
      options: [[15, '15 minutes', 'A quick reset'], [30, '30 minutes', 'A calm half hour'], [60, '1 hour', 'A full wind-down'], [90, '90 minutes', 'A slow evening routine']] },
    { id: 'caffeine', type: 'choice', def: 'none',
      title: 'Do you drink caffeine?', hint: 'Caffeine can stay active in your body for 8 hours or more.',
      options: [['none', "No, I don't have caffeine"], ['morning', 'Mornings only', 'Usually finished by about 11 AM'], ['afternoon', 'Into the afternoon', 'Usually finished by about 3 PM'], ['evening', 'Into the evening', 'Usually finished by about 7 PM']] },
    { id: 'screens', type: 'choice', def: 20,
      title: 'How much screen time do you usually have before bed?', hint: 'Phone, TV, laptop, all of it.',
      options: [[0, 'None', 'Screens off early'], [20, 'Under 30 minutes'], [45, '30 to 60 minutes'], [90, 'More than an hour']] },
    { id: 'exercise', type: 'choice', def: 'morning',
      title: 'When do you usually exercise?', hint: 'Hard workouts late in the day can make falling asleep harder.',
      options: [['none', 'Rarely or never'], ['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening', 'Within a few hours of bed']] },
    { id: 'naps', type: 'choice', def: 'none',
      title: 'Do you nap during the day?', hint: 'Naps can help or hurt, depending on length.',
      options: [['none', 'No naps'], ['short', 'Short naps', 'Under 30 minutes'], ['long', 'Long naps', '30 minutes or more']] },
    { id: 'struggle', type: 'choice', def: 'none',
      title: "What's your biggest sleep struggle?", hint: 'This helps me tailor your tips.',
      options: [['fall', 'Falling asleep'], ['stay', 'Staying asleep'], ['early', 'Waking too early'], ['unrested', 'Waking up unrested'], ['none', 'Nothing major']] },
    { id: 'weekend', type: 'choice', def: 0,
      title: 'Is your weekend wake-up time different?', hint: 'If so, I will build a weekend plan too.',
      options: [[0, 'Same as weekdays'], [90, 'About 1.5 hours later'], [180, 'About 3 hours later']] }
  ];

  var stored = load();
  var profile = stored ? stored.profile : null;
  var view = profile ? 'home' : 'intro';
  var draft = defaults();
  var step = 0;
  var editing = false;
  var busy = false;
  var deferredPrompt = null;
  var reminders = loadReminders();
  var reminderTimers = [];
  var reminderNotice = '';
  var activeBanner = null;
  var bannerTimer = null;
  var iosStep = 0;
  var iosTimer = null;
  var iosManualPauseUntil = 0;
  var showIOSGuideOverride = false;
  var copyFeedback = '';

  function mod(n) { return ((Math.round(n) % DAY) + DAY) % DAY; }

  function toMin(t) {
    var parts = t.split(':');
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  function fmtTime(min) {
    min = mod(min);
    var h = Math.floor(min / 60), m = min % 60;
    var ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
  }

  function fmtDur(mins) {
    mins = Math.max(0, Math.round(mins));
    var h = Math.floor(mins / 60), m = mins % 60;
    if (!h) return m + ' min';
    return h + 'h' + (m ? ' ' + m + 'm' : '');
  }

  function fmtHours(h) {
    return h + (h === 1 ? ' hour' : ' hours');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  }

  function save(p) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, savedAt: Date.now(), profile: p })); } catch (e) { }
  }

  function defaultReminders() {
    return {
      enabled: false,
      winddown: true,
      bed: true,
      windFireAt: null,
      bedFireAt: null,
      firedTags: {}
    };
  }

  function loadReminders() {
    try {
      var raw = JSON.parse(localStorage.getItem(REMINDER_KEY));
      if (!raw || typeof raw !== 'object') return defaultReminders();
      return Object.assign(defaultReminders(), raw, {
        firedTags: (raw.firedTags && typeof raw.firedTags === 'object') ? raw.firedTags : {}
      });
    } catch (e) {
      return defaultReminders();
    }
  }

  function saveReminders() {
    try { localStorage.setItem(REMINDER_KEY, JSON.stringify(reminders)); } catch (e) { }
  }

  function defaults() {
    var d = {};
    QUESTIONS.forEach(function (q) { d[q.id] = q.def; });
    return d;
  }

  function isStandalone() {
    if (window.navigator.standalone === true) return true;
    if (document.referrer && document.referrer.indexOf('android-app://') === 0) return true;
    if (window.matchMedia) {
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
      if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
    }
    return false;
  }

  function isIOS() {
    var ua = navigator.userAgent || '';
    return (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && !window.MSStream;
  }

  function getIOSContext() {
    var ua = navigator.userAgent || '';
    var standalone = isStandalone();
    var ios = isIOS();
    var ipad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var inApp = /FBAN|FBAV|Instagram|Line\/|Twitter|MicroMessenger|TikTok|BytedanceWebview|LinkedInApp|Snapchat|Pinterest/i.test(ua);
    var crios = /CriOS/i.test(ua);
    var fxios = /FxiOS/i.test(ua);
    var edgios = /EdgiOS/i.test(ua);
    var gsa = /GSA\//i.test(ua);
    var opios = /OPiOS/i.test(ua);
    var ddg = /DuckDuckGo/i.test(ua);
    var otherBrowser = crios || fxios || edgios || gsa || opios || ddg;
    var safari = ios && !standalone && !inApp && !otherBrowser && /Safari/i.test(ua) && /AppleWebKit/i.test(ua);

    var browserName = 'Safari';
    if (inApp) browserName = 'In-app browser';
    else if (crios) browserName = 'Chrome on iOS';
    else if (fxios) browserName = 'Firefox on iOS';
    else if (edgios) browserName = 'Edge on iOS';
    else if (gsa) browserName = 'Google app';
    else if (ddg) browserName = 'DuckDuckGo';
    else if (opios) browserName = 'Opera';

    var deviceName = ipad ? 'iPad' : 'iPhone';
    var toolbarLoc = ipad ? 'top toolbar' : (crios || edgios ? 'top-right address bar' : 'bottom toolbar');

    return {
      standalone: standalone,
      ios: ios,
      ipad: ipad,
      inApp: inApp,
      safari: safari,
      otherBrowser: otherBrowser,
      needsOpenInSafari: inApp || gsa,
      browserName: browserName,
      deviceName: deviceName,
      toolbarLoc: toolbarLoc
    };
  }

  function shareIconSvg() {
    return '<svg class="ios-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 3v12"/>' +
      '<path d="M8 7l4-4 4 4"/>' +
      '<path d="M5 11v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>' +
    '</svg>';
  }

  function plusSquareIconSvg() {
    return '<svg class="ios-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="3" width="18" height="18" rx="4"/>' +
      '<path d="M12 8v8"/>' +
      '<path d="M8 12h8"/>' +
    '</svg>';
  }

  function renderIOSWalkthroughCard(ctx) {
    var badge = ctx.ios
      ? (ctx.deviceName + ' · ' + ctx.browserName)
      : 'iPhone & iPad · Safari';

    var browserCallout = '';
    if (ctx.needsOpenInSafari) {
      browserCallout =
        '<div class="ios-callout warn">' +
          '<div class="ios-callout-text">' +
            '<strong>Open in Safari first</strong>' +
            '<span>You’re in ' + esc(ctx.browserName) + ', which hides Add to Home Screen. Tap <b>•••</b> and choose <b>Open in Safari</b>, or copy the link below.</span>' +
          '</div>' +
          '<button class="ios-copy-btn" data-act="copy-url">' + (copyFeedback || 'Copy link') + '</button>' +
        '</div>';
    } else if (ctx.otherBrowser) {
      browserCallout =
        '<div class="ios-callout">' +
          '<div class="ios-callout-text">' +
            '<strong>Using ' + esc(ctx.browserName) + '?</strong>' +
            '<span>Tap the Share icon in the ' + esc(ctx.toolbarLoc) + ', or open this page in <b>Safari</b> for full Home Screen support.</span>' +
          '</div>' +
          '<button class="ios-copy-btn" data-act="copy-url">' + (copyFeedback || 'Copy link') + '</button>' +
        '</div>';
    }

    return '<div class="card ios-guide" id="iosGuideCard" data-active-step="' + iosStep + '">' +
      '<div class="ios-guide-head">' +
        '<div>' +
          '<p class="eyebrow">Install on ' + esc(ctx.deviceName) + '</p>' +
          '<h2>Add Drift to your Home Screen</h2>' +
        '</div>' +
        '<span class="ios-env-badge">' + esc(badge) + '</span>' +
      '</div>' +
      '<p class="hint ios-guide-sub">Install Drift in 3 quick taps for instant offline access, a full-screen experience and bedtime notifications.</p>' +
      browserCallout +
      '<div class="ios-stage" aria-hidden="true">' +
        '<div class="ios-scene ios-scene-0' + (iosStep === 0 ? ' active' : '') + '">' +
          '<div class="mock-phone">' +
            '<div class="mock-screen-body">' +
              '<div class="mock-mini-orb">🌙</div>' +
              '<div class="mock-mini-title">Drift · Sleep Planner</div>' +
              '<div class="mock-pointer">Tap Share below ↓</div>' +
            '</div>' +
            '<div class="mock-safari-bar">' +
              '<span class="mock-nav">‹</span>' +
              '<span class="mock-nav">›</span>' +
              '<span class="mock-share-target">' + shareIconSvg() + '<span class="mock-pulse"></span></span>' +
              '<span class="mock-nav">📖</span>' +
              '<span class="mock-nav">❐</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ios-scene ios-scene-1' + (iosStep === 1 ? ' active' : '') + '">' +
          '<div class="mock-phone">' +
            '<div class="mock-sheet">' +
              '<div class="mock-sheet-handle"></div>' +
              '<div class="mock-sheet-header">' +
                '<span class="mock-app-chip">🌙</span>' +
                '<div><b>Drift · Sleep Planner</b><small>drift-sleep-planner</small></div>' +
              '</div>' +
              '<div class="mock-sheet-row muted-row"><span>Copy</span><span>📋</span></div>' +
              '<div class="mock-sheet-row highlight-row">' +
                '<span>Add to Home Screen</span>' +
                '<span class="mock-plus-badge">' + plusSquareIconSvg() + '</span>' +
                '<span class="mock-row-pulse"></span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ios-scene ios-scene-2' + (iosStep === 2 ? ' active' : '') + '">' +
          '<div class="mock-phone">' +
            '<div class="mock-dialog">' +
              '<div class="mock-dialog-top">' +
                '<span class="mock-cancel">Cancel</span>' +
                '<b>Add to Home Screen</b>' +
                '<span class="mock-add-btn">Add<span class="mock-pulse"></span></span>' +
              '</div>' +
              '<div class="mock-dialog-card">' +
                '<span class="mock-home-icon">🌙</span>' +
                '<div><b>Drift</b><small>Full-screen Home Screen app</small></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<ol class="ios-steps">' +
        '<li class="ios-step' + (iosStep === 0 ? ' active' : '') + '" data-ios-step="0">' +
          '<span class="ios-step-num">1</span>' +
          '<div class="ios-step-body">' +
            '<div class="ios-step-title">Tap <strong>Share</strong> in the ' + esc(ctx.toolbarLoc) + '</div>' +
            '<div class="ios-step-desc">Look for the square icon with an upward arrow in Safari.</div>' +
          '</div>' +
          '<span class="ios-step-icon">' + shareIconSvg() + '</span>' +
        '</li>' +
        '<li class="ios-step' + (iosStep === 1 ? ' active' : '') + '" data-ios-step="1">' +
          '<span class="ios-step-num">2</span>' +
          '<div class="ios-step-body">' +
            '<div class="ios-step-title">Choose <strong>Add to Home Screen</strong></div>' +
            '<div class="ios-step-desc">Scroll down the share sheet until you see the plus-in-square row.</div>' +
          '</div>' +
          '<span class="ios-step-icon">' + plusSquareIconSvg() + '</span>' +
        '</li>' +
        '<li class="ios-step' + (iosStep === 2 ? ' active' : '') + '" data-ios-step="2">' +
          '<span class="ios-step-num">3</span>' +
          '<div class="ios-step-body">' +
            '<div class="ios-step-title">Tap <strong>Add</strong> in the top-right corner</div>' +
            '<div class="ios-step-desc">Open Drift from your Home Screen for full-screen mode & notifications.</div>' +
          '</div>' +
          '<span class="ios-step-pill">Add</span>' +
        '</li>' +
      '</ol>' +
      (!ctx.ios && showIOSGuideOverride ? '<button class="ghost ios-hide-btn" data-act="toggle-ios-guide">Hide iPhone install steps</button>' : '') +
    '</div>';
  }

  function updateIOSWalkthroughDOM() {
    var card = document.getElementById('iosGuideCard');
    if (!card) return;
    card.setAttribute('data-active-step', String(iosStep));
    var scenes = card.querySelectorAll('.ios-scene');
    for (var i = 0; i < scenes.length; i++) {
      scenes[i].classList.toggle('active', i === iosStep);
    }
    var steps = card.querySelectorAll('.ios-step');
    for (var j = 0; j < steps.length; j++) {
      steps[j].classList.toggle('active', j === iosStep);
    }
  }

  function ensureIOSWalkthroughTimer() {
    if (iosTimer) return;
    iosTimer = setInterval(function () {
      if (!document.getElementById('iosGuideCard')) return;
      if (Date.now() < iosManualPauseUntil) return;
      iosStep = (iosStep + 1) % 3;
      updateIOSWalkthroughDOM();
    }, 3200);
  }

  function installHint() {
    var ctx = getIOSContext();
    if (ctx.standalone) return '';
    if (ctx.ios || showIOSGuideOverride) {
      ensureIOSWalkthroughTimer();
      return renderIOSWalkthroughCard(ctx);
    }
    if (deferredPrompt) {
      return '<div class="install-stack">' +
        '<button class="install-btn" data-act="install">Install Drift on this device</button>' +
        '<button class="ghost ios-toggle-link" data-act="toggle-ios-guide">On iPhone or iPad? See Add to Home Screen steps</button>' +
      '</div>';
    }
    return '<button class="ghost ios-toggle-link" data-act="toggle-ios-guide">📱 Install on iPhone or iPad · See Add to Home Screen steps</button>';
  }

  function canUseNotifications() {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  function getNotificationPermission() {
    if (!canUseNotifications()) return 'unsupported';
    return Notification.permission || 'default';
  }

  function requestNotificationPermission() {
    if (!canUseNotifications()) return Promise.resolve('unsupported');
    try {
      var res = Notification.requestPermission();
      if (res && typeof res.then === 'function') return res;
    } catch (e) { }
    return new Promise(function (resolve) {
      try {
        Notification.requestPermission(function (perm) { resolve(perm); });
      } catch (err) {
        resolve(getNotificationPermission());
      }
    });
  }

  function computeNextFireTimestamp(targetMin, nowMs) {
    var now = new Date(nowMs || Date.now());
    var target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Math.floor(mod(targetMin) / 60),
      mod(targetMin) % 60,
      0,
      0
    );
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime();
  }

  function dateKeyForTimestamp(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function playGentleChime() {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var ctx = new AudioCtx();
      var now = ctx.currentTime;
      [528, 660].forEach(function (freq, idx) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.18);
        gain.gain.setValueAtTime(0.0001, now + idx * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.18 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.18 + 0.55);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.18);
        osc.stop(now + idx * 0.18 + 0.6);
      });
    } catch (e) { }
  }

  function showInAppBanner(title, body) {
    activeBanner = { title: title, body: body };
    playGentleChime();
    if (bannerTimer) clearTimeout(bannerTimer);
    render(true);
    bannerTimer = setTimeout(function () {
      activeBanner = null;
      var toast = document.querySelector('.notif-toast');
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 6500);
  }

  function renderInAppBanner() {
    if (!activeBanner) return '';
    return '<div class="notif-toast enter" role="status">' +
      '<div class="notif-toast-icon">🌙</div>' +
      '<div class="notif-toast-body">' +
        '<div class="notif-toast-meta"><span>Drift · Bedtime Reminder</span><span>now</span></div>' +
        '<strong>' + esc(activeBanner.title) + '</strong>' +
        '<p>' + esc(activeBanner.body) + '</p>' +
      '</div>' +
      '<button class="notif-toast-close" data-act="dismiss-banner" aria-label="Dismiss notification">✕</button>' +
    '</div>';
  }

  function showLocalNotification(title, body, tag) {
    showInAppBanner(title, body);
    if (!canUseNotifications() || Notification.permission !== 'granted') return false;
    var options = {
      body: body,
      tag: tag || 'drift-reminder',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      renotify: true,
      data: { url: './' }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg && reg.showNotification) {
          reg.showNotification(title, options).catch(function () {
            try { new Notification(title, options); } catch (e) { }
          });
        } else {
          try { new Notification(title, options); } catch (e) { }
        }
      }).catch(function () {
        try { new Notification(title, options); } catch (e) { }
      });
    } else {
      try { new Notification(title, options); } catch (e) { }
    }
    return true;
  }

  function clearReminderTimers() {
    while (reminderTimers.length) {
      clearTimeout(reminderTimers.pop());
    }
  }

  function postToServiceWorker(msg) {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg && reg.active) {
        reg.active.postMessage(msg);
      }
    }).catch(function () { });
  }

  function buildCueDefinitions(plan, p) {
    var cues = [];
    if (reminders.winddown) {
      cues.push({
        key: 'winddown',
        min: plan.windStart,
        title: 'Start winding down now',
        body: 'Dim the lights and put screens away for your ' + p.winddown + '-minute wind-down. Bedtime is ' + fmtTime(plan.bed) + '.'
      });
    }
    if (reminders.bed) {
      cues.push({
        key: 'bed',
        min: plan.bed,
        title: 'Time to get in bed',
        body: 'Lights out, phone across the room. Aim to be asleep around ' + fmtTime(plan.asleep) + ' for your ' + fmtTime(plan.wake) + ' alarm.'
      });
    }
    return cues;
  }

  function scheduleTonightReminders(p) {
    clearReminderTimers();
    if (!p || !reminders.enabled) {
      postToServiceWorker({ type: 'CANCEL_NOTIFICATIONS' });
      return;
    }

    var plan = computePlan(p);
    var now = Date.now();
    var cues = buildCueDefinitions(plan, p);
    var swItems = [];

    cues.forEach(function (cue) {
      var prop = cue.key === 'winddown' ? 'windFireAt' : 'bedFireAt';
      var existing = reminders[prop];

      // If a previously scheduled timestamp was just reached while the tab was backgrounded (within 15 minutes), fire it now
      if (existing && now >= existing && (now - existing) <= 15 * 60 * 1000) {
        var missedTag = 'drift-' + cue.key + '-' + dateKeyForTimestamp(existing);
        if (!reminders.firedTags[missedTag]) {
          reminders.firedTags[missedTag] = true;
          showLocalNotification(cue.title, cue.body, missedTag);
        }
      }

      var fireAt = computeNextFireTimestamp(cue.min, now);
      reminders[prop] = fireAt;
      var delay = Math.max(0, fireAt - now);
      var tag = 'drift-' + cue.key + '-' + dateKeyForTimestamp(fireAt);

      var timer = setTimeout(function () {
        if (!reminders.enabled) return;
        if (!reminders.firedTags[tag]) {
          reminders.firedTags[tag] = true;
          saveReminders();
          showLocalNotification(cue.title, cue.body, tag);
        }
        // Re-schedule for the next night
        setTimeout(function () {
          if (profile) scheduleTonightReminders(profile);
          if (view === 'home' && profile) renderHome(profile, false);
        }, 1500);
      }, delay);

      reminderTimers.push(timer);
      swItems.push({
        tag: tag,
        title: cue.title,
        body: cue.body,
        fireAt: fireAt
      });
    });

    if (!reminders.winddown) reminders.windFireAt = null;
    if (!reminders.bed) reminders.bedFireAt = null;
    saveReminders();
    if (getNotificationPermission() === 'granted') {
      postToServiceWorker({ type: 'SCHEDULE_NOTIFICATIONS', items: swItems });
    }
  }

  function reminderCardHtml(plan, p) {
    var perm = getNotificationPermission();
    var ctx = getIOSContext();
    var now = Date.now();
    var windNext = computeNextFireTimestamp(plan.windStart, now);
    var bedNext = computeNextFireTimestamp(plan.bed, now);
    var windInMin = Math.max(1, Math.round((windNext - now) / 60000));
    var bedInMin = Math.max(1, Math.round((bedNext - now) / 60000));
    var active = Boolean(reminders.enabled);

    var nextCueSummary = '';
    if (active) {
      var upcoming = [];
      if (reminders.winddown) upcoming.push({ label: '“Start winding down now”', at: plan.windStart, ts: windNext, inMin: windInMin });
      if (reminders.bed) upcoming.push({ label: '“Time to get in bed”', at: plan.bed, ts: bedNext, inMin: bedInMin });
      upcoming.sort(function (a, b) { return a.ts - b.ts; });
      if (upcoming.length) {
        var first = upcoming[0];
        nextCueSummary = '<div class="remind-live">' +
          '<span class="remind-dot"></span>' +
          '<span>Next alert: <strong>' + first.label + '</strong> at ' + fmtTime(first.at) + ' (in ' + fmtDur(first.inMin) + ')</span>' +
        '</div>';
      }
    }

    var envHint = '';
    if (ctx.ios && !ctx.standalone) {
      envHint = '<p class="remind-subhint">💡 Add Drift to your Home Screen below to receive lock-screen notifications on ' + esc(ctx.deviceName) + '.</p>';
    } else if (active && perm === 'denied') {
      envHint = '<p class="remind-subhint">💡 Browser notifications are muted in site settings, so alerts will chime inside the open app.</p>';
    }

    var noticeHtml = reminderNotice ? '<p class="remind-notice">' + esc(reminderNotice) + '</p>' : '';

    return '<div class="card remind-card">' +
      '<div class="remind-head">' +
        '<div>' +
          '<p class="eyebrow">Tonight’s alarms</p>' +
          '<h2>Bedtime notifications</h2>' +
        '</div>' +
        '<span class="remind-badge' + (active ? ' on' : '') + '">' + (active ? 'Scheduled' : 'Off') + '</span>' +
      '</div>' +
      '<p class="hint" style="margin-top:0">Schedule local notifications for tonight right from this device — no account or server needed.</p>' +
      '<div class="remind-cues">' +
        '<button type="button" class="remind-cue' + (reminders.winddown ? ' on' : '') + '" data-act="remind-cue" data-cue="winddown" aria-pressed="' + (reminders.winddown ? 'true' : 'false') + '">' +
          '<span class="remind-check">' + (reminders.winddown ? '✓' : '') + '</span>' +
          '<div class="remind-cue-info">' +
            '<b>“Start winding down now”</b>' +
            '<small>In ' + fmtDur(windInMin) + ' · ' + p.winddown + ' min before bed</small>' +
          '</div>' +
          '<span class="remind-cue-time">' + fmtTime(plan.windStart) + '</span>' +
        '</button>' +
        '<button type="button" class="remind-cue' + (reminders.bed ? ' on' : '') + '" data-act="remind-cue" data-cue="bed" aria-pressed="' + (reminders.bed ? 'true' : 'false') + '">' +
          '<span class="remind-check">' + (reminders.bed ? '✓' : '') + '</span>' +
          '<div class="remind-cue-info">' +
            '<b>“Time to get in bed”</b>' +
            '<small>In ' + fmtDur(bedInMin) + ' · lights out</small>' +
          '</div>' +
          '<span class="remind-cue-time">' + fmtTime(plan.bed) + '</span>' +
        '</button>' +
      '</div>' +
      nextCueSummary +
      envHint +
      noticeHtml +
      '<div class="remind-actions">' +
        (active
          ? '<button class="remind-btn-secondary" data-act="remind-test">Send test alert</button>' +
            '<button class="ghost remind-off-btn" data-act="remind-toggle">Turn off</button>'
          : '<button class="primary remind-enable-btn" data-act="remind-toggle">🔔 Schedule tonight’s notification' + (reminders.winddown && reminders.bed ? 's' : '') + '</button>') +
      '</div>' +
    '</div>';
  }

  function computePlan(p) {
    var wake = toMin(p.wake);
    var need = Math.round(p.need * 60);
    var lat = p.latency;
    var asleep = mod(wake - need);
    var bed = mod(asleep - lat);
    var windStart = mod(bed - p.winddown);

    var lastCaff = { morning: 660, afternoon: 900, evening: 1140 }[p.caffeine];
    var hasCaff = lastCaff !== undefined;
    var cutoff = hasCaff ? mod(asleep - 480) : null;
    var caffeineHours = hasCaff ? mod(asleep - lastCaff) / 60 : null;

    var exerciseEnd = p.exercise === 'evening' ? mod(bed - 180) : null;

    var cycles = [4, 5, 6].map(function (c) {
      return { c: c, dur: c * 90, bed: mod(wake - c * 90 - lat) };
    });
    var bestCycle = cycles.reduce(function (a, b) {
      return Math.abs(b.dur - need) < Math.abs(a.dur - need) ? b : a;
    });
    cycles.forEach(function (c) { c.best = c.c === bestCycle.c; });

    var weekend = null;
    if (p.weekend > 0) {
      var wkWake = mod(wake + p.weekend);
      var wkAsleep = mod(wkWake - need);
      weekend = { wake: wkWake, asleep: wkAsleep, bed: mod(wkAsleep - lat) };
    }

    var items = [
      { t: wake, icon: '☀️', label: 'Wake up', desc: 'Open the blinds and get some daylight' },
      hasCaff ? { t: cutoff, icon: '☕', label: 'Last caffeine', desc: 'No coffee, tea or energy drinks after this' } : null,
      exerciseEnd !== null ? { t: exerciseEnd, icon: '🏋️', label: 'Finish workouts', desc: 'Give your body time to cool down' } : null,
      { t: windStart, icon: '🕯️', label: 'Wind down, screens away', desc: p.winddown + ' minutes of dim lights and calm activities' },
      { t: bed, icon: '🛏️', label: 'Get in bed', desc: 'Lights out, phone across the room' },
      { t: asleep, icon: '🌙', label: 'Aim to be asleep', desc: 'About ' + lat + ' minutes after getting in bed' }
    ].filter(Boolean);
    items.sort(function (a, b) { return mod(a.t - wake) - mod(b.t - wake); });

    return {
      wake: wake, need: need, asleep: asleep, bed: bed, windStart: windStart,
      cutoff: cutoff, caffeineHours: caffeineHours, exerciseEnd: exerciseEnd,
      cycles: cycles, weekend: weekend, items: items
    };
  }

  function latePlan(plan, p) {
    var d = new Date();
    var now = d.getHours() * 60 + d.getMinutes();
    var lateBy = mod(now - plan.bed);
    var window = mod(plan.wake - plan.bed);
    if (lateBy < 1 || lateBy >= window) return null;
    var sleepAt = mod(now + p.latency);
    var avail = Math.max(0, window - lateBy - p.latency);
    return {
      sleepAt: sleepAt,
      avail: avail,
      shortfall: Math.max(0, plan.need - avail),
      cycles: Math.floor(avail / 90)
    };
  }

  function lateCard(plan, p, late) {
    var msg;
    if (late.avail <= 0) {
      msg = 'There is not enough time for a full night before your alarm. Rest now anyway, since even a short sleep helps.';
    } else if (late.shortfall > 0) {
      msg = 'That is ' + fmtDur(late.shortfall) + ' short of your target. Get into bed now and keep screens away to make the most of it.';
    } else {
      msg = 'You can still hit your full sleep target. Get into bed now and you are covered.';
    }
    var cycles = late.cycles >= 1 ? ' That covers ' + late.cycles + ' full sleep cycle' + (late.cycles === 1 ? '' : 's') + '.' : '';
    return '<div class="card enter"><p class="eyebrow">Running late</p><h2>Sleep you can still get</h2>' +
      '<div class="big">' + fmtDur(late.avail) + '</div>' +
      '<p class="hint">If you fall asleep at ' + fmtTime(late.sleepAt) + ', you will get ' + fmtDur(late.avail) +
      ' before your ' + fmtTime(plan.wake) + ' alarm. Your target is ' + fmtDur(plan.need) + '.</p>' +
      '<p class="hint">' + msg + cycles + '</p></div>';
  }

  function statusFor(plan, p) {
    var d = new Date();
    var now = d.getHours() * 60 + d.getMinutes();
    var sinceBed = mod(now - plan.bed);
    if (sinceBed <= 120 && sinceBed >= 0 && mod(plan.bed - plan.windStart) > 0 && now >= plan.bed && now < plan.wake) {
      return '😴 Sweet dreams, ' + esc(p.name || 'friend') + '.';
    }
    if (mod(now - plan.windStart) < p.winddown) return '🕯️ Wind-down time. Settle in now.';
    if (mod(plan.bed - now) <= 60) return '🛏️ Bedtime is close. Start heading there.';
    return 'Wind-down starts in ' + fmtDur(mod(plan.windStart - now));
  }

  function tipsFor(p, plan) {
    var struggleTips = {
      fall: 'Falling asleep is your main challenge. Keep the room cool and dark, and try slow breathing (in for 4, out for 6) once you are in bed.',
      stay: 'Waking in the night? Skip alcohol close to bedtime and keep big drinks out of the last hour.',
      early: 'Waking too early? Get outside in morning light soon after you wake, and use blackout curtains if dawn comes early.',
      unrested: 'Feeling unrested? A steady wake time, even on weekends, does more for sleep quality than extra hours in bed.',
      none: 'No major struggles. Keep your routine steady and it will keep working for you.'
    };
    var tips = [struggleTips[p.struggle]];
    if (p.latency >= 25) tips.push('Since you take a while to drift off, try a quick "brain dump" in a notebook during wind-down to park racing thoughts.');
    if (p.screens >= 45) tips.push('About ' + p.screens + ' minutes of screens before bed can delay sleep. Switch to night mode earlier and read something on paper.');
    if (plan.caffeineHours !== null && plan.caffeineHours < 8) tips.push('Your usual last cup is only about ' + Math.round(plan.caffeineHours) + ' hours before sleep. Try to finish by ' + fmtTime(plan.cutoff) + '.');
    if (p.exercise === 'evening') tips.push('Evening workouts are fine if they wrap up at least 3 hours before bed. Keep the last session light.');
    if (p.naps === 'long') tips.push('Long naps can make it harder to sleep at night. Keep naps under 30 minutes and before 3 PM.');
    if (p.winddown < 30) tips.push('A 30 to 60 minute wind-down gives your body time to shift into sleep mode.');
    if (p.weekend > 60) tips.push('Your weekend wake-up is later than on weekdays. Big shifts cause "social jetlag", so try to keep it within about an hour.');
    return tips.slice(0, 6);
  }

  function renderIntro() {
    app.innerHTML =
      '<section class="screen intro enter">' +
        '<div class="orb"><span>🌙</span></div>' +
        '<h1 class="brand">Drift</h1>' +
        '<p class="lede">Answer a few quick questions and get a bedtime plan built around your wake-up time, your sleep needs and your evening habits.</p>' +
        '<ul class="features">' +
          '<li>⏰ A bedtime that fits your alarm</li>' +
          '<li>🕯️ A personal wind-down schedule</li>' +
          '<li>🔁 Sleep-cycle friendly options</li>' +
        '</ul>' +
        '<button class="primary" data-act="start">Let’s begin</button>' +
        '<p class="fine">Your answers save privately on this device and the app works offline.</p>' +
        installHint() +
      '</section>';
  }

  function renderQuiz() {
    var q = QUESTIONS[step];
    var last = step === QUESTIONS.length - 1;
    var v = draft[q.id];
    var body = '';

    if (q.type === 'text') {
      body = '<input id="inp" class="input" type="text" autocomplete="given-name" autocapitalize="words" maxlength="' + q.maxLength +
        '" placeholder="' + esc(q.placeholder) + '" value="' + esc(v || '') + '">';
    } else if (q.type === 'time') {
      body = '<input id="inp" class="input time" type="time" value="' + esc(v) + '">';
    } else if (q.type === 'slider') {
      body = '<div class="slider-wrap"><div class="big" id="sliderVal">' + fmtHours(v) + '</div>' +
        '<input id="inp" type="range" min="' + q.min + '" max="' + q.max + '" step="' + q.step + '" value="' + v + '"></div>';
    } else {
      body = '<div class="choices">' + q.options.map(function (o, i) {
        return '<button class="choice' + (o[0] === v ? ' on' : '') + '" data-choice="' + i + '"><span>' + o[1] + '</span>' +
          (o[2] ? '<small>' + o[2] + '</small>' : '') + '</button>';
      }).join('') + '</div>';
    }

    app.innerHTML =
      '<section class="screen enter">' +
        '<header class="top">' +
          '<button class="ghost" data-act="back">‹ Back</button>' +
          '<span class="count">' + (step + 1) + ' of ' + QUESTIONS.length + '</span>' +
        '</header>' +
        '<div class="progress"><span style="width:' + ((step + 1) / QUESTIONS.length * 100) + '%"></span></div>' +
        '<div class="card qcard" id="qcard">' +
          '<h1>' + q.title + '</h1>' +
          (q.hint ? '<p class="hint">' + q.hint + '</p>' : '') +
          body +
        '</div>' +
        '<footer class="bottom">' +
          (q.type === 'choice' ? '' : '<button class="primary" data-act="next">' + (last ? 'See my plan' : 'Continue') + '</button>') +
        '</footer>' +
      '</section>';

    var inp = document.getElementById('inp');
    if (inp && q.type === 'text') setTimeout(function () { inp.focus(); }, 300);
  }

  function renderHome(p, preview) {
    var plan = computePlan(p);
    var name = esc(p.name || 'friend');
    var h = new Date().getHours();
    var greet = preview ? 'Here is your plan' : (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
    var dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    var status = preview ? 'Looks right? Save it below.' : statusFor(plan, p);

    var timeline = plan.items.map(function (it) {
      return '<li><div class="dot">' + it.icon + '</div><div><div class="l">' + it.label + '</div><div class="d">' + it.desc +
        '</div></div><div class="t">' + fmtTime(it.t) + '</div></li>';
    }).join('');

    var cycles = plan.cycles.map(function (c) {
      return '<div class="cycle' + (c.best ? ' best' : '') + '"><div><b>' + c.c + ' cycles</b>' + (c.best ? '<span class="tag">Best match</span>' : '') +
        '<small>' + fmtDur(c.dur) + ' of sleep</small></div><div class="cyc-time">' + fmtTime(c.bed) + '</div></div>';
    }).join('');

    var weekend = '';
    if (plan.weekend) {
      weekend = '<div class="card enter"><p class="eyebrow">Weekends</p><h2>Weekend rhythm</h2>' +
        '<div class="cycle"><div><b>Up at</b><small>' + fmtTime(plan.weekend.wake) + '</small></div><div class="cyc-time">Bed ' + fmtTime(plan.weekend.bed) + '</div></div>' +
        '<p class="hint">Sleep in a little if you need to, but keeping this within an hour of your weekday schedule helps you feel better on Monday.</p></div>';
    }

    var tips = tipsFor(p, plan).map(function (t) { return '<li>' + t + '</li>'; }).join('');

    var late = preview ? null : latePlan(plan, p);
    var lateHtml = late ? lateCard(plan, p, late) : '';
    var remindersHtml = preview ? '' : reminderCardHtml(plan, p);

    var actions = preview
      ? '<button class="primary" data-act="save">Save and open my plan</button>' +
        '<button class="ghost" data-act="change">Change my answers</button>'
      : '<div class="actions"><button class="ghost" data-act="edit">Edit my answers</button>' +
        '<button class="danger" data-act="reset">Erase everything</button></div>';

    app.innerHTML =
      renderInAppBanner() +
      '<section class="screen enter">' +
        '<header class="greet">' +
          '<div><p class="eyebrow">' + dateStr + '</p><h1>' + greet + ', ' + name + '</h1></div>' +
          '<div class="moon-badge">🌙</div>' +
        '</header>' +
        '<div class="card hero">' +
          '<p class="eyebrow">Be in bed by</p>' +
          '<div class="hero-time">' + fmtTime(plan.bed) + '</div>' +
          '<p class="hero-sub">Asleep around ' + fmtTime(plan.asleep) + ' · up at ' + fmtTime(plan.wake) + ' · ' + fmtHours(plan.need / 60) + ' of sleep</p>' +
          '<div class="status">' + status + '</div>' +
        '</div>' +
        lateHtml +
        remindersHtml +
        '<div class="card"><h2>Tonight’s timeline</h2><ol class="timeline">' + timeline + '</ol></div>' +
        '<div class="card"><h2>Sleep-cycle bedtimes</h2>' +
          '<p class="hint" style="margin-top:0">Sleep cycles last about 90 minutes. Waking at the end of one feels easier.</p>' +
          '<div style="margin-top:14px">' + cycles + '</div></div>' +
        weekend +
        '<div class="card"><h2>Personal tips</h2><ul class="tips">' + tips + '</ul></div>' +
        actions +
        (preview ? '' : installHint()) +
      '</section>';
  }

  function render(preserveScroll) {
    var y = preserveScroll ? window.scrollY : 0;
    if (view === 'intro') renderIntro();
    else if (view === 'quiz') renderQuiz();
    else if (view === 'preview') renderHome(draft, true);
    else renderHome(profile, false);
    if (preserveScroll) window.scrollTo(0, y);
    else window.scrollTo(0, 0);
  }

  function flashReminderNotice(msg) {
    reminderNotice = msg;
    render(true);
    setTimeout(function () {
      if (reminderNotice === msg) {
        reminderNotice = '';
        var el = document.querySelector('.remind-notice');
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
    }, 5000);
  }

  function next() {
    var q = QUESTIONS[step];
    if (q.type === 'text') {
      var t = (draft.name || '').trim();
      if (!t) {
        var card = document.getElementById('qcard');
        if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
        return;
      }
      draft.name = t;
    }
    if (step < QUESTIONS.length - 1) step++;
    else view = 'preview';
    render();
  }

  function back() {
    if (view === 'preview') { step = QUESTIONS.length - 1; view = 'quiz'; }
    else if (step > 0) step--;
    else view = editing ? 'home' : 'intro';
    render();
  }

  function pickChoice(i) {
    if (busy) return;
    var q = QUESTIONS[step];
    draft[q.id] = q.options[i][0];
    busy = true;
    renderQuiz();
    setTimeout(function () {
      busy = false;
      next();
    }, 240);
  }

  app.addEventListener('click', function (e) {
    var iosStepEl = e.target.closest('[data-ios-step]');
    if (iosStepEl) {
      iosStep = Number(iosStepEl.getAttribute('data-ios-step')) || 0;
      iosManualPauseUntil = Date.now() + 7000;
      updateIOSWalkthroughDOM();
      return;
    }

    var choice = e.target.closest('[data-choice]');
    if (choice) { pickChoice(Number(choice.getAttribute('data-choice'))); return; }

    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');

    if (act === 'start') {
      draft = defaults();
      step = 0; editing = false; view = 'quiz'; render();
    } else if (act === 'next') {
      next();
    } else if (act === 'back') {
      back();
    } else if (act === 'save') {
      var p = Object.assign({}, draft);
      p.name = (draft.name || '').trim();
      save(p);
      profile = p;
      editing = false;
      view = 'home';
      scheduleTonightReminders(profile);
      render();
    } else if (act === 'change') {
      step = QUESTIONS.length - 1; view = 'quiz'; render();
    } else if (act === 'edit') {
      draft = Object.assign(defaults(), profile);
      step = 0; editing = true; view = 'quiz'; render();
    } else if (act === 'reset') {
      if (window.confirm('Erase your name and plan from this device? This cannot be undone.')) {
        try {
          localStorage.removeItem(KEY);
          localStorage.removeItem(REMINDER_KEY);
        } catch (err) { }
        clearReminderTimers();
        postToServiceWorker({ type: 'CANCEL_NOTIFICATIONS' });
        reminders = defaultReminders();
        profile = null;
        draft = defaults();
        step = 0; editing = false; view = 'intro'; render();
      }
    } else if (act === 'install') {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt = null;
        render(true);
      }
    } else if (act === 'toggle-ios-guide') {
      showIOSGuideOverride = !showIOSGuideOverride;
      iosStep = 0;
      render(true);
      if (showIOSGuideOverride) {
        var guide = document.getElementById('iosGuideCard');
        if (guide && guide.scrollIntoView) {
          guide.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    } else if (act === 'focus-ios-guide') {
      showIOSGuideOverride = true;
      render(true);
      var targetGuide = document.getElementById('iosGuideCard');
      if (targetGuide && targetGuide.scrollIntoView) {
        targetGuide.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (act === 'copy-url') {
      var url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          copyFeedback = 'Copied!';
          render(true);
          setTimeout(function () { copyFeedback = ''; render(true); }, 2200);
        }).catch(function () { });
      }
    } else if (act === 'remind-cue') {
      var cueKey = b.getAttribute('data-cue');
      if (cueKey === 'winddown' || cueKey === 'bed') {
        var otherKey = cueKey === 'winddown' ? 'bed' : 'winddown';
        if (reminders[cueKey] && !reminders[otherKey]) {
          reminders[otherKey] = true;
        }
        reminders[cueKey] = !reminders[cueKey];
        saveReminders();
        if (reminders.enabled && profile) {
          scheduleTonightReminders(profile);
        }
        render(true);
      }
    } else if (act === 'dismiss-banner') {
      activeBanner = null;
      if (bannerTimer) clearTimeout(bannerTimer);
      render(true);
    } else if (act === 'remind-toggle') {
      if (reminders.enabled) {
        reminders.enabled = false;
        reminders.windFireAt = null;
        reminders.bedFireAt = null;
        saveReminders();
        clearReminderTimers();
        postToServiceWorker({ type: 'CANCEL_NOTIFICATIONS' });
        flashReminderNotice('Tonight’s notifications turned off.');
        return;
      }

      requestNotificationPermission().then(function () {
        if (!reminders.winddown && !reminders.bed) {
          reminders.winddown = true;
        }
        reminders.enabled = true;
        saveReminders();
        if (profile) scheduleTonightReminders(profile);
        var planNow = computePlan(profile);
        var targetLabel = reminders.winddown ? fmtTime(planNow.windStart) : fmtTime(planNow.bed);
        flashReminderNotice('Scheduled for tonight! Your “Start winding down now” alert is set for ' + targetLabel + '.');
      });
    } else if (act === 'remind-test') {
      requestNotificationPermission().then(function () {
        if (profile) {
          var planTest = computePlan(profile);
          showLocalNotification(
            'Start winding down now',
            'Dim the lights and put screens away for your ' + profile.winddown + '-minute wind-down. Bedtime is ' + fmtTime(planTest.bed) + '.',
            'drift-test'
          );
          flashReminderNotice('Sent a “Start winding down now” test notification.');
        }
      });
    }
  });

  app.addEventListener('input', function (e) {
    if (e.target.id !== 'inp') return;
    var q = QUESTIONS[step];
    if (q.type === 'slider') {
      draft[q.id] = parseFloat(e.target.value);
      var label = document.getElementById('sliderVal');
      if (label) label.textContent = fmtHours(draft[q.id]);
    } else {
      draft[q.id] = e.target.value;
    }
  });

  app.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.id === 'inp' && QUESTIONS[step].type === 'text') {
      e.preventDefault();
      next();
    }
  });

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (view === 'intro' || view === 'home') render(true);
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    if (view === 'intro' || view === 'home') render(true);
  });

  if (window.matchMedia) {
    try {
      var mq = window.matchMedia('(display-mode: standalone)');
      if (mq.addEventListener) {
        mq.addEventListener('change', function () {
          if (view === 'intro' || view === 'home') render(true);
        });
      }
    } catch (e) { }
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && profile) {
      scheduleTonightReminders(profile);
      if (view === 'home') render(true);
    }
  });

  window.addEventListener('focus', function () {
    if (profile) {
      scheduleTonightReminders(profile);
      if (view === 'home') render(true);
    }
  });

  setInterval(function () {
    if (profile) scheduleTonightReminders(profile);
    if (view === 'home') render(true);
  }, 60000);

  if (profile) scheduleTonightReminders(profile);
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function () {
        if (profile && reminders.enabled) scheduleTonightReminders(profile);
      }).catch(function () { });
    });
  }
})();
