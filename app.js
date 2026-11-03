(function () {
  'use strict';

  var KEY = 'drift.profile.v1';
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

  function defaults() {
    var d = {};
    QUESTIONS.forEach(function (q) { d[q.id] = q.def; });
    return d;
  }

  function isStandalone() {
    return window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function installHint() {
    if (isStandalone()) return '';
    if (deferredPrompt) return '<button class="install-btn" data-act="install">Install Drift on this device</button>';
    if (isIOS()) return '<p class="install">Install on iPhone: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</p>';
    return '';
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

    var actions = preview
      ? '<button class="primary" data-act="save">Save and open my plan</button>' +
        '<button class="ghost" data-act="change">Change my answers</button>'
      : '<div class="actions"><button class="ghost" data-act="edit">Edit my answers</button>' +
        '<button class="danger" data-act="reset">Erase everything</button></div>';

    app.innerHTML =
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

  function render() {
    if (view === 'intro') renderIntro();
    else if (view === 'quiz') renderQuiz();
    else if (view === 'preview') renderHome(draft, true);
    else renderHome(profile, false);
    window.scrollTo(0, 0);
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
      render();
    } else if (act === 'change') {
      step = QUESTIONS.length - 1; view = 'quiz'; render();
    } else if (act === 'edit') {
      draft = Object.assign(defaults(), profile);
      step = 0; editing = true; view = 'quiz'; render();
    } else if (act === 'reset') {
      if (window.confirm('Erase your name and plan from this device? This cannot be undone.')) {
        try { localStorage.removeItem(KEY); } catch (err) { }
        profile = null;
        draft = defaults();
        step = 0; editing = false; view = 'intro'; render();
      }
    } else if (act === 'install') {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt = null;
        render();
      }
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
    if (view === 'intro' || view === 'home') render();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    if (view === 'intro' || view === 'home') render();
  });

  setInterval(function () {
    if (view === 'home') renderHome(profile, false);
  }, 60000);

  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    });
  }
})();
