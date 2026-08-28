/* =========================================================
   다시올때 — 랜딩 인터랙션
   의존성 0. prefers-reduced-motion 이면 모든 모션을 끈다.
   프리셋 데이터 출처: Sources/Core/Presets.swift (45종, 훼손 금지)
   ========================================================= */
(() => {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- 그룹 메타(라벨 + 인라인 SVG 아이콘) ---------- */
  const GROUPS = [
    ["hair",      "헤어",         `<path d="M12 3c-4 3-5 7-5 10a5 5 0 0 0 10 0c0-3-1-7-5-10z"/><path d="M9 13c0 2 1 4 3 4M15 13c0 2-1 4-3 4"/>`],
    ["nail",      "네일",         `<path d="M8 21h8M9 21V9a3 3 0 0 1 6 0v12"/><path d="M9 9c0-2 1.4-4 3-4s3 2 3 4"/>`],
    ["brow",      "속눈썹·눈썹",   `<path d="M2 13c3-4 7-6 10-6s7 2 10 6"/><path d="M6 12v3M10 11v4M14 11v4M18 12v3"/>`],
    ["waxing",    "왁싱·제모",     `<path d="M5 19l9-9M14 4l4 4-8 8-4 1 1-4z"/>`],
    ["skin",      "피부 시술",     `<path d="M4 12h4M16 12h4M12 4v4M12 16v4"/><circle cx="12" cy="12" r="3.2"/>`],
    ["injection", "주사 시술",     `<path d="M4 20l5-5M8 8l8 8M14 6l4 4M9.5 9.5l1.5 1.5M12 7l5 5"/>`],
    ["care",      "관리",         `<path d="M12 20s-7-4.5-7-9a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 4.5-7 9-7 9z"/>`],
    ["etc",       "기타",         `<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="2.4"/>`],
  ];
  const GROUP_LABEL = Object.fromEntries(GROUPS.map(g => [g[0], g[1]]));
  const GROUP_ICON  = Object.fromEntries(GROUPS.map(g => [g[0], g[2]]));

  /* ---------- 프리셋 45종 (Presets.swift 1:1) ---------- */
  // [title, category, group, cycleText, seriesNote?]
  const PRESETS = [
    ["펌", "beauty", "hair", "3~6개월"],
    ["전체 염색", "beauty", "hair", "2~3개월"],
    ["뿌리 염색·새치 커버", "beauty", "hair", "4~6주"],
    ["커트·트리밍", "beauty", "hair", "4~8주"],
    ["헤어 클리닉·트리트먼트", "beauty", "hair", "2~4주"],
    ["두피 스케일링", "beauty", "hair", "2~4주"],

    ["젤네일", "beauty", "nail", "3~4주"],
    ["네일 케어(큐티클)", "beauty", "nail", "2~3주"],
    ["패디큐어", "beauty", "nail", "4~6주"],
    ["젤 제거 후 휴식기", "beauty", "nail", "2~3개월", "제거 후 1~2주 쉬어주면 손톱이 회복돼요"],

    ["속눈썹 연장(리터치)", "beauty", "brow", "3~4주"],
    ["속눈썹 펌", "beauty", "brow", "4~8주"],
    ["눈썹 왁싱·정리", "beauty", "brow", "2~4주"],
    ["눈썹 반영구(리터치)", "medical", "brow", "1~2년", "첫 리터치는 4~8주 뒤에 받아요"],
    ["아이라인 반영구", "medical", "brow", "1~3년"],

    ["브라질리언 왁싱", "beauty", "waxing", "4~6주"],
    ["다리·팔 왁싱", "beauty", "waxing", "4~6주"],
    ["겨드랑이 왁싱", "beauty", "waxing", "3~4주"],
    ["페이스 왁싱", "beauty", "waxing", "2~4주"],
    ["레이저 제모", "medical", "waxing", "4~8주", "5~10회 받은 뒤에는 6~12개월마다 유지관리해요"],

    ["슈링크·리프테라", "medical", "skin", "3~6개월"],
    ["울쎄라", "medical", "skin", "12~18개월"],
    ["인모드", "medical", "skin", "3~4주", "3~6회 받은 뒤에는 3~6개월마다 유지해요"],
    ["레이저토닝", "medical", "skin", "2~4주", "보통 5~10회 반복해요"],
    ["IPL(색소·홍조)", "medical", "skin", "3~4주", "보통 3~5회 반복해요"],
    ["프락셀·피코프락셀", "medical", "skin", "4주", "보통 3~5회 반복해요"],
    ["아쿠아필·물광필링", "medical", "skin", "2~4주"],
    ["필링(화학적)", "medical", "skin", "2~4주"],
    ["LDM·재생관리", "medical", "skin", "1~2주"],

    ["보톡스(주름)", "medical", "injection", "3~4개월"],
    ["보톡스(사각턱)", "medical", "injection", "4~6개월"],
    ["보톡스(승모근·바디)", "medical", "injection", "4~6개월"],
    ["턱 필러", "medical", "injection", "12~18개월"],
    ["입술 필러", "medical", "injection", "6~12개월"],
    ["팔자·볼 필러", "medical", "injection", "12~18개월"],
    ["스킨부스터(리쥬란·쥬베룩)", "medical", "injection", "3~6개월", "처음엔 2~4주 간격으로 3~4회 받아요"],
    ["물광주사", "medical", "injection", "1~3개월"],
    ["지방분해주사", "medical", "injection", "1~2주", "보통 3~5회 반복해요"],

    ["페이셜 관리", "beauty", "care", "2~4주"],
    ["등·바디 관리", "beauty", "care", "2~4주"],
    ["마사지·경락", "beauty", "care", "2~4주"],

    ["치아 스케일링", "medical", "etc", "6개월", "건강보험은 연 1회 적용돼요"],
    ["치아 미백(터치업)", "medical", "etc", "6~12개월"],
    ["립 반영구(리터치)", "medical", "etc", "1~2년"],
    ["태닝", "beauty", "etc", "1~2주"],
  ].map(([title, category, group, cycleText, seriesNote]) =>
    ({ title, category, group, cycleText, seriesNote: seriesNote || null }));

  const svgIcon = (group) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GROUP_ICON[group]}</svg>`;

  /* ================= 라이브러리 렌더 + 필터 ================= */
  const grid = $("#presetGrid");
  const filterBar = $(".lib__filter");
  let activeGroup = "all";

  function renderFilter() {
    const counts = {};
    PRESETS.forEach(p => { counts[p.group] = (counts[p.group] || 0) + 1; });
    const chips = [["all", "전체", PRESETS.length]]
      .concat(GROUPS.map(g => [g[0], g[1], counts[g[0]] || 0]));
    filterBar.innerHTML = chips.map(([key, label, n]) =>
      `<button type="button" class="fchip" data-group="${key}" aria-pressed="${key === "all"}">
        ${label}<span class="fchip__count">${n}</span>
      </button>`).join("");
    $$(".fchip", filterBar).forEach(btn => {
      btn.addEventListener("click", () => {
        activeGroup = btn.dataset.group;
        $$(".fchip", filterBar).forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
        renderGrid();
      });
    });
  }

  function renderGrid() {
    const items = PRESETS.filter(p => activeGroup === "all" || p.group === activeGroup);
    grid.innerHTML = items.map((p, i) => {
      const isMed = p.category === "medical";
      const tag = isMed
        ? `<span class="preset__tag preset__tag--medical">의료</span>`
        : `<span class="preset__tag preset__tag--beauty">뷰티</span>`;
      const note = p.seriesNote ? `<p class="preset__note">${p.seriesNote}</p>` : "";
      const delay = reduce ? 0 : Math.min(i, 12) * 0.035;
      return `<article class="preset" style="animation-delay:${delay}s">
        <div class="preset__top">
          <span class="preset__ic">${svgIcon(p.group)}</span>
          ${tag}
        </div>
        <h3 class="preset__title">${p.title}</h3>
        <p class="preset__cycle">주기 <strong>${p.cycleText}</strong></p>
        ${note}
      </article>`;
    }).join("");
  }

  if (grid && filterBar) { renderFilter(); renderGrid(); }

  /* ================= 스크롤 리빌 ================= */
  const revealEls = $$("[data-reveal]");
  if (reduce || !("IntersectionObserver" in window)) {
    revealEls.forEach(el => el.classList.add("is-in"));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const el = e.target;
          const sibs = Array.from(el.parentElement ? el.parentElement.children : [el])
            .filter(n => n.hasAttribute && n.hasAttribute("data-reveal"));
          const idx = Math.max(0, sibs.indexOf(el));
          el.style.transitionDelay = (idx % 6) * 0.07 + "s";
          el.classList.add("is-in");
          io.unobserve(el);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach(el => io.observe(el));
  }

  /* ================= 카운트업 ================= */
  function countUp(el) {
    const to = parseFloat(el.dataset.to || "0");
    const prefix = el.dataset.prefix || "";
    if (reduce) { el.textContent = prefix + to; return; }
    const dur = 1300, start = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = prefix + Math.round(to * ease(t));
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = prefix + to;
    }
    requestAnimationFrame(tick);
  }
  const countEls = $$("[data-countup]");
  if (reduce || !("IntersectionObserver" in window)) {
    countEls.forEach(el => { el.textContent = (el.dataset.prefix || "") + (el.dataset.to || "0"); });
  } else {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { countUp(e.target); cio.unobserve(e.target); } });
    }, { threshold: 0.6 });
    countEls.forEach(el => cio.observe(el));
  }

  /* ================= D-day 링 draw-on ================= */
  const C = 2 * Math.PI * 92; // ≈ 578
  function drawRing(fillEl, progress, animate = true) {
    const offset = C * (1 - progress);
    if (!animate || reduce) {
      fillEl.style.transition = "none";
      fillEl.style.strokeDashoffset = offset;
      return;
    }
    fillEl.style.strokeDashoffset = C;
    // 다음 프레임에 목표로 전환 → 트랜지션 발생
    requestAnimationFrame(() => {
      fillEl.style.transition = "stroke-dashoffset 1.15s cubic-bezier(.22,.61,.20,1)";
      fillEl.style.strokeDashoffset = offset;
    });
  }
  /* 히어로 링: 보톡스(주름) 105일 주기의 65%가 지난 상태를 예시로 보여준다.
     ⚠️ D-day 와 날짜를 하드코딩하면 ①서로 어긋나고("D-64"인데 10월 12일)
        ②그 날짜가 지나면 영영 과거가 된다. 데모 카드와 **같은 식**으로 오늘 기준 계산한다. */
  const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
  const ELAPSED = 0.65;
  const HERO_CYCLE_DAYS = 105;   // 보톡스(주름) — Presets.swift 와 동일

  function daysFromNow(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return d;
  }
  function koDate(d) {
    return `${d.getMonth() + 1}월 ${d.getDate()}일 · ${WEEK[d.getDay()]}요일`;
  }

  const heroRemain = Math.max(1, Math.ceil(HERO_CYCLE_DAYS * (1 - ELAPSED)));
  const heroDday = $("[data-hero-dday]");
  const heroDate = $("[data-hero-date]");
  if (heroDday) heroDday.textContent = "D-" + heroRemain;
  if (heroDate) heroDate.textContent = koDate(daysFromNow(heroRemain));

  const heroRing = $("[data-ring] .ring__fill");
  if (heroRing) {
    if (reduce || !("IntersectionObserver" in window)) drawRing(heroRing, 0.65, false);
    else {
      const hio = new IntersectionObserver((es) => {
        es.forEach(e => { if (e.isIntersecting) { drawRing(heroRing, 0.65, true); hio.unobserve(e.target); } });
      }, { threshold: 0.4 });
      hio.observe($("[data-ring]"));
    }
  }

  /* ================= 데모: 주기 골라 계산 ================= */
  // WEEK / ELAPSED / daysFromNow / koDate 는 히어로와 공유한다(같은 규칙, 한 곳에서).
  const demoRing = $("[data-demo-ring] .ring__fill--demo");
  const demoDday = $("[data-demo-dday]");
  const demoDate = $("[data-demo-date]");
  const demoChip = $("[data-demo-chip]");
  const demoCycle = $("[data-demo-cycle]");

  function updateDemo(btn, animate = true) {
    const days = parseInt(btn.dataset.days, 10);
    const remain = Math.max(1, Math.ceil(days * (1 - ELAPSED)));
    const dateStr = koDate(daysFromNow(remain));

    if (demoDate) demoDate.textContent = dateStr;
    if (demoChip) {
      demoChip.textContent = btn.dataset.title;
      demoChip.classList.toggle("chip--medical", btn.dataset.cat === "medical");
    }
    if (demoCycle) demoCycle.textContent = "주기 " + btn.dataset.cycle;

    // D-day 카운트업
    if (demoDday) {
      if (reduce || !animate) demoDday.textContent = "D-" + remain;
      else {
        const from = 0, dur = 900, start = performance.now();
        const ease = t => 1 - Math.pow(1 - t, 3);
        (function tick(now) {
          const t = Math.min(1, (now - start) / dur);
          demoDday.textContent = "D-" + Math.round(from + (remain - from) * ease(t));
          if (t < 1) requestAnimationFrame(tick);
          else demoDday.textContent = "D-" + remain;
        })(start);
      }
    }
    if (demoRing) drawRing(demoRing, ELAPSED, animate);
  }

  const dchips = $$(".dchip");
  let demoInit = false;
  function initDemo() {
    if (demoInit) return; demoInit = true;
    const active = $(".dchip.is-active") || dchips[0];
    if (active) updateDemo(active, true);
  }
  dchips.forEach(btn => {
    btn.addEventListener("click", () => {
      dchips.forEach(b => b.classList.toggle("is-active", b === btn));
      updateDemo(btn, true);
    });
  });
  const demoSection = $("#demo");
  if (demoSection) {
    if (reduce || !("IntersectionObserver" in window)) initDemo();
    else {
      const dio = new IntersectionObserver((es) => {
        es.forEach(e => { if (e.isIntersecting) { initDemo(); dio.unobserve(e.target); } });
      }, { threshold: 0.35 });
      dio.observe(demoSection);
    }
  }

  /* ================= 커스텀 커서 (데스크톱만) ================= */
  if (canHover && !reduce) {
    const cursor = $(".cursor");
    const dot = $(".cursor__dot"), ring = $(".cursor__ring");
    if (cursor && dot && ring) {
      document.body.classList.add("has-cursor");
      let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
      window.addEventListener("mousemove", (e) => {
        mx = e.clientX; my = e.clientY;
        dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
      }, { passive: true });
      (function loop() {
        rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
        ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
        requestAnimationFrame(loop);
      })();
      const hot = "a, button, summary, input, .dchip, .fchip, .preset, .acc";
      document.addEventListener("mouseover", (e) => {
        if (e.target.closest(hot)) cursor.classList.add("is-hot");
      });
      document.addEventListener("mouseout", (e) => {
        if (e.target.closest(hot)) cursor.classList.remove("is-hot");
      });
      window.addEventListener("mouseleave", () => { cursor.style.opacity = "0"; });
      window.addEventListener("mouseenter", () => { cursor.style.opacity = "1"; });
    }
  }

  /* ================= 마그네틱 버튼 (데스크톱만) ================= */
  if (canHover && !reduce) {
    $$(".magnetic").forEach(el => {
      const strength = 0.32;
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * strength;
        const y = (e.clientY - (r.top + r.height / 2)) * strength;
        el.style.transform = `translate(${x}px, ${y}px)`;
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
  }

  /* ================= 히어로 패럴랙스 ================= */
  if (!reduce) {
    const blobs = $$(".hero__blob");
    const heroRingEl = $(".hero__ring");
    let ticking = false;
    function parallax() {
      const y = window.scrollY;
      blobs.forEach((b, i) => { b.style.transform = `translateY(${y * (0.12 + i * 0.05)}px)`; });
      if (heroRingEl && innerWidth >= 940) heroRingEl.style.transform = `translateY(${y * -0.06}px)`;
      ticking = false;
    }
    window.addEventListener("scroll", () => {
      if (!ticking) { requestAnimationFrame(parallax); ticking = true; }
    }, { passive: true });
  }

  /* ================= 스크롤 진행바 + 내비 상태 ================= */
  const bar = $(".scroll-progress > span");
  const nav = $("#nav");
  let navTick = false;
  function onScroll() {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const p = max > 0 ? window.scrollY / max : 0;
    if (bar) bar.style.width = (p * 100) + "%";
    if (nav) nav.classList.toggle("is-scrolled", window.scrollY > 8);
    navTick = false;
  }
  window.addEventListener("scroll", () => {
    if (!navTick) { requestAnimationFrame(onScroll); navTick = true; }
  }, { passive: true });
  onScroll();

  /* ================= 테마 토글 ================= */
  const toggle = $("#themeToggle");
  if (toggle) {
    const root = document.documentElement;
    const saved = (() => { try { return localStorage.getItem("dc-theme"); } catch { return null; } })();
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    function apply(mode) {
      // mode: "dark" | "light" | "auto"
      root.setAttribute("data-theme", mode);
      const isDark = mode === "dark" || (mode === "auto" && systemDark);
      toggle.setAttribute("aria-pressed", String(isDark));
    }
    apply(saved || "auto");
    toggle.addEventListener("click", () => {
      const cur = root.getAttribute("data-theme");
      const isDark = cur === "dark" || (cur === "auto" && systemDark);
      const next = isDark ? "light" : "dark";
      apply(next);
      try { localStorage.setItem("dc-theme", next); } catch {}
    });
  }

  /* ================= 사전예약 폼 → mailto ================= */
  const form = $("#waitForm");
  if (form) {
    const input = $("#email", form);
    const note = $("#waitNote");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = (input.value || "").trim();
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
      if (!ok) {
        input.focus();
        input.setAttribute("aria-invalid", "true");
        if (note) note.textContent = "올바른 이메일 주소를 입력해 주세요.";
        return;
      }
      input.removeAttribute("aria-invalid");
      const subject = encodeURIComponent("다시올때 사전예약 신청");
      const body = encodeURIComponent(
        `다시올때(뷰티 주기 리마인더) 사전예약을 신청합니다.\n\n신청 이메일: ${val}\n`);
      window.location.href = `mailto:dys0707y@gmail.com?subject=${subject}&body=${body}`;
      if (note) { note.textContent = "메일 앱이 열렸어요. 보내주시면 출시 소식을 가장 먼저 전할게요."; note.classList.add("is-done"); }
    });
  }

  /* ================= 앵커 스무스 스크롤 (헤더 오프셋) ================= */
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 74;
      window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    });
  });
})();
