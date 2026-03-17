/**
 * 셔틀버스 운행이력 Mock 데이터 생성기
 * 검단역 ↔ 로얄파크씨티 PRUGIO 셔틀 경로 시뮬레이션
 */
const MockData = (() => {
  // 시드 기반 난수 생성기 (동일 조건이면 동일 데이터)
  function createRng(seed) {
    let s = Math.abs(seed) || 1;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  const VEHICLES = ['BUS-001', 'BUS-002', 'BUS-003'];

  // 검단역 ↔ 로얄파크씨티 경로 웨이포인트 [lat, lng]
  const WAYPOINTS = [
    [37.5963, 126.6712], // 검단역
    [37.5955, 126.6728],
    [37.5948, 126.6742],
    [37.5940, 126.6755],
    [37.5932, 126.6768], // 검단사거리
    [37.5925, 126.6780],
    [37.5918, 126.6792],
    [37.5912, 126.6803],
    [37.5905, 126.6815],
    [37.5898, 126.6825], // 중간지점
    [37.5892, 126.6835],
    [37.5886, 126.6843],
    [37.5880, 126.6850],
    [37.5876, 126.6856],
    [37.5873, 126.6862], // 로얄파크씨티
  ];

  // 웨이포인트 사이를 보간하여 상세 경로 생성
  function buildRoute(rng, reverse) {
    const wps = reverse ? [...WAYPOINTS].reverse() : WAYPOINTS;
    const points = [];
    for (let i = 0; i < wps.length - 1; i++) {
      const steps = 5 + Math.floor(rng() * 4);
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        points.push([
          wps[i][0] + (wps[i + 1][0] - wps[i][0]) * t + (rng() - 0.5) * 0.00008,
          wps[i][1] + (wps[i + 1][1] - wps[i][1]) * t + (rng() - 0.5) * 0.00008,
        ]);
      }
    }
    points.push(wps[wps.length - 1]);
    return points;
  }

  // 셔틀 운행 패턴 속도 생성
  function generateSpeed(index, total, rng) {
    const progress = index / total;
    // 정류장 부근 (출발, 중간, 도착): 정차/서행
    if (progress < 0.04 || Math.abs(progress - 0.5) < 0.02 || progress > 0.96) {
      return Math.floor(rng() * 5);
    }
    // 간헐적 교통 정체
    if (rng() < 0.08) return 3 + Math.floor(rng() * 12);
    // 드물게 과속
    if (rng() < 0.03) return 61 + Math.floor(rng() * 14);
    // 정상 주행
    return 20 + Math.floor(rng() * 30);
  }

  /**
   * GPS 로그 생성
   * @param {string} vehicleId - 차량 ID (e.g. 'BUS-001')
   * @param {string} date - 날짜 (e.g. '2026-03-11')
   * @param {number} startH - 시작 시 (0-23)
   * @param {number} startM - 시작 분 (0 또는 30)
   * @param {number} durationMin - 조회 간격 (30 또는 60)
   * @returns {Array} GPS 로그 배열
   */
  function generateLogs(vehicleId, date, startH, startM, durationMin) {
    const seed = vehicleId.charCodeAt(4) * 10000 +
      parseInt(date.replace(/-/g, '')) % 10000 +
      startH * 100 + startM;
    const rng = createRng(seed);
    const route = buildRoute(rng, startH % 2 === 1);
    const totalLogs = Math.floor(durationMin * 60 / 5); // 5초 간격
    const logs = [];

    for (let i = 0; i < totalLogs; i++) {
      const totalSec = startH * 3600 + startM * 60 + i * 5;
      const h = Math.floor(totalSec / 3600) % 24;
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const routeIdx = Math.min(
        Math.floor(i / totalLogs * route.length),
        route.length - 1
      );

      logs.push({
        id: i + 1,
        vehicleId,
        date,
        timeStr: String(h).padStart(2, '0') + ':' +
          String(m).padStart(2, '0') + ':' +
          String(s).padStart(2, '0'),
        lat: route[routeIdx][0],
        lng: route[routeIdx][1],
        speed: generateSpeed(i, totalLogs, rng),
      });
    }
    return logs;
  }

  // 조회 가능 시간대 (30분 단위, 06:00 ~ 22:00)
  function getTimeSlots() {
    const slots = [];
    for (let h = 6; h <= 22; h++) {
      slots.push(String(h).padStart(2, '0') + ':00');
      if (h < 22) slots.push(String(h).padStart(2, '0') + ':30');
    }
    return slots;
  }

  // CSV 변환
  function toCSV(logs) {
    const header = '로그번호,차량ID,날짜,시간,위도,경도,속도(km/h)\n';
    return header + logs.map(l =>
      [l.id, l.vehicleId, l.date, l.timeStr,
        l.lat.toFixed(6), l.lng.toFixed(6), l.speed].join(',')
    ).join('\n');
  }

  // 위경도 → 픽셀 좌표 변환 (지도 영역 내 매핑)
  function toPixels(logs, width, height, padding) {
    padding = padding || 30;
    if (!logs.length) return [];
    const lats = logs.map(l => l.lat);
    const lngs = logs.map(l => l.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const rangeLat = maxLat - minLat || 0.001;
    const rangeLng = maxLng - minLng || 0.001;
    const scaleX = (width - 2 * padding) / rangeLng;
    const scaleY = (height - 2 * padding) / rangeLat;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (width - rangeLng * scale) / 2;
    const offsetY = (height - rangeLat * scale) / 2;

    return logs.map(l => ({
      x: offsetX + (l.lng - minLng) * scale,
      y: offsetY + (maxLat - l.lat) * scale,
    }));
  }

  return { VEHICLES, generateLogs, getTimeSlots, toCSV, toPixels };
})();
