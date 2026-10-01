/* 지도 — MapLibre GL JS(web/vendor, BSD-3) + OpenFreeMap 벡터 타일(키·한도 없음, 표기 의무).
   지도가 실패해도 목록·거리 기능은 app.js 에서 그대로 동작한다. 타일 제공자는 이 파일 STYLE 한 곳에서만 바꾼다. */
(function (global) {
  'use strict';
  var STYLE = 'https://tiles.openfreemap.org/styles/positron';
  var SUMMARY_MAX_ZOOM = 10;   // 이 줌 미만: 시군구 요약 원(불러오지 않은 시도만)
  // ⚠ 라벨 레이어는 반드시 스타일에 있는 글꼴을 지정한다. 기본 글꼴은 OpenFreeMap 에 없어 glyph 404 → 그 소스의 타일 전체가 버려져 점까지 안 그려진다.
  var FONT = ['Noto Sans Regular'];
  // 화면 문구는 i18n.js 사전에서(한국어는 이전 문구 그대로). 지도 라벨은 한국어면 name:ko, 영어면 name:en 우선.
  function t(k, p) { return global.I18N ? global.I18N.t(k, p) : k; }
  function isEn() { return !!(global.I18N && global.I18N.lang() === 'en'); }
  function uiStrings() {
    return {
      'NavigationControl.ZoomIn': t('map.zoomIn'), 'NavigationControl.ZoomOut': t('map.zoomOut'),
      'CooperativeGesturesHandler.MobileHelpText': t('map.gestureMobile'),
      'CooperativeGesturesHandler.WindowsHelpText': t('map.gestureWin'),
      'CooperativeGesturesHandler.MacHelpText': t('map.gestureMac')
    };
  }
  function labelExpr() {
    return isEn() ? ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']] : ['coalesce', ['get', 'name:ko'], ['get', 'name']];
  }

  function create(containerId, opts) {
    opts = opts || {};
    var api = { ready: false, map: null };
    if (!global.maplibregl) { if (opts.onFail) opts.onFail('map.fail.lib'); return api; }
    var map;
    try {
      map = new maplibregl.Map({
        container: containerId, style: STYLE, center: [127.8, 36.3], zoom: 6, minZoom: 5, maxZoom: 17,
        attributionControl: { compact: false },
        // 스크롤 함정 방지(2026-09-26 iOS Safari 실측): 한 손가락 스와이프·마우스 휠은 페이지를 움직이고, 지도는 두 손가락·Ctrl/⌘+휠·확대 버튼으로.
        cooperativeGestures: true,
        locale: uiStrings()
      });
    } catch (e) { if (opts.onFail) opts.onFail('map.fail.create'); return api; }
    api.map = map;
    global.__dbgMap = map;   // 화면 검수용 참조
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    var failed = false;
    map.on('error', function (e) {
      if (failed) return;
      var msg = e && e.error && e.error.message ? e.error.message : '';
      if (!api.ready && /style|Failed to fetch|NetworkError/i.test(msg)) { failed = true; if (opts.onFail) opts.onFail('map.fail.tiles', msg.slice(0, 60)); }
    });
    var baseLabels = [];   // 타일 스타일의 지명 라벨 레이어(우리가 더하는 시설·요약 라벨은 제외)
    function setLabels() {
      var ex = labelExpr();
      baseLabels.forEach(function (id) { try { map.setLayoutProperty(id, 'text-field', ex); } catch (e) { /* ignore */ } });
    }
    map.on('load', function () {
      // 지명 라벨: 한국어면 name:ko, 영어면 name:en(없으면 name:latin) 우선, 없으면 name(현지어)
      map.getStyle().layers.forEach(function (l) {
        if (l.type === 'symbol' && l.layout && l.layout['text-field']) baseLabels.push(l.id);
      });
      setLabels();
      // 스타일이 완전히 그려진(idle) 뒤에 소스를 만든다
      map.once('idle', function () { setTimeout(function () { api.ready = true; if (opts.onReady) opts.onReady(); }, 0); });
    });

    // 갱신 때마다 소스+레이어를 새로 만든다(단순·확실). 2026-09-24 "점이 안 그려지던" 진짜 원인은 setData 가 아니라
    // 라벨 레이어의 글꼴 404 였다(위 FONT 주석). 성능은 시도 파일 1개(수천 점) 수준이라 문제 없다.
    function replace(id, layers, sourceDef) {
      layers.forEach(function (l) { if (map.getLayer(l.id)) map.removeLayer(l.id); });
      if (map.getSource(id)) map.removeSource(id);
      map.addSource(id, sourceDef);
      layers.forEach(function (l) { map.addLayer(l); });
    }
    var SGG_LAYERS = [
      { id: 'sgg-circle', type: 'circle', source: 'sgg', maxzoom: SUMMARY_MAX_ZOOM,
        paint: { 'circle-color': '#0e7c86', 'circle-opacity': 0.75, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5,
                 'circle-radius': ['interpolate', ['linear'], ['get', 'n'], 1, 6, 50, 14, 300, 24, 1000, 32] } },
      { id: 'sgg-label', type: 'symbol', source: 'sgg', maxzoom: SUMMARY_MAX_ZOOM,
        layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': FONT, 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff' } }
    ];
    var FAC_LAYERS = [
      { id: 'fac-cluster', type: 'circle', source: 'fac', filter: ['has', 'point_count'],
        paint: { 'circle-color': '#0e7c86', 'circle-opacity': 0.8, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5,
                 'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24] } },
      { id: 'fac-cluster-label', type: 'symbol', source: 'fac', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': FONT, 'text-size': 11 }, paint: { 'text-color': '#fff' } },
      { id: 'fac-point', type: 'circle', source: 'fac', filter: ['!', ['has', 'point_count']],
        paint: { 'circle-color': ['case', ['==', ['coalesce', ['get', 'hit'], 0], 1], '#0e7c86', '#98a2ae'], 'circle-radius': ['case', ['==', ['coalesce', ['get', 'hit'], 0], 1], 7, 5],
                 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } },
      { id: 'fac-label', type: 'symbol', source: 'fac', minzoom: 13, filter: ['all', ['!', ['has', 'point_count']], ['==', ['coalesce', ['get', 'hit'], 0], 1]],
        layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': '#17202a', 'text-halo-color': '#fff', 'text-halo-width': 1.2 } }
    ];
    var ME_LAYERS = [{ id: 'me', type: 'circle', source: 'me', paint: { 'circle-color': '#1d4ed8', 'circle-radius': 8, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } }];
    var handlersBound = false;
    function bindHandlers() {
      if (handlersBound) return;
      handlersBound = true;
      map.on('click', 'fac-point', function (e) {
        var p = e.features[0].properties;
        new maplibregl.Popup({ closeButton: true, maxWidth: '260px' }).setLngLat(e.features[0].geometry.coordinates)
          .setHTML('<strong>' + esc(p.name) + '</strong><br>' + esc(p.type) + '<br><span style="color:#6b7280">' + esc(p.addr) + '</span>' + (p.dup ? '<br><small>' + esc(t('map.dup')) + '</small>' : '')).addTo(map);
      });
      map.on('click', 'fac-cluster', function (e) {
        var f = e.features[0];
        map.getSource('fac').getClusterExpansionZoom(f.properties.cluster_id).then(function (z) { map.easeTo({ center: f.geometry.coordinates, zoom: z }); });
      });
      ['fac-point', 'fac-cluster', 'sgg-circle'].forEach(function (id) {
        map.on('mouseenter', id, function () { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, function () { map.getCanvas().style.cursor = ''; });
      });
      map.on('click', 'sgg-circle', function (e) { var f = e.features[0]; map.easeTo({ center: f.geometry.coordinates, zoom: SUMMARY_MAX_ZOOM + 1 }); if (opts.onSggClick) opts.onSggClick(f.properties.code); });
    }

    api.setSummary = function (points) {   // [{code,name,lat,lng,n}]
      if (!api.ready) return;
      bindHandlers();
      replace('sgg', SGG_LAYERS, { type: 'geojson', data: { type: 'FeatureCollection', features: points.map(function (p) {
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { code: p.code, name: p.name, n: p.n } };
      }) } });
      if (map.getLayer('me')) { ME_LAYERS.forEach(function (l) { map.moveLayer(l.id); }); }
    };
    api.setFacilities = function (list) {   // [{name,type,lat,lng,addr,dup,hit}]
      if (!api.ready) return;
      bindHandlers();
      replace('fac', FAC_LAYERS, { type: 'geojson', cluster: true, clusterMaxZoom: 13, clusterRadius: 40, data: { type: 'FeatureCollection', features: list.map(function (f) {
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [f.lng, f.lat] }, properties: { name: f.name, type: f.type, addr: f.addr, dup: f.dup, hit: f.hit ? 1 : 0 } };
      }) } });
      if (map.getLayer('me')) { ME_LAYERS.forEach(function (l) { map.moveLayer(l.id); }); }
    };
    api.setUser = function (lat, lng, zoom) {
      if (!api.ready) return;
      replace('me', ME_LAYERS, { type: 'geojson', data: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: {} }] } });
      map.easeTo({ center: [lng, lat], zoom: zoom || 12, duration: 600 });
    };
    api.resize = function () { if (map) map.resize(); };
    // 언어 전환: MapLibre 4.7.1 에는 UI 문구를 바꾸는 공개 API 가 없어, 이미 그려진 확대·축소 버튼 제목과 두 손가락 안내 글자를 직접 바꾼다.
    api.setLang = function () {
      var L = uiStrings();
      try { Object.keys(L).forEach(function (k) { map._locale[k] = L[k]; }); } catch (e) { /* 내부 구조가 다르면 건너뛴다 */ }
      var c = map.getContainer();
      [['.maplibregl-ctrl-zoom-in', 'NavigationControl.ZoomIn'], ['.maplibregl-ctrl-zoom-out', 'NavigationControl.ZoomOut']].forEach(function (b) {
        var el = c.querySelector(b[0]); if (el) { el.title = L[b[1]]; el.setAttribute('aria-label', L[b[1]]); }
      });
      var mac = navigator.userAgent.indexOf('Mac') !== -1;   // MapLibre 와 같은 판정(⌘ 또는 Ctrl)
      var dm = c.querySelector('.maplibregl-desktop-message'), mm = c.querySelector('.maplibregl-mobile-message');
      if (dm) dm.textContent = L[mac ? 'CooperativeGesturesHandler.MacHelpText' : 'CooperativeGesturesHandler.WindowsHelpText'];
      if (mm) mm.textContent = L['CooperativeGesturesHandler.MobileHelpText'];
      setLabels();
    };
    return api;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  global.FacMap = { create: create, SUMMARY_MAX_ZOOM: SUMMARY_MAX_ZOOM };
})(window);
