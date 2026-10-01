/* cheryeok 앱 — 정적 JSON 만 읽는다. 서버·키 없음. 입력값은 기기 밖으로 나가지 않는다. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n, d) { return (Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toLocaleString('ko-KR'); };

  var D = { meta: null, norms: null, ex: null, summary: null, grade: null };
  var S = { age: null, sex: null, inputs: {}, results: [], weak: [], loc: null, sidoFiles: {}, filterTypes: {}, keyword: null };
  var mapApi = null;

  // ────────── 데이터 로드
  function loadJSON(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }); }
  Promise.all([loadJSON('data/meta.json'), loadJSON('data/norms.json'), loadJSON('data/exercise_map.json'), loadJSON('data/facilities/summary.json')])
    .then(function (a) { D.meta = a[0]; D.norms = a[1]; D.ex = a[2]; D.summary = a[3]; init(); })
    .catch(function (e) {
      $('#banner').innerHTML = '<div class="banner-error" role="alert">데이터 파일을 불러오지 못했습니다 (' + esc(e.message) + '). 잠시 후 새로고침해 주세요. 계속되면 사이트 주소가 맞는지 확인해 주세요.</div>';
    });

  function init() {
    if (D.meta.mock) $('#banner').innerHTML = '<div class="banner-mock" role="status">⚠ 지금 보이는 숫자는 <strong>예시 데이터</strong>입니다. 공공데이터 활용신청이 완료되면 실제 국민체력100 측정결과로 바뀝니다.</div>';
    var nm = D.norms.meta, fm = D.summary.meta;
    $('#foot-sources').textContent = '데이터 기준: 측정결과 ' + (nm.period || '') + ' (사용 ' + fmt(nm.n_used) + '건) · 시설 ' + fmt(fm.n_out) + '곳 (' + fm.basis + ') · 생성 ' + nm.generated_at.slice(0, 16).replace('T', ' ');
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
    applyHash();
    window.addEventListener('hashchange', applyHash);
  }

  // ────────── 앱 연동(embed) — 값은 주소의 '#' 뒤로만 받는다.
  // '#' 조각은 브라우저가 서버로 보내지 않으므로(요청·Referer 모두 제외) "입력값은 이 기기 밖으로 나가지 않습니다"가 그대로 지켜진다. '?' 쿼리는 받지 않는다.
  // 예: index.html#embed=1&age=38&sex=M&height=173&weight=74&f052=41  (측정값 키 = norms.json items 코드)
  function applyHash() {
    var raw = location.hash.replace(/^#/, '');
    if (raw.indexOf('=') < 0) return;
    var p = new URLSearchParams(raw);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 파일 열기 등 — 값은 이미 읽었다 */ }
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
    renderEmbedBar('앱에서 받은 값');
  }
  function renderEmbedBar(title) {
    var h = parseFloat($('#height').value), w = parseFloat($('#weight').value);
    var n = $$('#items input').filter(function (i) { return i.value !== ''; }).length;
    var bits = [$('#age').value + '세', currentSex() === 'M' ? '남성' : '여성'];
    if (h > 0) bits.push('신장 ' + fmt(h, 1) + 'cm');
    if (w > 0) bits.push('체중 ' + fmt(w, 1) + 'kg');
    bits.push(n ? '측정값 ' + n + '개' : '측정값 없음');
    var bar = $('#embed-bar');
    bar.innerHTML = '<p><strong>' + esc(title) + '</strong> ' + esc(bits.join(' · ')) + '</p><button type="button" class="btn btn-secondary" id="btn-edit">측정값 넣기·고치기</button>';
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
    if (!(age >= 19)) { box.innerHTML = ''; $('#items-sub').textContent = '나이를 넣으면 그 연령대에서 측정하는 항목이 나타납니다.'; return; }
    $('#items-sub').textContent = age >= 65 ? '65세 이상 어르신 측정 항목입니다.' : '19~64세 성인 측정 항목입니다.';
    box.innerHTML = inputItems(age, currentSex()).map(function (c) {
      var it = D.norms.items[c];
      return '<div class="field" data-code="' + c + '"><label for="in-' + c + '">' + esc(it.label) + ' <span class="unit">' + esc(it.unit) + '</span></label>' +
        '<input id="in-' + c + '" type="number" inputmode="decimal" step="0.1" data-code="' + c + '" value="' + esc(keep[c] || '') + '"' + (it.hint ? ' aria-describedby="hint-' + c + '"' : '') + '><div class="hint" id="hint-' + c + '" data-default="' + esc(it.hint || '') + '">' + esc(it.hint || '') + '</div></div>';
    }).join('');
    $$('input', box).forEach(function (i) { i.addEventListener('input', function () { validate(i); }); });
  }
  function validate(i) {
    var it = D.norms.items[i.dataset.code], f = i.closest('.field'), h = $('.hint', f);
    var v = i.value === '' ? null : parseFloat(i.value);
    if (v === null) { f.classList.remove('invalid'); h.textContent = h.dataset.default || ''; return true; }
    if (isNaN(v) || v < it.range[0] || v > it.range[1]) { f.classList.add('invalid'); h.textContent = '가능한 범위는 ' + it.range[0] + '~' + it.range[1] + it.unit + '입니다. 이 값은 계산에서 뺍니다.'; return false; }
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
    if (!(age >= 19 && age <= 120)) { $('#age-hint').textContent = '만 19세 이상 나이를 숫자로 넣어 주세요.'; $('#age').closest('.field').classList.add('invalid'); ok = false; } else { $('#age-hint').textContent = ''; $('#age').closest('.field').classList.remove('invalid'); }
    if (!sex) { $('#sex-hint').textContent = '측정 기준 성별을 골라 주세요.'; ok = false; } else { $('#sex-hint').textContent = ''; }
    if (!ok) { $('#age').focus(); return; }
    S.age = age; S.sex = sex; S.inputs = {};
    if (!noInput) {
      $$('#items input').forEach(function (i) { if (i.value !== '' && validate(i)) S.inputs[i.dataset.code] = parseFloat(i.value); });
      var h = parseFloat($('#height').value), w = parseFloat($('#weight').value);
      if (w > 0 && S.inputs.f052) S.inputs.f028 = S.inputs.f052 / w * 100;
      if (h > 0 && w > 0) S.inputs.f018 = w / Math.pow(h / 100, 2);
    }
    var key = Percentile.bandKey(sex, age), g = D.norms.groups[key];
    if (!g || !Object.keys(g.items).length) { $('#step2').hidden = false; $('#basis').textContent = ''; $('#results').innerHTML = '<li class="empty">이 성별·연령대의 비교 자료가 아직 없습니다. 다른 나이를 넣어 보거나, 아래에서 시설만 찾을 수 있습니다.</li>'; showFacilities(); return; }
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
    var nMax = g.n;
    $('#basis').textContent = '비교 대상: ' + g.label + ' · 국민체력100 체력인증센터 측정 기록 ' + fmt(nMax) + '건(항목별 표본 수는 다름) · 측정 기간 ' + (D.norms.meta.period || '') + ' · 공공데이터포털 ' + '15108938';
    $('#results').innerHTML = S.results.map(renderPct).join('');
    $('#step2').hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { $$('.bar-fill[data-w]').forEach(function (b) { b.style.width = b.dataset.w + '%'; }); $$('.bar-me[data-l]').forEach(function (b) { b.style.left = b.dataset.l + '%'; }); }); });
    var hasInput = S.results.some(function (r) { return r.good != null; });
    if (hasInput) { renderWeak(); renderGrade(); } else { $('#step3').hidden = true; $('#stepai').hidden = true; S.keyword = null; }
    showFacilities();
    if (document.body.classList.contains('embed') && !$('#embed-bar').hidden) renderEmbedBar('계산한 값');   // 앱 연동에서 값을 고쳐 다시 계산하면 요약도 바꾼다
    if (!noScroll) $('#step2').scrollIntoView({ behavior: 'smooth', block: 'start' });   // 앱 연동 첫 화면은 맨 위 고지부터 보이게 스크롤하지 않는다
  }

  function renderPct(r) {
    var it = r.item, gi = r.gi;
    var nTxt = '<span class="tag">' + (gi.low_n ? '표본 부족 · 참고용' : 'n=' + fmt(gi.n)) + '</span>';
    if (r.x == null) {
      return '<li class="pct muted"><div class="pct-head"><span class="pct-name">' + esc(it.label) + '<small>' + esc(it.unit) + '</small></span><span class="pct-val">또래 중앙값 <b>' + fmt(gi.median, 1) + '</b> ' + esc(it.unit) + '</span></div>' +
        '<div class="bar" aria-hidden="true"><div class="bar-fill" data-w="50"></div><div class="bar-median" style="left:50%"></div></div>' +
        '<p class="pct-note">입력하지 않은 항목입니다. 또래 중앙값만 표시합니다. ' + nTxt + '</p></li>';
    }
    var p = r.p, good = r.good;
    // 막대는 항목 방향과 무관하게 항상 "오른쪽 = 또래보다 강함". 방향 없는 참고 항목만 값의 위치를 그대로 보여 준다.
    var pos = Math.max(0, Math.min(100, good == null ? p : good));
    var note, tag = '', aria;
    if (good == null) { note = '또래 참가자 중 값이 낮은 쪽에서 ' + fmt(p, 0) + '% 위치입니다 (좋고 나쁨의 방향이 없는 참고 항목)'; aria = it.label + ' 또래 중 위치 ' + fmt(p, 0) + '퍼센트'; }
    else {
      var rank = Math.max(1, Math.min(100, Math.round(100 - good)));
      note = '측정 참가자 또래 100명 중 <b>약 ' + rank + '등</b>' + (it.better === 'low' ? ' <small>· 낮을수록 좋은 항목</small>' : '');
      aria = it.label + ' 또래 100명 중 약 ' + rank + '등';
      if (good < 30) tag = ' <span class="tag tag-low">먼저 기를 항목 후보</span>';
    }
    var label = good == null ? ['값 낮음', '값 높음'] : ['또래보다 약함', '또래보다 강함'];
    return '<li class="pct"><div class="pct-head"><span class="pct-name">' + esc(it.label) + '<small>' + esc(it.unit) + (it.hint ? ' · ' + esc(it.hint) : '') + '</small></span><span class="pct-val">내 값 <b>' + fmt(r.x, 1) + '</b> · 또래 중앙값 ' + fmt(gi.median, 1) + '</span></div>' +
      '<div class="bar" role="img" aria-label="' + esc(aria) + '"><div class="bar-fill" data-w="' + pos.toFixed(1) + '"></div><div class="bar-median" style="left:50%" title="또래 중앙값"></div><div class="bar-me" data-l="' + pos.toFixed(1) + '" style="left:0%"></div></div>' +
      '<div class="bar-axis"><span>' + label[0] + '</span><span>또래 중앙</span><span>' + label[1] + '</span></div>' +
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
  /* 역산 경계값 표: 예상 등급의 다음 등급 기준과 내 값의 차이 */
  function renderTargets(topGrade) {
    var box = $('#ai-targets');
    if (!D.cutoffs) { box.innerHTML = ''; return; }
    var cell = D.cutoffs.groups[Percentile.bandKey(S.sex, S.age)];
    if (!cell) { box.innerHTML = ''; return; }
    var want = topGrade === '1등급' ? null : (topGrade === '2등급' ? 'g1' : 'g2');
    var label = want === 'g1' ? '1등급' : '2등급';
    if (!want) { box.innerHTML = '<p class="sub">이미 1등급으로 추정됩니다. 지금 수준을 유지하는 것이 목표입니다.</p>'; return; }
    var rows = [];
    Object.keys(S.inputs).forEach(function (c) {
      var e = cell[c], it = D.norms.items[c];
      if (!e || e[want] == null || !it || !it.input) return;
      var v = S.inputs[c], cut = e[want], low = it.better === 'low';
      var ok = low ? v <= cut : v >= cut;
      var gap = low ? v - cut : cut - v;
      rows.push({ label: it.label, unit: it.unit, v: v, cut: cut, ok: ok, gap: gap, low: low, agree: e[want + '_agree'], n: e.n });
    });
    if (!rows.length) { box.innerHTML = ''; return; }
    rows.sort(function (a, b) { return (a.ok - b.ok) || (b.gap - a.gap); });
    box.innerHTML = '<p class="sub"><strong>' + label + ' 목표치와 내 값</strong> — 가장 낮은 항목이 등급을 정하므로 표의 항목을 모두 넘기는 것이 목표입니다.</p>' +
      '<table class="targets"><thead><tr><th>항목</th><th>내 값</th><th>' + label + ' 기준</th><th>차이</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var diff = r.ok ? '<span class="ok">달성</span>' : '<b>' + fmt(Math.abs(r.gap), 1) + esc(r.unit) + ' ' + (r.low ? '줄이기' : '더') + '</b>';
        return '<tr><td>' + esc(r.label) + '</td><td>' + fmt(r.v, 1) + esc(r.unit) + '</td><td>' + fmt(r.cut, 1) + esc(r.unit) + ' ' + (r.low ? '이하' : '이상') + '</td><td>' + diff + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<details class="evidence"><summary>기준값의 근거 보기</summary><p class="src">2023~2025년 측정 자료에서 역산한 기준입니다(공단 공식 기준표는 공개 데이터로 제공되지 않음). 판별 일치율 ' + rows.map(function (r) { return esc(r.label) + ' ' + Math.round(r.agree * 100) + '%'; }).join(' · ') + ' (균형 정확도, 같은 성별·연령대 ' + fmt(rows[0].n) + '명 안팎). 항목마다 기준을 넘겨도 공단 판정은 다를 수 있습니다.</p></details>';
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
      $('#ai-lead').textContent = (nIn < 4 ? '입력 항목이 ' + nIn + '개뿐이라 추정이 불확실합니다. 항목을 더 넣으면 정확해집니다.' : '지금 입력한 값으로 추정한 결과입니다.');
      $('#ai-grade').innerHTML = '<p class="grade-head">예상 등급 <b>' + esc(m.classes[top]) + '</b> <span class="tag">확률 ' + Math.round(pr[top] * 100) + '%</span></p>' +
        m.classes.map(function (c, k) { return '<div class="grade-row' + (k === top ? ' is-top' : '') + '"><span class="gl">' + esc(c) + '</span><div class="gb" aria-hidden="true"><div class="gf" data-w="' + (pr[k] * 100).toFixed(1) + '"></div></div><span class="gp">' + Math.round(pr[k] * 100) + '%</span></div>'; }).join('');
      requestAnimationFrame(function () { requestAnimationFrame(function () { $$('#ai-grade .gf[data-w]').forEach(function (b) { b.style.width = b.dataset.w + '%'; }); }); });
      renderTargets(m.classes[top]);
      var wi = Grade.whatIf(m, pct, sexM, age, 70).options.filter(function (o) { return o.gain > 0.02; }).slice(0, 3);
      if (wi.length) {
        $('#ai-whatif').innerHTML = '<p class="sub"><strong>등급을 올리려면</strong> — 다른 항목은 그대로 두고 한 항목만 또래 상위 30% 수준(100명 중 30등)으로 바꿨을 때 모델이 주는 확률 변화(변화가 큰 순)</p><ul class="whatif">' +
          wi.map(function (o) {
            var it = D.norms.items[o.code], k1 = m.classes.indexOf('1등급'), k2 = m.classes.indexOf('2등급');
            var before = Math.round((o.base[k1] + o.base[k2]) * 100), after = Math.round((o.proba[k1] + o.proba[k2]) * 100);
            var tb = 0; o.proba.forEach(function (p, k) { if (p > o.proba[tb]) tb = k; });
            return '<li><b>' + esc(it.label) + '</b> 지금 100명 중 약 ' + Math.round(100 - o.from) + '등 → 30등이 되면: 2등급 이상 확률 ' + before + '% → <b>' + after + '%</b>, 예상 등급 ' + esc(m.classes[tb]) + '</li>';
          }).join('') + '</ul>';
      } else {
        $('#ai-whatif').innerHTML = '<p class="sub">한 항목만 올려서는 예상 등급이 크게 바뀌지 않습니다. 가장 낮은 항목부터 고르게 올리는 편이 낫습니다.</p>';
      }
      $('#ai-src').innerHTML = '공단의 실제 등급 판정과 다를 수 있으며 의료 판단이 아닙니다.' +
        '<details class="evidence"><summary>이 추정의 근거 보기</summary><p class="src">국민체력100 인증 등급이 있는 측정 기록 ' + fmt(m.meta.n_train_final) + '건을 학습한 모델(경사부스팅 120그루). 2025년 측정 기록 ' + fmt(v.n_test) + '건으로 검증한 정확도 ' + Math.round(v.acc * 100) + '% (성별·연령대 최빈 등급 ' + Math.round(v.acc_baseline * 100) + '% · 측정 자료에서 역산한 핵심 3항목 규칙 75%). 입력하지 않은 항목은 또래 중앙값으로 가정합니다. 출처: ' + esc(m.meta.source) + '</p></details>';
    }).catch(function (e) { $('#ai-grade').innerHTML = '<p class="empty">예측 모델을 불러오지 못했습니다 (' + esc(e.message) + '). 다른 기능은 그대로 쓸 수 있습니다.</p>'; });
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
      kws = kws.concat(dom.facility_keywords || []);
      var head = (cands.length === 1) ? esc(r.item.label) + ' 기르기' : (idx === 0 ? '가장 낮은 항목: ' : '다음으로 낮은 항목: ') + esc(r.item.label);
      var pres = (dom.prescribed || []).slice(0, 5);
      return '<div class="weak"><h3>' + head + '</h3><p class="why">' + esc(r.item.domain) + ' · 측정 참가자 또래 100명 중 약 ' + Math.max(1, Math.min(100, Math.round(100 - r.good))) + '등</p>' +
        (pres.length ? '<p class="sub">체력인증센터 운동처방에 가장 자주 나온 <strong>' + esc(r.item.domain) + '</strong> 운동</p><ul class="videos">' + pres.map(function (x) { return '<li><span class="vt">' + esc(x.name) + '</span><span class="vm">처방 ' + fmt(x.n) + '회</span></li>'; }).join('') + '</ul>' : '<p class="empty">이 항목의 처방 집계가 아직 없습니다.</p>') +
        (mv ? '<p class="sub">집에서 직접 측정해 보기: <a href="' + esc(mv.url) + '" rel="noopener" target="_blank">' + esc(mv.title) + ' 영상' + (mv.length ? ' (' + Math.round(mv.length) + '초)' : '') + '</a>' + (mv.tool ? ' <small>· 준비물 ' + esc(mv.tool) + '</small>' : '') + '</p>' : '') +
        '<button type="button" class="btn btn-secondary btn-fac" data-dom="' + esc(r.item.domain) + '">이 운동이 되는 시설 보기</button></div>';
    }).join('');
    $('#weak-src').textContent = '처방 운동 출처: ' + D.ex.meta.prescribed_source + ' (' + fmt(D.ex.meta.n_notes) + '건). 측정 영상 출처: ' + D.ex.meta.videos_source + ' (국민체육진흥공단 제공)' + (D.ex.meta.mock ? ' · 예시 데이터' : '') + '. 운동을 시작하기 전 질환이 있거나 통증이 있다면 의사와 상의하세요.';
    $$('.btn-fac').forEach(function (b) { b.addEventListener('click', function () { setKeyword(D.ex.domains[b.dataset.dom].facility_keywords); $('#step4').scrollIntoView({ behavior: 'smooth' }); }); });
    S.keyword = kws.length ? kws : null;
    $('#step3').hidden = false;
  }

  // ────────── ④ 시설
  function typeName(code) { return D.summary.types[String(code)] || ''; }
  function fillSido() {
    var sel = $('#sel-sido');
    D.summary.sido.forEach(function (s) { var o = document.createElement('option'); o.value = s.code; o.textContent = s.name + ' (' + fmt(s.n) + ')'; sel.appendChild(o); });
    var tc = {}; D.summary.sido.forEach(function (s) { s.sgg.forEach(function (g) { Object.keys(g.by_type).forEach(function (t) { tc[t] = (tc[t] || 0) + g.by_type[t]; }); }); });
    var top = Object.keys(tc).sort(function (a, b) { return tc[b] - tc[a]; }).slice(0, 8);
    $('#filters').innerHTML = '<button type="button" class="chip" data-t="" aria-pressed="true">전체</button>' + top.map(function (t) { return '<button type="button" class="chip" data-t="' + t + '" aria-pressed="false">' + esc(typeName(t)) + '</button>'; }).join('');
    $$('.chip').forEach(function (c) { c.addEventListener('click', function () { toggleChip(c); }); });
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
  function setKeyword(kws) {
    S.filterTypes = {};
    Object.keys(D.summary.types).forEach(function (t) { var nm = D.summary.types[t]; if (kws.some(function (k) { return nm.indexOf(k) >= 0; })) S.filterTypes[t] = true; });
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
      loadMapLib().then(createMap, function () { var fb = $('#map-fallback'); if (fb) fb.textContent = '지도 라이브러리를 불러오지 못했습니다. 지도 없이도 아래 목록에서 가까운 시설을 볼 수 있습니다.'; });
    }
    if (S.keyword) setKeyword(S.keyword); else listFacilities();
  }
  function createMap() {
    if (!mapApi) {
      mapApi = FacMap.create('map', {
        onFail: function (msg) { var fb = $('#map-fallback'); if (fb) fb.textContent = msg + '. 지도 없이도 아래 목록에서 가까운 시설을 볼 수 있습니다.'; },
        onReady: function () { var fb = $('#map-fallback'); if (fb) fb.remove(); mapApi.setSummary(allSgg()); if (S.loc) drawMap(); },
        onSggClick: function (code) { var s = findSgg(code); if (s) setLoc(s.lat, s.lng, s.sido, '시군구 중심: ' + s.name); }
      });
    }
  }
  function allSgg() { var out = []; D.summary.sido.forEach(function (s) { s.sgg.forEach(function (g) { out.push({ code: g.code, name: g.name, lat: g.lat, lng: g.lng, n: g.n, sido: s.code }); }); }); return out; }
  function findSgg(code) { return allSgg().filter(function (g) { return g.code === code; })[0]; }
  function haversine(a, b, c, d) { var R = 6371, p1 = a * Math.PI / 180, p2 = c * Math.PI / 180, dp = (c - a) * Math.PI / 180, dl = (d - b) * Math.PI / 180; var x = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2); return 2 * R * Math.asin(Math.sqrt(x)); }

  function onSido() {
    var code = $('#sel-sido').value, sel = $('#sel-sgg');
    sel.innerHTML = '<option value="">선택</option>'; sel.disabled = !code;
    if (!code) return;
    var s = D.summary.sido.filter(function (x) { return x.code === code; })[0];
    s.sgg.forEach(function (g) { var o = document.createElement('option'); o.value = g.code; o.textContent = g.name + ' (' + g.n + ')'; sel.appendChild(o); });
  }
  function onSgg() { var g = findSgg($('#sel-sgg').value); if (g) setLoc(g.lat, g.lng, g.sido, g.name + ' 중심 기준'); }
  function useGeo() {
    if (!navigator.geolocation) { $('#map-lead').textContent = '이 브라우저는 위치를 지원하지 않습니다. 지역을 골라 주세요.'; return; }
    $('#btn-geo').disabled = true; $('#btn-geo').textContent = '위치 확인 중…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      $('#btn-geo').disabled = false; $('#btn-geo').textContent = '내 위치 사용';
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      var near = allSgg().sort(function (a, b) { return haversine(lat, lng, a.lat, a.lng) - haversine(lat, lng, b.lat, b.lng); })[0];
      if (!near || haversine(lat, lng, near.lat, near.lng) > 150) { $('#map-lead').textContent = '현재 위치가 자료 범위(대한민국) 밖으로 보입니다. 지역을 골라 주세요.'; return; }
      setLoc(lat, lng, near.sido, '내 위치 기준 (' + near.name + ' 부근)');
    }, function () {
      $('#btn-geo').disabled = false; $('#btn-geo').textContent = '내 위치 사용';
      $('#map-lead').textContent = '위치 권한이 거부됐거나 확인할 수 없습니다. 아래에서 지역을 골라 주세요.';
    }, { timeout: 8000, maximumAge: 60000 });
  }
  function setLoc(lat, lng, sido, label) {
    S.loc = { lat: lat, lng: lng, sido: sido, label: label };
    $('#map-lead').textContent = label + ' · 가까운 순으로 보여 드립니다. 위치가 없는 시설은 지도에 없습니다.';
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
    }).catch(function (e) { $('#fac-list').innerHTML = '<li class="empty">시설 파일을 불러오지 못했습니다 (' + esc(e.message) + '). 새로고침해 주세요.</li>'; return []; });
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
    return '<div class="fo"><span>지도 앱에서 열기</span><a href="' + esc(g) + '"' + a + ' aria-label="' + esc(f.name) + ' Google 지도에서 열기(새 창)">Google 지도</a><a href="' + esc(k) + '"' + a + ' aria-label="' + esc(f.name) + ' 카카오맵에서 열기(새 창)">카카오맵</a></div>';
  }
  function filtered(list) { var any = Object.keys(S.filterTypes).length; return list.map(function (f) { f.hit = !any || !!S.filterTypes[f.tcode]; return f; }); }
  function listFacilities() {
    var box = $('#fac-list');
    if (!S.loc) { box.innerHTML = '<li class="empty">내 위치를 쓰거나 시·도와 시·군·구를 고르면 가까운 시설 5곳을 보여 드립니다.</li>'; $('#fac-src').textContent = ''; return; }
    var list = filtered(S.sidoFiles[S.loc.sido] || []);
    var near = list.filter(function (f) { return f.hit; }).map(function (f) { f.d = haversine(S.loc.lat, S.loc.lng, f.lat, f.lng); return f; }).sort(function (a, b) { return (a.d - b.d) || (a.dup - b.dup); }).slice(0, 5);
    if (!near.length) { box.innerHTML = '<li class="empty">고른 유형의 시설이 이 시·도 안에 없습니다. 필터를 "전체"로 바꿔 보세요.</li>'; }
    else box.innerHTML = near.map(function (f) {
      return '<li class="fac"><div><div class="fn">' + esc(f.name) + '</div><div class="fa">' + esc(f.type) + ' · ' + esc(f.addr) + (f.dup ? ' <span class="fk">(대표 위치)</span>' : '') + (f.home ? ' · <a href="' + esc(f.home) + '" rel="noopener" target="_blank">홈페이지</a>' : '') + '</div>' + appLinks(f) + '</div><div class="fd">' + (f.d < 10 ? fmt(f.d, 1) : fmt(f.d, 0)) + ' km</div></li>';
    }).join('');
    var m = D.summary.meta;
    $('#fac-src').textContent = '출처: ' + m.source + ' · ' + m.basis + ' · 폐업 ' + fmt(m.excluded.closed || 0) + '곳·삭제 ' + fmt(m.excluded.deleted || 0) + '곳 제외 · 위치 미상 ' + fmt((m.excluded.no_coord || 0) + (m.excluded.out_of_range || 0)) + '곳은 지도에 없습니다' + (m.mock ? ' · 예시 데이터' : '');
    if (mapApi && mapApi.ready) drawMap();
  }
  function drawMap() {
    if (!mapApi || !mapApi.ready || !S.loc) return;
    mapApi.setSummary(allSgg().filter(function (g) { return !S.sidoFiles[g.sido]; }));   // 불러온 시도는 요약 원 대신 개별 점
    mapApi.setFacilities(filtered(S.sidoFiles[S.loc.sido] || []));
    mapApi.setUser(S.loc.lat, S.loc.lng, 12);
  }
})();
