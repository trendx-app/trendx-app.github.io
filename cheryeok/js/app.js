/* cheryeok 앱 — 정적 JSON 만 읽는다. 서버·키 없음. 입력값은 기기 밖으로 나가지 않는다. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n, d) { return (Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toLocaleString('ko-KR'); };
  // 화면 문구는 전부 i18n.js 사전에서 온다(한국어 문구는 이전과 글자 하나까지 같다). 계산·연결 키는 데이터 원문(한국어) 그대로 쓴다.
  var t = I18N.t, withUnit = I18N.withUnit;

  var D = { meta: null, norms: null, ex: null, summary: null, grade: null };
  var S = { age: null, sex: null, inputs: {}, results: [], weak: [], loc: null, sidoFiles: {}, filterTypes: {}, keyword: null };
  var mapApi = null;

  // ────────── CaloryX 구역 영상 대표 그림 — 화면에 가까워질 때만 붙인다(첫 화면 전송량을 늘리지 않는다). 데이터 로드와 무관하게 바로 건다.
  (function lazyPosters() {
    var vids = $$('video[data-poster]');
    var put = function (v) { if (!v.getAttribute('poster')) v.setAttribute('poster', v.getAttribute('data-poster')); };
    if (!('IntersectionObserver' in window)) { vids.forEach(put); return; }
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { put(e.target); io.unobserve(e.target); } }); }, { rootMargin: '400px 0px' });
    vids.forEach(function (v) { io.observe(v); });
  })();

  // ────────── 데이터 로드
  function loadJSON(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }); }
  Promise.all([loadJSON('data/meta.json'), loadJSON('data/norms.json'), loadJSON('data/exercise_map.json'), loadJSON('data/facilities/summary.json')])
    .then(function (a) { D.meta = a[0]; D.norms = a[1]; D.ex = a[2]; D.summary = a[3]; init(); })
    .catch(function (e) {
      var show = function () { $('#banner').innerHTML = '<div class="banner-error" role="alert">' + t('err.data', { msg: esc(e.message) }) + '</div>'; };
      show(); I18N.onChange(show);
    });

  function init() {
    renderBanner();
    renderFootSources();
    $('#age').addEventListener('input', renderItems);
    $$('input[name=sex]').forEach(function (r) { r.addEventListener('change', renderItems); });
    $('#form').addEventListener('submit', function (e) { e.preventDefault(); run(false); });
    $('#btn-noinput').addEventListener('click', function () { run(true); });
    $('#btn-example').addEventListener('click', fillExample);
    $('#btn-demo').addEventListener('click', function () { fillExample(); run(false); });   // 심사위원·측정값 없는 사용자: 예시 프로필(남 38세)로 4단계를 바로 보여 준다
    $('#btn-geo').addEventListener('click', useGeo);
    $('#sel-sido').addEventListener('change', onSido);
    $('#sel-sgg').addEventListener('change', onSgg);
    fillSido();
    renderItems();
    I18N.onChange(relang);
    applyHash();
    window.addEventListener('hashchange', applyHash);
  }
  function renderBanner() {
    if (D.meta.mock) $('#banner').innerHTML = '<div class="banner-mock" role="status">' + t('banner.mock') + '</div>';
  }
  function renderFootSources() {
    var nm = D.norms.meta, fm = D.summary.meta;
    $('#foot-sources').textContent = t('foot.sources', { period: I18N.period(nm.period || ''), n: fmt(nm.n_used), nf: fmt(fm.n_out), basis: I18N.src(fm.basis), gen: nm.generated_at.slice(0, 16).replace('T', ' ') });
  }

  // ────────── 언어 전환 — 고른 즉시 같은 상태(입력값·결과·지역·필터)를 새 언어로 다시 그린다. 정적 문구는 i18n.js 가 먼저 바꿨다.
  function relang() {
    renderBanner();
    renderFootSources();
    renderItems();
    $$('#items input').forEach(function (i) { if (i.value !== '') validate(i); });
    if ($('#age-hint').textContent) $('#age-hint').textContent = t('err.age');
    if ($('#sex-hint').textContent) $('#sex-hint').textContent = t('err.sex');
    relabelLocSelects();
    renderChips(); syncChips();
    if (!$('#step2').hidden) { if (S.noGroup) renderNoGroup(); else if (S.group) renderResults(); }   // 계산은 다시 하지 않는다 — 이미 계산한 S 그대로
    if (!$('#stepai').hidden) renderGrade();
    if (!$('#step3').hidden) renderWeak();
    if (S.embedKind && !$('#embed-bar').hidden) renderEmbedBar(S.embedKind);
    renderLead();
    if ($('#btn-geo').disabled) $('#btn-geo').textContent = t('geo.busy');
    renderMapFail();
    if (mapApi && mapApi.setLang) mapApi.setLang();
    if (!$('#step4').hidden) {
      listFacilities(true);   // 지도 시점은 그대로 두고 목록·점 문구만 바꾼다
      if (mapApi && mapApi.ready && S.loc) mapApi.setFacilities(filtered(S.sidoFiles[S.loc.sido] || []));
    }
  }

  // ────────── 앱 연동(embed) — 값은 주소의 '#' 뒤로만 받는다.
  // '#' 조각은 브라우저가 서버로 보내지 않으므로(요청·Referer 모두 제외) "입력값은 이 기기 밖으로 나가지 않습니다"가 그대로 지켜진다. '?' 쿼리는 받지 않는다.
  // 예: index.html#embed=1&age=38&sex=M&height=173&weight=74&f052=41&lang=en  (측정값 키 = norms.json items 코드, lang = ko|en)
  function applyHash() {
    var raw = location.hash.replace(/^#/, '');
    if (raw.indexOf('=') < 0) return;
    var p = new URLSearchParams(raw);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 파일 열기 등 — 값은 이미 읽었다 */ }
    if (p.get('lang')) I18N.set(p.get('lang'), false);   // 링크가 정한 언어 — 이 화면에만 쓰고 저장하지 않는다
    var num = function (k) { var v = parseFloat(p.get(k)); return isFinite(v) ? v : null; };
    var age = num('age'), sx = String(p.get('sex') || '').toUpperCase();
    var sex = (sx === 'M' || sx === 'MALE') ? 'M' : (sx === 'F' || sx === 'FEMALE') ? 'F' : null;
    if (age != null) $('#age').value = Math.round(age);
    if (sex) $('#sex-' + sex.toLowerCase()).checked = true;
    renderItems();
    p.forEach(function (v, k) { if (/^f\d{3}$/.test(k)) { var i = $('#in-' + k); if (i) { i.value = v; validate(i); } } });   // 그 연령대에 없는 항목은 칸이 없으므로 받지 않는다
    if (num('height') != null) $('#height').value = num('height');
    if (num('weight') != null) $('#weight').value = num('weight');
    if (p.get('embed') !== '1') return;
    document.body.classList.add('embed');
    var ok = Math.round(age) >= 19 && Math.round(age) <= 120 && sex;
    if (!ok) { $('#step1').hidden = false; $('#embed-bar').hidden = true; return; }   // 값이 모자라면 입력 화면을 그대로 보여 준다
    $('#step1').hidden = true;
    run(false, true);
    renderEmbedBar('received');
  }
  function renderEmbedBar(kind) {   // kind: 'received' 앱에서 받은 값 · 'calculated' 계산한 값
    S.embedKind = kind;
    var h = parseFloat($('#height').value), w = parseFloat($('#weight').value);
    var n = $$('#items input').filter(function (i) { return i.value !== ''; }).length;
    var bits = [t('embed.age', { age: $('#age').value }), currentSex() === 'M' ? t('sex.M') : t('sex.F')];
    if (h > 0) bits.push(t('embed.height', { v: fmt(h, 1) }));
    if (w > 0) bits.push(t('embed.weight', { v: fmt(w, 1) }));
    bits.push(n ? t('embed.nItems', { n: n }) : t('embed.noItems'));
    var bar = $('#embed-bar');
    bar.innerHTML = '<p><strong>' + esc(t('embed.' + kind)) + '</strong> ' + esc(bits.join(' · ')) + '</p><button type="button" class="btn btn-secondary" id="btn-edit">' + t('embed.edit') + '</button>';
    bar.hidden = false;
    $('#btn-edit').addEventListener('click', function () {
      $('#step1').hidden = false;
      $('#step1').scrollIntoView({ behavior: 'smooth', block: 'start' });
      var first = $$('#items input').filter(function (i) { return i.value === ''; })[0] || $('#age');
      first.focus({ preventScroll: true });
    });
  }

  // ────────── ① 입력
  function who(age) { return age >= 65 ? 'senior' : 'adult'; }
  function IT(c) { return I18N.item(c, D.norms.items[c]); }   // 측정 항목 표시 문구(이름·단위·힌트·운동 요소)
  function inputItems(age, sex) {
    // 그 연령대 비교 자료가 실제로 있는 항목만 보여 준다(성별 미선택이면 두 성별 중 하나라도 있으면). 없는 항목을 입력받아 놓고 결과에서 조용히 빼지 않는다.
    var w = who(age);
    var keys = sex ? [Percentile.bandKey(sex, age)] : [Percentile.bandKey('M', age), Percentile.bandKey('F', age)];
    var avail = {};
    keys.forEach(function (k) { var g = k && D.norms.groups[k]; if (g) Object.keys(g.items).forEach(function (c) { avail[c] = true; }); });
    return Object.keys(D.norms.items).filter(function (c) { var it = D.norms.items[c]; return it.input && (it.who === 'all' || it.who === w) && avail[c]; });
  }
  function currentSex() { return ($$('input[name=sex]').filter(function (r) { return r.checked; })[0] || {}).value; }
  function renderItems() {
    var age = parseInt($('#age').value, 10);
    var box = $('#items');
    var keep = {};
    $$('input', box).forEach(function (i) { if (i.value !== '') keep[i.dataset.code] = i.value; });
    if (!(age >= 19)) { box.innerHTML = ''; $('#items-sub').textContent = t('items.sub'); return; }
    $('#items-sub').textContent = age >= 65 ? t('items.senior') : t('items.adult');
    box.innerHTML = inputItems(age, currentSex()).map(function (c) {
      var it = IT(c);
      return '<div class="field" data-code="' + c + '"><label for="in-' + c + '">' + esc(it.label) + ' <span class="unit">' + esc(it.unit) + '</span></label>' +
        '<input id="in-' + c + '" type="number" inputmode="decimal" step="0.1" data-code="' + c + '" value="' + esc(keep[c] || '') + '"' + (it.hint ? ' aria-describedby="hint-' + c + '"' : '') + '><div class="hint" id="hint-' + c + '" data-default="' + esc(it.hint || '') + '">' + esc(it.hint || '') + '</div></div>';
    }).join('');
    $$('input', box).forEach(function (i) { i.addEventListener('input', function () { validate(i); }); });
  }
  function validate(i) {
    var it = D.norms.items[i.dataset.code], f = i.closest('.field'), h = $('.hint', f);
    var v = i.value === '' ? null : parseFloat(i.value);
    if (v === null) { f.classList.remove('invalid'); h.textContent = h.dataset.default || ''; return true; }
    if (isNaN(v) || v < it.range[0] || v > it.range[1]) { f.classList.add('invalid'); h.textContent = t('val.range', { a: it.range[0], bu: withUnit(it.range[1], IT(i.dataset.code).unit) }); return false; }
    f.classList.remove('invalid'); h.textContent = h.dataset.default || ''; return true;
  }
  function fillExample() {
    $('#age').value = 38; $('#sex-m').checked = true; renderItems();
    var ex = { f052: 41, f019: 32, f022: 205, f012: 8, f004: 86, f020: 38 };
    Object.keys(ex).forEach(function (c) { var i = $('#in-' + c); if (i) i.value = ex[c]; });
    $('#height').value = 173; $('#weight').value = 74;
  }

  // ────────── ② 계산·표시
  function run(noInput, noScroll) {
    var age = parseInt($('#age').value, 10);
    var sex = ($$('input[name=sex]').filter(function (r) { return r.checked; })[0] || {}).value;
    var ok = true;
    if (!(age >= 19 && age <= 120)) { $('#age-hint').textContent = t('err.age'); $('#age').closest('.field').classList.add('invalid'); ok = false; } else { $('#age-hint').textContent = ''; $('#age').closest('.field').classList.remove('invalid'); }
    if (!sex) { $('#sex-hint').textContent = t('err.sex'); ok = false; } else { $('#sex-hint').textContent = ''; }
    if (!ok) { $('#age').focus(); return; }
    S.age = age; S.sex = sex; S.inputs = {};
    if (!noInput) {
      $$('#items input').forEach(function (i) { if (i.value !== '' && validate(i)) S.inputs[i.dataset.code] = parseFloat(i.value); });
      var h = parseFloat($('#height').value), w = parseFloat($('#weight').value);
      if (w > 0 && S.inputs.f052) S.inputs.f028 = S.inputs.f052 / w * 100;
      if (h > 0 && w > 0) S.inputs.f018 = w / Math.pow(h / 100, 2);
    }
    var key = Percentile.bandKey(sex, age), g = D.norms.groups[key];
    if (!g || !Object.keys(g.items).length) { S.noGroup = true; renderNoGroup(); showFacilities(); return; }
    S.noGroup = false; S.group = g;
    S.results = [];
    var order = inputItems(age, sex).concat(['f028', 'f018']);
    order.forEach(function (c) {
      var it = D.norms.items[c], gi = g.items[c];
      if (!gi) return;
      var x = S.inputs[c];
      var r = { code: c, item: it, gi: gi, x: (x == null ? null : x), p: null, good: null };
      if (x != null) { r.p = Percentile.gridPercentile(gi.q, x); r.good = Percentile.goodPercentile(gi.q, x, it.better); }
      S.results.push(r);
    });
    renderResults();
    var hasInput = S.results.some(function (r) { return r.good != null; });
    if (hasInput) { renderWeak(); renderGrade(); } else { $('#step3').hidden = true; $('#stepai').hidden = true; S.keyword = null; }
    // 체중 비교(js/weight.js)에 값을 넘긴다 — '측정값 없이 보기'면 신장·체중도 쓰지 않는다
    document.dispatchEvent(new CustomEvent('cheryeok:run', { detail: { age: age, sex: sex, label: g.label, bmi: g.items.f018 || null,
      h: noInput ? null : parseFloat($('#height').value), w: noInput ? null : parseFloat($('#weight').value) } }));
    showFacilities();
    if (document.body.classList.contains('embed') && !$('#embed-bar').hidden) renderEmbedBar('calculated');   // 앱 연동에서 값을 고쳐 다시 계산하면 요약도 바꾼다
    if (!noScroll) $('#step2').scrollIntoView({ behavior: 'smooth', block: 'start' });   // 앱 연동 첫 화면은 맨 위 고지부터 보이게 스크롤하지 않는다
  }
  function renderNoGroup() {
    $('#step2').hidden = false; $('#basis').textContent = ''; $('#results').innerHTML = '<li class="empty">' + t('res.noGroup') + '</li>';
  }
  function renderResults() {
    var g = S.group;
    $('#basis').textContent = t('res.basis', { group: I18N.group(g.label), n: fmt(g.n), period: I18N.period(D.norms.meta.period || ''), id: '15108938' });
    $('#results').innerHTML = S.results.map(renderPct).join('');
    $('#step2').hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { $$('.bar-fill[data-w]').forEach(function (b) { b.style.width = b.dataset.w + '%'; }); $$('.bar-me[data-l]').forEach(function (b) { b.style.left = b.dataset.l + '%'; }); }); });
  }

  function renderPct(r) {
    var it = r.item, gi = r.gi, L = IT(r.code);
    var nTxt = '<span class="tag">' + (gi.low_n ? t('pct.lowN') : 'n=' + fmt(gi.n)) + '</span>';
    if (r.x == null) {
      return '<li class="pct muted"><div class="pct-head"><span class="pct-name">' + esc(L.label) + '<small>' + esc(L.unit) + '</small></span><span class="pct-val">' + t('pct.median', { v: fmt(gi.median, 1), unit: esc(L.unit) }) + '</span></div>' +
        '<div class="bar" aria-hidden="true"><div class="bar-fill" data-w="50"></div><div class="bar-median" style="left:50%"></div></div>' +
        '<p class="pct-note">' + t('pct.notEntered') + nTxt + '</p></li>';
    }
    var p = r.p, good = r.good;
    // 막대는 항목 방향과 무관하게 항상 "오른쪽 = 또래보다 강함". 방향 없는 참고 항목만 값의 위치를 그대로 보여 준다.
    var pos = Math.max(0, Math.min(100, good == null ? p : good));
    var note, tag = '', aria;
    if (good == null) { note = t('pct.noDir', { p: fmt(p, 0) }); aria = t('pct.noDirAria', { label: L.label, p: fmt(p, 0) }); }
    else {
      var rank = Math.max(1, Math.min(100, Math.round(100 - good)));
      note = t('pct.rank', { rank: rank }) + (it.better === 'low' ? t('pct.lowBetter') : '');
      aria = t('pct.rankAria', { label: L.label, rank: rank });
      if (good < 30) tag = ' <span class="tag tag-low">' + t('pct.weakTag') + '</span>';
    }
    var label = good == null ? [t('pct.valLow'), t('pct.valHigh')] : [t('pct.weaker'), t('pct.stronger')];
    return '<li class="pct"><div class="pct-head"><span class="pct-name">' + esc(L.label) + '<small>' + esc(L.unit) + (L.hint ? ' · ' + esc(L.hint) : '') + '</small></span><span class="pct-val">' + t('pct.mine', { v: fmt(r.x, 1), m: fmt(gi.median, 1) }) + '</span></div>' +
      '<div class="bar" role="img" aria-label="' + esc(aria) + '"><div class="bar-fill" data-w="' + pos.toFixed(1) + '"></div><div class="bar-median" style="left:50%" title="' + t('pct.medianTitle') + '"></div><div class="bar-me" data-l="' + pos.toFixed(1) + '" style="left:0%"></div></div>' +
      '<div class="bar-axis"><span>' + label[0] + '</span><span>' + t('pct.center') + '</span><span>' + label[1] + '</span></div>' +
      '<p class="pct-note">' + note + tag + ' ' + nTxt + '</p></li>';
  }

  // ────────── AI 예상 인증 등급 (경사부스팅 모델 JSON 129KB — 처음 필요할 때 한 번만 받는다)
  var gradeLoading = null;
  function loadGradeModel() {
    if (D.grade) return Promise.resolve(D.grade);
    if (!gradeLoading) gradeLoading = Promise.all([loadJSON('data/grade_model.json'), loadJSON('data/grade_cutoffs.json').catch(function () { return null; })])
      .then(function (a) { D.grade = a[0]; D.cutoffs = a[1]; return a[0]; });
    return gradeLoading;
  }
  /* 역산 경계값 표: 예상 등급의 다음 등급 기준과 내 값의 차이. 등급 비교는 모델 원문('1등급' 등)으로 하고 화면에만 바꿔 쓴다. */
  function renderTargets(topGrade) {
    var box = $('#ai-targets');
    if (!D.cutoffs) { box.innerHTML = ''; return; }
    var cell = D.cutoffs.groups[Percentile.bandKey(S.sex, S.age)];
    if (!cell) { box.innerHTML = ''; return; }
    var want = topGrade === '1등급' ? null : (topGrade === '2등급' ? 'g1' : 'g2');
    var label = I18N.grade(want === 'g1' ? '1등급' : '2등급');
    if (!want) { box.innerHTML = '<p class="sub">' + t('tgt.top') + '</p>'; return; }
    var rows = [];
    Object.keys(S.inputs).forEach(function (c) {
      var e = cell[c], it = D.norms.items[c];
      if (!e || e[want] == null || !it || !it.input) return;
      var L = IT(c);
      var v = S.inputs[c], cut = e[want], low = it.better === 'low';
      var ok = low ? v <= cut : v >= cut;
      var gap = low ? v - cut : cut - v;
      rows.push({ label: L.label, unit: L.unit, v: v, cut: cut, ok: ok, gap: gap, low: low, agree: e[want + '_agree'], n: e.n });
    });
    if (!rows.length) { box.innerHTML = ''; return; }
    rows.sort(function (a, b) { return (a.ok - b.ok) || (b.gap - a.gap); });
    box.innerHTML = '<p class="sub">' + t('tgt.intro', { label: label }) + '</p>' +
      '<table class="targets"><thead><tr><th>' + t('tgt.item') + '</th><th>' + t('tgt.mine') + '</th><th>' + t('tgt.cut', { label: label }) + '</th><th>' + t('tgt.gap') + '</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var diff = r.ok ? '<span class="ok">' + t('tgt.met') + '</span>' : '<b>' + t(r.low ? 'tgt.less' : 'tgt.more', { v: withUnit(fmt(Math.abs(r.gap), 1), esc(r.unit)) }) + '</b>';
        return '<tr><td>' + esc(r.label) + '</td><td>' + withUnit(fmt(r.v, 1), esc(r.unit)) + '</td><td>' + t(r.low ? 'tgt.atMost' : 'tgt.atLeast', { v: withUnit(fmt(r.cut, 1), esc(r.unit)) }) + '</td><td>' + diff + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<details class="evidence"><summary>' + t('tgt.evSummary') + '</summary><p class="src">' + t('tgt.ev', { list: rows.map(function (r) { return esc(r.label) + ' ' + Math.round(r.agree * 100) + '%'; }).join(' · '), n: fmt(rows[0].n) }) + '</p></details>';
  }
  function renderGrade() {
    var pct = {};
    S.results.forEach(function (r) { if (r.good != null && /^f\d{3}$/.test(r.code)) pct[r.code] = r.good; });
    var nIn = Object.keys(pct).length;
    if (!nIn) { $('#stepai').hidden = true; return; }
    $('#stepai').hidden = false;
    $('#ai-grade').innerHTML = '<div class="skeleton" style="width:60%"></div>'; $('#ai-whatif').innerHTML = ''; $('#ai-targets').innerHTML = '';
    loadGradeModel().then(function (m) {
      var sexM = S.sex === 'M' ? 1 : 0, age = S.age;
      var pr = Grade.predictProba(m, Grade.features(m, pct, sexM, age));
      var top = 0; pr.forEach(function (p, k) { if (p > pr[top]) top = k; });
      var v = m.meta.validation;
      $('#ai-lead').textContent = (nIn < 4 ? t('ai.few', { n: nIn }) : t('ai.ok'));
      $('#ai-grade').innerHTML = '<p class="grade-head">' + t('ai.head', { grade: esc(I18N.grade(m.classes[top])), p: Math.round(pr[top] * 100) }) + '</p>' +
        m.classes.map(function (c, k) { return '<div class="grade-row' + (k === top ? ' is-top' : '') + '"><span class="gl">' + esc(I18N.grade(c)) + '</span><div class="gb" aria-hidden="true"><div class="gf" data-w="' + (pr[k] * 100).toFixed(1) + '"></div></div><span class="gp">' + Math.round(pr[k] * 100) + '%</span></div>'; }).join('');
      requestAnimationFrame(function () { requestAnimationFrame(function () { $$('#ai-grade .gf[data-w]').forEach(function (b) { b.style.width = b.dataset.w + '%'; }); }); });
      renderTargets(m.classes[top]);
      var wi = Grade.whatIf(m, pct, sexM, age, 70).options.filter(function (o) { return o.gain > 0.02; }).slice(0, 3);
      if (wi.length) {
        $('#ai-whatif').innerHTML = '<p class="sub">' + t('ai.wiIntro') + '</p><ul class="whatif">' +
          wi.map(function (o) {
            var L = IT(o.code), k1 = m.classes.indexOf('1등급'), k2 = m.classes.indexOf('2등급');
            var before = Math.round((o.base[k1] + o.base[k2]) * 100), after = Math.round((o.proba[k1] + o.proba[k2]) * 100);
            var tb = 0; o.proba.forEach(function (p, k) { if (p > o.proba[tb]) tb = k; });
            return '<li>' + t('ai.wiRow', { label: esc(L.label), from: Math.round(100 - o.from), before: before, after: after, grade: esc(I18N.grade(m.classes[tb])) }) + '</li>';
          }).join('') + '</ul>';
      } else {
        $('#ai-whatif').innerHTML = '<p class="sub">' + t('ai.wiNone') + '</p>';
      }
      $('#ai-src').innerHTML = t('ai.disclaimer') +
        '<details class="evidence"><summary>' + t('ai.evSummary') + '</summary><p class="src">' + t('ai.ev', { n: fmt(m.meta.n_train_final), nt: fmt(v.n_test), acc: Math.round(v.acc * 100), base: Math.round(v.acc_baseline * 100), src: esc(I18N.src(m.meta.source)) }) + '</p></details>';
    }).catch(function (e) { $('#ai-grade').innerHTML = '<p class="empty">' + t('ai.fail', { msg: esc(e.message) }) + '</p>'; });
  }

  // ────────── ③ 약한 항목
  function renderWeak() {
    var cands = S.results.filter(function (r) { return r.good != null && r.item.domain !== '참고'; }).sort(function (a, b) { return a.good - b.good; });
    if (!cands.length) { $('#step3').hidden = true; return; }
    S.weak = cands.slice(0, cands.length === 1 ? 1 : 2);
    var kws = [];
    $('#weak').innerHTML = S.weak.map(function (r, idx) {
      var dom = D.ex.domains[r.item.domain] || { prescribed: [], facility_keywords: [] };
      var mv = D.ex.measure ? D.ex.measure[r.code] : null;
      var L = IT(r.code);
      kws = kws.concat(dom.facility_keywords || []);
      var head = (cands.length === 1) ? t('weak.single', { label: esc(L.label) }) : (idx === 0 ? t('weak.first') : t('weak.next')) + esc(L.label);
      var pres = (dom.prescribed || []).slice(0, 5);
      return '<div class="weak"><h3>' + head + '</h3><p class="why">' + t('weak.why', { domain: esc(L.domain), rank: Math.max(1, Math.min(100, Math.round(100 - r.good))) }) + '</p>' +
        (pres.length ? '<p class="sub">' + t('weak.presIntro', { domain: esc(L.domain), domainLower: esc(String(L.domain).toLowerCase()) }) + '</p><ul class="videos">' + pres.map(function (x) { return '<li><span class="vt">' + esc(I18N.exercise(x.name)) + '</span><span class="vm">' + t('weak.presN', { n: fmt(x.n) }) + '</span></li>'; }).join('') + '</ul>' : '<p class="empty">' + t('weak.noPres') + '</p>') +
        (mv ? '<p class="sub">' + t('weak.measure') + '<a href="' + esc(mv.url) + '" rel="noopener" target="_blank">' + t('weak.videoLink', { title: esc(mv.title), len: mv.length ? t('weak.videoLen', { s: Math.round(mv.length) }) : '' }) + '</a>' + (mv.tool ? t('weak.tool', { tool: esc(I18N.tool(mv.tool)) }) : '') + '</p>' : '') +
        '<button type="button" class="btn btn-secondary btn-fac" data-dom="' + esc(r.item.domain) + '">' + t('weak.facBtn') + '</button></div>';
    }).join('');
    $('#weak-src').textContent = t('weak.src', { src: I18N.src(D.ex.meta.prescribed_source), n: fmt(D.ex.meta.n_notes), vsrc: I18N.src(D.ex.meta.videos_source), mock: D.ex.meta.mock ? t('mock.suffix') : '' });
    $$('.btn-fac').forEach(function (b) { b.addEventListener('click', function () { setKeyword(D.ex.domains[b.dataset.dom].facility_keywords); $('#step4').scrollIntoView({ behavior: 'smooth' }); }); });
    S.keyword = kws.length ? kws : null;
    $('#step3').hidden = false;
  }

  // ────────── ④ 시설
  function typeName(code) { return I18N.ftype(code, D.summary.types[String(code)] || ''); }
  function sidoLabel(s) { return I18N.sido(s.code, s.name) + ' (' + fmt(s.n) + ')'; }
  function fillSido() {
    var sel = $('#sel-sido');
    D.summary.sido.forEach(function (s) { var o = document.createElement('option'); o.value = s.code; o.textContent = sidoLabel(s); sel.appendChild(o); });
    var tc = {}; D.summary.sido.forEach(function (s) { s.sgg.forEach(function (g) { Object.keys(g.by_type).forEach(function (k) { tc[k] = (tc[k] || 0) + g.by_type[k]; }); }); });
    S.chipTypes = Object.keys(tc).sort(function (a, b) { return tc[b] - tc[a]; }).slice(0, 8);
    renderChips();
  }
  function renderChips() {
    $('#filters').innerHTML = '<button type="button" class="chip" data-t="" aria-pressed="true">' + t('chip.all') + '</button>' + S.chipTypes.map(function (k) { return '<button type="button" class="chip" data-t="' + k + '" aria-pressed="false">' + esc(typeName(k)) + '</button>'; }).join('');
    $$('.chip').forEach(function (c) { c.addEventListener('click', function () { toggleChip(c); }); });
  }
  function relabelLocSelects() {   // 고른 값은 그대로 두고 글자만 바꾼다(시·군·구 이름은 공단 원문 그대로)
    var byCode = {}; D.summary.sido.forEach(function (s) { byCode[s.code] = s; });
    $$('#sel-sido option').forEach(function (o) { o.textContent = o.value ? sidoLabel(byCode[o.value]) : t('opt.select'); });
    var first = $('#sel-sgg option'); if (first && !first.value) first.textContent = t('opt.select');
  }
  function toggleChip(c) {
    if (c.dataset.t === '') { S.filterTypes = {}; }
    else { if (S.filterTypes[c.dataset.t]) delete S.filterTypes[c.dataset.t]; else S.filterTypes[c.dataset.t] = true; }
    syncChips(); listFacilities();
  }
  function syncChips() {
    var any = Object.keys(S.filterTypes).length > 0;
    $$('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c.dataset.t === '' ? String(!any) : String(!!S.filterTypes[c.dataset.t])); });
  }
  function setKeyword(kws) {   // 운동 요소 → 시설 유형: 데이터 원문(한국어) 유형 이름으로 맞춘다
    S.filterTypes = {};
    Object.keys(D.summary.types).forEach(function (k) { var nm = D.summary.types[k]; if (kws.some(function (w) { return nm.indexOf(w) >= 0; })) S.filterTypes[k] = true; });
    if (!Object.keys(S.filterTypes).length) S.filterTypes = {};
    syncChips(); listFacilities();
  }
  // 지도 라이브러리(0.8MB)는 첫 화면에서 받지 않고 ④단계가 열릴 때 한 번만 받는다. 실패해도 목록은 동작.
  var mapLibLoading = null;
  function loadMapLib() {
    if (window.maplibregl) return Promise.resolve();
    if (mapLibLoading) return mapLibLoading;
    mapLibLoading = new Promise(function (resolve, reject) {
      var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/maplibre-gl.css'; document.head.appendChild(css);
      var js = document.createElement('script'); js.src = 'vendor/maplibre-gl.js'; js.onload = resolve; js.onerror = function () { reject(new Error('maplibre load failed')); }; document.head.appendChild(js);
    });
    return mapLibLoading;
  }
  function showFacilities() {
    $('#step4').hidden = false;
    if (!mapApi && !mapLibLoading) {
      loadMapLib().then(createMap, function () { S.mapFail = { key: 'map.fail.lib' }; renderMapFail(); });
    }
    if (S.keyword) setKeyword(S.keyword); else listFacilities();
  }
  function renderMapFail() {
    var fb = $('#map-fallback');
    if (fb && S.mapFail) fb.textContent = t(S.mapFail.key, { msg: S.mapFail.detail }) + t('map.listStill');
  }
  function createMap() {
    if (!mapApi) {
      mapApi = FacMap.create('map', {
        onFail: function (key, detail) { S.mapFail = { key: key, detail: detail }; renderMapFail(); },
        onReady: function () { var fb = $('#map-fallback'); if (fb) fb.remove(); mapApi.setSummary(allSgg()); if (S.loc) drawMap(); },
        onSggClick: function (code) { var s = findSgg(code); if (s) setLoc(s.lat, s.lng, s.sido, { key: 'loc.sggClick', name: s.name }); }
      });
    }
  }
  function allSgg() { var out = []; D.summary.sido.forEach(function (s) { s.sgg.forEach(function (g) { out.push({ code: g.code, name: g.name, lat: g.lat, lng: g.lng, n: g.n, sido: s.code }); }); }); return out; }
  function findSgg(code) { return allSgg().filter(function (g) { return g.code === code; })[0]; }
  function haversine(a, b, c, d) { var R = 6371, p1 = a * Math.PI / 180, p2 = c * Math.PI / 180, dp = (c - a) * Math.PI / 180, dl = (d - b) * Math.PI / 180; var x = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2); return 2 * R * Math.asin(Math.sqrt(x)); }

  function onSido() {
    var code = $('#sel-sido').value, sel = $('#sel-sgg');
    sel.innerHTML = '<option value="">' + t('opt.select') + '</option>'; sel.disabled = !code;
    if (!code) return;
    var s = D.summary.sido.filter(function (x) { return x.code === code; })[0];
    s.sgg.forEach(function (g) { var o = document.createElement('option'); o.value = g.code; o.textContent = g.name + ' (' + g.n + ')'; sel.appendChild(o); });
  }
  function onSgg() { var g = findSgg($('#sel-sgg').value); if (g) setLoc(g.lat, g.lng, g.sido, { key: 'loc.sgg', name: g.name }); }
  function leadMsg(key) { S.leadMsg = key; renderLead(); }
  function renderLead() {   // ④ 안내 한 줄 — 상태(위치 오류 문구 또는 고른 위치)에서 다시 만든다. 둘 다 없으면 index.html 원문 그대로.
    if (S.leadMsg) $('#map-lead').textContent = t(S.leadMsg);
    else if (S.loc) $('#map-lead').textContent = t('loc.lead', { label: t(S.loc.lb.key, { name: S.loc.lb.name }) });
  }
  function useGeo() {
    if (!navigator.geolocation) { leadMsg('geo.unsupported'); return; }
    $('#btn-geo').disabled = true; $('#btn-geo').textContent = t('geo.busy');
    navigator.geolocation.getCurrentPosition(function (pos) {
      $('#btn-geo').disabled = false; $('#btn-geo').textContent = t('geo.use');
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      var near = allSgg().sort(function (a, b) { return haversine(lat, lng, a.lat, a.lng) - haversine(lat, lng, b.lat, b.lng); })[0];
      if (!near || haversine(lat, lng, near.lat, near.lng) > 150) { leadMsg('geo.outside'); return; }
      setLoc(lat, lng, near.sido, { key: 'loc.geo', name: near.name });
    }, function () {
      $('#btn-geo').disabled = false; $('#btn-geo').textContent = t('geo.use');
      leadMsg('geo.denied');
    }, { timeout: 8000, maximumAge: 60000 });
  }
  function setLoc(lat, lng, sido, lb) {   // lb: { key: 문구 키, name: 시군구 이름(원문) } — 언어를 바꾸면 다시 만든다
    S.loc = { lat: lat, lng: lng, sido: sido, lb: lb };
    S.leadMsg = null; renderLead();
    loadSido(sido).then(function () { listFacilities(); drawMap(); });
  }
  function loadSido(code) {
    if (S.sidoFiles[code]) return Promise.resolve(S.sidoFiles[code]);
    var s = D.summary.sido.filter(function (x) { return x.code === code; })[0];
    $('#fac-list').innerHTML = '<li class="skeleton"></li><li class="skeleton" style="width:80%"></li><li class="skeleton" style="width:60%"></li>';
    return loadJSON('data/facilities/' + s.file).then(function (d) {
      var ci = {}; d.cols.forEach(function (c, i) { ci[c] = i; });
      S.sidoFiles[code] = d.rows.map(function (r) { return { name: r[ci.name], type: typeName(r[ci.type]), tcode: String(r[ci.type]), lat: r[ci.lat], lng: r[ci.lng], sgg: r[ci.sgg], addr: r[ci.addr], home: r[ci.home], dup: r[ci.dup], far: r[ci.far] }; });
      return S.sidoFiles[code];
    }).catch(function (e) { $('#fac-list').innerHTML = '<li class="empty">' + t('fac.loadFail', { msg: esc(e.message) }) + '</li>'; return []; });
  }
  // 지도 앱에서 열기 — 공식 문서가 있는 웹 링크만 쓴다(키 불필요). 넘어가는 값은 공개 시설의 이름·좌표뿐, 사용자 입력·위치는 싣지 않는다.
  //   Google: developers.google.com/maps/documentation/urls (search, query=위도,경도)
  //   카카오: apis.map.kakao.com/web/guide (/link/map/이름,위도,경도)  · 네이버는 앱 없이 여는 공식 웹 형식이 없어 뺐다
  function appLinks(f) {
    if (!isFinite(f.lat) || !isFinite(f.lng)) return '';
    var ll = f.lat.toFixed(6) + ',' + f.lng.toFixed(6);
    var g = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(ll);
    var k = 'https://map.kakao.com/link/map/' + encodeURIComponent(String(f.name || '시설').replace(/,/g, ' ')) + ',' + ll;
    var a = ' rel="noopener noreferrer" target="_blank"';
    return '<div class="fo"><span>' + t('fac.open') + '</span><a href="' + esc(g) + '"' + a + ' aria-label="' + esc(t('fac.googleAria', { name: f.name })) + '">' + t('fac.google') + '</a><a href="' + esc(k) + '"' + a + ' aria-label="' + esc(t('fac.kakaoAria', { name: f.name })) + '">' + t('fac.kakao') + '</a></div>';
  }
  // 유형 표시 이름은 그릴 때마다 현재 언어로 다시 붙인다(불러 둔 시도 파일은 언어를 바꿔도 다시 받지 않는다)
  function filtered(list) { var any = Object.keys(S.filterTypes).length; return list.map(function (f) { f.type = typeName(f.tcode); f.hit = !any || !!S.filterTypes[f.tcode]; return f; }); }
  function listFacilities(noMap) {
    var box = $('#fac-list');
    if (!S.loc) { box.innerHTML = '<li class="empty">' + t('fac.pick') + '</li>'; $('#fac-src').textContent = ''; return; }
    var list = filtered(S.sidoFiles[S.loc.sido] || []);
    var near = list.filter(function (f) { return f.hit; }).map(function (f) { f.d = haversine(S.loc.lat, S.loc.lng, f.lat, f.lng); return f; }).sort(function (a, b) { return (a.d - b.d) || (a.dup - b.dup); }).slice(0, 5);
    if (!near.length) { box.innerHTML = '<li class="empty">' + t('fac.noType') + '</li>'; }
    else box.innerHTML = near.map(function (f) {
      return '<li class="fac"><div><div class="fn">' + esc(f.name) + '</div><div class="fa">' + esc(f.type) + ' · ' + esc(f.addr) + (f.dup ? ' <span class="fk">' + t('fac.dup') + '</span>' : '') + (f.home ? ' · <a href="' + esc(f.home) + '" rel="noopener" target="_blank">' + t('fac.home') + '</a>' : '') + '</div>' + appLinks(f) + '</div><div class="fd">' + (f.d < 10 ? fmt(f.d, 1) : fmt(f.d, 0)) + ' km</div></li>';
    }).join('');
    var m = D.summary.meta;
    $('#fac-src').textContent = t('fac.src', { src: I18N.src(m.source), basis: I18N.src(m.basis), closed: fmt(m.excluded.closed || 0), deleted: fmt(m.excluded.deleted || 0), unknown: fmt((m.excluded.no_coord || 0) + (m.excluded.out_of_range || 0)), mock: m.mock ? t('mock.suffix') : '' });
    if (!noMap && mapApi && mapApi.ready) drawMap();
  }
  function drawMap() {
    if (!mapApi || !mapApi.ready || !S.loc) return;
    mapApi.setSummary(allSgg().filter(function (g) { return !S.sidoFiles[g.sido]; }));   // 불러온 시도는 요약 원 대신 개별 점
    mapApi.setFacilities(filtered(S.sidoFiles[S.loc.sido] || []));
    mapApi.setUser(S.loc.lat, S.loc.lng, 12);
  }
})();
