/* 인증 등급 예측 — 경사부스팅 트리 JSON 을 브라우저에서 그대로 계산한다.
   raw_k = init_k + lr · Σ_tree leaf_k(x) → softmax. */
(function (global) {
  'use strict';

  function predictProba(model, x) {          // x: 특징 배열(model.features 순서)
    var K = model.classes.length, raw = model.init.slice();
    for (var r = 0; r < model.trees.length; r++) {
      var row = model.trees[r];
      for (var k = 0; k < K; k++) {
        var t = row[k], node = 0;
        while (t.l[node] !== -1) node = (x[t.f[node]] <= t.t[node]) ? t.l[node] : t.r[node];
        raw[k] += model.lr * t.v[node];
      }
    }
    var m = Math.max.apply(null, raw), e = raw.map(function (v) { return Math.exp(v - m); }), s = e.reduce(function (a, b) { return a + b; }, 0);
    return e.map(function (v) { return v / s; });
  }

  /* 사이트 결과(항목별 '좋은 쪽' 백분위)에서 특징 벡터 만들기. pct: {code: goodPercentile or null}, sexM: 1/0, age */
  function features(model, pct, sexM, age) {
    var codes = model.features.filter(function (f) { return /^f\d{3}$/.test(f); });
    var vals = [], n = 0, sum = 0, min = Infinity;
    codes.forEach(function (c) {
      var p = pct[c];
      if (p == null || isNaN(p)) { vals.push(model.meta.fill); return; }
      vals.push(p); n++; sum += p; if (p < min) min = p;
    });
    var extra = { sex: sexM, age: age, p_min: n ? min : model.meta.fill, p_mean: n ? sum / n : model.meta.fill, n_items: n };
    return model.features.map(function (f, i) { return i < codes.length ? vals[i] : extra[f]; });
  }

  /* 솔루션: 입력한 항목 하나를 '또래 상위 30%(백분위 70)' 수준까지 올리면 등급 확률이 어떻게 바뀌나 */
  function whatIf(model, pct, sexM, age, target) {
    target = target || 70;
    var base = predictProba(model, features(model, pct, sexM, age));
    var out = [];
    Object.keys(pct).forEach(function (c) {
      if (pct[c] == null || pct[c] >= target) return;
      var p2 = {}; Object.keys(pct).forEach(function (k) { p2[k] = pct[k]; }); p2[c] = target;
      var pr = predictProba(model, features(model, p2, sexM, age));
      out.push({ code: c, from: pct[c], to: target, base: base, proba: pr, gain: expected(model, pr) - expected(model, base) });
    });
    out.sort(function (a, b) { return b.gain - a.gain; });
    return { base: base, options: out };
  }
  function expected(model, pr) {   // 등급 기대값(1등급=3점, 2=2, 3=1) — 높을수록 좋음
    var s = 0; model.classes.forEach(function (c, k) { s += pr[k] * (c === '1등급' ? 3 : c === '2등급' ? 2 : 1); }); return s;
  }

  global.Grade = { predictProba: predictProba, features: features, whatIf: whatIf, expected: expected };
})(window);
