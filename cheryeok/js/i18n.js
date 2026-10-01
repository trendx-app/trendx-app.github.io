/* 언어 — 한국어(ko)·영어(en).
   정하는 순서: ①주소 조각 #lang=ko|en(그 화면에만, 저장 안 함) ②사용자가 고른 값(localStorage cheryeok.lang) ③기기 언어(첫 값이 ko 로 시작하면 한국어, 그 밖은 영어).
   한국어 정적 문구는 사전에 두지 않는다 — index.html 원문을 처음 읽어 두었다가 되돌린다(배포 게이트가 원문을 검사하고, 한국어 화면이 한 글자도 바뀌지 않게).
   계산·연결에 쓰는 값(운동 요소·등급·시설 유형 이름)은 데이터 원문(한국어) 그대로 두고, 화면에 보일 때만 바꾼다.
   운동처방 운동 이름의 영어는 트렌드 엑스(TrendX)가 공단 처방 기록 원문을 옮긴 것이다(화면에 표기). */
(function (global) {
  'use strict';
  var KEY = 'cheryeok.lang';

  // ────────── JS 가 그리는 문구 — KO 는 이전 코드의 문구와 글자 하나까지 같다
  var KO = {
    'err.data': '데이터 파일을 불러오지 못했습니다 ({msg}). 잠시 후 새로고침해 주세요. 계속되면 사이트 주소가 맞는지 확인해 주세요.',
    'banner.mock': '⚠ 지금 보이는 숫자는 <strong>예시 데이터</strong>입니다. 공공데이터 활용신청이 완료되면 실제 국민체력100 측정결과로 바뀝니다.',
    'foot.sources': '데이터 기준: 측정결과 {period} (사용 {n}건) · 시설 {nf}곳 ({basis}) · 생성 {gen}',
    'embed.received': '앱에서 받은 값',
    'embed.calculated': '계산한 값',
    'embed.age': '{age}세',
    'embed.height': '신장 {v}cm',
    'embed.weight': '체중 {v}kg',
    'embed.nItems': '측정값 {n}개',
    'embed.noItems': '측정값 없음',
    'embed.edit': '측정값 넣기·고치기',
    'sex.M': '남성',
    'sex.F': '여성',
    'items.sub': '나이를 넣으면 그 연령대에서 측정하는 항목이 나타납니다.',
    'items.senior': '65세 이상 어르신 측정 항목입니다.',
    'items.adult': '19~64세 성인 측정 항목입니다.',
    'val.range': '가능한 범위는 {a}~{bu}입니다. 이 값은 계산에서 뺍니다.',
    'err.age': '만 19세 이상 나이를 숫자로 넣어 주세요.',
    'err.sex': '측정 기준 성별을 골라 주세요.',
    'res.noGroup': '이 성별·연령대의 비교 자료가 아직 없습니다. 다른 나이를 넣어 보거나, 아래에서 시설만 찾을 수 있습니다.',
    'res.basis': '비교 대상: {group} · 국민체력100 체력인증센터 측정 기록 {n}건(항목별 표본 수는 다름) · 측정 기간 {period} · 공공데이터포털 {id}',
    'pct.lowN': '표본 부족 · 참고용',
    'pct.median': '또래 중앙값 <b>{v}</b> {unit}',
    'pct.notEntered': '입력하지 않은 항목입니다. 또래 중앙값만 표시합니다. ',
    'pct.noDir': '또래 참가자 중 값이 낮은 쪽에서 {p}% 위치입니다 (좋고 나쁨의 방향이 없는 참고 항목)',
    'pct.noDirAria': '{label} 또래 중 위치 {p}퍼센트',
    'pct.rank': '측정 참가자 또래 100명 중 <b>약 {rank}등</b>',
    'pct.lowBetter': ' <small>· 낮을수록 좋은 항목</small>',
    'pct.rankAria': '{label} 또래 100명 중 약 {rank}등',
    'pct.weakTag': '먼저 기를 항목 후보',
    'pct.valLow': '값 낮음', 'pct.valHigh': '값 높음',
    'pct.weaker': '또래보다 약함', 'pct.stronger': '또래보다 강함',
    'pct.mine': '내 값 <b>{v}</b> · 또래 중앙값 {m}',
    'pct.medianTitle': '또래 중앙값',
    'pct.center': '또래 중앙',
    'tgt.top': '이미 1등급으로 추정됩니다. 지금 수준을 유지하는 것이 목표입니다.',
    'tgt.intro': '<strong>{label} 목표치와 내 값</strong> — 가장 낮은 항목이 등급을 정하므로 표의 항목을 모두 넘기는 것이 목표입니다.',
    'tgt.item': '항목', 'tgt.mine': '내 값', 'tgt.cut': '{label} 기준', 'tgt.gap': '차이',
    'tgt.met': '달성',
    'tgt.less': '{v} 줄이기', 'tgt.more': '{v} 더',
    'tgt.atMost': '{v} 이하', 'tgt.atLeast': '{v} 이상',
    'tgt.evSummary': '기준값의 근거 보기',
    'tgt.ev': '2023~2025년 측정 자료에서 역산한 기준입니다(공단 공식 기준표는 공개 데이터로 제공되지 않음). 판별 일치율 {list} (균형 정확도, 같은 성별·연령대 {n}명 안팎). 항목마다 기준을 넘겨도 공단 판정은 다를 수 있습니다.',
    'ai.few': '입력 항목이 {n}개뿐이라 추정이 불확실합니다. 항목을 더 넣으면 정확해집니다.',
    'ai.ok': '지금 입력한 값으로 추정한 결과입니다.',
    'ai.head': '예상 등급 <b>{grade}</b> <span class="tag">확률 {p}%</span>',
    'ai.wiIntro': '<strong>등급을 올리려면</strong> — 다른 항목은 그대로 두고 한 항목만 또래 상위 30% 수준(100명 중 30등)으로 바꿨을 때 모델이 주는 확률 변화(변화가 큰 순)',
    'ai.wiRow': '<b>{label}</b> 지금 100명 중 약 {from}등 → 30등이 되면: 2등급 이상 확률 {before}% → <b>{after}%</b>, 예상 등급 {grade}',
    'ai.wiNone': '한 항목만 올려서는 예상 등급이 크게 바뀌지 않습니다. 가장 낮은 항목부터 고르게 올리는 편이 낫습니다.',
    'ai.disclaimer': '공단의 실제 등급 판정과 다를 수 있으며 의료 판단이 아닙니다.',
    'ai.evSummary': '이 추정의 근거 보기',
    'ai.ev': '국민체력100 인증 등급이 있는 측정 기록 {n}건을 학습한 모델(경사부스팅 120그루). 2025년 측정 기록 {nt}건으로 검증한 정확도 {acc}% (성별·연령대 최빈 등급 {base}% · 측정 자료에서 역산한 핵심 3항목 규칙 75%). 입력하지 않은 항목은 또래 중앙값으로 가정합니다. 출처: {src}',
    'ai.fail': '예측 모델을 불러오지 못했습니다 ({msg}). 다른 기능은 그대로 쓸 수 있습니다.',
    'weak.single': '{label} 기르기',
    'weak.first': '가장 낮은 항목: ',
    'weak.next': '다음으로 낮은 항목: ',
    'weak.why': '{domain} · 측정 참가자 또래 100명 중 약 {rank}등',
    'weak.presIntro': '체력인증센터 운동처방에 가장 자주 나온 <strong>{domain}</strong> 운동',
    'weak.presN': '처방 {n}회',
    'weak.noPres': '이 항목의 처방 집계가 아직 없습니다.',
    'weak.measure': '집에서 직접 측정해 보기: ',
    'weak.videoLink': '{title} 영상{len}',
    'weak.videoLen': ' ({s}초)',
    'weak.tool': ' <small>· 준비물 {tool}</small>',
    'weak.facBtn': '이 운동이 되는 시설 보기',
    'weak.src': '처방 운동 출처: {src} ({n}건). 측정 영상 출처: {vsrc} (국민체육진흥공단 제공){mock}. 운동을 시작하기 전 질환이 있거나 통증이 있다면 의사와 상의하세요.',
    'mock.suffix': ' · 예시 데이터',
    'chip.all': '전체',
    'map.fail.lib': '지도 라이브러리를 불러오지 못했습니다',
    'map.fail.create': '지도를 만들지 못했습니다',
    'map.fail.tiles': '지도 타일을 불러오지 못했습니다 ({msg})',
    'map.listStill': '. 지도 없이도 아래 목록에서 가까운 시설을 볼 수 있습니다.',
    'map.dup': '대표 위치(같은 좌표 공유)',
    'map.zoomIn': '확대', 'map.zoomOut': '축소',
    'map.gestureMobile': '두 손가락으로 지도를 움직이세요',
    'map.gestureWin': 'Ctrl 키를 누른 채 스크롤하면 지도가 확대·축소됩니다',
    'map.gestureMac': '⌘ 키를 누른 채 스크롤하면 지도가 확대·축소됩니다',
    'opt.select': '선택',
    'loc.sggClick': '시군구 중심: {name}',
    'loc.sgg': '{name} 중심 기준',
    'loc.geo': '내 위치 기준 ({name} 부근)',
    'loc.lead': '{label} · 가까운 순으로 보여 드립니다. 위치가 없는 시설은 지도에 없습니다.',
    'geo.unsupported': '이 브라우저는 위치를 지원하지 않습니다. 지역을 골라 주세요.',
    'geo.busy': '위치 확인 중…',
    'geo.use': '내 위치 사용',
    'geo.outside': '현재 위치가 자료 범위(대한민국) 밖으로 보입니다. 지역을 골라 주세요.',
    'geo.denied': '위치 권한이 거부됐거나 확인할 수 없습니다. 아래에서 지역을 골라 주세요.',
    'fac.loadFail': '시설 파일을 불러오지 못했습니다 ({msg}). 새로고침해 주세요.',
    'fac.open': '지도 앱에서 열기',
    'fac.google': 'Google 지도', 'fac.kakao': '카카오맵',
    'fac.googleAria': '{name} Google 지도에서 열기(새 창)',
    'fac.kakaoAria': '{name} 카카오맵에서 열기(새 창)',
    'fac.pick': '내 위치를 쓰거나 시·도와 시·군·구를 고르면 가까운 시설 5곳을 보여 드립니다.',
    'fac.noType': '고른 유형의 시설이 이 시·도 안에 없습니다. 필터를 "전체"로 바꿔 보세요.',
    'fac.dup': '(대표 위치)',
    'fac.home': '홈페이지',
    'fac.src': '출처: {src} · {basis} · 폐업 {closed}곳·삭제 {deleted}곳 제외 · 위치 미상 {unknown}곳은 지도에 없습니다{mock}'
  };

  var EN = {
    'err.data': 'Couldn’t load the data files ({msg}). Please refresh in a moment. If it keeps happening, check that the site address is correct.',
    'banner.mock': '⚠ The numbers shown are <strong>sample data</strong>. They will be replaced with real National Fitness 100 results once the public data access request is approved.',
    'foot.sources': 'Data basis: test results {period} ({n} records used) · {nf} facilities ({basis}) · generated {gen}',
    'embed.received': 'Values from the app',
    'embed.calculated': 'Calculated values',
    'embed.age': 'Age {age}',
    'embed.height': 'Height {v} cm',
    'embed.weight': 'Weight {v} kg',
    'embed.nItems': '{n} test results',
    'embed.nItems.one': '1 test result',
    'embed.noItems': 'No test results',
    'embed.edit': 'Add or edit test results',
    'sex.M': 'Male',
    'sex.F': 'Female',
    'items.sub': 'Enter your age to see the tests for your age group.',
    'items.senior': 'Tests for older adults (65+).',
    'items.adult': 'Tests for adults aged 19–64.',
    'val.range': 'Allowed range: {a}–{bu}. This value will be left out of the calculation.',
    'err.age': 'Please enter your age as a number (19 or older).',
    'err.sex': 'Please choose the sex to compare with.',
    'res.noGroup': 'There’s no comparison data for this sex and age group yet. Try another age, or just look for facilities below.',
    'res.basis': 'Compared with: {group} · {n} test records from National Fitness 100 certification centers (sample size varies by item) · test period {period} · Public Data Portal {id}',
    'pct.lowN': 'Small sample · for reference',
    'pct.median': 'Peer median <b>{v}</b> {unit}',
    'pct.notEntered': 'Not entered. Showing the peer median only. ',
    'pct.noDir': 'At percentile {p} among peers, counted from the lowest value (reference item — neither direction is better)',
    'pct.noDirAria': '{label}: percentile {p} among peers',
    'pct.rank': 'Among 100 tested peers, you rank <b>about #{rank}</b>',
    'pct.lowBetter': ' <small>· lower is better</small>',
    'pct.rankAria': '{label}: about #{rank} of 100 peers',
    'pct.weakTag': 'Candidate to work on first',
    'pct.valLow': 'Lower value', 'pct.valHigh': 'Higher value',
    'pct.weaker': 'Weaker than peers', 'pct.stronger': 'Stronger than peers',
    'pct.mine': 'You <b>{v}</b> · peer median {m}',
    'pct.medianTitle': 'Peer median',
    'pct.center': 'Peer median',
    'tgt.top': 'You’re already estimated at Grade 1. The goal is to keep your current level.',
    'tgt.intro': '<strong>{label} targets vs. your values</strong> — your lowest item decides the grade, so aim to pass every item in the table.',
    'tgt.item': 'Item', 'tgt.mine': 'You', 'tgt.cut': '{label} cutoff', 'tgt.gap': 'Change needed',
    'tgt.met': 'Met',
    'tgt.less': '−{v}', 'tgt.more': '+{v}',
    'tgt.atMost': '≤ {v}', 'tgt.atLeast': '≥ {v}',
    'tgt.evSummary': 'Where these cutoffs come from',
    'tgt.ev': 'Cutoffs back-calculated from 2023–2025 test records (KSPO’s official cutoff table is not available as public data). Agreement: {list} (balanced accuracy, about {n} people of the same sex and age group). Even if you pass every cutoff, KSPO’s actual grading may differ.',
    'ai.few': 'Only {n} items entered, so this estimate is uncertain. Adding more items makes it more accurate.',
    'ai.few.one': 'Only 1 item entered, so this estimate is uncertain. Adding more items makes it more accurate.',
    'ai.ok': 'Estimated from the values you entered.',
    'ai.head': 'Most likely <b>{grade}</b> <span class="tag">probability {p}%</span>',
    'ai.wiIntro': '<strong>To raise your grade</strong> — how the model’s probabilities change if just one item reaches the top 30% of peers (#30 of 100) and everything else stays the same (largest change first)',
    'ai.wiRow': '<b>{label}</b> now about #{from} of 100 → at #30: chance of Grade 2 or better {before}% → <b>{after}%</b>, estimated {grade}',
    'ai.wiNone': 'Raising just one item won’t change the estimated grade much. It’s better to raise your lowest items evenly.',
    'ai.disclaimer': 'This is an estimate of the certification grade. It may differ from KSPO’s actual grading and is not a medical judgment.',
    'ai.evSummary': 'How this estimate works',
    'ai.ev': 'A model (gradient boosting, 120 trees) trained on {n} National Fitness 100 test records that received a certification grade. Accuracy on {nt} test records from 2025: {acc}% (vs. {base}% for the most common grade by sex and age group, and 75% for a 3-item rule back-calculated from test data). Items you didn’t enter are assumed to be at the peer median. Source: {src}',
    'ai.fail': 'Couldn’t load the prediction model ({msg}). Everything else still works.',
    'weak.single': 'Work on: {label}',
    'weak.first': 'Lowest: ',
    'weak.next': 'Next lowest: ',
    'weak.why': '{domain} · about #{rank} of 100 tested peers',
    'weak.presIntro': 'Exercises most often prescribed for <strong>{domainLower}</strong> at certification centers',
    'weak.presN': 'prescribed {n} times',
    'weak.noPres': 'No prescription data for this item yet.',
    'weak.measure': 'Measure it yourself at home: ',
    'weak.videoLink': '{title} (Korean video{len})',
    'weak.videoLen': ', {s} s',
    'weak.tool': ' <small>· You’ll need: {tool}</small>',
    'weak.facBtn': 'Show facilities for this',
    'weak.src': 'Prescribed exercises: {src} ({n} records). Exercise names translated by TrendX from KSPO prescription records. Measurement videos: {vsrc} (provided by KSPO){mock}. If you have a medical condition or pain, talk to a doctor before you start exercising.',
    'mock.suffix': ' · sample data',
    'chip.all': 'All',
    'map.fail.lib': 'Couldn’t load the map library',
    'map.fail.create': 'Couldn’t create the map',
    'map.fail.tiles': 'Couldn’t load the map tiles ({msg})',
    'map.listStill': '. You can still see nearby facilities in the list below.',
    'map.dup': 'Shared location (same coordinates as other facilities)',
    'map.zoomIn': 'Zoom in', 'map.zoomOut': 'Zoom out',
    'map.gestureMobile': 'Use two fingers to move the map',
    'map.gestureWin': 'Use Ctrl + scroll to zoom the map',
    'map.gestureMac': 'Use ⌘ + scroll to zoom the map',
    'opt.select': 'Select',
    'loc.sggClick': 'District center: {name}',
    'loc.sgg': 'From the center of {name}',
    'loc.geo': 'From your location (near {name})',
    'loc.lead': '{label} · nearest first. Facilities without a location are not on the map.',
    'geo.unsupported': 'This browser doesn’t support location. Please choose a region.',
    'geo.busy': 'Finding your location…',
    'geo.use': 'Use my location',
    'geo.outside': 'Your location seems to be outside the data coverage (South Korea). Please choose a region.',
    'geo.denied': 'Location permission was denied or your location couldn’t be found. Please choose a region below.',
    'fac.loadFail': 'Couldn’t load the facility file ({msg}). Please refresh.',
    'fac.open': 'Open in a map app',
    'fac.google': 'Google Maps', 'fac.kakao': 'KakaoMap',
    'fac.googleAria': 'Open {name} in Google Maps (new window)',
    'fac.kakaoAria': 'Open {name} in KakaoMap (new window)',
    'fac.pick': 'Use your location, or choose a region and a city/district, to see the 5 nearest facilities.',
    'fac.noType': 'No facilities of the selected type in this region. Try setting the filter to “All”.',
    'fac.dup': '(shared location)',
    'fac.home': 'Website',
    'fac.src': 'Source: {src} · {basis} · {closed} closed and {deleted} deleted facilities excluded · {unknown} facilities with no known location are not on the map{mock}'
  };

  // ────────── index.html 정적 문구(data-i18n) 의 영어판. 한국어는 원문을 되돌린다.
  var STATIC_EN = {
    'doc.title': 'My Fitness, My Neighborhood — National Fitness 100 peer comparison and public sports facilities nearby',
    'top.h1': 'My Fitness, My Neighborhood',
    'top.lead': 'Enter your age, sex and any test results you know. We’ll show <strong>where you stand among people your age tested by National Fitness 100 (국민체력100)</strong>, Korea’s public fitness testing program, and find <strong>public sports facilities nearby</strong> where you can build up your weaker areas.',
    'notice': '<strong>This is a reference tool for comparing fitness levels. It is not a medical device</strong> and is not intended to diagnose, treat or prevent any disease. Everything you enter is calculated only in your browser and <strong>never leaves this device.</strong><br>Percentiles compare you with participants of the same sex and age group who were tested at National Fitness 100 centers in Korea in 2023–2025. They are not standards for the whole population of Korea or for any other country.',
    'howto.aria': 'How to use',
    'howto.title': 'How to use',
    'howto.1': 'Enter your age and sex, plus any test results you know (they’re optional)',
    'howto.2': 'Tap “See where I stand” to see your rank out of 100 peers for each item, your estimated certification grade, and what to work on first',
    'howto.3': 'Use your location or pick a region to see nearby public sports facilities for those exercises on the map',
    'btn.demo': 'Don’t know your results? See an example',
    'step1.h': 'Tell us about yourself',
    'step1.lead': 'Age and sex are enough. Add only the test results you know.',
    'age.label': 'Age <span class="unit">(in full years, 19+)</span>',
    'sex.label': 'Sex to compare with',
    'sex.m': 'Male',
    'sex.f': 'Female',
    'items.legend': 'Fitness test results <span class="unit">(optional — only what you know)</span>',
    'items.sub': 'Enter your age to see the tests for your age group.',
    'body.legend': 'Body measurements <span class="unit">(optional — for relative grip strength and BMI)</span>',
    'height.label': 'Height <span class="unit">cm</span>',
    'weight.label': 'Weight <span class="unit">kg</span>',
    'btn.go': 'See where I stand',
    'btn.noinput': 'Continue without results',
    'btn.example': 'Fill in example values',
    'step2.h': 'Where I stand among my peers',
    'stepai.h': 'Estimated certification grade if tested at a center today',
    'step3.h': 'What to work on first',
    'step4.h': 'Public sports facilities nearby',
    'map.lead': 'Use your location or choose a region. Closed or deleted facilities are excluded, and facilities without a location are not on the map.',
    'btn.geo': 'Use my location',
    'sido.label': 'Region',
    'sgg.label': 'City / district',
    'opt.select': 'Select',
    'filters.aria': 'Facility type filter',
    'map.preparing': 'Preparing the map…',
    'foot.data': 'Data: Korea Sports Promotion Foundation (KSPO) public data on the Public Data Portal (data.go.kr) — National Fitness 100 certification center test results · public sports facility details · National Fitness 100 videos. Percentiles are based on a sample of people tested at National Fitness 100 certification centers, not on the whole population.',
    'foot.map': 'Map: <a href="https://openfreemap.org" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" rel="noopener">OpenMapTiles</a> · Data from <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> · MapLibre GL JS (BSD-3)',
    'foot.contest': 'Entry in the 2026 KSPO Public Data Utilization Contest · Operated by TrendX',
    'foot.app': 'From TrendX: <strong>CaloryX</strong> — an app to manage your meals and to save and track the calories you burn, your route, elevation and speed while hiking, walking or running, so exercise is more fun. <a href="https://play.google.com/store/apps/details?id=com.caloryx.app" rel="noopener" target="_blank">Google Play</a> · <a href="https://apps.apple.com/kr/app/id6791085565" rel="noopener" target="_blank">App Store</a>',
    // CaloryX 연계 구역(#stepcx) — 기능·요금 구분은 CaloryX 코드(FeatureGate·Monetization, Android 2.12.3) 기준 2026-10-01
    'cx.h': 'After your fitness check — manage meals, weight and exercise with CaloryX',
    'cx.lead': 'This site shows <strong>where your fitness stands among people your age</strong>. For the everyday part — <strong>meals, weight and exercise</strong> — you can log and manage it with <strong>CaloryX</strong>, an app made by TrendX.',
    'cx.meal.h': '🍱 Meals',
    'cx.meal.list': '<li>Snap one photo of your food to get calories, protein, carbs and fat</li><li>A full table is split dish by dish; adjust portions in 0.1-serving steps</li><li>Food search (barcodes, chains, convenience stores — Korean food safety nutrition data)</li><li>Ask the AI nutrition coach “What should I eat?”</li>',
    'cx.move.h': '🚴 Exercise',
    'cx.move.list': '<li>GPS tracking for walks, runs, hikes and bike rides</li><li>Replay your route on a 3D map and save it as a video</li><li>Elevation and speed charts and videos</li><li>Workout photos with your stats on them; calories burned shown as food</li>',
    'cx.weight.h': '⚖️ Weight',
    'cx.weight.list': '<li>Compare calories eaten and burned on one screen, every day</li><li>Weight trend chart and a daily goal set for you</li><li>Weekly AI report and monthly recap, streaks and home-screen widgets</li>',
    'cx.real.h': 'Real screens from the app',
    'cx.route.aria': 'CaloryX bike route video',
    'cx.route.cap': 'Route video — your ride redrawn on a 3D map',
    'cx.elev.aria': 'CaloryX elevation and speed video',
    'cx.elev.cap': 'Elevation and speed video — climbs and fast stretches at a glance',
    'cx.proof.alt': 'CaloryX workout photo showing 4.07 km, 22:56, average 10.7 km/h and 85 kcal over a photo of the Han River',
    'cx.proof.cap': 'Workout photo — distance, time, speed and calories on your own photo',
    'cx.meal.alt': 'CaloryX screen analyzing a chicken breast brown-rice fried rice and cabbage salad lunch box: 480 kcal, protein 36 g, carbs 62 g, fat 10 g',
    'cx.meal.cap': 'Meal analysis — calories, protein, carbs and fat from one photo',
    'cx.store.h': 'Store screenshots',
    'cx.ios': 'Get it on the App Store',
    'cx.android': 'Get it on Google Play',
    'cx.note': 'CaloryX requires sign-in, and every feature is free for the first 7 days after you install it. After that, photo calorie analysis, workout videos, workout photos, the weekly report and the monthly recap need a subscription (prices are shown in the store); GPS workout tracking, weight trends, food search and the AI coach stay free. Calorie and nutrition figures in CaloryX are AI estimates, not medical information. Nothing you enter on this site is sent to CaloryX.',
    'cx.link.weight': 'You can <a href="#stepcx">keep managing your meals and weight with CaloryX</a>.',
    'cx.link.move': 'You can <a href="#stepcx">log your workout route, elevation, speed and calories burned with CaloryX</a>.'
  };

  // ────────── 데이터 속 문구의 영어판 — 코드 또는 원문(한국어)을 키로. 없으면 원문 그대로(시험이 찾아낸다).
  var ITEM_EN = {
    f004: { label: 'Waist circumference', unit: 'cm' },
    f003: { label: 'Body fat percentage', unit: '%' },
    f052: { label: 'Grip strength', unit: 'kg' },
    f019: { label: 'Crossed-arm sit-ups', unit: 'reps' },
    f028: { label: 'Relative grip strength', unit: '%' },
    f009: { label: 'Curl-ups', unit: 'reps' },
    f012: { label: 'Sit-and-reach', unit: 'cm' },
    f022: { label: 'Standing long jump', unit: 'cm' },
    f010: { label: 'Repeated jumps (반복점프)', unit: 'reps' },
    f020: { label: 'Shuttle run', unit: 'laps' },   // 거리는 뺐다 — 공단 측정 영상 제목은 '15m', API 명세는 거리 없음(검토 필요)
    f024: { label: '6-minute walk', unit: 'm' },
    f023: { label: 'Chair stand', unit: 'reps' },
    f025: { label: '2-minute step-in-place', unit: 'steps' },
    f018: { label: 'BMI', unit: 'kg/m²' }
  };
  var HINT_EN = {
    '좌·우 중 큰 값 기준': 'Use the higher of left and right',
    '성인 측정 항목(1분)': 'Adult test (1 minute)',
    '어르신 측정 항목': 'Older-adult test',
    '측정 사례가 적어 참고용': 'Few measurements — for reference only'
  };
  var DOMAIN_EN = {
    '근력': 'Muscular strength', '근지구력': 'Muscular endurance', '유연성': 'Flexibility', '순발력': 'Explosive power',
    '심폐지구력': 'Cardiorespiratory endurance', '신체조성': 'Body composition', '하지근력': 'Lower-body strength', '평형성': 'Balance', '참고': 'Reference'
  };
  var EXERCISE_EN = {
    '앉았다 일어서기': 'Squats',
    '웨이트 트레이닝 루틴프로그램': 'Weight training routine',
    '팔굽혀펴기': 'Push-ups',
    '턱걸이': 'Pull-ups',
    '저항밴드 운동 루틴프로그램': 'Resistance band routine',
    '한발 앞으로 내밀고 앉았다 일어서기': 'Forward lunges',
    '엎드려 버티기': 'Plank',
    '윗몸올리기': 'Trunk raises (윗몸올리기)',
    '윗몸 말아 올리기': 'Curl-ups',
    '누워서 다리 들어올리기': 'Lying leg raises',
    '윗몸 일으키기': 'Sit-ups',
    '전완대고 버티기': 'Forearm plank',
    '넙다리 뒤쪽 스트레칭': 'Hamstring stretch',
    '엉덩이 스트레칭': 'Hip and glute stretch',
    '넙다리 안쪽 스트레칭': 'Inner-thigh stretch',
    '하지 루틴 스트레칭2': 'Lower-body stretching routine 2',
    '요가 및 필라테스 루틴프로그램': 'Yoga and Pilates routine',
    '하지 루틴 스트레칭1': 'Lower-body stretching routine 1',
    '줄넘기 운동': 'Jump rope workout',
    '버피운동': 'Burpees',
    '줄넘기': 'Jump rope',
    '계단 뛰어 오르기': 'Running up stairs',
    '버피 테스트': 'Burpee test',
    '팔벌려뛰기': 'Jumping jacks',
    '달리기': 'Running',
    '조깅': 'Jogging',
    '수영': 'Swimming',
    '실내 자전거타기': 'Indoor cycling',
    '계단 올라갔다 내려오기': 'Stair climbing (up and down)',
    '걷기': 'Walking',
    '앉아서 다리 펴기': 'Seated leg extensions',
    '앉아서 다리 밀기': 'Seated leg press',
    '엎드려서 균형잡기': 'Prone balance (엎드려서 균형잡기)',
    '한발 연속 뛰기': 'Single-leg hops',
    '한발 서서 균형잡기': 'Single-leg stand',
    '균형 걷기': 'Balance walk',
    '의자 잡고 후방으로 한발 뻗어 들기': 'Rear leg raises holding a chair'
  };
  var FTYPE_EN = {
    '1': 'Small sports ground (간이운동장)', '2': 'Other facility', '3': 'All-weather gateball court', '4': 'Soccer field',
    '5': 'Community gym', '6': 'Tennis court', '7': 'Swimming pool', '8': 'Indoor ball-sports gym',
    '9': 'Other (fitness center)', '10': 'Baseball field', '11': 'Futsal court', '12': 'Traditional archery range (gukgung)',
    '13': 'Park golf course', '14': 'Athletics stadium', '15': 'Roller skating rink', '16': 'Golf driving range',
    '17': 'Ssireum (Korean wrestling) ring', '18': 'Outdoor climbing wall', '19': 'Golf course', '20': 'Combat sports gym',
    '21': 'Ice rink', '22': 'Shooting range', '23': 'Archery range', '24': 'Hockey field',
    '25': 'Horse riding center', '26': 'Yachting center', '27': 'Indoor climbing wall', '28': 'Rowing and canoe course',
    '29': 'Cycling track', '30': 'Cross-country course', '31': 'Ski jump', '32': 'Biathlon range'
  };
  var SIDO_EN = {
    '11': 'Seoul', '12': 'Jeonnam-Gwangju (전남광주)', '26': 'Busan', '27': 'Daegu', '28': 'Incheon', '29': 'Gwangju', '30': 'Daejeon',
    '31': 'Ulsan', '36': 'Sejong', '41': 'Gyeonggi', '42': 'Gangwon', '43': 'North Chungcheong', '44': 'South Chungcheong',
    '45': 'Jeonbuk', '46': 'South Jeolla', '47': 'North Gyeongsang', '48': 'South Gyeongsang', '50': 'Jeju', '51': 'Gangwon', '52': 'Jeonbuk'
  };
  var TOOL_EN = {
    '줄자': 'a tape measure', '인바디 측정기': 'a body composition analyzer (InBody)', '악력계': 'a grip dynamometer',
    '매트(얇은 이불)': 'a mat (or a thin blanket)', '측정대': 'a measuring board', '허들': 'a hurdle', '초시계': 'a stopwatch',
    '색테이프': 'colored tape', '의자': 'a chair'
  };
  var SRC_EN = {
    '공공체육시설 상세 정보 (공공데이터포털 15107764)': 'Public sports facility details (Public Data Portal 15107764)',
    '국민체력100 체력인증센터 측정결과 정보 (공공데이터포털 15108938) 운동처방내용(pres_note) 본운동 집계': 'National Fitness 100 certification center test results (Public Data Portal 15108938), count of main exercises in the exercise prescriptions (pres_note)',
    '국민체력100 동영상 정보 (공공데이터포털 15108846)': 'National Fitness 100 videos (Public Data Portal 15108846)',
    '국민체력100 체력인증센터 측정결과(15108938) 2023-01~2025-12, 인증 등급(cert_gbn) 1·2·3등급': 'National Fitness 100 certification center test results (15108938), 2023-01 to 2025-12, certification grades 1–3 (cert_gbn)'
  };

  // ────────── 언어 정하기
  var lang = 'ko';
  function norm(v) { v = String(v || '').toLowerCase(); return v === 'ko' || v === 'en' ? v : null; }
  function hashLang() {
    try { return norm(new URLSearchParams(location.hash.replace(/^#/, '')).get('lang')); } catch (e) { return null; }
  }
  function storedLang() {
    try { return norm(localStorage.getItem(KEY)); } catch (e) { return null; }   // 사생활 모드·저장소 차단 — 없는 것으로 본다
  }
  function deviceLang() {
    var first = '';
    try { first = (navigator.languages && navigator.languages.length) ? navigator.languages[0] : (navigator.language || ''); } catch (e) { first = ''; }
    return String(first || '').toLowerCase().indexOf('ko') === 0 ? 'ko' : 'en';
  }

  // ────────── 문구
  function fill(s, p) {
    if (!p) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return p[k] == null ? m : String(p[k]); });
  }
  function t(key, p) {
    var s = (lang === 'en' ? EN : KO)[key];
    if (lang === 'en' && p && p.n === 1 && EN[key + '.one'] != null) s = EN[key + '.one'];   // 영어 단수형
    if (s == null) s = KO[key];
    return s == null ? key : fill(s, p);
  }
  function en() { return lang === 'en'; }
  function item(code, it) {   // 측정 항목 표시 문구 — 계산은 norms.json 원문을 그대로 쓴다
    it = it || {};
    if (!en()) return { label: it.label, unit: it.unit, hint: it.hint, domain: it.domain };
    var e = ITEM_EN[code] || {};
    return { label: e.label || it.label, unit: e.unit || it.unit, hint: it.hint ? (HINT_EN[it.hint] || it.hint) : it.hint, domain: domain(it.domain) };
  }
  function domain(ko) { return en() ? (DOMAIN_EN[ko] || ko) : ko; }
  function exercise(ko) { return en() ? (EXERCISE_EN[ko] || ko) : ko; }
  function ftype(code, ko) { return en() ? (FTYPE_EN[String(code)] || ko) : ko; }
  function sido(code, ko) { return en() ? (SIDO_EN[String(code)] || ko) : ko; }
  function tool(ko) { return en() ? (TOOL_EN[ko] || ko) : ko; }
  function src(ko) {
    if (!en()) return ko;
    if (SRC_EN[ko]) return SRC_EN[ko];
    var m = /^포털 수정일 (\S+)$/.exec(ko || '');
    return m ? 'Public Data Portal update ' + m[1] : ko;
  }
  function grade(ko) { if (!en()) return ko; var m = /^(\d)등급$/.exec(ko || ''); return m ? 'Grade ' + m[1] : ko; }
  function group(ko) {   // '남성 35~39세' → 'Men 35–39', '여성 70세 이상' → 'Women 70+'
    if (!en()) return ko;
    var m = /^(남성|여성) (\d+)~(\d+)세$/.exec(ko || '');
    if (m) return (m[1] === '남성' ? 'Men' : 'Women') + ' ' + m[2] + '–' + m[3];
    m = /^(남성|여성) (\d+)세 이상$/.exec(ko || '');
    return m ? (m[1] === '남성' ? 'Men' : 'Women') + ' ' + m[2] + '+' : ko;
  }
  function period(p) {   // '202301~202512' → '2023-01 to 2025-12'
    if (!en()) return p;
    var m = /^(\d{4})(\d{2})~(\d{4})(\d{2})$/.exec(p || '');
    return m ? m[1] + '-' + m[2] + ' to ' + m[3] + '-' + m[4] : p;
  }
  function withUnit(v, unit) {   // 한국어는 이전처럼 붙여 쓰고(41kg), 영어는 띄어 쓴다(41 kg · 32%)
    if (!en()) return v + unit;
    return unit === '%' ? v + unit : v + ' ' + unit;
  }

  // ────────── 정적 문구 — 한국어 원문을 먼저 읽어 둔다
  var snapHtml = [], snapAria = [], snapTitle = document.title;
  Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) { snapHtml.push([el, el.getAttribute('data-i18n'), el.innerHTML]); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-aria]'), function (el) { snapAria.push([el, el.getAttribute('data-i18n-aria'), el.getAttribute('aria-label')]); });
  function applyStatic() {
    snapHtml.forEach(function (s) {
      var v = en() ? STATIC_EN[s[1]] : s[2];
      if (v != null && s[0].innerHTML !== v) s[0].innerHTML = v;
    });
    snapAria.forEach(function (s) { var v = en() ? STATIC_EN[s[1]] : s[2]; if (v != null) s[0].setAttribute('aria-label', v); });
    var title = en() ? STATIC_EN['doc.title'] : snapTitle;
    if (document.title !== title) document.title = title;
    document.documentElement.setAttribute('lang', lang);
    Array.prototype.forEach.call(document.querySelectorAll('.lang-btn'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
  }

  var listeners = [];
  function set(next, save) {
    next = norm(next);
    if (!next) return;
    if (save) { try { localStorage.setItem(KEY, next); } catch (e) { /* 저장이 막혀도 이 화면에서는 바뀐다 */ } }
    if (next === lang) return;
    lang = next;
    applyStatic();
    listeners.forEach(function (fn) { try { fn(lang); } catch (e) { if (global.console) console.error(e); } });
  }

  lang = hashLang() || storedLang() || deviceLang();
  if (lang !== 'ko') applyStatic();   // 한국어는 원문 그대로 — 아무것도 바꾸지 않는다
  else Array.prototype.forEach.call(document.querySelectorAll('.lang-btn'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === 'ko')); });
  Array.prototype.forEach.call(document.querySelectorAll('.lang-btn'), function (b) {
    b.addEventListener('click', function () { set(b.getAttribute('data-lang'), true); });
  });

  global.I18N = {
    t: t, lang: function () { return lang; }, set: set, onChange: function (fn) { listeners.push(fn); },
    item: item, domain: domain, exercise: exercise, ftype: ftype, sido: sido, tool: tool, src: src, grade: grade, group: group, period: period, withUnit: withUnit,
    _dicts: { KO: KO, EN: EN, STATIC_EN: STATIC_EN, ITEM_EN: ITEM_EN, HINT_EN: HINT_EN, DOMAIN_EN: DOMAIN_EN, EXERCISE_EN: EXERCISE_EN, FTYPE_EN: FTYPE_EN, SIDO_EN: SIDO_EN, TOOL_EN: TOOL_EN, SRC_EN: SRC_EN }   // 시험용
  };
})(window);
