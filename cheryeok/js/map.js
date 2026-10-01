/* 지도 — MapLibre GL JS(web/vendor, BSD-3) + OpenFreeMap 벡터 타일(키·한도 없음, 표기 의무).
   지도가 실패해도 목록·거리 기능은 app.js 에서 그대로 동작한다. 타일 제공자는 이 파일 STYLE 한 곳에서만 바꾼다. */
(function (global) {
  'use strict';
  var STYLE = 'https://tiles.openfreemap.org/styles/positron';
  var SUMMARY_MAX_ZOOM = 10;   // 이 줌 미만: 시군구 요약 원(불러오지 않은 시도만)
  // ⚠ 라벨 레이어는 반드시 스타일에 있는 글꼴을 지정한다. 기본 글꼴은 OpenFreeMap 에 없어 glyph 404 → 그 소스의 타일 전체가 버려져 점까지 안 그려진다.
  var FONT = ['Noto Sans Regular'];

  function create(containerId, opts) {
    opts = opts || {};
    var api = { ready: false, map: null };
    if (!global.maplibregl) { if (opts.onFail) opts.onFail('지도 라이브러리를 불러오지 못했습니다'); return api; }
    var map;
    try {
      map = new maplibregl.Map({
        container: containerId, style: STYLE, center: [127.8, 36.3], zoom: 6, minZoom: 5, maxZoom: 17,
        attributionControl: { compact: false },
        // 스크롤 함정 방지(2026-09-26 iOS Safari 실측): 한 손가락 스와이프·마우스 휠은 페이지를 움직이고, 지도는 두 손가락·Ctrl/⌘+휠·확대 버튼으로.
        cooperativeGestures: true,
        locale: {
          'NavigationControl.ZoomIn': '확대', 'NavigationControl.ZoomOut': '축소',
          'CooperativeGesturesHandler.MobileHelpText': '두 손가락으로 지도를 움직이세요',
          'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl 키를 누른 채 스크롤하면 지도가 확대·축소됩니다',
          'CooperativeGesturesHandler.MacHelpText': '⌘ 키를 누른 채 스크롤하면 지도가 확대·축소됩니다'
        }
      });
    } catch (e) { if (opts.onFail) opts.onFail('지도를 만들지 못했습니다'); return api; }
    api.map = map;
    global.__dbgMap = map;   // 화면 검수용 참조
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    var failed = false;
    map.on('error', function (e) {
      if (failed) return;
      var msg = e && e.error && e.error.message ? e.error.message : '';
      if (!api.ready && /style|Failed to fetch|NetworkError/i.test(msg)) { failed = true; if (opts.onFail) opts.onFail('지도 타일을 불러오지 못했습니다 (' + msg.slice(0, 60) + ')'); }
    });
    map.on('load', function () {
      // 한글 라벨: name:ko 우선, 없으면 name(현지어)
      map.getStyle().layers.forEach(function (l) {
        if (l.type === 'symbol' && l.layout && l.layout['text-field']) {
          try { map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:ko'], ['get', 'name']]); } catch (e) { /* ignore */ }
        }
      });
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
          .setHTML('<strong>' + esc(p.name) + '</strong><br>' + esc(p.type) + '<br><span style="color:#6b7280">' + esc(p.addr) + '</span>' + (p.dup ? '<br><small>대표 위치(같은 좌표 공유)</small>' : '')).addTo(map);
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
    return api;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  global.FacMap = { create: create, SUMMARY_MAX_ZOOM: SUMMARY_MAX_ZOOM };
})(window);
