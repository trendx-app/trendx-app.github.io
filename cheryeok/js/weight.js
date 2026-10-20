/* 체중 비교 — 같은 성별·연령대 측정 참가자의 BMI 중앙값 × 내 키² 로 '내 키의 또래 중앙 체중'을 구하고,
   차이에 따라 하루 섭취를 평소보다 얼마나 줄이거나 늘리면 되는지 안내한다. 입력값은 기기 밖으로 나가지 않는다.
   ⚠ 키별 원자료가 아니라 BMI 중앙값으로 환산한 값이다(화면에 그대로 밝힌다).
   안전장치: 하루 500kcal 이내·12주 기준 · 저체중이면 줄이라고 하지 않는다 · 정상 이상인데 또래 중앙이 비만 전단계 이상이면
   '중앙에 맞추려고 더 먹으라'고 하지 않는다(대한비만학회 비만 진료지침 2022 BMI 기준). */
(function (global) {
  'use strict';
  var KCAL_PER_KG = 7700;        // 체지방 1kg ≈ 7,700kcal (널리 쓰는 근사값 — CaloryX 와 같은 상수)
  var PLAN_DAYS = 84;            // 12주에 걸쳐 나눈다
  var KCAL_MIN = 100, KCAL_MAX = 500;   // 하루 조절량 범위(주 0.5kg 안팎을 넘지 않게)
  var SAME_KG = 1;               // 이 이내면 '거의 같다'
  var BMI_UNDER = 18.5, BMI_NORMAL_TOP = 23, BMI_PRE_TOP = 25;   // 대한비만학회: <18.5 저체중 · 18.5~22.9 정상 · 23~24.9 비만 전단계 · ≥25 비만

  function r1(x) { return Math.round(x * 10) / 10; }
  function category(bmi) { return bmi < BMI_UNDER ? 'under' : bmi < BMI_NORMAL_TOP ? 'normal' : bmi < BMI_PRE_TOP ? 'pre' : 'obese'; }
  function kcalFor(kg) {
    var k = Math.round(kg * KCAL_PER_KG / PLAN_DAYS / 10) * 10;
    return Math.max(KCAL_MIN, Math.min(KCAL_MAX, k));
  }
  function weeksFor(kg, kcal) { return Math.ceil(kg * KCAL_PER_KG / (kcal * 7)); }

  /* h: cm, w: kg, medianBmi: 또래 BMI 중앙값 → 계산 결과(화면 문구와 분리된 순수 값) */
  function plan(h, w, medianBmi) {
    if (!(h >= 100 && h <= 250 && w >= 20 && w <= 300 && medianBmi > 0)) return null;
    var m2 = Math.pow(h / 100, 2);
    var peer = medianBmi * m2, diff = w - peer, bmi = w / m2;
    var out = { peer: r1(peer), diff: r1(diff), bmi: r1(bmi), cat: category(bmi), healthyLo: r1(BMI_UNDER * m2), healthyHi: r1((BMI_NORMAL_TOP - 0.1) * m2),
                advice: 'keep', kcal: 0, weeks: 0, target: null, reason: '' };
    if (Math.abs(diff) < SAME_KG) { out.reason = 'same'; return out; }
    if (diff > 0) {                                   // 또래 중앙보다 무겁다
      if (out.cat === 'under') { out.reason = 'under'; return out; }
      out.advice = 'less'; out.kcal = kcalFor(diff); out.weeks = weeksFor(diff, out.kcal); out.target = out.peer; out.reason = 'to-peer';
      return out;
    }
    var light = -diff;                                // 또래 중앙보다 가볍다
    if (out.cat === 'under') {                        // 저체중 → 정상 범위 하한까지 먼저
      var gain = BMI_UNDER * m2 - w;
      out.advice = 'more'; out.kcal = kcalFor(gain); out.weeks = weeksFor(gain, out.kcal); out.target = out.healthyLo; out.reason = 'to-healthy';
      return out;
    }
    if (medianBmi < BMI_NORMAL_TOP) {                  // 또래 중앙이 정상 범위 → 중앙까지 늘려도 정상
      out.advice = 'more'; out.kcal = kcalFor(light); out.weeks = weeksFor(light, out.kcal); out.target = out.peer; out.reason = 'to-peer';
      return out;
    }
    out.reason = 'peer-above-normal';                 // 또래 중앙이 비만 전단계 이상 → 맞추려고 더 먹을 필요 없음
    return out;
  }

  var T = {
    ko: {
      title: '또래 중앙 체중과 비교', peerLine: '내 키({h}cm) 또래 중앙 체중', mine: '내 체중',
      heavier: '{d}kg 무거워요', lighter: '{d}kg 가벼워요', same: '거의 같아요',
      bmiLine: '내 체질량지수 {b} — {c}', healthy: '정상 범위 체중 {lo}~{hi}kg',
      cat: { under: '저체중', normal: '정상', pre: '비만 전단계', obese: '비만' },
      less: '평소보다 하루 <b>약 {k}kcal 덜</b> 드시면 약 {wk}주 뒤 또래 중앙 체중({t}kg)에 닿아요.',
      more: '평소보다 하루 <b>약 {k}kcal 더</b> 드시면 약 {wk}주 뒤 {goal}({t}kg)에 닿아요.',
      goalPeer: '또래 중앙 체중', goalHealthy: '정상 범위',
      keep: { same: '지금처럼 드시면 돼요 :)', under: '저체중 범위라 줄이지 않는 게 좋아요.',
              'peer-above-normal': '또래 중앙 체중이 비만 전단계 이상이라, 맞추려고 더 드실 필요는 없어요. 지금 체중을 유지해도 괜찮아요 :)' },
      tip: '예: 밥 반 공기 ≈ 150kcal · 바나나 1개 ≈ 90kcal · 30분 빠르게 걷기 ≈ 120~150kcal',
      src: '비교 기준: 국민체력100 체력인증센터 측정 참가자 중 {g} BMI 중앙값 {m}(측정 기록 {n}건) × 내 키². 키별 원자료가 아니라 BMI 중앙값으로 환산한 값입니다. 체중 구분은 대한비만학회 비만 진료지침(2022) 체질량지수 기준. 1kg ≈ 7,700kcal 근사로 12주·하루 500kcal 이내로 계산했습니다. 의료 진단이 아니며, 질환이 있거나 임신·수유 중이면 의사와 상의하세요.'
    },
    en: {
      title: 'Your weight vs. peers', peerLine: 'Peer median weight at your height ({h} cm)', mine: 'Your weight',
      heavier: '{d} kg above the peer median', lighter: '{d} kg below the peer median', same: 'About the same',
      bmiLine: 'Your BMI {b} — {c}', healthy: 'Normal-range weight {lo}–{hi} kg',
      cat: { under: 'underweight', normal: 'normal', pre: 'pre-obese', obese: 'obese' },
      less: 'If you eat <b>about {k} kcal less</b> per day than usual, you would reach the peer median ({t} kg) in about {wk} weeks.',
      more: 'If you eat <b>about {k} kcal more</b> per day than usual, you would reach the {goal} ({t} kg) in about {wk} weeks.',
      goalPeer: 'peer median', goalHealthy: 'normal range',
      keep: { same: 'Keep eating as you do :)', under: 'You are in the underweight range, so cutting down is not advised.',
              'peer-above-normal': 'The peer median is in the pre-obese range or above, so there is no need to eat more to match it. Keeping your current weight is fine :)' },
      tip: 'e.g. half a bowl of rice ≈ 150 kcal · 1 banana ≈ 90 kcal · 30 min brisk walk ≈ 120–150 kcal',
      src: 'Basis: median BMI {m} of {g} participants measured at National Fitness 100 centers in Korea ({n} records) × your height². Converted from the BMI median, not height-specific raw data. Weight categories follow the Korean Society for the Study of Obesity guideline (2022). Uses 1 kg ≈ 7,700 kcal, spread over 12 weeks and capped at 500 kcal/day. Not a medical diagnosis — consult a doctor if you have a condition or are pregnant/breastfeeding.'
    }
  };
  function lang() { return /^en/i.test(document.documentElement.lang || '') ? 'en' : 'ko'; }
  function fill(s, p) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return p[k] == null ? '' : p[k]; }); }
  function unit() { return lang() === 'en' ? ' kg' : 'kg'; }   // 영어는 숫자와 단위를 띄운다(8.4 kg 과 같게)
  function fmt(n) { return Number(n).toLocaleString(lang() === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: 1 }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var last = null;
  function render() {
    var sec = document.getElementById('stepw');
    if (!sec) return;
    if (!last) { sec.hidden = true; return; }
    var d = last, p = plan(d.h, d.w, d.bmi && d.bmi.median), t = T[lang()];
    if (!p) { sec.hidden = true; return; }
    var head = Math.abs(p.diff) < SAME_KG ? t.same : fill(p.diff > 0 ? t.heavier : t.lighter, { d: fmt(Math.abs(p.diff)) });
    var advice = p.advice === 'less' ? fill(t.less, { k: fmt(p.kcal), wk: p.weeks, t: fmt(p.target) })
      : p.advice === 'more' ? fill(t.more, { k: fmt(p.kcal), wk: p.weeks, t: fmt(p.target), goal: p.reason === 'to-healthy' ? t.goalHealthy : t.goalPeer })
      : t.keep[p.reason] || t.keep.same;
    document.getElementById('h-stepw').textContent = t.title;
    document.getElementById('w-body').innerHTML =
      '<div class="w-cmp"><div><span class="w-lab">' + esc(fill(t.peerLine, { h: fmt(d.h) })) + '</span><b>' + fmt(p.peer) + unit() + '</b></div>' +
      '<div><span class="w-lab">' + esc(t.mine) + '</span><b>' + fmt(d.w) + unit() + '</b></div>' +
      '<div class="w-diff ' + (p.diff > 0 ? 'up' : p.diff < 0 ? 'down' : '') + '">' + esc(head) + '</div></div>' +
      '<p class="sub">' + esc(fill(t.bmiLine, { b: fmt(p.bmi), c: t.cat[p.cat] })) + ' · ' + esc(fill(t.healthy, { lo: fmt(p.healthyLo), hi: fmt(p.healthyHi) })) + '</p>' +
      '<div class="w-advice">' + advice + (p.advice !== 'keep' ? '<small>' + esc(t.tip) + '</small>' : '') + '</div>';
    var g = d.label || ''; if (lang() === 'en' && global.I18N && global.I18N.group) g = global.I18N.group(g);   // '남성 35~39세' → 'Men 35–39'
    document.getElementById('w-src').textContent = fill(t.src, { g: g, m: fmt(d.bmi.median), n: fmt(d.bmi.n) });
    sec.hidden = false;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('cheryeok:run', function (e) {
      var d = e.detail || {};
      last = (d.h > 0 && d.w > 0 && d.bmi) ? d : null;
      render();
    });
    document.addEventListener('cheryeok:lang', render);
    if (global.I18N && global.I18N.onChange) global.I18N.onChange(function () { render(); });   // 한/영 전환(js/i18n.js)
  }
  global.WeightCmp = { plan: plan, kcalFor: kcalFor, category: category };
})(typeof window !== 'undefined' ? window : globalThis);
