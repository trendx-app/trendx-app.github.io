/* 건강 습관 알림 — 켜고 끄기·시간을 정하면 매일 반복 일정 + 정시 알림이 든 캘린더 파일(.ics)을 만들어 휴대폰 캘린더에 넣는다.
   이 사이트는 서버가 없어 닫혀 있는 동안 스스로 알림을 보낼 수 없다 → 알림은 휴대폰 캘린더 앱이 보낸다.
   설정은 이 기기(localStorage)에만 저장하고, 캘린더 파일도 브라우저 안에서 만든다(아무것도 서버로 보내지 않음).
   시각은 시간대 없는 '현지 시각'으로 넣는다 — 해외에서도 그 나라 아침 7시에 울린다. */
(function (global) {
  'use strict';
  var KEY = 'cheryeok.reminders';
  var ITEMS = [
    { id: 'morning', time: '07:00', min: 10 },
    { id: 'water', time: '12:00', min: 5 },
    { id: 'move', time: '17:00', min: 30 },
    { id: 'night', time: '22:00', min: 10 }
  ];
  var T = {
    ko: {
      title: '건강 습관 알림',
      lead: '매일 정한 시간에 휴대폰 알림으로 챙겨 드려요. 켜고 끄기와 시간은 마음대로 바꿀 수 있어요.',
      items: {
        morning: { name: '일어나서 스트레칭', title: '🌅 굿모닝! 스트레칭 10분 할 시간이에요', body: '기지개 쭈욱~ 몸을 살살 깨우면 오늘 하루가 더 가뿐해져요 :)' },
        water: { name: '점심 물 한 모금', title: '💧 물 한 모금 마셔요 :)', body: '꿀꺽꿀꺽~ 촉촉한 몸이 오후 집중력을 지켜 줘요' },
        move: { name: '저녁 운동', title: '🏃 오늘 몸 좀 움직여 볼까요?', body: '30분만 걸어도 충분해요! 가까운 공공체육시설도 기다리고 있어요 ✨' },
        night: { name: '자기 전 릴렉스', title: '🌙 오늘도 수고 많았어요', body: '자기 전에 명상과 스트레칭으로 몸을 사르르 릴렉스하는 시간을 가져요 :)' }
      },
      on: '켜짐', off: '꺼짐', time: '시간',
      add: '📅 휴대폰 캘린더에 알림 넣기', none: '켜진 알림이 없어요. 하나 이상 켜 주세요.',
      how: '파일을 열면 캘린더에 매일 반복 일정이 추가되고, 정한 시간에 휴대폰 알림이 떠요. iPhone 은 「모두 추가」, 갤럭시는 「캘린더」로 열어 주세요. 시간을 바꿨다면 예전 일정을 지우고 다시 넣어 주세요.',
      saved: '설정은 이 기기에만 저장되고, 아무것도 서버로 보내지 않아요.',
      cal: '건강 습관 알림(내 체력, 우리 동네 기준으로)',
      fname: 'health-reminders.ics'
    },
    en: {
      title: 'Healthy-habit reminders',
      lead: 'Get a phone reminder at the times you choose, every day. Turn each one on or off and change its time.',
      items: {
        morning: { name: 'Morning stretch', title: '🌅 Good morning! Time for a 10-minute stretch', body: 'Reach up high~ waking your body gently makes the whole day lighter :)' },
        water: { name: 'Lunchtime water', title: '💧 Take a sip of water :)', body: 'Gulp gulp~ staying hydrated keeps your afternoon focus sharp' },
        move: { name: 'Evening workout', title: '🏃 Shall we get moving today?', body: 'Just a 30-minute walk is plenty! Public sports facilities nearby are waiting ✨' },
        night: { name: 'Bedtime relax', title: '🌙 You did great today', body: 'Before bed, take a moment to relax with meditation and stretching :)' }
      },
      on: 'On', off: 'Off', time: 'Time',
      add: '📅 Add reminders to my phone calendar', none: 'All reminders are off. Turn at least one on.',
      how: 'Opening the file adds daily repeating events to your calendar, and your phone alerts you at those times. On iPhone tap "Add All"; on Android open it with your calendar app. If you change a time, delete the old events and add them again.',
      saved: 'Settings stay on this device only. Nothing is sent to any server.',
      cal: 'Healthy-habit reminders (My Fitness, My Neighborhood)',
      fname: 'health-reminders.ics'
    }
  };
  function lang() { return /^en/i.test(document.documentElement.lang || '') ? 'en' : 'ko'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function load() {
    var st = {};
    ITEMS.forEach(function (it) { st[it.id] = { on: true, time: it.time }; });
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      Object.keys(st).forEach(function (k) {
        var v = saved[k];
        if (v && typeof v.on === 'boolean') st[k].on = v.on;
        if (v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time || '')) st[k].time = v.time;
      });
    } catch (e) { /* 저장소가 막혀 있어도 기본값으로 동작 */ }
    return st;
  }
  function save(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 저장 실패해도 화면은 동작 */ } }

  /* ── 캘린더 파일(RFC 5545) — 순수 함수(시험 대상) */
  function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) {                       // 한 줄 75바이트(UTF-8) 넘으면 접는다
    var out = [], cur = '', n = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], code = line.codePointAt(i);
      if (code > 0xffff) { ch = line.slice(i, i + 2); i++; }
      var b = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
      if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; }
      cur += ch; n += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'; }
  function firstLocal(now, hhmm) {            // 오늘 그 시각이 지났으면 내일부터
    var p = hhmm.split(':'), d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +p[0], +p[1], 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }
  function buildIcs(st, lg, now) {
    var t = T[lg] || T.ko, L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TrendX//cheryeok health reminders//' + lg.toUpperCase(), 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsText(t.cal)];
    ITEMS.forEach(function (it) {
      var s = st[it.id];
      if (!s || !s.on) return;
      var tx = t.items[it.id];
      L.push('BEGIN:VEVENT', 'UID:cheryeok-' + it.id + '@trendx-app.github.io', 'DTSTAMP:' + stamp(now),
        'DTSTART:' + firstLocal(now, s.time), 'DURATION:PT' + it.min + 'M', 'RRULE:FREQ=DAILY',
        'SUMMARY:' + icsText(tx.title), 'DESCRIPTION:' + icsText(tx.body), 'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(tx.title), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }

  /* ── 화면 */
  var st = null;
  function render() {
    var sec = document.getElementById('steprem');
    if (!sec) return;
    var t = T[lang()];
    document.getElementById('h-steprem').textContent = t.title;
    document.getElementById('rem-lead').textContent = t.lead;
    document.getElementById('rem-list').innerHTML = ITEMS.map(function (it) {
      var s = st[it.id], tx = t.items[it.id];
      return '<li class="rem' + (s.on ? '' : ' off') + '" data-id="' + it.id + '">' +
        '<label class="switch"><input type="checkbox" role="switch" data-k="on"' + (s.on ? ' checked' : '') + ' aria-label="' + esc(tx.name) + '"><span class="knob" aria-hidden="true"></span></label>' +
        '<div class="rem-main"><div class="rem-name">' + esc(tx.name) + '</div><div class="rem-msg">' + esc(tx.title) + '</div>' +
        '<input type="time" data-k="time" value="' + esc(s.time) + '" aria-label="' + esc(tx.name + ' ' + t.time) + '"' + (s.on ? '' : ' disabled') + '></div>' +
        '</li>';
    }).join('');
    var btn = document.getElementById('rem-add');
    btn.textContent = t.add;
    btn.disabled = !ITEMS.some(function (it) { return st[it.id].on; });
    document.getElementById('rem-note').textContent = btn.disabled ? t.none : t.how;
    document.getElementById('rem-saved').textContent = t.saved;
  }
  function onChange(e) {
    var li = e.target.closest('.rem');
    if (!li) return;
    var s = st[li.dataset.id];
    if (e.target.dataset.k === 'on') s.on = e.target.checked;
    if (e.target.dataset.k === 'time' && /^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value)) s.time = e.target.value;
    save(st); render();
  }
  function download() {
    var lg = lang(), t = T[lg];
    var blob = new Blob([buildIcs(st, lg, new Date())], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = t.fname; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      if (!document.getElementById('steprem')) return;
      st = load();
      document.getElementById('rem-list').addEventListener('change', onChange);
      document.getElementById('rem-add').addEventListener('click', download);
      render();
    });
    document.addEventListener('cheryeok:lang', function () { if (st) render(); });
    if (global.I18N && global.I18N.onChange) global.I18N.onChange(function () { if (st) render(); });   // 한/영 전환(js/i18n.js)
  }
  global.Reminders = { buildIcs: buildIcs, fold: fold, firstLocal: firstLocal, ITEMS: ITEMS, T: T };
})(typeof window !== 'undefined' ? window : globalThis);
