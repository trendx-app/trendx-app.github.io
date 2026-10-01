/* 백분위 계산 — 빌드 스크립트의 격자 계산과 같은 로직 (mid-rank).
   q: 0..100 백분위 격자(101개, 오름차순). x: 내 값.
   반환: 0~100 (값이 같은 사람 중 중간 순위). */
(function (global) {
  'use strict';

  function gridPercentile(q, x) {
    var n = q.length;
    var pLo = n - 1, pHi = 0, i;
    for (i = 0; i < n; i++) { if (x <= q[i]) { pLo = i; break; } }
    for (i = n - 1; i >= 0; i--) { if (q[i] <= x) { pHi = i; break; } }
    if (pHi < pLo) {                       // 두 격자점 사이 → 선형보간
      var a = q[pHi], b = q[pLo];
      var frac = (b !== a) ? (x - a) / (b - a) : 0;
      return (pHi + frac) * 100 / (n - 1);
    }
    return ((pLo + pHi) / 2) * 100 / (n - 1);
  }

  /* "좋은 쪽" 기준 백분위: 높을수록 좋은 항목은 그대로, 낮을수록 좋은 항목은 100-p. 방향 없음이면 null */
  function goodPercentile(q, x, better) {
    var p = gridPercentile(q, x);
    if (better === 'high') return p;
    if (better === 'low') return 100 - p;
    return null;
  }

  function bandKey(sex, age) {
    var bands = [[19, 24], [25, 29], [30, 34], [35, 39], [40, 44], [45, 49], [50, 54], [55, 59], [60, 64], [65, 69], [70, 120]];
    for (var i = 0; i < bands.length; i++) {
      if (age >= bands[i][0] && age <= bands[i][1]) return sex + '_' + bands[i][0];
    }
    return null;
  }

  global.Percentile = { gridPercentile: gridPercentile, goodPercentile: goodPercentile, bandKey: bandKey };
})(window);
