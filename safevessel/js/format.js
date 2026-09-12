/* ==========================================================================
   포맷 · 공용 유틸
   숫자를 화면에 올리는 방법을 한 곳에 모은다. 같은 값이 화면마다 다르게 보이면
   담당자가 도구를 믿지 않는다.
   ========================================================================== */

const SV = (() => {
  'use strict';

  /* ---------------------------------------------------------------- 숫자 */

  const nf = new Intl.NumberFormat('ko-KR');

  /** 1234567 → "1,234,567". 값이 없으면 대시(0으로 둔갑시키지 않는다). */
  function num(v, dash = '—') {
    if (v === null || v === undefined || !Number.isFinite(v)) return dash;
    return nf.format(Math.round(v));
  }

  /** 소수 자리 고정. NaN/누락은 대시. */
  function dec(v, digits = 1, dash = '—') {
    if (v === null || v === undefined || !Number.isFinite(v)) return dash;
    return v.toFixed(digits);
  }

  /** 0.1234 → "12.3%" */
  function pct(v, digits = 1, dash = '—') {
    if (v === null || v === undefined || !Number.isFinite(v)) return dash;
    return (v * 100).toFixed(digits) + '%';
  }

  /** 이미 퍼센트인 값(12.34) → "12.3%" */
  function pctRaw(v, digits = 1, dash = '—') {
    if (v === null || v === undefined || !Number.isFinite(v)) return dash;
    return v.toFixed(digits) + '%';
  }

  /** 톤수 표기 — 정수면 소수점을 떼고, 아니면 두 자리까지. */
  function ton(v) {
    if (!Number.isFinite(v)) return '—';
    return (Number.isInteger(v) ? v : +v.toFixed(2)) + '톤';
  }

  const clamp = (v, lo, hi) => {
    if (lo > hi) throw new Error('clamp: 하한이 상한보다 큽니다');
    if (!Number.isFinite(v)) return hi;   // 엔진과 같은 규칙 — 깨진 값은 '가장 위험'으로
    return Math.max(lo, Math.min(hi, v));
  };

  /* ---------------------------------------------------------------- 신호등 */

  const LEVELS = {
    green: { key: 'green', label: '안전', emoji: '🟢', cssVar: '--sig-green',
             action: '정기 모니터링 유지' },
    amber: { key: 'amber', label: '주의', emoji: '🟡', cssVar: '--sig-amber',
             action: '안전점검 권고 문자 발송 · 지원사업 안내' },
    red:   { key: 'red',   label: '위험', emoji: '🔴', cssVar: '--sig-red',
             action: '즉시 유선 연락 · 출항 자제 권고 · 현장 점검 대상' },
  };

  /** 점수 → 등급. 엔진(risk.SignalThresholds.classify)과 같은 부등호를 쓴다. */
  function classify(score, th) {
    if (score >= th.red) return 'red';
    if (score >= th.amber) return 'amber';
    return 'green';
  }

  /** 신호등 알약 HTML. 색만으로 뜻을 나르지 않도록 램프 + 글자를 함께 낸다. */
  function signalPill(level) {
    const L = LEVELS[level];
    return `<span class="signal signal--${L.key}"><span class="signal__lamp" aria-hidden="true"></span>${L.label}</span>`;
  }

  /* ---------------------------------------------------------------- 출처 */

  const PROV_CLASS = {
    KMST: 'src--kmst', MOF: 'src--mof', KOMSA: 'src--komsa', KOSIS: 'src--mof',
    KMA: 'src--kma', 기관내부: 'src--komsa', DERIVED: 'src--derived',
    ASSUMED: 'src--assumed',
  };
  const PROV_LABEL = {
    KMST: '심판원', MOF: '해수부', KOMSA: '공단', KOSIS: '통계청', KMA: '기상청',
    기관내부: '기관연계', DERIVED: '계산값', ASSUMED: '추정',
  };

  /**
   * 출처 뱃지. 이 프로젝트에서 가장 중요한 UI 요소다 —
   * 해양수산부 담당자가 "이 숫자 어디서 났냐"고 물었을 때 화면이 바로 답해야 한다.
   */
  function srcBadge(prov, detail = '') {
    const cls = PROV_CLASS[prov] || 'src--derived';
    const label = PROV_LABEL[prov] || prov;
    const title = esc(detail || label);
    return `<span class="src ${cls}" title="${title}">${esc(label)}</span>`;
  }

  /* ---------------------------------------------------------------- HTML */

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function el(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`요소를 찾지 못했습니다: #${id}`);
    return node;
  }

  function html(id, markup) { el(id).innerHTML = markup; }

  /* ---------------------------------------------------------------- 툴팁 */

  let tipNode = null;
  function tipInit() { tipNode = document.getElementById('tip'); }

  function tipShow(evt, markup) {
    if (!tipNode) tipInit();
    if (!tipNode) return;
    tipNode.innerHTML = markup;
    tipNode.classList.add('is-on');
    tipMove(evt);
  }

  function tipMove(evt) {
    if (!tipNode) return;
    const pad = 14;
    const r = tipNode.getBoundingClientRect();
    let x = evt.clientX + pad;
    let y = evt.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
    tipNode.style.left = Math.max(8, x) + 'px';
    tipNode.style.top = Math.max(8, y) + 'px';
  }

  function tipHide() {
    if (tipNode) tipNode.classList.remove('is-on');
  }

  /** 요소에 툴팁을 붙인다. 터치 기기에서도 탭으로 뜨게 한다. */
  function attachTip(node, builder) {
    node.addEventListener('pointerenter', (e) => tipShow(e, builder(node)));
    node.addEventListener('pointermove', tipMove);
    node.addEventListener('pointerleave', tipHide);
    node.addEventListener('click', (e) => { tipShow(e, builder(node)); });
  }

  /* ---------------------------------------------------------------- 색 */

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /** 계열 색 (범주형 — 고정 순서, 순환하지 않는다) */
  const SERIES_VARS = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'];
  function seriesColor(i) { return cssVar(SERIES_VARS[i % SERIES_VARS.length]); }

  /** 팩터 키 → 고정 색. 필터로 계열 수가 바뀌어도 색이 따라 움직이지 않게 한다. */
  const FACTOR_COLOR = {
    weather: '--s1', history: '--s2', fishery: '--s3',
    condition: '--s4', exposure: '--s5', human: '--s6',
  };
  function factorColor(key) { return cssVar(FACTOR_COLOR[key] || '--s1'); }

  /** 순차 램프 (파랑 100→700). t는 0~1. */
  const SEQ = ['--seq-100', '--seq-250', '--seq-400', '--seq-500', '--seq-600', '--seq-700'];
  function seqColor(t) {
    const i = Math.round(clamp(t, 0, 1) * (SEQ.length - 1));
    return cssVar(SEQ[i]);
  }

  /* ---------------------------------------------------------------- 기타 */

  function debounce(fn, ms = 120) {
    let t = 0;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function sortBy(arr, key, dir = -1) {
    return [...arr].sort((a, b) => {
      const av = a[key], bv = b[key];
      const an = av === null || av === undefined || !Number.isFinite(av);
      const bn = bv === null || bv === undefined || !Number.isFinite(bv);
      if (an && bn) return 0;
      if (an) return 1;        // 값 없는 항목은 항상 뒤로 — 0으로 보지 않는다
      if (bn) return -1;
      return (av - bv) * dir;
    });
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  return {
    num, dec, pct, pctRaw, ton, clamp,
    LEVELS, classify, signalPill,
    srcBadge, PROV_LABEL,
    esc, el, html,
    tipInit, tipShow, tipMove, tipHide, attachTip,
    cssVar, seriesColor, factorColor, seqColor,
    debounce, sortBy, fmtDateTime,
  };
})();
