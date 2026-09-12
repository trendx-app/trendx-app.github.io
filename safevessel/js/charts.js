/* ==========================================================================
   차트 — 외부 라이브러리 없이 SVG 를 직접 만든다.
   정부 내부망에서도 뜨게 하려면 CDN 의존이 없어야 한다.

   규칙 (dataviz 원칙)
     · 축은 하나. 이중 y축은 만들지 않는다.
     · 막대 끝은 4px 라운드, 베이스라인에 붙인다.
     · 격자·축은 물러나고 데이터가 앞선다.
     · 계열이 2개 이상이면 범례가 항상 있다. 색만으로 뜻을 나르지 않는다.
     · 저절로 움직이는 애니메이션은 없다. 사람이 만지면 즉시 반응한다.
   ========================================================================== */

const Charts = (() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const $ = (t, attrs = {}) => {
    const n = document.createElementNS(NS, t);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== null && v !== undefined) n.setAttribute(k, v);
    }
    return n;
  };

  function svgRoot(w, h) {
    const s = $('svg', {
      viewBox: `0 0 ${w} ${h}`, class: 'chart',
      preserveAspectRatio: 'xMidYMid meet', role: 'img',
    });
    s.style.width = '100%';
    s.style.height = 'auto';
    return s;
  }

  function mount(target, svg) {
    const host = typeof target === 'string' ? document.getElementById(target) : target;
    if (!host) throw new Error('차트를 붙일 요소를 찾지 못했습니다: ' + target);
    host.replaceChildren(svg);
    return svg;
  }

  function text(str, x, y, cls = 'ax-label', extra = {}) {
    const t = $('text', { x, y, class: cls, ...extra });
    t.textContent = str;
    return t;
  }

  /** 막대 상단 두 귀퉁이만 둥근 path (베이스라인에 붙은 4px 라운드) */
  function barPathV(x, y, w, h, r = 4) {
    const rr = Math.max(0, Math.min(r, w / 2, h));
    return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} `
         + `L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} `
         + `L${x + w},${y + h} Z`;
  }

  /** 가로 막대 — 오른쪽 두 귀퉁이만 둥글게 */
  function barPathH(x, y, w, h, r = 4) {
    const rr = Math.max(0, Math.min(r, h / 2, w));
    return `M${x},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} `
         + `L${x + w},${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} `
         + `L${x},${y + h} Z`;
  }

  function niceMax(v) {
    if (!Number.isFinite(v) || v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * mag;
  }

  /* ===================================================== 가로 막대 차트 */

  /**
   * @param {Array<{label,value,color?,note?,tip?}>} rows
   * opts: { valueFmt, max, labelWidth, barH, gap, showValue }
   */
  function barH(target, rows, opts = {}) {
    const {
      valueFmt = (v) => SV.dec(v, 1),
      labelWidth = 96,
      barH: bh = 20,
      gap = 8,
      padRight = 62,
      max: fixedMax = null,
      colorFor = null,
      onClick = null,
    } = opts;

    const w = 640;
    const h = rows.length * (bh + gap) + 18;
    const svg = svgRoot(w, h);
    const plotX = labelWidth + 8;
    const plotW = w - plotX - padRight;
    const max = niceMax(fixedMax ?? Math.max(...rows.map((r) => r.value), 0.0001));

    // 기준 격자 — 물러나 있어야 한다
    [0.25, 0.5, 0.75, 1].forEach((f) => {
      svg.appendChild($('line', {
        x1: plotX + plotW * f, y1: 2, x2: plotX + plotW * f, y2: h - 16, class: 'gridline',
      }));
    });
    svg.appendChild($('line', { x1: plotX, y1: 2, x2: plotX, y2: h - 16, class: 'ax-line' }));

    rows.forEach((r, i) => {
      const y = i * (bh + gap) + 4;
      const val = Number.isFinite(r.value) ? r.value : 0;
      const bw = Math.max(2, (val / max) * plotW);
      const color = r.color || (colorFor ? colorFor(r, i) : SV.cssVar('--seq-400'));

      const lab = text(r.label, labelWidth, y + bh * 0.72, 'ax-label', { 'text-anchor': 'end' });
      lab.style.fill = 'var(--ink-2)';
      svg.appendChild(lab);

      const g = $('g', { class: 'bar-g', style: onClick ? 'cursor:pointer' : '' });
      const p = $('path', { d: barPathH(plotX, y, bw, bh, 4), fill: color });
      p.style.transition = 'width 240ms';
      g.appendChild(p);

      if (opts.showValue !== false) {
        const t = text(valueFmt(r.value), plotX + bw + 7, y + bh * 0.72, 'val-label');
        svg.appendChild(t);
      }

      const hit = $('rect', {
        x: plotX, y: y - gap / 2, width: plotW, height: bh + gap, fill: 'transparent',
      });
      g.appendChild(hit);
      if (r.tip) {
        g.addEventListener('pointerenter', (e) => SV.tipShow(e, r.tip));
        g.addEventListener('pointermove', SV.tipMove);
        g.addEventListener('pointerleave', SV.tipHide);
      }
      if (onClick) g.addEventListener('click', () => onClick(r, i));
      svg.appendChild(g);
    });

    // x축 눈금
    [0, 0.5, 1].forEach((f) => {
      svg.appendChild(text(valueFmt(max * f), plotX + plotW * f, h - 3, 'ax-label',
        { 'text-anchor': f === 0 ? 'start' : f === 1 ? 'end' : 'middle' }));
    });

    return mount(target, svg);
  }

  /* ===================================================== 세로 막대 차트 */

  function barV(target, rows, opts = {}) {
    const {
      valueFmt = (v) => SV.dec(v, 2),
      baseline = null,          // 기준선(예: 지수 1.00)
      baselineLabel = '',
      colorFor = null,
      height = 210,
    } = opts;

    const w = 640;
    const h = height;
    const padL = 34, padR = 10, padT = 14, padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const svg = svgRoot(w, h);

    const max = niceMax(Math.max(...rows.map((r) => r.value), baseline || 0));
    const bw = Math.min(46, (plotW / rows.length) * 0.66);
    const step = plotW / rows.length;

    // 가로 격자
    for (let i = 0; i <= 4; i++) {
      const y = padT + plotH * (i / 4);
      svg.appendChild($('line', { x1: padL, y1: y, x2: w - padR, y2: y, class: 'gridline' }));
      svg.appendChild(text(valueFmt(max * (1 - i / 4)), padL - 6, y + 3.5, 'ax-label',
        { 'text-anchor': 'end' }));
    }
    svg.appendChild($('line', { x1: padL, y1: padT + plotH, x2: w - padR, y2: padT + plotH, class: 'ax-line' }));

    rows.forEach((r, i) => {
      const val = Number.isFinite(r.value) ? r.value : 0;
      const bh = Math.max(2, (val / max) * plotH);
      const x = padL + step * i + (step - bw) / 2;
      const y = padT + plotH - bh;
      const color = r.color || (colorFor ? colorFor(r, i) : SV.cssVar('--seq-400'));

      const g = $('g', {});
      g.appendChild($('path', { d: barPathV(x, y, bw, bh, 4), fill: color }));
      g.appendChild($('rect', { x: padL + step * i, y: padT, width: step, height: plotH, fill: 'transparent' }));
      if (r.tip) {
        g.addEventListener('pointerenter', (e) => SV.tipShow(e, r.tip));
        g.addEventListener('pointermove', SV.tipMove);
        g.addEventListener('pointerleave', SV.tipHide);
      }
      svg.appendChild(g);

      svg.appendChild(text(r.label, padL + step * i + step / 2, h - 10, 'ax-label',
        { 'text-anchor': 'middle' }));
    });

    if (baseline !== null && Number.isFinite(baseline)) {
      const y = padT + plotH - (baseline / max) * plotH;
      svg.appendChild($('line', {
        x1: padL, y1: y, x2: w - padR, y2: y,
        stroke: SV.cssVar('--ink-muted'), 'stroke-width': 1.5, 'stroke-dasharray': '5 4',
      }));
      if (baselineLabel) {
        const t = text(baselineLabel, w - padR - 2, y - 5, 'val-label', { 'text-anchor': 'end' });
        svg.appendChild(t);
      }
    }

    return mount(target, svg);
  }

  /* ===================================================== 누적 가로 막대 */

  /** rows: [{label, parts:[{key,value,color}], total}] */
  function stackedH(target, rows, opts = {}) {
    const { labelWidth = 60, barH: bh = 22, gap = 9, fmt = (v) => SV.num(v) } = opts;
    const w = 640;
    const h = rows.length * (bh + gap) + 6;
    const svg = svgRoot(w, h);
    const plotX = labelWidth + 8;
    const plotW = w - plotX - 76;

    rows.forEach((r, i) => {
      const y = i * (bh + gap) + 2;
      const total = r.total || r.parts.reduce((s, p) => s + p.value, 0) || 1;
      let x = plotX;

      const lab = text(r.label, labelWidth, y + bh * 0.7, 'ax-label', { 'text-anchor': 'end' });
      lab.style.fill = 'var(--ink-2)';
      svg.appendChild(lab);

      r.parts.forEach((p, j) => {
        const pw = (p.value / total) * plotW;
        if (pw <= 0) return;
        const first = x === plotX;
        const last = j === r.parts.length - 1;
        // 인접 조각 사이 2px 표면 간격 — 경계가 색으로만 구분되지 않게
        const gapPx = last ? 0 : 2;
        const d = last ? barPathH(x, y, Math.max(1, pw), bh, 4)
                : first ? `M${x + 4},${y} L${x + pw - gapPx},${y} L${x + pw - gapPx},${y + bh} L${x + 4},${y + bh} Q${x},${y + bh} ${x},${y + bh - 4} L${x},${y + 4} Q${x},${y} ${x + 4},${y} Z`
                : `M${x},${y} h${Math.max(1, pw - gapPx)} v${bh} h-${Math.max(1, pw - gapPx)} Z`;
        const seg = $('path', { d, fill: p.color });
        if (p.tip) {
          seg.addEventListener('pointerenter', (e) => SV.tipShow(e, p.tip));
          seg.addEventListener('pointermove', SV.tipMove);
          seg.addEventListener('pointerleave', SV.tipHide);
        }
        svg.appendChild(seg);
        x += pw;
      });

      svg.appendChild(text(fmt(total), plotX + plotW + 7, y + bh * 0.7, 'val-label'));
    });

    return mount(target, svg);
  }

  /* ===================================================== 산점 지도 */

  /**
   * 한반도 주변 해역 산점도. 실제 위·경도를 단순 등거리 투영으로 찍는다.
   * 정밀 해도가 아니라 '어디에 몰려 있는가'를 보는 용도임을 화면에 명시한다.
   */
  function scatterMap(target, points, opts = {}) {
    const {
      lonRange = [123.5, 132.5],
      latRange = [32.0, 39.0],
      colorFor = () => SV.cssVar('--seq-400'),
      radiusFor = () => 2.6,
      tipFor = null,
      height = 560,
      overlay = [],          // 사고 다발지점처럼 점 위에 겹쳐 그릴 마크
    } = opts;

    const w = 720;
    const h = height;
    const pad = 26;
    const svg = svgRoot(w, h);

    const [lon0, lon1] = lonRange;
    const [lat0, lat1] = latRange;
    // 위도 보정 — 한국 위도대에서 경도 1도는 위도 1도보다 짧다
    const midLat = (lat0 + lat1) / 2;
    const lonScaleFix = Math.cos((midLat * Math.PI) / 180);

    const spanLon = (lon1 - lon0) * lonScaleFix;
    const spanLat = lat1 - lat0;
    const scale = Math.min((w - pad * 2) / spanLon, (h - pad * 2) / spanLat);
    const offX = (w - spanLon * scale) / 2;
    const offY = (h - spanLat * scale) / 2;

    const px = (lon) => offX + (lon - lon0) * lonScaleFix * scale;
    const py = (lat) => offY + (lat1 - lat) * scale;

    // 배경 격자 (경위도 1도)
    for (let lon = Math.ceil(lon0); lon <= lon1; lon++) {
      svg.appendChild($('line', { x1: px(lon), y1: 0, x2: px(lon), y2: h, class: 'gridline' }));
      svg.appendChild(text(`${lon}°E`, px(lon) + 3, h - 6, 'ax-label'));
    }
    for (let lat = Math.ceil(lat0); lat <= lat1; lat++) {
      svg.appendChild($('line', { x1: 0, y1: py(lat), x2: w, y2: py(lat), class: 'gridline' }));
      svg.appendChild(text(`${lat}°N`, 4, py(lat) - 4, 'ax-label'));
    }

    // 해역 라벨 — 지형 없이도 위치를 읽을 수 있게
    const marks = [
      ['서해', 125.2, 36.4], ['남해', 127.9, 34.2], ['동해', 130.3, 37.4],
      ['제주', 126.5, 33.2], ['대한해협', 129.2, 34.6],
    ];
    marks.forEach(([name, lon, lat]) => {
      const t = text(name, px(lon), py(lat), 'ax-label', { 'text-anchor': 'middle' });
      t.style.fontSize = '13px';
      t.style.fill = 'var(--ink-muted)';
      t.style.opacity = '.5';
      t.style.fontWeight = '700';
      svg.appendChild(t);
    });

    const g = $('g', {});
    points.forEach((p) => {
      const lon = p.x, lat = p.y;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      if (lon < lon0 || lon > lon1 || lat < lat0 || lat > lat1) return;
      const c = $('circle', {
        cx: px(lon).toFixed(1), cy: py(lat).toFixed(1),
        r: radiusFor(p), fill: colorFor(p), class: 'map-dot',
        'fill-opacity': p.c > 0 ? 0.88 : 0.45,
      });
      if (tipFor) {
        c.addEventListener('pointerenter', (e) => SV.tipShow(e, tipFor(p)));
        c.addEventListener('pointermove', SV.tipMove);
        c.addEventListener('pointerleave', SV.tipHide);
      }
      g.appendChild(c);
    });
    svg.appendChild(g);

    // 겹쳐 그리는 레이어 (사고 다발지점) — 개별 사고보다 위에, 속이 빈 원으로
    // 그려 아래 점들을 가리지 않게 한다.
    if (overlay.length) {
      const og = $('g', {});
      overlay.forEach((o) => {
        if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) return;
        if (o.x < lon0 || o.x > lon1 || o.y < lat0 || o.y > lat1) return;
        const c = $('circle', {
          cx: px(o.x).toFixed(1), cy: py(o.y).toFixed(1), r: o.r || 6,
          fill: o.color, 'fill-opacity': 0.14,
          stroke: o.color, 'stroke-width': 2, class: 'map-dot',
        });
        if (o.tip) {
          c.addEventListener('pointerenter', (e) => SV.tipShow(e, o.tip));
          c.addEventListener('pointermove', SV.tipMove);
          c.addEventListener('pointerleave', SV.tipHide);
        }
        og.appendChild(c);
      });
      svg.appendChild(og);
    }

    return mount(target, svg);
  }

  /* ===================================================== 팩터 분해 막대 */

  /** 총점을 팩터 기여도로 쪼갠 하나의 가로 막대 */
  function contributionBar(target, factors, total, opts = {}) {
    const w = 640, h = 46;
    const svg = svgRoot(w, h);
    const plotW = w - 4;
    const scale = plotW / 100;
    let x = 2;

    factors.forEach((f, i) => {
      const cw = Math.max(0, f.contribution * scale);
      if (cw <= 0) return;
      const last = i === factors.length - 1;
      const d = last ? barPathH(x, 4, cw, 26, 4)
        : i === 0 ? `M${x + 4},4 L${x + cw - 2},4 L${x + cw - 2},30 L${x + 4},30 Q${x},30 ${x},26 L${x},8 Q${x},4 ${x + 4},4 Z`
        : `M${x},4 h${Math.max(1, cw - 2)} v26 h-${Math.max(1, cw - 2)} Z`;
      const seg = $('path', { d, fill: SV.factorColor(f.key) });
      seg.addEventListener('pointerenter', (e) => SV.tipShow(e,
        `<b>${SV.esc(f.label)}</b><dl><dt>점수</dt><dd>${SV.dec(f.score, 1)}</dd>`
        + `<dt>가중치</dt><dd>${SV.dec(f.weight * 100, 1)}%</dd>`
        + `<dt>기여</dt><dd>${SV.dec(f.contribution, 1)}점</dd></dl>`));
      seg.addEventListener('pointermove', SV.tipMove);
      seg.addEventListener('pointerleave', SV.tipHide);
      svg.appendChild(seg);
      x += cw;
    });

    // 남은 구간 (안전 여유)
    if (x < plotW) {
      svg.appendChild($('rect', {
        x, y: 4, width: plotW - x + 2, height: 26, rx: 4,
        fill: SV.cssVar('--surface-sunk'),
      }));
    }

    // 경계선 표시
    [40, 70].forEach((v) => {
      const lx = 2 + v * scale;
      svg.appendChild($('line', {
        x1: lx, y1: 0, x2: lx, y2: 34,
        stroke: SV.cssVar('--ink-muted'), 'stroke-width': 1.5, 'stroke-dasharray': '3 3',
      }));
      svg.appendChild(text(String(v), lx, 43, 'ax-label', { 'text-anchor': 'middle' }));
    });

    return mount(target, svg);
  }

  /* ===================================================== 범례 */

  function legendHTML(items) {
    return items.map((it) =>
      `<span class="legend__item"><span class="legend__swatch" style="background:${it.color}"></span>${SV.esc(it.label)}${
        it.value !== undefined ? ` <b class="tnum">${SV.esc(it.value)}</b>` : ''}</span>`
    ).join('');
  }

  return { barH, barV, stackedH, scatterMap, contributionBar, legendHTML, niceMax };
})();
