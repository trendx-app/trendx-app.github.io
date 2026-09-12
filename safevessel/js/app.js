/* ==========================================================================
   SafeVessel 웹 앱

   핵심 설계 — 슬라이더가 63,647척을 즉시 다시 계산하는 법
     팩터 점수(기상·사고이력·업종·선박상태·해역노출·인적요인)는 **가중치와 무관**하다.
     파이썬 엔진이 팩터 점수를 미리 계산해 cells.json 에 넣어 두었고,
     브라우저는 슬라이더 값으로 **가중합만** 다시 한다.
     → 채점 로직이 두 벌이 되지 않는다. JS 는 곱셈과 덧셈만 한다.
   ========================================================================== */

(() => {
  'use strict';

  const DATA_FILES = ['meta', 'cells', 'fishery', 'accidents', 'programs', 'cases', 'denominator',
                      'hotspots', 'named', 'inspection', 'emergency'];
  const D = {};                 // 불러온 원본 데이터
  let EV = [];                  // 근거 문장 풀
  let CELLS = [];               // 선박군 조합
  let weights = null;           // 현재 가중치
  let thresholds = null;        // 현재 경계값
  let scenario = 'moderate';    // 현재 기상 시나리오. 실시간 연동이 있으면 부팅 시 'live' 로 바뀐다
  let selectedCell = null;
  let selectedHull = null;
  let vesselMode = 'named';   // 'named' = 실명 선박 · 'cell' = 선박군(전수)
  let selectedFishery = null;
  let selectedCase = 0;
  let inspOfficer = 0;           // 점검계획에서 보고 있는 거점
  let emCase = 0;                // 긴급대응에서 보고 있는 사례

  /* ================================================================ 로딩 */

  async function loadAll() {
    const results = await Promise.all(DATA_FILES.map(async (name) => {
      const res = await fetch(`data/${name}.json`, { cache: 'no-cache' });
      if (!res.ok) {
        throw new Error(`data/${name}.json 을 불러오지 못했습니다 (HTTP ${res.status})`);
      }
      return [name, await res.json()];
    }));
    for (const [name, json] of results) D[name] = json;

    EV = D.cells.evidence || [];
    CELLS = D.cells.cells || [];
    weights = { ...D.meta.defaults.weights };
    thresholds = { ...D.meta.defaults.thresholds };
    // 실시간 기상이 연동돼 있으면 그것을 기본 화면으로 — 시나리오보다 실제가 낫다
    if (D.meta.scenarios.some((s) => s.code === 'live')) scenario = 'live';
  }

  /* ================================================ 점수 계산 (핵심) */

  /**
   * 가중치 정규화 — 합이 1이 아니어도 항상 1로 만든다. 엔진과 같은 규칙.
   *
   * 합이 0이면(모든 슬라이더를 내린 경우) 예외를 던지지 않고 **균등 배분**으로 떨어뜨린다.
   * 담당자가 슬라이더를 만지다가 화면이 죽는 것이 훨씬 나쁘기 때문이다.
   * 대신 그 상태임을 화면에 알린다(`isDegenerate`).
   */
  function normalized(w) {
    const keys = Object.keys(w);
    const total = keys.reduce((s, k) => s + (Number.isFinite(w[k]) ? w[k] : 0), 0);
    if (!(total > 0)) {
      const even = 1 / keys.length;
      const out = {};
      keys.forEach((k) => { out[k] = even; });
      out.__degenerate = true;
      return out;
    }
    const out = {};
    for (const k of keys) out[k] = (Number.isFinite(w[k]) ? w[k] : 0) / total;
    return out;
  }

  function isDegenerate(w) {
    return !(Object.values(w).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0) > 0);
  }

  /**
   * 셀 1개의 점수를 계산한다.
   * 결측이 있으면 '안전' 판정을 막는 하한을 적용한다 — 엔진의 _apply_confidence_floor 와 동일.
   */
  function scoreCell(cell, norm, th, scen) {
    const s = cell.scores;
    const parts = {
      // 실시간 시나리오가 없는 해역이면 null 이 온다 — 0 으로 두면 '무풍'이 되어
      // 위험도가 낮게 나온다. 그래서 중립값(50)으로 올리고 결측으로 취급한다.
      weather: s.weather[scen] === null || s.weather[scen] === undefined
        ? 50 : s.weather[scen],
      history: s.history,
      fishery: s.fishery,
      condition: s.condition,
      exposure: s.exposure,
      human: s.human,
    };
    let total = 0;
    for (const k of Object.keys(parts)) total += (parts[k] || 0) * (norm[k] || 0);
    total = SV.clamp(total, 0, 100);

    // 하한은 **개별 결측**(이 선박만 값이 없음)에만 건다.
    // 구조적 부재(cell.unavail — 데이터셋 자체에 항목이 없음)까지 걸면
    // 전 선박이 같은 조건이라 63,647척이 전부 노란불이 되어 신호등이 죽는다.
    const weatherUnknown = s.weather[scen] === null || s.weather[scen] === undefined;
    let floored = false;
    if ((cell.missing && cell.missing.length) || weatherUnknown) {
      const floor = Math.max(D.meta.defaults.uncertain_floor, th.amber);
      if (total < floor) { total = floor; floored = true; }
    }
    const level = SV.classify(total, th);
    return { score: total, level, parts, floored };
  }

  /**
   * 실명 선박 1척을 **현재 가중치·경계값으로 다시 계산**한다.
   *
   * ⚠️ 예전에는 `named.json` 에 굳혀 넣은 `assessment.score/level` 을 그대로 읽었다.
   *    그 값은 빌드 시점의 기본 가중치(0.30/0.20…)와 기본 경계(40/70)로 계산된 것이라,
   *    담당자가 슬라이더를 움직이면 **같은 탭의 선박군 모드와 실명 모드가 서로 다른
   *    등급을 주장**했다. 발주처가 통화에서 직접 요구한 기능("기상을 0.3 팩터로…
   *    조작할 수 있잖아")을 쓰는 순간 도구가 자기모순에 빠졌다.
   *
   * 셀 계산(`cellScore`)과 같은 규칙을 쓴다 — 정규화, 개별 결측에만 하한.
   */
  function namedScore(v) {
    const a = v.assessment;
    const norm = normalized(weights);
    const th = thresholds;

    let total = 0;
    const parts = {};
    let hasMissing = false;
    for (const f of a.factors) {
      const sc = Number.isFinite(f.score) ? f.score : null;
      parts[f.key] = sc;
      total += (sc || 0) * (norm[f.key] || 0);
      if (f.missing) hasMissing = true;
    }
    total = SV.clamp(total, 0, 100);

    let floored = false;
    if (hasMissing) {
      const floor = Math.max(D.meta.defaults.uncertain_floor, th.amber);
      if (total < floor) { total = floor; floored = true; }
    }
    return { score: total, level: SV.classify(total, th), parts, floored };
  }

  /** 전체 셀 재계산. 척수 가중 집계까지 한 번에 낸다. */
  function recompute(w = weights, th = thresholds, scen = scenario) {
    const norm = normalized(w);
    const counts = { green: 0, amber: 0, red: 0 };
    let vessels = 0, weightedScore = 0;
    const rows = CELLS.map((c) => {
      const r = scoreCell(c, norm, th, scen);
      counts[r.level] += c.count;
      vessels += c.count;
      weightedScore += r.score * c.count;
      return { cell: c, ...r };
    });
    rows.sort((a, b) => b.score - a.score);
    return {
      rows, counts, vessels, norm,
      meanScore: vessels ? weightedScore / vessels : 0,
      shares: {
        green: vessels ? counts.green / vessels : 0,
        amber: vessels ? counts.amber / vessels : 0,
        red: vessels ? counts.red / vessels : 0,
      },
    };
  }

  /* ================================================================ 공통 UI */

  function cellLabel(c) {
    return `${c.fishery} · ${c.band} · ${c.sea}`;
  }

  function evidenceList(cell, keys = null) {
    const order = keys || ['fishery', 'history', 'condition', 'exposure', 'human'];
    const labels = Object.fromEntries(D.meta.factors.map((f) => [f.key, f.label]));
    const out = [];
    for (const k of order) {
      const idxs = (cell.ev && cell.ev[k]) || [];
      for (const i of idxs) {
        const e = EV[i];
        if (!e) continue;
        out.push(
          `<li class="evi__item">${SV.srcBadge(e.p, e.s || e.p)}<div>${SV.esc(e.t)}`
          + (e.s ? `<span class="evi__src">출처: ${SV.esc(e.s)}</span>` : '')
          + `</div></li>`
        );
      }
    }
    return out.join('');
  }

  function distBar(id, counts, vessels) {
    const order = ['red', 'amber', 'green'];
    const html = order.map((k) => {
      const share = vessels ? counts[k] / vessels : 0;
      if (share <= 0) return '';
      const L = SV.LEVELS[k];
      return `<div class="dist__seg dist__seg--${k}" style="flex:0 0 ${(share * 100).toFixed(2)}%"
        title="${L.label} ${SV.num(counts[k])}척">${share > 0.06 ? SV.pct(share, 0) : ''}</div>`;
    }).join('');
    SV.html(id, html);
  }

  function distLegend(id, counts, vessels) {
    SV.html(id, ['red', 'amber', 'green'].map((k) => {
      const L = SV.LEVELS[k];
      return `<span class="legend__item">
        <span class="legend__swatch" style="background:var(${L.cssVar})"></span>
        ${L.emoji} ${L.label} <b class="tnum">${SV.num(counts[k])}척</b>
        <span class="muted">(${SV.pct(vessels ? counts[k] / vessels : 0, 1)})</span></span>`;
    }).join(''));
  }

  /* ================================================================ 종합 현황 */

  function renderOverview() {
    const R = recompute();
    const m = D.meta.totals;
    const bandRates = D.denominator.band_rates;

    // ---- 핵심 지표 카드 ----
    const worstBand = Object.values(bandRates).reduce((a, b) =>
      (b.annual_pct > a.annual_pct ? b : a));
    const acc = D.accidents.meta;

    SV.html('heroStats', [
      `<div class="stat">
        <div class="stat__label">평가 대상 어선 ${SV.srcBadge('KOMSA', 'KOMSA 어선 검사현황 전수 (공공데이터포털 15049852)')}</div>
        <div class="stat__value tnum">${SV.num(m.registry_vessels)}<span class="stat__unit">척</span></div>
        <div class="stat__foot">${SV.num(m.cells)}개 선박군 조합으로 전수 평가</div>
      </div>`,
      `<div class="stat stat--red">
        <div class="stat__label">🔴 위험 등급 ${SV.srcBadge('DERIVED', '현재 가중치·기상 시나리오 기준 산출')}</div>
        <div class="stat__value tnum">${SV.num(R.counts.red)}<span class="stat__unit">척</span></div>
        <div class="stat__foot">전체의 ${SV.pct(R.shares.red, 1)} · ${SV.LEVELS.red.action}</div>
      </div>`,
      `<div class="stat stat--amber">
        <div class="stat__label">🟡 주의 등급 ${SV.srcBadge('DERIVED', '현재 가중치·기상 시나리오 기준 산출')}</div>
        <div class="stat__value tnum">${SV.num(R.counts.amber)}<span class="stat__unit">척</span></div>
        <div class="stat__foot">전체의 ${SV.pct(R.shares.amber, 1)} · 안전점검 권고 대상</div>
      </div>`,
      `<div class="stat">
        <div class="stat__label">척당 가장 위험한 톤급 ${SV.srcBadge('KMST', '분자 KMST 사고 원자료 / 분모 해수부 어선세력')}</div>
        <div class="stat__value tnum">${worstBand.band.replace('톤', '')}<span class="stat__unit">톤</span></div>
        <div class="stat__foot">연 사고율 ${SV.pctRaw(worstBand.annual_pct)} · 1,000척당 사망·실종 ${SV.dec(worstBand.casualty_per_1k)}명</div>
      </div>`,
    ].join(''));

    renderCriteria();
    renderSourceStrip();

    // ---- 기상 시나리오 버튼 ----
    SV.html('scenarioBtns', D.meta.scenarios.map((s) =>
      `<button class="seg__btn ${s.live ? 'seg__btn--live' : ''}" data-scen="${s.code}"
        aria-pressed="${s.code === scenario}" title="${SV.esc(s.desc)}">${s.live ? '● ' : ''}${SV.esc(s.label)}</button>`
    ).join(''));
    document.querySelectorAll('#scenarioBtns .seg__btn').forEach((b) => {
      b.addEventListener('click', () => {
        scenario = b.dataset.scen;
        renderOverview();
        renderSimulator();
        renderVesselPanel();
      });
    });
    const sc = D.meta.scenarios.find((s) => s.code === scenario);
    if (sc.live) {
      const areas = Object.values(sc.areas || {});
      SV.el('scenarioDesc').innerHTML =
        `<b>기상청 실시간 연동</b> ${SV.srcBadge('KMA', '기상청 초단기실황·단기예보·기상특보 조회서비스 실시간 연동')}
         <div class="livegrid mt-1">${areas.map((a) => `
           <div class="livegrid__item" title="${SV.esc(a.source)}">
             <b>${SV.esc(a.sea_area === '미상' ? '해역 미상' : a.sea_area)}</b>
             <span class="tnum">${SV.dec(a.wind_speed_ms, 1)}<i>m/s</i></span>
             <span class="tnum">${SV.dec(a.wave_height_m, 1)}<i>m</i></span>
             ${a.warning ? `<span class="tag tag--govt">${SV.esc(a.warning)}</span>` : ''}
             ${a.qc_rejected && a.qc_rejected.length
               ? `<span class="tag" title="품질검사에서 배제된 항목">QC 배제 ${a.qc_rejected.length}</span>` : ''}
           </div>`).join('')}</div>
         <div class="small muted mt-1">관측 ${SV.fmtDateTime(areas[0] && areas[0].observed_at)} ·
           해역별 대표 지점 중 <b>가장 나쁜 값</b>을 씁니다 (평균이 아니라 최악을 봐야 안전 판단이 됩니다).</div>
         ${areas.some((a) => a.sea_area === '미상') ? `<div class="small muted">
           <b>해역 미상</b> = 선적항이 어느 해역인지 판정되지 않은 어선.
           어느 해역일 수도 있으므로 <b>실측 해역 중 가장 나쁜 값</b>을 적용합니다 —
           모르는 것을 '잔잔함'으로 두지 않기 위한 규칙입니다.</div>` : ''}`;
    } else {
      SV.el('scenarioDesc').innerHTML =
        `<b>${SV.esc(sc.label)}</b> — ${SV.esc(sc.desc)} · 수온 ${sc.water_temp_c}℃ · 시정 ${sc.visibility_km}km`
        + (sc.warning ? ` · <b style="color:var(--sig-red)">${SV.esc(sc.warning)}</b>` : '')
        + ` <span class="tag">가상 시나리오</span>`
        + ` ${SV.srcBadge('KMA', '기상청 응답 필드 구조를 그대로 쓴 가정값입니다. 실제 관측이 아닙니다.')}`;
    }

    // ---- 분포 ----
    distBar('distBar', R.counts, R.vessels);
    distLegend('distLegend', R.counts, R.vessels);
    SV.el('distTotal').textContent = `총 ${SV.num(R.vessels)}척`;

    SV.html('lampStack', ['red', 'amber', 'green'].map((k) => {
      const L = SV.LEVELS[k];
      const on = R.counts[k] > 0;
      return `<div class="lamp lamp--${k} ${on ? 'is-on' : ''}">
        <span class="lamp__bulb" aria-hidden="true"></span>
        <span><b>${L.label}</b> — ${L.action}</span>
        <span style="margin-left:auto" class="tnum small">${SV.num(R.counts[k])}척</span>
      </div>`;
    }).join(''));

    // ---- 해역별 구성 ----
    const bySea = {};
    R.rows.forEach((r) => {
      const s = r.cell.sea;
      bySea[s] = bySea[s] || { green: 0, amber: 0, red: 0, total: 0 };
      bySea[s][r.level] += r.cell.count;
      bySea[s].total += r.cell.count;
    });
    const seaRows = Object.entries(bySea)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([sea, v]) => ({
        label: sea, total: v.total,
        parts: ['red', 'amber', 'green'].map((k) => ({
          key: k, value: v[k], color: SV.cssVar(SV.LEVELS[k].cssVar),
          tip: `<b>${SV.esc(sea)} · ${SV.LEVELS[k].label}</b>`
             + `<dl><dt>척수</dt><dd>${SV.num(v[k])}</dd>`
             + `<dt>해역 내 비중</dt><dd>${SV.pct(v[k] / v.total, 1)}</dd></dl>`,
        })),
      }));
    Charts.stackedH('seaChart', seaRows, { labelWidth: 44, fmt: (v) => SV.num(v) + '척' });

    // ---- 위험 상위 선박군 ----
    const top = R.rows.slice(0, 12);
    SV.html('topRiskTable',
      `<thead><tr><th style="width:34px"></th><th>선박군</th><th class="num">척수</th><th class="num">점수</th><th>등급</th></tr></thead>
       <tbody>${top.map((r, i) => `
        <tr data-cell="${r.cell.id}" style="cursor:pointer">
          <td><span class="rank ${i < 3 ? 'rank--top' : ''}">${i + 1}</span></td>
          <td><b>${SV.esc(r.cell.fishery)}</b>${r.cell.govt_high_risk ? ' <span class="tag tag--govt">정부지정</span>' : ''}
              <div class="small muted">${SV.esc(r.cell.band)} · ${SV.esc(r.cell.sea)} · ${SV.esc(r.cell.hull)}</div></td>
          <td class="num tnum">${SV.num(r.cell.count)}</td>
          <td class="num tnum"><b>${SV.dec(r.score, 1)}</b></td>
          <td>${SV.signalPill(r.level)}</td>
        </tr>`).join('')}</tbody>`);
    document.querySelectorAll('#topRiskTable tbody tr').forEach((tr) => {
      tr.addEventListener('click', () => {
        selectedCell = tr.dataset.cell;
        switchTab('vessel');
        setVesselMode('cell');      // 선박군 상세를 실제로 보이게 한다
        renderVesselPanel();
      });
    });

    // ---- 톤급별 사고율 ----
    const bandOrder = Object.keys(bandRates);
    Charts.barV('bandRateChart', bandOrder.map((b) => {
      const r = bandRates[b];
      return {
        label: b.replace('톤미만', '').replace('톤이상', '+').replace('톤', ''),
        value: r.annual_pct,
        color: SV.seqColor(r.annual_pct / 25),
        tip: `<b>${SV.esc(b)}</b>
          <dl><dt>등록 척수</dt><dd>${SV.num(r.vessels)}척</dd>
          <dt>사고 건수(5년)</dt><dd>${SV.num(r.accidents)}건</dd>
          <dt>연 사고율</dt><dd>${SV.pctRaw(r.annual_pct, 2)}</dd>
          <dt>1,000척당 사망·실종</dt><dd>${SV.dec(r.casualty_per_1k, 1)}명</dd></dl>
          <div class="small muted" style="margin-top:5px">분자 KMST 사고 원자료 / 분모 해수부 어선세력</div>`,
      };
    }), { valueFmt: (v) => v.toFixed(0) + '%', height: 220 });

    // ---- 월별 지수 ----
    const mi = D.accidents.month_index;
    Charts.barV('monthChart', Object.keys(mi).map((m) => ({
      label: m + '월',
      value: mi[m],
      color: mi[m] >= 1.2 ? SV.cssVar('--sig-red')
            : mi[m] >= 1.0 ? SV.cssVar('--seq-400') : SV.cssVar('--seq-250'),
      tip: `<b>${m}월</b><dl><dt>사고 지수</dt><dd>${SV.dec(mi[m], 2)}</dd>
        <dt>연평균 대비</dt><dd>${mi[m] >= 1 ? '+' : ''}${SV.pct(mi[m] - 1, 0)}</dd></dl>`,
    })), { valueFmt: (v) => v.toFixed(1), baseline: 1, baselineLabel: '연평균 1.00', height: 220 });
  }

  /** 신호등 판정 기준 — 사용자가 결과를 보기 전에 기준을 먼저 알아야 한다. */
  function renderCriteria() {
    const th = thresholds;
    const norm = normalized(weights);
    const factorCards = D.meta.factors.map((f) => `
      <div class="crit__factor">
        <span class="crit__dot" style="background:${SV.factorColor(f.key)}"></span>
        <div>
          <b>${SV.esc(f.label)}</b>
          <span class="crit__w tnum">${SV.pct(norm[f.key], 0)}</span>
          <div class="small muted">${SV.esc(f.desc)}</div>
        </div>
      </div>`).join('');

    SV.html('criteriaBody', `
      <div class="crit-flow">
        <div class="crit-step">
          <div class="crit-step__n">1</div>
          <div>
            <b class="small">여섯 가지를 각각 0~100점으로 채점</b>
            <div class="crit__factors mt-1">${factorCards}</div>
            <p class="small muted mt-1">
              각 팩터의 점수는 정부 공개 데이터에서 계산합니다.
              업종·톤급 위험도는 <b>사고 건수 ÷ 등록 척수</b>(실측 사고율)에서,
              계절·시간대는 사고 원자료 17,036건의 실제 분포에서 나옵니다.
            </p>
          </div>
        </div>

        <div class="crit-step">
          <div class="crit-step__n">2</div>
          <div>
            <b class="small">가중치를 곱해 합산 — 가중치는 담당자가 조정합니다</b>
            <p class="small muted mt-1">
              기본값은 발주기관이 제시한 <b>기상 0.30 · 사고이력 0.20</b>이며 나머지는 초기 배분안입니다.
              합이 1이 아니어도 자동으로 정규화되므로 슬라이더를 전부 올려도 모두 빨간불이 되지 않습니다.
              <a href="#" data-goto="simulator">시뮬레이터에서 직접 조정</a>해 보십시오.
            </p>
          </div>
        </div>

        <div class="crit-step">
          <div class="crit-step__n">3</div>
          <div>
            <b class="small">합계 점수를 경계값과 대조해 신호등 결정</b>
            <div class="crit-scale mt-1">
              <div class="crit-scale__bar">
                <span class="crit-scale__seg" style="flex:${th.amber};background:var(--sig-green)"></span>
                <span class="crit-scale__seg" style="flex:${th.red - th.amber};background:var(--sig-amber)"></span>
                <span class="crit-scale__seg" style="flex:${100 - th.red};background:var(--sig-red)"></span>
              </div>
              <div class="crit-scale__ticks tnum">
                <span>0</span><span style="flex:${th.amber}"></span>
                <span>${SV.dec(th.amber, 0)}</span><span style="flex:${th.red - th.amber}"></span>
                <span>${SV.dec(th.red, 0)}</span><span style="flex:${100 - th.red}"></span><span>100</span>
              </div>
            </div>
            <div class="crit__levels mt-2">
              ${['green', 'amber', 'red'].map((k) => {
                const L = SV.LEVELS[k];
                const range = k === 'green' ? `0 ~ ${SV.dec(th.amber, 0)}점 미만`
                  : k === 'amber' ? `${SV.dec(th.amber, 0)} ~ ${SV.dec(th.red, 0)}점 미만`
                  : `${SV.dec(th.red, 0)}점 이상`;
                return `<div class="crit__level">
                  ${SV.signalPill(k)}
                  <div><b class="small tnum">${range}</b>
                    <div class="small muted">${L.action}</div></div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="crit-step">
          <div class="crit-step__n">4</div>
          <div>
            <b class="small">데이터가 없을 때의 규칙</b>
            <p class="small muted mt-1">
              <b>① 이 선박만 확인이 안 된 경우</b> — '안전' 판정을 내리지 않고 점수에 하한을 겁니다.
              공공 안전 도구에서 <b>"정보가 없어서 안전"</b>은 가장 위험한 오답이기 때문입니다.<br>
              <b>② 전 선박에 공통으로 항목이 없는 경우</b>(건조년도·승선원 수 등은 공개 명부에 아예 없습니다)
              — 하한을 걸지 않습니다. 모든 배가 같은 조건이라 <b>상대 비교는 유효</b>하며,
              하한을 걸면 전 선박이 노란불이 되어 신호등이 아무 정보도 주지 못합니다.
              대신 해당 팩터에 <span class="miss-tag">추정</span> 표시를 답니다.
            </p>
          </div>
        </div>
      </div>`);
  }

  /** 종합 현황 하단 출처 스트립 — 신뢰성의 핵심이므로 첫 화면에 둔다. */
  function renderSourceStrip() {
    SV.html('sourceStrip', `<div class="srcstrip">${D.meta.sources.map((s) => `
      <a class="srcstrip__item" href="${SV.esc(s.url)}" target="_blank" rel="noopener">
        <div class="srcstrip__org">${SV.esc(s.org)}</div>
        <div class="srcstrip__name">${SV.esc(s.name)}</div>
        <div class="srcstrip__meta tnum">${SV.esc(s.rows)} · ${SV.esc(s.period)}</div>
        <div class="srcstrip__use">${SV.esc(s.use).replace(/\*\*/g, '')}</div>
        ${s.dataset_id ? `<span class="tag">${SV.esc(s.portal)} ${SV.esc(s.dataset_id)}</span>` : ''}
      </a>`).join('')}</div>`);
  }

  /* ================================================================ 시뮬레이터 */

  let baselineRanking = null;

  function renderSimulatorControls() {
    const defaults = D.meta.defaults.weights;
    SV.html('weightSliders', D.meta.factors.map((f) => `
      <div class="slider-row">
        <div class="slider-row__top">
          <span class="slider-row__name">
            <span class="slider-row__dot" style="background:${SV.factorColor(f.key)}"></span>${SV.esc(f.label)}
          </span>
          <span>
            <span class="slider-row__val tnum" id="wv-${f.key}">${SV.dec(weights[f.key], 2)}</span>
            <span class="slider-row__pct tnum" id="wp-${f.key}"></span>
          </span>
        </div>
        <input type="range" id="w-${f.key}" min="0" max="1" step="0.01" value="${weights[f.key]}"
               aria-label="${SV.esc(f.label)} 가중치">
        <div class="slider-row__desc">${SV.esc(f.desc)}</div>
      </div>`).join(''));

    D.meta.factors.forEach((f) => {
      const input = document.getElementById(`w-${f.key}`);
      input.addEventListener('input', () => {
        weights[f.key] = parseFloat(input.value);
        renderSimulator();
      });
    });

    SV.html('thresholdSliders', [
      { key: 'amber', label: '🟡 주의 경계', color: '--sig-amber' },
      { key: 'red', label: '🔴 위험 경계', color: '--sig-red' },
    ].map((t) => `
      <div class="slider-row">
        <div class="slider-row__top">
          <span class="slider-row__name">
            <span class="slider-row__dot" style="background:var(${t.color})"></span>${t.label}
          </span>
          <span class="slider-row__val tnum" id="tv-${t.key}">${SV.dec(thresholds[t.key], 0)}점</span>
        </div>
        <input type="range" id="t-${t.key}" min="5" max="95" step="1" value="${thresholds[t.key]}"
               aria-label="${t.label} 값">
      </div>`).join(''));

    ['amber', 'red'].forEach((k) => {
      const input = document.getElementById(`t-${k}`);
      input.addEventListener('input', () => {
        let v = parseInt(input.value, 10);
        // 경계 역전 방지 — 엔진이 거부하는 상태를 UI 에서 만들지 않는다
        if (k === 'amber') v = Math.min(v, thresholds.red - 1);
        else v = Math.max(v, thresholds.amber + 1);
        input.value = v;
        thresholds[k] = v;
        renderSimulator();
        renderOverview();
        renderVesselPanel();
        if (RENDERED.has('vessel')) renderNamedList();
      });
    });

    // ⚠️ 이 버튼은 index.html 에 **정적으로** 있다. 핸들러 안에서
    //    renderSimulatorControls() 를 다시 부르면 여기가 또 실행돼 리스너가
    //    2 → 4 → 8 … 로 늘어난다(10번 누르면 1024개). 그래서 한 번만 붙인다.
    const resetBtn = SV.el('resetWeights');
    if (resetBtn && !resetBtn.dataset.bound) {
      resetBtn.dataset.bound = '1';
      resetBtn.addEventListener('click', () => {
        weights = { ...defaults };
        thresholds = { ...D.meta.defaults.thresholds };
        renderSimulatorControls();
        renderSimulator();
        renderOverview();
        renderVesselPanel();
        if (RENDERED.has('vessel')) renderNamedList();
      });
    }

    SV.el('weightProvenanceText').innerHTML =
      `<b>기본값의 출처</b><br>${SV.esc(D.meta.defaults.weights_note)}`;
  }

  function renderSimulator() {
    const R = recompute();
    const norm = R.norm;

    D.meta.factors.forEach((f) => {
      const v = document.getElementById(`wv-${f.key}`);
      const p = document.getElementById(`wp-${f.key}`);
      if (v) v.textContent = SV.dec(weights[f.key], 2);
      if (p) p.textContent = `(실효 ${SV.pct(norm[f.key], 0)})`;
    });
    ['amber', 'red'].forEach((k) => {
      const n = document.getElementById(`tv-${k}`);
      if (n) n.textContent = SV.dec(thresholds[k], 0) + '점';
    });

    const sc = D.meta.scenarios.find((s) => s.code === scenario);
    SV.el('simScenarioHint').textContent = `기상 시나리오: ${sc.label} (${sc.desc})`;

    const degenerate = isDegenerate(weights);
    let warn = document.getElementById('simDegenerate');
    if (degenerate && !warn) {
      warn = document.createElement('div');
      warn.id = 'simDegenerate';
      warn.className = 'notice notice--warn';
      warn.style.marginBottom = '12px';
      warn.innerHTML = '<span class="notice__ico">⚠️</span><div>'
        + '<b>모든 가중치가 0입니다.</b> 이 상태로는 위험도를 계산할 수 없어 '
        + '여섯 팩터를 균등(각 16.7%)으로 두고 표시합니다. 슬라이더를 하나 이상 올려 주십시오.</div>';
      SV.el('simDist').parentElement.prepend(warn);
    } else if (!degenerate && warn) {
      warn.remove();
    }

    distBar('simDist', R.counts, R.vessels);
    distLegend('simLegend', R.counts, R.vessels);

    const base = baselineRanking || (baselineRanking = recompute(
      D.meta.defaults.weights, D.meta.defaults.thresholds, scenario));
    const baseIndex = new Map(base.rows.map((r, i) => [r.cell.id, i]));

    SV.html('simStats', [
      `<div class="stat"><div class="stat__label">평균 위험도</div>
        <div class="stat__value tnum">${SV.dec(R.meanScore, 1)}</div>
        <div class="stat__foot">기본값 대비 ${R.meanScore >= base.meanScore ? '+' : ''}${SV.dec(R.meanScore - base.meanScore, 1)}점</div></div>`,
      `<div class="stat"><div class="stat__label">조치 대상(주의+위험)</div>
        <div class="stat__value tnum">${SV.num(R.counts.red + R.counts.amber)}</div>
        <div class="stat__foot">${SV.pct((R.counts.red + R.counts.amber) / R.vessels, 1)} · 기본값 ${SV.num(base.counts.red + base.counts.amber)}척</div></div>`,
      `<div class="stat"><div class="stat__label">가중치 합</div>
        <div class="stat__value tnum">${SV.dec(Object.values(weights).reduce((s, v) => s + v, 0), 2)}</div>
        <div class="stat__foot">자동으로 1.00 으로 정규화되어 적용됩니다</div></div>`,
    ].join(''));

    SV.html('simRankTable',
      `<thead><tr><th style="width:34px">순위</th><th>선박군</th><th class="num">점수</th>
        <th class="num">기본값 대비</th><th>등급</th></tr></thead>
      <tbody>${R.rows.slice(0, 15).map((r, i) => {
        const prev = baseIndex.get(r.cell.id);
        const delta = prev === undefined ? null : prev - i;
        const arrow = delta === null ? '—'
          : delta > 0 ? `<span style="color:var(--sig-red)">▲ ${delta}</span>`
          : delta < 0 ? `<span style="color:var(--seq-500)">▼ ${-delta}</span>`
          : '<span class="muted">–</span>';
        return `<tr>
          <td><span class="rank ${i < 3 ? 'rank--top' : ''}">${i + 1}</span></td>
          <td><b>${SV.esc(r.cell.fishery)}</b>
              <div class="small muted">${SV.esc(r.cell.band)} · ${SV.esc(r.cell.sea)} · ${SV.num(r.cell.count)}척</div></td>
          <td class="num tnum"><b>${SV.dec(r.score, 1)}</b></td>
          <td class="num">${arrow}</td>
          <td>${SV.signalPill(r.level)}</td></tr>`;
      }).join('')}</tbody>`);
  }

  /* ================================================================ 업종 분석 */

  function renderFisheryControls() {
    const groups = [...new Set(D.fishery.map((f) => f.group))];
    SV.html('groupFilter',
      `<button class="seg__btn" data-group="" aria-pressed="true">전체</button>`
      + groups.map((g) => `<button class="seg__btn" data-group="${SV.esc(g)}" aria-pressed="false">${SV.esc(g)}</button>`).join(''));
    document.querySelectorAll('#groupFilter .seg__btn').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#groupFilter .seg__btn')
          .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        renderFisheryTable();
      });
    });
    SV.el('fisherySort').addEventListener('change', renderFisheryTable);
    SV.el('onlyGovt').addEventListener('change', renderFisheryTable);
  }

  function currentFisheryRows() {
    const g = document.querySelector('#groupFilter .seg__btn[aria-pressed="true"]')?.dataset.group || '';
    const sortKey = SV.el('fisherySort').value;
    const govtOnly = SV.el('onlyGovt').checked;
    let rows = D.fishery;
    if (g) rows = rows.filter((f) => f.group === g);
    if (govtOnly) rows = rows.filter((f) => f.is_govt_high_risk);
    return SV.sortBy(rows, sortKey, -1);
  }

  function renderFisheryTable() {
    const rows = currentFisheryRows();
    SV.el('fisheryCount').textContent = `${rows.length}개 업종`;
    SV.html('fisheryTable',
      `<thead><tr><th style="width:32px"></th><th>업종</th><th class="num">등록</th>
        <th class="num">지수</th><th class="num">연 사고율</th><th class="num">1천척당 사망</th></tr></thead>
      <tbody>${rows.map((f, i) => `
        <tr data-f="${SV.esc(f.name)}" class="${selectedFishery === f.name ? 'is-selected' : ''}" style="cursor:pointer">
          <td><span class="rank ${i < 3 ? 'rank--top' : ''}">${i + 1}</span></td>
          <td><b>${SV.esc(f.name)}</b>${f.is_govt_high_risk ? ' <span class="tag tag--govt">정부지정</span>' : ''}
            <div class="small muted">${SV.esc(f.group)} · 중앙값 ${SV.ton(f.median_tonnage)} · ${SV.esc(f.top_sea)}</div></td>
          <td class="num tnum">${SV.num(f.vessel_count)}</td>
          <td class="num tnum"><b>${SV.dec(f.risk_index, 2)}</b></td>
          <td class="num tnum">${SV.pctRaw(f.annual_rate_pct)}</td>
          <td class="num tnum">${f.fatality_per_1k === null ? '<span class="muted" title="공표되지 않은 업종입니다. 0명이라는 뜻이 아닙니다.">미공표</span>' : SV.dec(f.fatality_per_1k, 1)}</td>
        </tr>`).join('')}</tbody>`);

    document.querySelectorAll('#fisheryTable tbody tr').forEach((tr) => {
      tr.addEventListener('click', () => {
        selectedFishery = tr.dataset.f;
        renderFisheryTable();
        renderFisheryDetail();
      });
    });
    if (!selectedFishery && rows.length) {
      selectedFishery = rows[0].name;
      renderFisheryDetail();
    }
  }

  function renderFisheryDetail() {
    const f = D.fishery.find((x) => x.name === selectedFishery);
    if (!f) return;
    SV.el('fdName').textContent = f.name;
    SV.el('fdGroup').textContent = `${f.group} · 등록 ${SV.num(f.vessel_count)}척`;

    const mixRows = Object.entries(f.tonnage_mix)
      .filter(([, v]) => v > 0.005)
      .map(([band, share]) => ({
        label: band, value: share * 100,
        color: SV.seqColor(share),
        tip: `<b>${SV.esc(band)}</b><dl><dt>이 업종 내 비중</dt><dd>${SV.pct(share, 1)}</dd>
              <dt>추정 척수</dt><dd>${SV.num(share * f.vessel_count)}척</dd></dl>`,
      }));

    SV.html('fisheryDetail', `
      <div class="grid grid--3" style="gap:10px">
        <div class="stat"><div class="stat__label">위험지수</div>
          <div class="stat__value tnum">${SV.dec(f.risk_index, 2)}</div>
          <div class="stat__foot">전국 평균 = 1.00</div></div>
        <div class="stat"><div class="stat__label">연 사고율</div>
          <div class="stat__value tnum">${SV.dec(f.annual_rate_pct, 1)}<span class="stat__unit">%</span></div>
          <div class="stat__foot">척당 · 톤급 구성 기준</div></div>
        <div class="stat"><div class="stat__label">1,000척당 사망·실종</div>
          <div class="stat__value tnum">${f.fatality_per_1k === null ? '—' : SV.dec(f.fatality_per_1k, 1)}</div>
          <div class="stat__foot">${f.fatality_per_1k === null ? '업종별 공표 자료 없음' : '2019~2023 조업 중 안전사고'}</div></div>
      </div>

      ${f.is_govt_high_risk ? `<div class="notice notice--warn mt-2">
        <span class="notice__ico">⚠️</span>
        <div><b>정부 지정 13개 고위험 허가업종</b>입니다 — 어선 클린사업장 조성 지원사업 대상.
        ${SV.srcBadge('KOMSA', 'KOMSA 어선 클린사업장 조성 지원사업 대상 업종 고시')}</div></div>` : ''}

      ${f.hazard_tags.length ? `<div class="mt-2">${f.hazard_tags.map((t) =>
        `<span class="tag">⚠ ${SV.esc(t)}</span>`).join('')}</div>` : ''}

      ${f.hazard_note ? `<p class="small mt-2" style="color:var(--ink-2)">${SV.esc(f.hazard_note)}</p>` : ''}

      <h4 class="small mt-3" style="margin-bottom:4px">톤급 구성 (%)</h4>
      <div id="fdMix"></div>

      <h4 class="small mt-3" style="margin-bottom:6px">산출 근거</h4>
      <ul class="evi">${f.evidence.map((e) =>
        `<li class="evi__item">${SV.srcBadge('DERIVED')}<div>${SV.esc(e)}</div></li>`).join('')}</ul>

      <div class="row mt-2">
        <span class="small muted">제원</span>
        <span class="tag">중앙값 ${SV.ton(f.median_tonnage)}</span>
        <span class="tag">최대 ${SV.ton(f.max_tonnage)}</span>
        ${f.median_length_m ? `<span class="tag">길이 ${SV.dec(f.median_length_m, 1)}m</span>` : ''}
        <span class="tag">FRP ${SV.pct(f.frp_share, 0)}</span>
        <span class="tag">주 해역 ${SV.esc(f.top_sea)}</span>
      </div>`);

    Charts.barH('fdMix', mixRows, {
      valueFmt: (v) => SV.dec(v, 0) + '%', labelWidth: 62, barH: 15, gap: 5,
    });
  }

  function renderGovtCompare() {
    const ranked = D.fishery;
    const govt = ranked.filter((f) => f.is_govt_high_risk);
    const topThird = new Set(ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 3))).map((f) => f.name));
    const hits = govt.filter((f) => topThird.has(f.name));
    const expected = govt.length / 3;
    const notDesignated = ranked.slice(0, 15).filter((f) => !f.is_govt_high_risk);

    SV.html('govtCompare', `
      <div class="grid grid--3" style="gap:10px;margin-bottom:14px">
        <div class="stat"><div class="stat__label">정부 지정 업종 중 모델 상위 1/3 재현</div>
          <div class="stat__value tnum">${hits.length}<span class="stat__unit">/ ${govt.length}</span></div>
          <div class="stat__foot">무작위 기대치 ${SV.dec(expected, 1)}개 대비 ${SV.dec(hits.length / expected, 1)}배</div></div>
        <div class="stat"><div class="stat__label">전체 분석 업종</div>
          <div class="stat__value tnum">${ranked.length}</div>
          <div class="stat__foot">등록 20척 이상 업종만</div></div>
        <div class="stat"><div class="stat__label">모델이 새로 지목한 고위험</div>
          <div class="stat__value tnum">${notDesignated.length}</div>
          <div class="stat__foot">상위 15위 중 정부 미지정</div></div>
      </div>

      <div class="notice">
        <span class="notice__ico">🔍</span>
        <div>
          <b>모델이 정부 판단을 데이터만으로 재현했습니다.</b>
          정부가 사고발생률을 근거로 지정한 고위험 업종 ${govt.length}개 중 ${hits.length}개가,
          본 모델의 독립적 계산(공개 데이터만 사용)에서도 상위 1/3에 들었습니다.
          이는 모델의 타당성을 뒷받침합니다.
        </div>
      </div>

      ${notDesignated.length ? `
      <div class="notice notice--warn mt-2">
        <span class="notice__ico">📌</span>
        <div>
          <b>검토가 필요한 지점</b> — 아래 업종은 모델 위험지수가 상위 15위 안에 들지만
          현재 정부 고위험 지정 목록에는 없습니다. 지정 확대 검토 대상으로 제안드립니다.
          <div class="mt-1">${notDesignated.map((f) =>
            `<span class="tag">${SV.esc(f.name)} <b>${SV.dec(f.risk_index, 2)}배</b></span>`).join('')}</div>
        </div>
      </div>` : ''}

      <div class="tbl-wrap mt-2"><table>
        <thead><tr><th>정부 지정 업종</th><th class="num">모델 순위</th><th class="num">위험지수</th><th class="num">등록 척수</th></tr></thead>
        <tbody>${govt.map((f) => {
          const rank = ranked.findIndex((x) => x.name === f.name) + 1;
          return `<tr><td><b>${SV.esc(f.name)}</b></td>
            <td class="num tnum">${rank}위 / ${ranked.length}</td>
            <td class="num tnum">${SV.dec(f.risk_index, 2)}</td>
            <td class="num tnum">${SV.num(f.vessel_count)}</td></tr>`;
        }).join('')}</tbody></table></div>`);
  }

  /* ================================================================ 지도 */

  const KIND_COLORS = {};
  function kindColor(kind) {
    if (!KIND_COLORS[kind]) {
      const top = D.accidents.by_kind.slice(0, 6).map((k) => k.kind);
      const i = top.indexOf(kind);
      KIND_COLORS[kind] = i >= 0 ? SV.seriesColor(i) : SV.cssVar('--ink-muted');
    }
    return KIND_COLORS[kind];
  }

  function renderMapControls() {
    const kinds = D.accidents.by_kind.slice(0, 12);
    SV.el('mapKind').innerHTML = '<option value="">전체 유형</option>'
      + kinds.map((k) => `<option value="${SV.esc(k.kind)}">${SV.esc(k.kind)} (${SV.num(k.count)}건)</option>`).join('');
    const years = [...new Set(D.accidents.positions.map((p) => p.yr))].sort();
    SV.el('mapYear').innerHTML = '<option value="">전체 연도</option>'
      + years.map((y) => `<option value="${y}">${y}년</option>`).join('');

    ['mapKind', 'mapYear'].forEach((id) => SV.el(id).addEventListener('change', renderMap));
    const hotChk = document.getElementById('showHotspots');
    if (hotChk) {
      hotChk.addEventListener('change', renderMap);
      const n = (D.hotspots && D.hotspots.spots || []).length;
      const lbl = document.getElementById('hotspotLabel');
      if (lbl) {
        lbl.innerHTML = n
          ? `사고 다발지점 겹쳐보기 <b>(${SV.num(n)}곳)</b>`
          : '사고 다발지점 (MTIS 미연계)';
        if (!n) hotChk.disabled = true;
      }
    }
    document.querySelectorAll('#mapMode .seg__btn').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#mapMode .seg__btn')
          .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        renderMap();
      });
    });
  }

  function renderMap() {
    const mode = document.querySelector('#mapMode .seg__btn[aria-pressed="true"]').dataset.mode;
    const showHot = document.getElementById('showHotspots')?.checked;
    const kind = SV.el('mapKind').value;
    const year = SV.el('mapYear').value;

    let pts = D.accidents.positions;
    if (kind) pts = pts.filter((p) => p.k === kind);
    if (year) pts = pts.filter((p) => String(p.yr) === year);

    SV.el('mapCount').textContent =
      `표시 ${SV.num(pts.length)}건 · 인명피해 ${SV.num(pts.filter((p) => p.c > 0).length)}건`;

    // MTIS 사고 다발지점을 겹쳐 그린다 — 개별 사고가 아니라 '반복 발생 구역'이다
    const hotspots = showHot && D.hotspots && D.hotspots.spots ? D.hotspots.spots : [];

    Charts.scatterMap('mapChart', pts, {
      overlay: hotspots.map((h) => ({
        x: h.lon, y: h.lat, r: Math.min(16, 4 + Math.sqrt(h.size) * 1.6),
        color: h.kind === 'grounding' ? SV.cssVar('--s4') : SV.cssVar('--s6'),
        tip: `<b>${SV.esc(h.kind_label)}</b>
          <dl><dt>누적 사고</dt><dd>${h.size}건</dd>
          ${h.season ? `<dt>계절</dt><dd>${SV.esc(h.season)}</dd>` : ''}
          <dt>좌표</dt><dd>${SV.dec(h.lat, 3)}, ${SV.dec(h.lon, 3)}</dd></dl>
          <div class="small muted" style="margin-top:5px">MTIS · 최근 5년 사고를 DBSCAN 으로 군집한 반복 발생 지점</div>`,
      })),
      colorFor: (p) => mode === 'casualty'
        ? (p.c >= 3 ? SV.cssVar('--sig-red')
          : p.c > 0 ? '#ec835a'
          : p.i > 0 ? SV.cssVar('--sig-amber') : SV.cssVar('--seq-250'))
        : kindColor(p.k),
      radiusFor: (p) => (p.c >= 3 ? 6 : p.c > 0 ? 4.2 : p.i > 0 ? 3.1 : 2.2),
      tipFor: (p) => `<b>${SV.esc(p.n || '선명 미상')}</b>
        <dl><dt>사고 유형</dt><dd>${SV.esc(p.k)}</dd>
        <dt>발생</dt><dd>${p.yr}년</dd>
        <dt>총톤수</dt><dd>${SV.ton(p.t)}</dd>
        <dt>해역</dt><dd>${SV.esc(p.s)}</dd>
        <dt>사망·실종</dt><dd>${p.c}명</dd>
        <dt>부상</dt><dd>${p.i}명</dd></dl>
        <div class="small muted" style="margin-top:5px">중앙해양안전심판원 원자료의 실제 기록</div>`,
    });

    const hotLegend = hotspots.length ? Charts.legendHTML([
      { label: `좌초·좌주 다발지점`, color: SV.cssVar('--s4'),
        value: SV.num(hotspots.filter((h) => h.kind === 'grounding').length) + '곳' },
      { label: `부유물감김 다발지점`, color: SV.cssVar('--s6'),
        value: SV.num(hotspots.filter((h) => h.kind === 'entangle').length) + '곳' },
    ]) : '';

    SV.html('mapLegend', (mode === 'casualty'
      ? Charts.legendHTML([
          { label: '사망·실종 3명 이상', color: SV.cssVar('--sig-red') },
          { label: '사망·실종 1~2명', color: '#ec835a' },
          { label: '부상만', color: SV.cssVar('--sig-amber') },
          { label: '인명피해 없음', color: SV.cssVar('--seq-250') },
        ])
      : Charts.legendHTML(D.accidents.by_kind.slice(0, 6).map((k) => ({
          label: k.kind, color: kindColor(k.kind), value: SV.num(k.count) + '건',
        })))) + hotLegend);
  }

  function renderMapCharts() {
    const leth = D.accidents.by_kind
      .filter((k) => k.count >= 30)
      .sort((a, b) => b.lethality - a.lethality)
      .slice(0, 10);
    Charts.barH('lethalChart', leth.map((k) => ({
      label: k.kind.replace('(인명사상)', ''),
      value: k.lethality,
      color: k.lethality >= 0.3 ? SV.cssVar('--sig-red')
           : k.lethality >= 0.1 ? '#ec835a' : SV.cssVar('--seq-400'),
      tip: `<b>${SV.esc(k.kind)}</b>
        <dl><dt>사고 건수</dt><dd>${SV.num(k.count)}건</dd>
        <dt>사망</dt><dd>${SV.num(k.dead)}명</dd>
        <dt>실종</dt><dd>${SV.num(k.missing)}명</dd>
        <dt>부상</dt><dd>${SV.num(k.injured)}명</dd>
        <dt>치명률</dt><dd>${SV.dec(k.lethality, 3)}명/건</dd></dl>`,
    })), { valueFmt: (v) => v.toFixed(2), labelWidth: 104, barH: 17, gap: 7 });

    const ti = D.accidents.time_block_index;
    const order = ['0-4시', '4-8시', '8-12시', '12-16시', '16-20시', '20-24시'];
    Charts.barV('timeChart', order.filter((k) => k in ti).map((k) => ({
      label: k.replace('시', ''),
      value: ti[k],
      color: ti[k] >= 1.2 ? SV.cssVar('--sig-red')
           : ti[k] >= 1 ? SV.cssVar('--seq-400') : SV.cssVar('--seq-250'),
      tip: `<b>${SV.esc(k)}</b><dl><dt>사고 지수</dt><dd>${SV.dec(ti[k], 2)}</dd></dl>
        <div class="small muted" style="margin-top:4px">통념과 달리 야간이 아니라 주간 조업시간대가 가장 위험합니다.</div>`,
    })), { valueFmt: (v) => v.toFixed(1), baseline: 1, baselineLabel: '구간 평균 1.00', height: 220 });
  }

  /* ================================================================ 선박 판정 */

  function renderVesselControls() {
    const seas = [...new Set(CELLS.map((c) => c.sea))].sort();
    const bands = Object.keys(D.denominator.band_rates);
    SV.el('cellSea').innerHTML = '<option value="">전체 해역</option>'
      + seas.map((s) => `<option value="${SV.esc(s)}">${SV.esc(s)}</option>`).join('');
    SV.el('cellBand').innerHTML = '<option value="">전체 톤급</option>'
      + bands.map((b) => `<option value="${SV.esc(b)}">${SV.esc(b)}</option>`).join('');
    ['cellSea', 'cellBand', 'cellSignal'].forEach((id) =>
      SV.el(id).addEventListener('change', renderVesselPanel));
    SV.el('cellSearch').addEventListener('input', SV.debounce(renderVesselPanel, 160));
  }

  function renderVesselPanel() {
    const R = recompute();
    const q = SV.el('cellSearch').value.trim();
    const sea = SV.el('cellSea').value;
    const band = SV.el('cellBand').value;
    const sig = SV.el('cellSignal').value;

    let rows = R.rows;
    if (q) rows = rows.filter((r) =>
      r.cell.fishery.includes(q) || r.cell.ports.some((p) => p.includes(q)) || r.cell.sea.includes(q));
    if (sea) rows = rows.filter((r) => r.cell.sea === sea);
    if (band) rows = rows.filter((r) => r.cell.band === band);
    if (sig) rows = rows.filter((r) => r.level === sig);

    const shown = rows.slice(0, 200);
    SV.el('cellCount').textContent =
      `${SV.num(rows.length)}개 선박군 · ${SV.num(rows.reduce((s, r) => s + r.cell.count, 0))}척`
      + (rows.length > 200 ? ` (상위 200개 표시)` : '');

    SV.html('cellTable',
      `<thead><tr><th>선박군</th><th class="num">척수</th><th class="num">점수</th><th>등급</th></tr></thead>
      <tbody>${shown.map((r) => `
        <tr data-cell="${r.cell.id}" class="${selectedCell === r.cell.id ? 'is-selected' : ''}" style="cursor:pointer">
          <td><b>${SV.esc(r.cell.fishery)}</b>${r.cell.govt_high_risk ? ' <span class="tag tag--govt">지정</span>' : ''}
            <div class="small muted">${SV.esc(r.cell.band)} · ${SV.esc(r.cell.sea)} · ${SV.esc(r.cell.hull)} · ${SV.ton(r.cell.median_tonnage)}</div></td>
          <td class="num tnum">${SV.num(r.cell.count)}</td>
          <td class="num tnum"><b>${SV.dec(r.score, 1)}</b></td>
          <td>${SV.signalPill(r.level)}</td></tr>`).join('')}</tbody>`);

    document.querySelectorAll('#cellTable tbody tr').forEach((tr) => {
      tr.addEventListener('click', () => { selectedCell = tr.dataset.cell; renderVesselPanel(); });
    });

    if (!selectedCell || !shown.some((r) => r.cell.id === selectedCell)) {
      selectedCell = shown.length ? shown[0].cell.id : null;
    }
    renderCellDetail(R);
  }

  function renderCellDetail(R) {
    const host = SV.el('cellDetail');
    if (!selectedCell) {
      host.innerHTML = `<div class="card"><div class="card__body">
        <p class="muted small">조건에 맞는 선박군이 없습니다. 필터를 조정해 보십시오.</p></div></div>`;
      return;
    }
    const row = R.rows.find((r) => r.cell.id === selectedCell);
    if (!row) return;
    const c = row.cell;
    const labels = Object.fromEntries(D.meta.factors.map((f) => [f.key, f.label]));

    const factors = D.meta.factors.map((f) => ({
      key: f.key, label: f.label,
      score: row.parts[f.key],
      weight: R.norm[f.key],
      contribution: row.parts[f.key] * R.norm[f.key],
      missing: (c.missing || []).includes(f.key),
      unavailable: (c.unavail || []).includes(f.key),
      estimated: (c.missing || []).includes(f.key) || (c.unavail || []).includes(f.key),
    })).sort((a, b) => b.contribution - a.contribution);

    host.innerHTML = `
      <div class="card">
        <div class="card__head">
          <h3>${SV.esc(c.fishery)}</h3>
          <span class="hint">${SV.esc(c.band)} · ${SV.esc(c.sea)} · ${SV.num(c.count)}척</span>
        </div>
        <div class="card__body">
          <div class="row between" style="align-items:flex-start">
            <div>
              <div style="font-size:38px;font-weight:760;letter-spacing:-.03em;line-height:1">
                ${SV.dec(row.score, 1)}<span style="font-size:16px;color:var(--ink-2);font-weight:600"> / 100점</span>
              </div>
              <div class="mt-1">${SV.signalPill(row.level)}
                <span class="small muted" style="margin-left:6px">${SV.LEVELS[row.level].action}</span></div>
            </div>
            <div class="lamp-stack" style="min-width:172px">
              ${['red', 'amber', 'green'].map((k) => `
                <div class="lamp lamp--${k} ${row.level === k ? 'is-on' : ''}">
                  <span class="lamp__bulb" aria-hidden="true"></span><span>${SV.LEVELS[k].label}</span>
                </div>`).join('')}
            </div>
          </div>

          ${row.floored ? `<div class="notice notice--warn mt-2">
            <span class="notice__ico">⚠️</span>
            <div><b>데이터 결측으로 '안전' 판정을 보류했습니다.</b>
            공공 안전 도구에서 가장 위험한 오답은 "정보가 없어서 안전"입니다.
            결측 항목이 연계되면 자동으로 해제됩니다.</div></div>` : ''}

          <h4 class="small mt-3" style="margin-bottom:4px">점수 구성 (가중치 적용 후 기여도)</h4>
          <div id="contribBar"></div>

          <div class="mt-2">
            ${factors.map((f) => `
              <div class="fbar">
                <div class="fbar__name">
                  <span class="legend__swatch" style="background:${SV.factorColor(f.key)}"></span>
                  ${SV.esc(f.label)} ${f.estimated ? `<span class="miss-tag" title="${f.missing ? '이 선박만 데이터를 확인하지 못했습니다' : '현재 연계된 공개 데이터에 항목 자체가 없어 대리 추정했습니다 (전 선박 공통)'}">${f.missing ? '미확인' : '추정'}</span>` : ''}
                </div>
                <div class="fbar__track">
                  <div class="fbar__fill" style="width:${SV.clamp(f.score, 0, 100)}%;background:${SV.factorColor(f.key)}"></div>
                </div>
                <div class="fbar__num tnum"><b>${SV.dec(f.score, 0)}</b> × ${SV.dec(f.weight * 100, 0)}%</div>
              </div>`).join('')}
          </div>

          <div class="row mt-2 small muted">
            <span>선적항 예시</span>
            ${c.ports.map((p) => `<span class="tag">${SV.esc(p)}</span>`).join('')}
            ${c.port_count > c.ports.length ? `<span class="tag">외 ${c.port_count - c.ports.length}곳</span>` : ''}
          </div>
          <div class="row small muted">
            <span>제원</span>
            <span class="tag">${SV.ton(c.median_tonnage)}</span>
            <span class="tag">길이 ${SV.dec(c.median_length, 1)}m</span>
            <span class="tag">${SV.esc(c.hull)}</span>
            ${c.slenderness ? `<span class="tag">세장비 ${SV.dec(c.slenderness, 2)}</span>` : ''}
          </div>
          ${c.hazard_tags.length ? `<div class="row small mt-1">${c.hazard_tags.map((t) =>
            `<span class="tag">⚠ ${SV.esc(t)}</span>`).join('')}</div>` : ''}

          <h4 class="small mt-3" style="margin-bottom:6px">이 신호등이 나온 계산 과정</h4>
          ${calcTraceHTML(c, row, factors, R)}

          <h4 class="small mt-3" style="margin-bottom:6px">판정 근거 (출처 포함)</h4>
          <ul class="evi">${evidenceList(c)}</ul>
        </div>
      </div>`;

    Charts.contributionBar('contribBar', factors, row.score, { thresholds });
  }

  /**
   * 판정 과정을 산수 그대로 보여준다.
   *
   * "왜 빨간불이냐"에 화면이 답하지 못하면 행정에 쓸 수 없다.
   * 담당자가 종이에 옮겨 적어 검산할 수 있을 만큼 그대로 노출한다.
   */
  function calcTraceHTML(cell, row, factors, R) {
    const th = thresholds;
    const rawSum = factors.reduce((s, f) => s + f.contribution, 0);
    const sc = D.meta.scenarios.find((s) => s.code === scenario);

    const steps = [
      {
        n: 1,
        t: '여섯 팩터를 각각 0~100점으로 채점',
        body: `<div class="tbl-wrap"><table>
          <thead><tr><th>팩터</th><th class="num">점수</th><th>근거 요약</th></tr></thead>
          <tbody>${factors.map((f) => {
            const firstEv = (cell.ev[f.key] || []).map((i) => EV[i]).find(Boolean);
            return `<tr>
              <td><span class="legend__swatch" style="background:${SV.factorColor(f.key)};display:inline-block;margin-right:6px"></span>${SV.esc(f.label)}
                ${f.estimated ? `<span class="miss-tag">${f.missing ? '미확인' : '추정'}</span>` : ''}</td>
              <td class="num tnum"><b>${SV.dec(f.score, 1)}</b></td>
              <td class="small muted">${firstEv ? SV.esc(firstEv.t.slice(0, 70)) + (firstEv.t.length > 70 ? '…' : '') : '—'}</td>
            </tr>`;
          }).join('')}</tbody></table></div>
          <p class="small muted mt-1">기상 팩터는 선택한 시나리오(<b>${SV.esc(sc.label)}</b> · ${SV.esc(sc.desc)})로 계산했습니다.</p>`,
      },
      {
        n: 2,
        t: '가중치를 합이 1이 되도록 정규화',
        body: `<div class="sms" style="font-size:12.5px">${factors.map((f) =>
            `${SV.esc(f.label)} ${SV.dec(weights[f.key], 2)}`).join('  +  ')}
  =  ${SV.dec(Object.values(weights).reduce((s, v) => s + v, 0), 2)}
→ 각 가중치를 합으로 나눠 정규화 = ${factors.map((f) => `${SV.esc(f.label)} ${SV.pct(f.weight, 1)}`).join(' · ')}</div>
          <p class="small muted mt-1">정규화하지 않으면 슬라이더를 올릴수록 모든 배가 빨간불이 됩니다.</p>`,
      },
      {
        n: 3,
        t: '점수 × 가중치를 모두 더함',
        body: `<div class="sms" style="font-size:12.5px">${factors.map((f) =>
            `${SV.esc(f.label).padEnd(8, ' ')} ${SV.dec(f.score, 1).padStart(6, ' ')} × ${SV.dec(f.weight * 100, 1).padStart(5, ' ')}%  =  ${SV.dec(f.contribution, 2).padStart(6, ' ')}`).join('\n')}
${'─'.repeat(42)}
합계${' '.repeat(22)}=  ${SV.dec(rawSum, 2).padStart(6, ' ')}점</div>`,
      },
    ];

    if (row.floored) {
      steps.push({
        n: 4,
        t: '데이터 미확인 보정',
        body: `<div class="notice notice--warn"><span class="notice__ico">⚠️</span><div>
          이 선박만 확인하지 못한 항목이 있어 <b>'안전' 판정을 보류</b>하고
          점수를 ${SV.dec(Math.max(D.meta.defaults.uncertain_floor, th.amber), 0)}점으로 올렸습니다.
          공공 안전 도구에서 "정보가 없어서 안전"은 가장 위험한 오답이기 때문입니다.
        </div></div>`,
      });
    }

    steps.push({
      n: steps.length + 1,
      t: '경계값과 대조해 신호등 결정',
      body: `<div class="sms" style="font-size:12.5px">최종 ${SV.dec(row.score, 1)}점
  · ${SV.dec(th.amber, 0)}점 미만        → 🟢 안전
  · ${SV.dec(th.amber, 0)}점 이상 ${SV.dec(th.red, 0)}점 미만  → 🟡 주의
  · ${SV.dec(th.red, 0)}점 이상        → 🔴 위험
→ ${SV.dec(row.score, 1)}점 이므로 <b>${SV.LEVELS[row.level].emoji} ${SV.LEVELS[row.level].label}</b></div>
        <p class="small muted mt-1">경계값은 <a href="#" data-goto="simulator">위험도 시뮬레이터</a>에서 담당자가 조정할 수 있습니다.</p>`,
    });

    return `<div class="calc">${steps.map((s) => `
      <div class="calc__step">
        <div class="calc__n">${s.n}</div>
        <div class="calc__body"><b class="small">${SV.esc(s.t)}</b><div class="mt-1">${s.body}</div></div>
      </div>`).join('')}</div>`;
  }

  /* ================================================================ 실명 선박 */

  /**
   * 실명 선박 — "어느 배가 위험한가"에 직접 답하는 화면.
   *
   * 전수 명부(63,647척)에는 선박명이 없어 "근해안강망 49톤 · 보령시"까지만 말할 수
   * 있었다. 어선원부에는 **어선번호 + 선박명 + 진수일자**가 있어 개별 선박을
   * 지목할 수 있고, 선령이 실측이라 판정도 정확해진다.
   */
  function namedEvidence(factor) {
    const pool = (D.named && D.named.evidence) || [];
    return (factor.ev || []).map((i) => pool[i]).filter(Boolean);
  }

  function renderNamedControls() {
    const seas = [...new Set(D.named.vessels.map((v) => v.sea_area))].filter(Boolean).sort();
    SV.el('namedSea').innerHTML = '<option value="">전체 해역</option>'
      + seas.map((s) => `<option value="${SV.esc(s)}">${SV.esc(s)}</option>`).join('');
    ['namedSea', 'namedSignal', 'namedSort'].forEach((id) =>
      SV.el(id).addEventListener('change', renderNamedList));
    SV.el('namedOnlyAccident').addEventListener('change', renderNamedList);
    SV.el('namedSearch').addEventListener('input', SV.debounce(renderNamedList, 160));

    document.querySelectorAll('#vesselMode .seg__btn').forEach((b) => {
      b.addEventListener('click', () => {
        setVesselMode(b.dataset.vmode);
        if (vesselMode === 'named') renderNamedList(); else renderVesselPanel();
      });
    });
    updateVesselModeDesc();
  }

  function updateVesselModeDesc() {
    const m = D.named.meta;
    SV.el('vesselModeDesc').innerHTML = vesselMode === 'named'
      ? `<b>어선번호로 식별되는 실제 선박 ${SV.num(m.total)}척</b>입니다 —
         선박명·어선번호·제원이 공개 어선원부에 있는 배들입니다.
         이 중 <b>${SV.num(m.with_age)}척</b>은 진수일자가 있어 <b>선령이 실측</b>이고,
         <b>${SV.num(m.matched_with_accidents)}척</b>은 중앙해양안전심판원에 <b>실제 사고 기록</b>이 있습니다.
         <br><span class="muted">⚠️ ${SV.esc(m.caveat)}</span>`
      : `업종·톤급·해역·선질·선형이 같은 선박은 위험도가 같습니다.
         전국 <b>${SV.num(D.meta.totals.registry_vessels)}척</b>을
         <b>${SV.num(D.meta.totals.cells)}</b>개 조합으로 묶어 <b>전수</b>를 다룹니다.
         <br><span class="muted">이 명부에는 선박명이 없습니다 — 개별 선박을 지목하려면 '실명 선박' 보기를 쓰십시오.</span>`;
  }

  function currentNamedRows() {
    const q = SV.el('namedSearch').value.trim();
    const sea = SV.el('namedSea').value;
    const sig = SV.el('namedSignal').value;
    const sort = SV.el('namedSort').value;
    const onlyAcc = SV.el('namedOnlyAccident').checked;

    let rows = D.named.vessels;
    if (q) {
      const digits = q.replace(/\D/g, '');
      const numeric = digits.length >= 4 && digits.length >= q.replace(/\s/g, '').length * 0.6;
      rows = rows.filter((v) => v.name.includes(q)
        || (numeric && v.hull_no.includes(digits))
        || (v.port || '').includes(q));
    }
    if (sea) rows = rows.filter((v) => v.sea_area === sea);
    if (sig) rows = rows.filter((v) => namedScore(v).level === sig);
    if (onlyAcc) rows = rows.filter((v) => v.accident_count > 0);

    const key = {
      score: (v) => namedScore(v).score,
      age: (v) => v.age_years,
      tonnage: (v) => v.gross_tonnage,
      accident: (v) => v.accident_count * 100 + v.casualties,
    }[sort];
    return [...rows].sort((a, b) => {
      const av = key(a), bv = key(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;       // 값 없는 항목은 뒤로 — 0으로 보지 않는다
      if (bv == null) return -1;
      return bv - av;
    });
  }

  function renderNamedList() {
    const rows = currentNamedRows();
    SV.el('namedCount').textContent =
      `${SV.num(rows.length)}척` + (rows.length > 300 ? ' (상위 300척 표시)' : '');
    const shown = rows.slice(0, 300);

    SV.html('namedTable',
      `<thead><tr><th>선박 · 어선번호</th><th class="num">제원</th><th class="num">점수</th><th>등급</th></tr></thead>
      <tbody>${shown.map((v) => `
        <tr data-hull="${SV.esc(v.hull_no)}" class="${selectedHull === v.hull_no ? 'is-selected' : ''}" style="cursor:pointer">
          <td>
            <b>${SV.esc(v.name)}</b>
            ${v.casualties ? `<span class="tag tag--govt">인명피해 ${v.casualties}명</span>` : ''}
            ${v.accident_count ? `<span class="tag">사고 ${v.accident_count}건</span>` : ''}
            <div class="small muted tnum" style="white-space:nowrap">${SV.esc(v.display_no)}</div>
            <div class="small muted">${SV.esc(v.port || v.sea_area || '—')}</div>
          </td>
          <td class="num" style="white-space:nowrap">
            <span class="tnum">${SV.dec(v.gross_tonnage, 2)}톤</span>
            <div class="small muted tnum">${v.age_years == null
              ? '<span title="진수일자가 명부에 없습니다">선령 —</span>'
              : `선령 ${SV.dec(v.age_years, 0)}년`}${v.age_years >= 21 ? ' <span class="miss-tag">노후</span>' : ''}</div>
          </td>
          <td class="num tnum"><b style="font-size:15px">${SV.dec(namedScore(v).score, 1)}</b></td>
          <td>${SV.signalPill(namedScore(v).level)}</td>
        </tr>`).join('')}</tbody>`);

    document.querySelectorAll('#namedTable tbody tr').forEach((tr) => {
      tr.addEventListener('click', () => { selectedHull = tr.dataset.hull; renderNamedList(); });
    });

    if (!selectedHull || !shown.some((v) => v.hull_no === selectedHull)) {
      selectedHull = shown.length ? shown[0].hull_no : null;
    }
    renderNamedDetail();
  }

  function renderNamedDetail() {
    const host = SV.el('namedDetail');
    const v = D.named.vessels.find((x) => x.hull_no === selectedHull);
    if (!v) {
      host.innerHTML = `<div class="card"><div class="card__body">
        <p class="muted small">조건에 맞는 선박이 없습니다. 검색어나 필터를 조정해 보십시오.</p></div></div>`;
      return;
    }
    const a = v.assessment;
    // 현재 슬라이더 기준으로 다시 계산한다 (굳힌 값이 아니라)
    const now = namedScore(v);
    const factors = [...a.factors].sort((x, y) => y.contribution - x.contribution);

    host.innerHTML = `
      <div class="card">
        <div class="card__head">
          <h3>${SV.esc(v.name)}</h3>
          <span class="hint tnum">어선번호 ${SV.esc(v.display_no)}</span>
        </div>
        <div class="card__body">
          <div class="row between" style="align-items:flex-start">
            <div>
              <div style="font-size:38px;font-weight:760;letter-spacing:-.03em;line-height:1">
                ${SV.dec(now.score, 1)}<span style="font-size:16px;color:var(--ink-2);font-weight:600"> / 100점</span>
              </div>
              <div class="mt-1">${SV.signalPill(now.level)}
                <span class="small muted" style="margin-left:6px">${SV.esc(a.action)}</span></div>
            </div>
            <div class="lamp-stack" style="min-width:168px">
              ${['red', 'amber', 'green'].map((k) => `
                <div class="lamp lamp--${k} ${now.level === k ? 'is-on' : ''}">
                  <span class="lamp__bulb" aria-hidden="true"></span><span>${SV.LEVELS[k].label}</span>
                </div>`).join('')}
            </div>
          </div>

          <h4 class="small mt-3" style="margin-bottom:6px">선박 제원</h4>
          <div class="tbl-wrap"><table><tbody>
            ${[
              ['어선번호', `<span class="tnum">${SV.esc(v.display_no)}</span>`],
              ['선박명', `<b>${SV.esc(v.name)}</b>`],
              ['총톤수', `${SV.dec(v.gross_tonnage, 2)}톤 <span class="muted">(${SV.esc(v.tonnage_band)})</span>`],
              ['선령', v.age_years == null ? '<span class="muted">진수일자 미기재</span>'
                : `${SV.dec(v.age_years, 1)}년 <span class="muted">(진수 ${SV.esc(v.launched)})</span>${v.age_years >= 21 ? ' <span class="tag tag--govt">21년 이상 노후</span>' : ''}`],
              ['제원', [v.length_m && `길이 ${SV.dec(v.length_m, 2)}m`,
                        v.beam_m && `너비 ${SV.dec(v.beam_m, 2)}m`,
                        v.depth_m && `깊이 ${SV.dec(v.depth_m, 2)}m`,
                        v.slenderness && `세장비 ${SV.dec(v.slenderness, 2)}`]
                        .filter(Boolean).join(' · ') || '<span class="muted">—</span>'],
              ['선적항', SV.esc(v.port || '—') + (v.sea_area ? ` <span class="tag">${SV.esc(v.sea_area)}</span>` : '')],
              ['업종', v.fishery ? SV.esc(v.fishery) : '<span class="muted" title="어선원부에 어업방법이 없는 경우가 많습니다">미기재</span>'],
              ['선질·기관', [v.hull_material, v.engine_hp && `${SV.num(v.engine_hp)}마력`].filter(Boolean).join(' · ') || '<span class="muted">—</span>'],
              ['호출부호', v.call_sign ? SV.esc(v.call_sign) : '<span class="muted">—</span>'],
              ['조선자', v.builder ? SV.esc(v.builder) : '<span class="muted">—</span>'],
            ].map(([k, val]) => `<tr><td style="width:104px;color:var(--ink-2)">${k}</td><td>${val}</td></tr>`).join('')}
          </tbody></table></div>

          ${v.accident_count ? `
            <h4 class="small mt-3" style="margin-bottom:6px">
              사고 이력 <span class="muted">— 중앙해양안전심판원 실제 기록 ${v.accident_count}건</span>
            </h4>
            <div class="tbl-wrap"><table>
              <thead><tr><th>발생</th><th>사고 유형</th><th class="num">사망·실종</th><th class="num">부상</th><th>해역</th></tr></thead>
              <tbody>${v.accident_history.map((h) => `<tr>
                <td class="tnum">${h.year}-${String(h.month).padStart(2, '0')}</td>
                <td>${SV.esc(h.kind)}</td>
                <td class="num tnum">${h.casualties ? `<b style="color:var(--sig-red)">${h.casualties}</b>` : 0}</td>
                <td class="num tnum">${h.injuries || 0}</td>
                <td>${SV.esc(h.sea)}</td></tr>`).join('')}</tbody></table></div>`
            : `<div class="notice mt-3"><span class="notice__ico">ℹ️</span>
               <div>중앙해양안전심판원 기록(2021~2025)에 이 선박의 사고 이력이 없습니다.
               사고가 없었다는 뜻이며, 같은 톤급의 통계적 사고율을 사전확률로 적용했습니다.</div></div>`}

          <h4 class="small mt-3" style="margin-bottom:6px">점수 구성</h4>
          <div class="mt-1">
            ${factors.map((f) => `
              <div class="fbar">
                <div class="fbar__name">
                  <span class="legend__swatch" style="background:${SV.factorColor(f.key)}"></span>
                  ${SV.esc(f.label)} ${(f.missing || f.unavailable)
                    ? `<span class="miss-tag">${f.missing ? '미확인' : '추정'}</span>` : ''}
                </div>
                <div class="fbar__track">
                  <div class="fbar__fill" style="width:${SV.clamp(f.score, 0, 100)}%;background:${SV.factorColor(f.key)}"></div>
                </div>
                <div class="fbar__num tnum"><b>${SV.dec(f.score, 0)}</b> × ${SV.dec(f.weight * 100, 0)}%</div>
              </div>`).join('')}
          </div>

          ${a.notes.length ? `<div class="notice notice--warn mt-2"><span class="notice__ico">⚠️</span>
            <div>${a.notes.map((n) => SV.esc(n)).join('<br>')}</div></div>` : ''}

          <h4 class="small mt-3" style="margin-bottom:6px">판정 근거 (출처 포함)</h4>
          <ul class="evi">${factors.map((f) => namedEvidence(f).map((e) =>
            `<li class="evi__item">${SV.srcBadge(e.p, e.s || e.p)}<div>${SV.esc(e.t)}${
              e.s ? `<span class="evi__src">출처: ${SV.esc(e.s)}</span>` : ''}</div></li>`).join('')).join('')}</ul>

          <div class="row mt-2 small muted">
            <span>출처</span>
            ${(v.sources || []).map((s) => `<span class="tag">${SV.esc(s)}</span>`).join('')}
          </div>
        </div>
      </div>`;
  }

  /* ================================================================ 지원사업 */

  function renderSupport() {
    SV.html('caseBtns', D.cases.map((c, i) =>
      `<button class="seg__btn" data-case="${i}" aria-pressed="${i === selectedCase}">${SV.esc(c.vessel.fishery.replace('어업', ''))}</button>`
    ).join(''));
    document.querySelectorAll('#caseBtns .seg__btn').forEach((b) => {
      b.addEventListener('click', () => {
        selectedCase = parseInt(b.dataset.case, 10);
        renderSupport();
      });
    });

    const c = D.cases[selectedCase];
    const a = c.assessment;

    SV.html('caseSummary', `
      <div class="card__head"><h3>${SV.esc(c.vessel.fishery)}</h3>
        <span class="hint">${SV.ton(c.vessel.tonnage)} · ${SV.esc(c.vessel.port)}</span></div>
      <div class="card__body">
        <div class="row between">
          <div>
            <div style="font-size:34px;font-weight:760;letter-spacing:-.03em;line-height:1">${SV.dec(a.score, 1)}</div>
            <div class="mt-1">${SV.signalPill(a.level)}</div>
          </div>
          <div class="small muted" style="text-align:right;max-width:56%">
            승선원 ${c.vessel.crew ?? '—'}명${c.vessel.foreign_crew ? ` (외국인 ${c.vessel.foreign_crew}명)` : ''}<br>
            ${SV.esc(c.vessel.hull)} · 길이 ${SV.dec(c.vessel.length, 1)}m<br>
            판정 신뢰도 ${SV.pct(a.confidence, 0)}
          </div>
        </div>
        <div class="mt-2">
          <b class="small">판정 사유</b>
          <ul class="evi mt-1">${a.top_reasons.map((r) =>
            `<li class="evi__item">${SV.srcBadge('DERIVED')}<div>${SV.esc(r)}</div></li>`).join('')}</ul>
        </div>
        ${a.notes.length ? `<div class="notice notice--warn mt-2"><span class="notice__ico">⚠️</span>
          <div>${a.notes.map((n) => SV.esc(n)).join('<br>')}</div></div>` : ''}
      </div>`);

    const msg = c.sms;
    const bytes = [...msg].reduce((s, ch) => s + (ch.codePointAt(0) > 0x7f ? 2 : 1), 0);
    SV.el('smsBody').textContent = msg;
    SV.el('smsMeta').textContent = `${bytes <= 90 ? 'SMS' : 'LMS'} · ${bytes}바이트`;
    SV.html('smsFoot', `
      <span class="tag">수신: 담당 주무관 010-****-0000</span>
      <span class="tag">상태: 발송대기 (실제 발송 안 함)</span>
      <span class="tag">재발송 억제: ${a.level === 'red' ? '1일' : '7일'}</span>
      <span class="tag">심야(22~07시) ${a.level === 'red' ? '즉시 발송' : '발송 보류'}</span>`);

    SV.el('progCount').textContent = `${c.programs.length}건`;
    SV.html('programList', c.programs.map((p) => `
      <div class="card" style="box-shadow:none;margin-bottom:10px">
        <div class="card__body" style="padding:13px 15px">
          <div class="row between">
            <b>${SV.esc(p.name)}</b>
            <span class="tag ${p.priority === 1 ? 'tag--govt' : ''}">${p.priority}순위</span>
          </div>
          <div class="small muted mt-1">${SV.esc(p.agency)} · ${SV.esc(p.kind)}</div>
          <div class="row mt-1">
            <span class="tag ${p.confirmed ? '' : 'tag--govt'}">${SV.esc(p.eligibility)}</span>
            ${p.period ? `<span class="tag">${SV.esc(p.period)}</span>` : ''}
          </div>
          <ul class="evi mt-2">${p.reasons.map((r) =>
            `<li class="evi__item">${SV.srcBadge('DERIVED')}<div>${SV.esc(r)}</div></li>`).join('')}</ul>
          ${p.unverified.length ? `<div class="notice notice--warn mt-2"><span class="notice__ico">❓</span>
            <div><b>확인 필요</b><br>${p.unverified.map(SV.esc).join('<br>')}</div></div>` : ''}
          <p class="small mt-2"><b>지원 내용</b> ${SV.esc(p.benefit)}</p>
          <p class="small mt-1"><b>신청</b> ${SV.esc(p.how_to_apply)}</p>
          ${p.caveat ? `<p class="small mt-1 muted">${SV.esc(p.caveat)}</p>` : ''}
          <p class="small mt-1 muted">출처: ${p.source_url
            ? `<a href="${SV.esc(p.source_url)}" target="_blank" rel="noopener">${SV.esc(p.source)}</a>`
            : SV.esc(p.source)}</p>
        </div>
      </div>`).join(''));

    SV.html('allPrograms', `<div class="tbl-wrap"><table>
      <thead><tr><th>사업명</th><th>주관</th><th>지원 내용</th><th>신청</th><th>출처</th></tr></thead>
      <tbody>${D.programs.map((p) => `<tr>
        <td><b>${SV.esc(p.name)}</b><div class="small muted">${SV.esc(p.kind)}${p.period ? ' · ' + SV.esc(p.period) : ''}</div></td>
        <td class="small">${SV.esc(p.agency)}</td>
        <td class="small">${SV.esc(p.benefit)}</td>
        <td class="small">${SV.esc(p.how_to_apply)}</td>
        <td class="small">${p.source_url
          ? `<a href="${SV.esc(p.source_url)}" target="_blank" rel="noopener">링크</a>` : '—'}
          <div class="muted" style="font-size:11px">${SV.esc(p.source)}</div></td>
      </tr>`).join('')}</tbody></table></div>`);
  }

  /* ================================================================ 방법론 */

  function renderMethod() {
    SV.html('sourceTable', `
      <thead><tr><th>데이터</th><th>제공기관</th><th>규모·기간</th><th>이 도구에서의 쓰임</th><th>원본·검증</th></tr></thead>
      <tbody>${D.meta.sources.map((s) => `<tr>
        <td><b>${SV.esc(s.name)}</b>
          ${s.dataset_id ? `<div class="muted" style="font-size:11px">${SV.esc(s.portal)} 데이터 ${SV.esc(s.dataset_id)}</div>` : ''}</td>
        <td class="small">${SV.esc(s.org)}</td>
        <td class="small tnum">${SV.esc(s.rows)}<div class="muted">${SV.esc(s.period)}</div></td>
        <td class="small">${SV.esc(s.use).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</td>
        <td class="small">
          <a href="${SV.esc(s.url)}" target="_blank" rel="noopener">상세 ↗</a>
          ${s.download ? ` · <a href="${SV.esc(s.download)}" target="_blank" rel="noopener">직접 내려받기 ↗</a>` : ''}
          ${s.sha256 ? `<div class="muted" style="font-size:10.5px;font-family:ui-monospace,monospace">sha256 ${SV.esc(s.sha256)}… · ${SV.num(s.bytes / 1024)}KB</div>` : ''}
          ${s.license ? `<div class="muted" style="font-size:10.5px">${SV.esc(s.license)}</div>` : ''}
        </td>
      </tr>`).join('')}</tbody>`);

    const cmp = D.meta.denominator_comparison;
    const bands = Object.keys(cmp.fleet_strength.shares);
    SV.html('denomCompare', `
      <div class="notice notice--warn" style="margin-bottom:14px">
        <span class="notice__ico">⚠️</span>
        <div>${SV.esc(cmp.note)}</div>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>톤급</th>
          <th class="num">어선세력 (${cmp.fleet_strength.year}년, ${SV.num(cmp.fleet_strength.total)}척)</th>
          <th class="num">검사현황 (${SV.num(cmp.inspection.total)}척)</th>
          <th class="num">차이</th></tr></thead>
        <tbody>${bands.map((b) => {
          const a = cmp.fleet_strength.shares[b];
          const i = cmp.inspection.shares[b];
          const d = (i - a) * 100;
          return `<tr><td><b>${SV.esc(b)}</b></td>
            <td class="num tnum">${SV.pct(a, 1)}</td>
            <td class="num tnum">${SV.pct(i, 1)}</td>
            <td class="num tnum" style="color:${Math.abs(d) > 5 ? 'var(--sig-red)' : 'var(--ink-2)'}">
              ${d >= 0 ? '+' : ''}${SV.dec(d, 1)}p</td></tr>`;
        }).join('')}</tbody></table></div>
      <p class="small muted mt-2">
        <b>결론:</b> 톤급별 사고율의 분모로는 <b>${SV.esc(cmp.fleet_strength.source)}</b>를 씁니다.
        검사현황은 업종 정보가 있는 유일한 원자료이므로 <b>업종 구성 파악</b>에만 사용합니다.
      </p>`);

    SV.html('formulaBox', `
      <div class="grid grid--2" style="gap:14px">
        <div>
          <h4 class="small">① 톤급별 실측 사고율</h4>
          <div class="sms mt-1" style="font-size:12.5px">r(톤급) = KMST 어선 사고 건수(5년) ÷ 해수부 어선세력 등록 척수</div>
          <h4 class="small mt-3">② 업종 위험지수</h4>
          <div class="sms mt-1" style="font-size:12.5px">지수(업종) = Σ[ 그 업종의 톤급 구성비 × r(톤급) ] ÷ 전체 평균 사고율</div>
          <h4 class="small mt-3">③ 최종 위험도</h4>
          <div class="sms mt-1" style="font-size:12.5px">위험도 = Σ( 팩터 점수 × 정규화 가중치 )
가중치는 합이 1이 되도록 항상 정규화됩니다.</div>
        </div>
        <div>
          <h4 class="small">신호등 경계</h4>
          <p class="small muted mt-1">
            🟢 안전 &lt; ${D.meta.defaults.thresholds.amber}점 ≤ 🟡 주의 &lt; ${D.meta.defaults.thresholds.red}점 ≤ 🔴 위험<br>
            경계값은 담당자가 시뮬레이터에서 조정할 수 있습니다.
          </p>
          <h4 class="small mt-3">결측 처리 원칙</h4>
          <p class="small muted mt-1">
            공공 안전 도구에서 가장 위험한 오답은 <b>"정보가 없어서 안전"</b>입니다.
            그래서 결측 항목이 있으면 점수에 하한(${D.meta.defaults.uncertain_floor}점 또는 주의 경계값 중 큰 값)을 적용해
            <b>'안전' 판정이 나오지 않도록</b> 구조적으로 막습니다.
            연계 데이터가 늘면 자동으로 해제됩니다.
          </p>
          <h4 class="small mt-3">기본 가중치의 성격</h4>
          <p class="small muted mt-1">${SV.esc(D.meta.defaults.weights_note)}</p>
        </div>
      </div>`);

    // ---- 인용 자료 ----
    SV.html('citationTable', `
      <thead><tr><th>인용 내용</th><th>쓰임</th><th>출처</th></tr></thead>
      <tbody>${(D.meta.citations || []).map((c) => `<tr>
        <td class="small">${SV.esc(c.claim)}</td>
        <td class="small muted">${SV.esc(c.used_for)}</td>
        <td class="small"><a href="${SV.esc(c.url)}" target="_blank" rel="noopener">원문 ↗</a>
          <div class="muted" style="font-size:11px">${SV.esc(c.org)}</div></td>
      </tr>`).join('')}</tbody>`);

    // ---- 검수 방법 ----
    const V = D.meta.verification || {};
    SV.html('verifyBox', `
      <h4 class="small" style="margin-bottom:6px">재현 절차</h4>
      <ol class="verify-steps">${(V.how_to_reproduce || []).map((s) =>
        `<li>${SV.esc(s)}</li>`).join('')}</ol>

      <h4 class="small mt-3" style="margin-bottom:6px">공표 통계와의 대조</h4>
      <p class="small muted" style="margin-bottom:8px">
        본 도구가 계산한 값과 정부가 이미 발표한 수치를 나란히 둡니다.
        다르면 왜 다른지도 적었습니다 — 차이를 감추면 검수가 불가능합니다.
      </p>
      <div class="tbl-wrap"><table>
        <thead><tr><th>항목</th><th class="num">본 도구</th><th class="num">공표치</th><th>설명</th></tr></thead>
        <tbody>${(V.cross_checks || []).map((c) => `<tr>
          <td><b>${SV.esc(c.item)}</b></td>
          <td class="num tnum">${SV.esc(c.ours)}</td>
          <td class="num tnum">${SV.esc(c.official)}<div class="muted" style="font-size:11px">${SV.esc(c.source)}</div></td>
          <td class="small muted">${SV.esc(c.note)}</td>
        </tr>`).join('')}</tbody></table></div>

      <h4 class="small mt-3" style="margin-bottom:6px">반증 가능한 주장</h4>
      <p class="small muted" style="margin-bottom:8px">
        아래 주장이 틀렸다면 원자료를 세어보는 것만으로 반박하실 수 있습니다.
      </p>
      <ul class="evi">${(V.falsifiable_claims || []).map((c) =>
        `<li class="evi__item">${SV.srcBadge('KMST', '원자료로 직접 확인 가능')}<div>${SV.esc(c)}</div></li>`).join('')}</ul>

      <h4 class="small mt-3" style="margin-bottom:6px">알려진 불일치</h4>
      <ul class="evi">${(V.known_disagreements || []).map((c) =>
        `<li class="evi__item">${SV.srcBadge('ASSUMED', '주의 사항')}<div>${SV.esc(c)}</div></li>`).join('')}</ul>`);

    // ---- 관측 품질관리 ----
    const Q = D.meta.qc || {};
    SV.html('qcBox', `
      <p class="small" style="color:var(--ink-2);margin-bottom:10px">${SV.esc(Q.note || '')}</p>
      <div class="tbl-wrap"><table>
        <thead><tr><th>항목</th><th class="num">물리적 가능 범위</th><th class="num">통상 범위</th>
          <th class="num">1회 변화 허용</th><th>비고</th></tr></thead>
        <tbody>${(Q.limits || []).map((r) => `<tr>
          <td><b>${SV.esc(r.name)}</b> <span class="muted">${SV.esc(r.unit)}</span></td>
          <td class="num tnum">${r.hard[0]} ~ ${r.hard[1]}</td>
          <td class="num tnum">${r.soft[0]} ~ ${r.soft[1]}</td>
          <td class="num tnum">${r.max_jump}</td>
          <td class="small muted">${SV.esc(r.note || '')}</td>
        </tr>`).join('')}</tbody></table></div>
      <ul class="evi mt-2">
        <li class="evi__item">${SV.srcBadge('DERIVED')}<div><b>범위 밖</b> — 물리적으로 불가능한 값은 <b>배제</b>합니다(사용 안 함).</div></li>
        <li class="evi__item">${SV.srcBadge('DERIVED')}<div><b>드문 값</b> — 태풍급처럼 드물지만 실재하는 값은 버리지 않고 <b>의심</b> 표시만 합니다.</div></li>
        <li class="evi__item">${SV.srcBadge('DERIVED')}<div><b>상호 일관성</b> — 풍속 22m/s인데 파고 0m 같은 조합은 해상 값이 아닐 가능성이 커 파고를 배제합니다.</div></li>
        <li class="evi__item">${SV.srcBadge('DERIVED')}<div><b>공간 일관성</b> — 같은 해역 지점들의 중앙값과 크게 다른 값은 의심 표시합니다.</div></li>
      </ul>`);

    SV.html('limitList', D.meta.limitations.map((l) =>
      `<li class="evi__item">${SV.srcBadge('ASSUMED', '한계 고지')}<div>${l
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div></li>`).join(''));

    SV.html('nextSteps', `
      <div class="grid grid--3" style="gap:12px">
        ${[
          { t: '어선원부 연계', d: '건조년도·소유자·검사 이력. 선령 팩터가 추정에서 실측으로 바뀝니다.', who: '해양수산부 / KOMSA' },
          { t: '출입항 신고 연계', d: '승선 인원·출항 여부. 1인 조업 판정이 실측이 됩니다.', who: '해양경찰청' },
          { t: 'V-Pass 위치 연계', d: '실제 조업 위치. 공개 API가 없어 업무협약이 전제입니다.', who: '어선안전조업본부' },
          { t: '기상청 서비스 키', d: '단기예보·해양기상 실시간 연동. 개발계정은 자동승인·1만건/일입니다.', who: '공공데이터포털 신청' },
          { t: 'MTIS 인증키', d: 'KOMSA 해양교통안전정보 연계. 회원가입 후 개발키 무승인 발급.', who: 'mtisopenapi.komsa.or.kr' },
          { t: '기관 SMS 게이트웨이', d: '담당자 알림 실제 발송. 현재는 대기열·CSV 내보내기까지만 동작합니다.', who: '기관 행정망' },
        ].map((s) => `
          <div class="card" style="box-shadow:none">
            <div class="card__body" style="padding:13px 15px">
              <b>${SV.esc(s.t)}</b>
              <p class="small muted mt-1">${SV.esc(s.d)}</p>
              <span class="tag mt-1" style="display:inline-block">${SV.esc(s.who)}</span>
            </div>
          </div>`).join('')}
      </div>`);
  }

  /* ================================================================ 탭 */

  /**
   * 선박 판정 탭의 보기 모드를 바꾼다.
   *
   * ⚠️ 예전에는 `hidden` 해제 코드가 **모드 버튼 클릭 핸들러 안에만** 있었다.
   *    그래서 종합 현황에서 위험 상위 행을 눌러 `switchTab('vessel')` 로 오면,
   *    선박군 상세가 **숨겨진 div 안에 그려지고** 화면에는 무관한 실명 목록이 떴다.
   *    첫 화면의 유일한 드릴다운 경로가 조용히 죽어 있었다.
   */
  function setVesselMode(mode) {
    vesselMode = mode;
    document.querySelectorAll('#vesselMode .seg__btn').forEach((x) =>
      x.setAttribute('aria-pressed', String(x.dataset.vmode === mode)));
    const named = SV.el('namedWrap');
    const cell = SV.el('cellWrap');
    if (named) named.hidden = mode !== 'named';
    if (cell) cell.hidden = mode !== 'cell';
    updateVesselModeDesc();
  }

  /* ======================================================= 점검계획 (§4) */

  //: 엔진이 돌려주는 방법 설명의 키를 화면 용어로 옮긴다.
  //  영문 키(severity/routing…)를 그대로 보여주면 담당자가 읽을 수 없다.
  const METHOD_LABEL = {
    urgency: '긴급도 구분', routing: '동선 계산', travel: '이동 시간',
    capacity: '하루 용량', interval: '정기 주기',
    severity: '심각도 판정', response: '구조 도착', facilities: '의료기관 선택',
    limits: '한계',
  };

  /** 엔진 설명문의 **강조** 를 굵게 렌더한다 (이스케이프 후에 적용). */
  function mdBold(text) {
    return SV.esc(text || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  }

  function methodTable(m) {
    return `<div class="deftable">${Object.entries(m || {}).map(([k, v]) => `
      <div class="deftable__row">
        <div class="deftable__k">${SV.esc(METHOD_LABEL[k] || k)}</div>
        <div class="deftable__v">${mdBold(v)}</div>
      </div>`).join('')}</div>`;
  }


  const URGENCY_TONE = {
    'Level 1': 'red', 'Level 2': 'amber', 'Level 3': 'green', '정기': 'green',
  };

  function renderInspection() {
    const P = D.inspection;
    if (!P || !P.summary) {
      SV.html('inspStats', '<div class="notice">점검계획 데이터가 없습니다.</div>');
      return;
    }
    const s = P.summary;

    SV.el('inspBaseNote').innerHTML = mdBold(P.base_note);

    SV.html('inspStats', [
      `<div class="stat">
        <div class="stat__label">점검 대상 ${SV.srcBadge('DERIVED', '실명 선박 판정에서 특별점검 조건에 걸린 배')}</div>
        <div class="stat__value tnum">${SV.num(s.total_targets)}<span class="stat__unit">척</span></div>
        <div class="stat__foot">긴급도 Level 1~3</div>
      </div>`,
      `<div class="stat stat--amber">
        <div class="stat__label">오늘 배정</div>
        <div class="stat__value tnum">${SV.num(s.scheduled)}<span class="stat__unit">척</span></div>
        <div class="stat__foot">거점 ${s.officers}곳 · 총 이동 ${SV.dec(s.total_travel_km, 0)}km</div>
      </div>`,
      `<div class="stat stat--red">
        <div class="stat__label">이월</div>
        <div class="stat__value tnum">${SV.num(s.deferred)}<span class="stat__unit">척</span></div>
        <div class="stat__foot">하루 가용 시간을 넘겨 다음 날로</div>
      </div>`,
      `<div class="stat">
        <div class="stat__label">평균 가동률</div>
        <div class="stat__value tnum">${SV.pct(s.mean_utilization, 0)}</div>
        <div class="stat__foot">1인 1일 ${(P.bases[0] && P.bases[0].daily_minutes) || 480}분 기준</div>
      </div>`,
    ].join(''));

    SV.html('inspOfficerBtns', P.day_plans.map((p, i) =>
      `<button class="seg__btn" data-insp="${i}" aria-pressed="${i === inspOfficer}">
         ${SV.esc(p.officer)} <span class="tnum">${p.stop_count}</span>
       </button>`).join(''));
    document.querySelectorAll('#inspOfficerBtns .seg__btn').forEach((b) => {
      b.addEventListener('click', () => { inspOfficer = +b.dataset.insp; renderInspection(); });
    });

    renderInspectionRoute(P.day_plans[inspOfficer]);
    renderInspectionUrgency(P);
    renderInspectionCapacity(P);
    renderInspectionMethod(P);
  }

  function renderInspectionRoute(plan) {
    if (!plan) { SV.html('inspRoute', '<p class="muted">거점을 선택하십시오.</p>'); return; }
    SV.el('inspRouteMeta').textContent =
      `${plan.stop_count}곳 · 이동 ${SV.dec(plan.travel_km, 1)}km · 가동 ${SV.pct(plan.utilization, 0)}`;

    if (!plan.stops.length) {
      SV.html('inspRoute',
        `<p class="muted">이 거점에는 오늘 배정된 대상이 없습니다.
         (근처에 특별점검 조건에 걸린 배가 없거나, 다른 거점이 더 가깝습니다.)</p>`);
    } else {
      SV.html('inspRoute', `
        <div class="tbl-wrap"><table>
          <thead><tr>
            <th style="width:58px">순서</th><th style="width:64px">도착</th>
            <th>선박</th><th style="width:92px">긴급도</th>
            <th class="num" style="width:64px">위험도</th><th>사유</th>
          </tr></thead>
          <tbody>${plan.stops.map((st) => `
            <tr>
              <td class="tnum">${st.visit_order}</td>
              <td class="tnum">${SV.esc((st.eta || '').slice(11, 16))}</td>
              <td><b>${SV.esc(st.label)}</b><div class="small muted">${SV.esc(st.fishery)} · ${SV.esc(st.port)}</div></td>
              <td><span class="signal signal--${URGENCY_TONE[st.urgency] || 'green'}"><i class="signal__lamp"></i>${SV.esc(st.urgency_label)}</span></td>
              <td class="num tnum">${SV.dec(st.risk_score, 1)}</td>
              <td class="small">${(st.trigger_labels || []).map((t) => `<span class="tag">${SV.esc(t)}</span>`).join(' ')}
                  <div class="small muted">${(st.reasons || []).slice(0, 2).map(SV.esc).join(' · ')}</div></td>
            </tr>`).join('')}</tbody>
        </table></div>
        <p class="small muted mt-1">
          거점 <b>${SV.esc(plan.base)}</b> 출발 · 이동 시간은 직선거리×1.4 ÷ 45km/h 근사입니다.
          정밀 경로 API 연계 시 실도로 거리로 대체됩니다.
        </p>`);
    }

    const dfr = plan.deferred || [];
    SV.el('inspDeferMeta').textContent = `${dfr.length}척`;
    SV.html('inspDeferred', dfr.length
      ? `<ul class="evi">${dfr.slice(0, 12).map((d) => `
          <li><b>${SV.esc(d.label)}</b>
            <span class="signal signal--${URGENCY_TONE[d.urgency] || 'green'}"><i class="signal__lamp"></i>${SV.esc(d.urgency_label)}</span>
            <div class="small muted">${SV.esc(d.port)} · 위험도 ${SV.dec(d.risk_score, 1)}</div></li>`).join('')}
         </ul>${dfr.length > 12 ? `<p class="small muted">외 ${dfr.length - 12}척</p>` : ''}
         <p class="small muted mt-1">이월 대상은 <b>버려지지 않습니다.</b> 다음 날 계획의 앞에 놓입니다.</p>`
      : '<p class="muted">이월 대상이 없습니다.</p>');
  }

  function renderInspectionUrgency(P) {
    const by = P.summary.by_urgency || {};
    const desc = {
      'Level 1': '즉시 점검 — 설비 결함·사고 직결 신호',
      'Level 2': '24시간 내 — 위험 등급 또는 악천후 노출',
      'Level 3': '1주일 내 — 주의 등급·사고 다발 해역',
      '정기': '주기 도래 — 위험등급별 기본 주기',
    };
    SV.html('inspUrgency', `
      <div class="grid" style="gap:8px">
        ${Object.keys(desc).map((k) => `
          <div class="lamp lamp--${URGENCY_TONE[k]} ${(by[k] || 0) > 0 ? 'is-on' : ''}">
            <span class="lamp__bulb" aria-hidden="true"></span>
            <span><b>${SV.esc(k)}</b> — ${SV.esc(desc[k])}</span>
            <span style="margin-left:auto" class="tnum small">${SV.num(by[k] || 0)}척</span>
          </div>`).join('')}
      </div>`);
  }

  function renderInspectionCapacity(P) {
    const curve = P.capacity_curve || [];
    if (!curve.length) { SV.html('inspCapacity', '<p class="muted">산출되지 않았습니다.</p>'); return; }
    const max = Math.max(...curve.map((c) => c.scheduled + c.deferred)) || 1;
    const cur = (P.summary && P.summary.officers) || 0;

    SV.html('inspCapacity', `
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th style="width:80px">감독관</th><th>소화 비율</th>
          <th class="num" style="width:72px">배정</th><th class="num" style="width:72px">이월</th>
          <th class="num" style="width:88px">평균 가동</th><th class="num" style="width:88px">총 이동</th>
        </tr></thead>
        <tbody>${curve.map((c) => {
          const w = Math.round(c.scheduled / max * 100);
          const here = c.officers === cur;
          return `<tr${here ? ' class="rank--top"' : ''}>
            <td class="tnum"><b>${c.officers}명</b>${here ? ' <span class="tag">현재</span>' : ''}</td>
            <td>
              <div class="minibar" title="배정 ${c.scheduled} / 전체 ${c.scheduled + c.deferred}">
                <div class="minibar__fill" style="width:${w}%"></div>
              </div>
              <span class="small muted tnum">${SV.pct(c.coverage, 1)}</span>
            </td>
            <td class="num tnum">${SV.num(c.scheduled)}</td>
            <td class="num tnum">${SV.num(c.deferred)}</td>
            <td class="num tnum">${SV.pct(c.utilization, 0)}</td>
            <td class="num tnum">${SV.dec(c.travel_km, 0)}km</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <p class="small muted mt-1">${SV.esc(P.capacity_note || '')
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>`);
  }

  function renderInspectionMethod(P) {
    const m = P.method || {};
    const site = P.sites || {};
    SV.html('inspMethod', `
      ${methodTable(m)}
      <div class="notice mt-2">
        <span class="notice__ico" aria-hidden="true">📍</span>
        <div>
          <b>거점·구조 자원 위치는 실제 공개 명부입니다.</b><br>
          해양경찰 관서 ${SV.num((site.coast_guard || {}).total || 0)}개소
          (${Object.entries((site.coast_guard || {}).by_kind || {}).map(([k, v]) => `${k} ${v}`).join(' · ')}) ·
          국가어항 ${SV.num((site.fishing_ports || {}).total || 0)}개소.<br>
          <span class="small muted">${SV.esc(site.note || '')}</span>
        </div>
      </div>`);
  }

  /* ======================================================= 긴급대응 (§5) */

  function renderEmergency() {
    const E = D.emergency;
    if (!E || !E.cases || !E.cases.length) {
      SV.html('emSummary', '<div class="card__body"><p class="muted">긴급대응 데이터가 없습니다.</p></div>');
      return;
    }
    SV.html('emCaseBtns', E.cases.map((c, i) => {
      const o = c.origin || {};
      return `<button class="seg__btn" data-em="${i}" aria-pressed="${i === emCase}"
                title="${SV.esc(o.vessel || '')} · ${SV.esc(o.year || '')}년">
                ${SV.esc(o.kind || c.incident)}</button>`;
    }).join(''));
    document.querySelectorAll('#emCaseBtns .seg__btn').forEach((b) => {
      b.addEventListener('click', () => { emCase = +b.dataset.em; renderEmergency(); });
    });

    const c = E.cases[emCase];
    const o = c.origin || {};
    const sevTone = c.severity <= 2 ? 'red' : (c.severity === 3 ? 'amber' : 'green');
    const facs = c.facilities || [];

    SV.html('emSummary', `
      <div class="card__head">
        <h3>${SV.esc(o.vessel || '선박명 미상')} · ${SV.esc(o.kind || '')}</h3>
        <span class="hint">${SV.esc(o.year || '')}년 ${o.month ? SV.esc(o.month) + '월' : ''} · ${SV.esc(o.sea || '')}</span>
      </div>
      <div class="card__body">
        <div class="bigscore">
          <div>
            <div class="bigscore__v tnum" style="color:var(--sig-${sevTone})">${c.severity}<span class="bigscore__u">등급</span></div>
            <div class="small muted">${SV.esc(c.severity_label)}</div>
          </div>
          <div class="grow">
            <div class="kv"><span>사망·실종</span><b class="tnum">${SV.num(o.casualties)}명</b></div>
            <div class="kv"><span>부상</span><b class="tnum">${SV.num(o.injured)}명</b></div>
            <div class="kv"><span>목표 접촉</span><b class="tnum">${c.target_minutes > 0 ? c.target_minutes + '분 이내' : '즉시'}</b></div>
            <div class="kv"><span>생존 추정</span><b class="tnum">${c.golden_minutes == null ? '—' : c.golden_minutes + '분'}</b></div>
          </div>
        </div>
        <div class="mt-2 small">
          ${(c.severity_reasons || []).map((r) => `<div>· ${SV.esc(r)}</div>`).join('')}
        </div>
        <p class="small muted mt-2">
          출처: ${SV.esc(o.source || '')} · 좌표 ${SV.dec(c.lat, 3)}, ${SV.dec(c.lon, 3)}
        </p>
      </div>`);

    // 구조 도착
    SV.html('emResponse', (c.response && c.response.length) ? `
      <div class="tbl-wrap"><table>
        <thead><tr><th>수단</th><th class="num">준비</th><th class="num">출동</th>
          <th class="num">합계</th><th>비고</th></tr></thead>
        <tbody>${c.response.map((t) => `
          <tr class="${t.feasible ? '' : 'is-dim'}">
            <td><b>${SV.esc(t.mode)}</b>${t.feasible ? '' : ' <span class="tag">제약</span>'}</td>
            <td class="num tnum">${t.prep_min}분</td>
            <td class="num tnum">${t.launch_min}분<div class="small muted">${SV.dec(t.launch_km, 1)}km</div></td>
            <td class="num tnum"><b>${t.total_min}분</b></td>
            <td class="small">${(t.caveats || []).map(SV.esc).join('<br>') || '—'}</td>
          </tr>`).join('')}</tbody>
      </table></div>
      <p class="small muted mt-1">
        출동 거점 <b>${SV.esc((c.response[0] || {}).launch_from || '—')}</b> 기준.
        구조정은 병원이 아니라 <b>해양경찰 관서</b>에서 출발합니다.
      </p>` : '<p class="muted">구조 거점을 찾지 못했습니다.</p>');

    // 의료 이송
    const hasFac = c.transport && c.transport.length;
    SV.el('emTransportMeta').textContent = hasFac
      ? `사고 지점 → ${SV.esc((facs[0] || {}).name || '의료기관')}`
      : '의료기관 명부 미연계';
    SV.html('emTransport', hasFac ? `
      <div class="tbl-wrap"><table>
        <thead><tr><th>수단</th><th class="num">거리</th><th class="num">합계</th><th>비고</th></tr></thead>
        <tbody>${c.transport.map((t) => `
          <tr class="${t.feasible ? '' : 'is-dim'}">
            <td><b>${SV.esc(t.mode)}</b></td>
            <td class="num tnum">${SV.dec(t.distance_km, 1)}km</td>
            <td class="num tnum"><b>${t.total_min}분</b></td>
            <td class="small">${(t.caveats || []).map(SV.esc).join('<br>') || '—'}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : `
      <div class="notice notice--warn">
        <span class="notice__ico" aria-hidden="true">🏥</span>
        <div>
          <b>응급의료기관 좌표가 아직 연계되지 않았습니다.</b><br>
          국립중앙의료원 전국 응급의료기관 조회 서비스(공공데이터포털 15000563) 활용신청이
          승인되면 거리 기반 이송 추천이 켜집니다. <b>지어낸 병원을 넣지 않습니다.</b>
        </div>
      </div>`);

    // 필요 자원
    SV.html('emResources', `
      <div class="crit__factors">${(c.resources || []).map((r) => `
        <span class="tag">${SV.esc(typeof r === 'string' ? r : (r.kind || r.label || ''))}
        ${typeof r === 'object' && r.reason ? `<i title="${SV.esc(r.reason)}">ⓘ</i>` : ''}</span>`).join('')}</div>
      <p class="small muted mt-1">사고 유형 × 심각도 매트릭스(계획서 §5)로 결정됩니다.</p>`);

    // 이송 대상 의료기관 — '가까운 순'이 아니라 '감당 가능한 곳 중 가까운 순'
    SV.el('emFacMeta').textContent = facs.length
      ? `${facs.length}곳 · 실효거리순` : '명부 미연계';
    SV.html('emFacilities', facs.length ? `
      <ol class="evi">${facs.map((f, i) => `
        <li>
          <b>${SV.esc(f.name)}</b>
          <span class="tag${f.tier <= 2 ? ' tag--govt' : ''}">${SV.esc(f.kind || '등급 미상')}</span>
          ${f.suitable ? '' : '<span class="tag">역량 부족</span>'}
          <div class="small muted">
            직선 ${SV.dec(f.distance_km, 1)}km (${SV.dec(f.distance_nm, 1)}해리)
            ${f.effective_km !== f.distance_km
              ? ` · 실효 ${SV.dec(f.effective_km, 1)}km` : ''}
            ${f.phone ? ' · ' + SV.esc(f.phone) : ''}
          </div>
          ${f.address ? `<div class="small muted">${SV.esc(f.address)}</div>` : ''}
        </li>`).join('')}</ol>
      <p class="small muted mt-1">
        <b>실효거리</b> = 직선거리 + (등급 낮을수록 가산). 중증일수록 가산이 커져
        <b>가까운 지역기관보다 먼 권역센터</b>가 앞에 옵니다.<br>
        출처: 국립중앙의료원 전국 응급의료기관(공공데이터포털 15000563).
      </p>` : `
      <div class="notice notice--warn">
        <span class="notice__ico" aria-hidden="true">🏥</span>
        <div><b>응급의료기관 명부가 연계되지 않았습니다.</b> 지어낸 병원을 넣지 않습니다.</div>
      </div>`);

    // 최근접 구조 거점
    SV.html('emRescue', (c.rescue && c.rescue.length) ? `
      <ul class="evi">${c.rescue.map((r) => `
        <li><b>${SV.esc(r.name)}</b> <span class="tag">${SV.esc(r.kind)}</span>
          <div class="small muted">${SV.dec(r.distance_km, 1)}km (${SV.dec(r.distance_nm, 1)}해리)
          ${r.parent ? ' · ' + SV.esc(r.parent) : ''}</div></li>`).join('')}</ul>
      <p class="small muted mt-1">출처: 해양경찰청 관서 위치 · 파출소 관할 위치(공공데이터포털).
        관서별 보유 장비는 공개 데이터가 아닙니다.</p>`
      : '<p class="muted">근처 관서를 찾지 못했습니다.</p>');

    // 방법·한계
    const m = E.method || {};
    SV.html('emMethod', `
      ${methodTable(m)}
      <div class="notice notice--warn mt-2">
        <span class="notice__ico" aria-hidden="true">⚠️</span>
        <div>${(c.notes || []).map((n) => `<div>· ${SV.esc(n)}</div>`).join('')}</div>
      </div>`);
  }

  const RENDERED = new Set();

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((t) =>
      t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    document.querySelectorAll('.panel').forEach((p) =>
      p.hidden = (p.id !== `panel-${name}`));

    if (!RENDERED.has(name)) {
      RENDERED.add(name);
      try {
        if (name === 'simulator') { renderSimulatorControls(); renderSimulator(); }
        if (name === 'fishery') { renderFisheryControls(); renderFisheryTable(); renderGovtCompare(); }
        if (name === 'map') { renderMapControls(); renderMap(); renderMapCharts(); }
        if (name === 'vessel') { renderVesselControls(); renderVesselPanel(); renderNamedControls(); renderNamedList(); }
        if (name === 'inspection') renderInspection();
        if (name === 'emergency') renderEmergency();
        if (name === 'support') renderSupport();
        if (name === 'method') renderMethod();
      } catch (err) {
        RENDERED.delete(name);
        console.error(err);
        const panel = document.getElementById(`panel-${name}`);
        if (panel) {
          panel.insertAdjacentHTML('afterbegin',
            `<div class="notice notice--warn"><span class="notice__ico">⚠️</span>
             <div><b>화면을 그리는 중 오류가 발생했습니다.</b><br>${SV.esc(err.message)}</div></div>`);
        }
      }
    }
    if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  /* ================================================================ 테마 */

  function initTheme() {
    const saved = (() => { try { return localStorage.getItem('sv-theme'); } catch { return null; } })();
    const theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    SV.el('themeIco').textContent = theme === 'dark' ? '☀️' : '🌙';

    SV.el('themeBtn').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      SV.el('themeIco').textContent = next === 'dark' ? '☀️' : '🌙';
      try { localStorage.setItem('sv-theme', next); } catch { /* 사생활 보호 모드 */ }
      // 차트는 CSS 변수 색을 읽어 그리므로 다시 그려야 한다
      RENDERED.clear();
      const active = document.querySelector('.tab[aria-selected="true"]').dataset.tab;
      renderOverview();
      RENDERED.add('overview');
      switchTab(active);
    });
  }

  /* ================================================================ 시작 */

  async function boot() {
    SV.tipInit();
    initTheme();

    try {
      await loadAll();
    } catch (err) {
      console.error(err);
      SV.el('loader').innerHTML =
        `<div class="notice notice--warn" style="max-width:640px">
          <span class="notice__ico">⚠️</span>
          <div><b>데이터를 불러오지 못했습니다.</b><br>${SV.esc(err.message)}
          <br><span class="small muted">로컬에서 열었다면 <code>python3 -m http.server</code> 로 서버를 띄워 주십시오.
          브라우저가 <code>file://</code> 에서는 fetch 를 막습니다.</span></div></div>`;
      return;
    }

    SV.el('loader').remove();
    SV.el('chipDataText').textContent =
      `데이터 ${D.meta.totals.accident_years[0]}~${D.meta.totals.accident_years[1]} · 생성 ${SV.fmtDateTime(D.meta.generated_at)}`;
    SV.el('footMeta').innerHTML =
      `데이터 생성 ${SV.fmtDateTime(D.meta.generated_at)} · 엔진 v${SV.esc(D.meta.engine_version)} · `
      + `사고 원자료 ${SV.num(D.meta.totals.accident_rows)}행(어선 ${SV.num(D.meta.totals.accident_fishing_rows)}행) · `
      + `등록 어선 ${SV.num(D.meta.totals.registry_vessels)}척 · 선박군 ${SV.num(D.meta.totals.cells)}조합`;

    document.querySelectorAll('.tab').forEach((t) =>
      t.addEventListener('click', () => switchTab(t.dataset.tab)));
    document.querySelectorAll('[data-goto]').forEach((a) =>
      a.addEventListener('click', (e) => { e.preventDefault(); switchTab(a.dataset.goto); }));

    renderOverview();
    RENDERED.add('overview');

    const initial = (location.hash || '#overview').slice(1);
    switchTab(document.querySelector(`.tab[data-tab="${initial}"]`) ? initial : 'overview');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
