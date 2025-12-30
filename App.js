import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet, Text, View, FlatList, Pressable, Image, ScrollView, Linking
} from 'react-native';
import React, { useState } from 'react';
import Svg, { Path } from 'react-native-svg';

// -------------------- MOCK DATA --------------------
const MOCK_REPORTS = [
  {
    id: "r1",
    title: "“100% 수익 보장” 투자 광고 의심",
    createdAt: "2025-12-29 09:41",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    verdict: "위험",
    summary: "확정수익·원금보장 표현 + 후기 연출이 결합된 전형적 고위험 패턴입니다.",
    flags: ["확정 수익/보장 표현", "근거 부족", "후기 연출"],
    evidence: [
      "‘무조건 벌어요’, ‘원금 보장’ 같은 확정적 표현 포함",
      "성과를 입증할 외부 근거(공식자료/감사보고 등) 미제시",
      "제3자 후기처럼 보이는 자막/내레이션 구성"
    ],
  },
  {
    id: "r2",
    title: "다이어트 보조제: 7일 -5kg 주장",
    createdAt: "2025-12-28 22:10",
    youtubeUrl: "https://www.youtube.com/watch?v=3JZ_D3ELwOQ",
    thumbnail: "https://img.youtube.com/vi/3JZ_D3ELwOQ/hqdefault.jpg",
    verdict: "주의",
    summary: "개인 사례 중심 주장 + 임상 근거 부재로 과장 가능성이 있습니다.",
    flags: ["단기간 극단 효과", "임상근거 부재", "주의문구 약함"],
    evidence: [
      "단기간 감량 수치가 과하게 제시됨",
      "표본/기간/대조군 등 임상 조건 언급 없음",
      "주의 문구가 작게/짧게 표시됨"
    ],
  },
  {
    id: "r3",
    title: "게임 아이템 무료 지급 링크 유도",
    createdAt: "2025-12-27 13:02",
    youtubeUrl: "https://www.youtube.com/watch?v=L_jWHffIx5E",
    thumbnail: "https://img.youtube.com/vi/L_jWHffIx5E/hqdefault.jpg",
    verdict: "안전",
    summary: "허위 단서는 약하지만 외부 링크 유도가 있어 주의가 필요합니다.",
    flags: ["외부 링크 유도", "조건/제한 불명확"],
    evidence: [
      "무료 지급 조건(계정 연동/기간 제한)이 상세히 설명되지 않음",
      "공식 채널/공식 페이지 여부 확인 필요"
    ],
  },

  // 스크롤용 더미
  { id:"r4", title:"‘의사 추천’ 관절 영양제 광고", createdAt:"2025-12-27 10:11", youtubeUrl:"https://www.youtube.com/watch?v=kJQP7kiw5Fk", thumbnail:"https://img.youtube.com/vi/kJQP7kiw5Fk/hqdefault.jpg", verdict:"주의",
    summary:"전문가 권위 연출 대비 구체 근거가 부족합니다.", flags:["전문가 권위 차용","구체 데이터 부재"], evidence:["‘의사 추천’ 자막 반복","임상 수치/조건 설명 없음"] },
  { id:"r5", title:"‘단 1주’ 피부 미백 크림 후기 광고", createdAt:"2025-12-26 20:19", youtubeUrl:"https://www.youtube.com/watch?v=9bZkp7q19f0", thumbnail:"https://img.youtube.com/vi/9bZkp7q19f0/hqdefault.jpg", verdict:"위험",
    summary:"단기간 극단 효능 + 후기 형식 + 근거 미제시가 동시에 나타납니다.", flags:["단기간 극단 효능","후기 연출"], evidence:["7일 변화 강조","개인 후기만 제시"] },
  { id:"r6", title:"‘수강생 10만명’ 수치 출처 없는 강의 광고", createdAt:"2025-12-24 18:12", youtubeUrl:"https://www.youtube.com/watch?v=JGwWNGJdvx8", thumbnail:"https://img.youtube.com/vi/JGwWNGJdvx8/hqdefault.jpg", verdict:"안전",
    summary:"수치 과장 가능성은 있으나 위해도가 낮은 편입니다.", flags:["수치 출처 불명확"], evidence:["‘10만명’ 출처 링크 없음"] },
];

// -------------------- UTILS --------------------
function verdictColor(verdict) {
  if (verdict === "위험") return "#ff3b30";
  if (verdict === "주의") return "#ffcc66";
  return "#6fe3a5";
}

function verdictProgress(verdict) {
  if (verdict === "안전") return 0.33;
  if (verdict === "주의") return 0.66;
  return 1.00;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function normAngle(a) {
  // 0~360
  let x = a % 360;
  if (x < 0) x += 360;
  return x;
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  // ✅ 각도 정규화
  let start = normAngle(startAngle);
  let end = normAngle(endAngle);

  // ✅ 우리가 원하는 건 "시계방향으로" start -> end 를 그리는 것
  // SVG의 sweep=1은 시계방향. 근데 end가 더 작으면 wrap(360)해서 end를 크게 만들어 줘야 안정적.
  if (end <= start) end += 360;

  const s = polarToCartesian(cx, cy, r, start);
  const e = polarToCartesian(cx, cy, r, end);

  const delta = end - start; // 0~360
  const largeArc = delta > 180 ? 1 : 0;

  // sweep=1 : 시계방향
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
}


// -------------------- UI COMPONENTS --------------------
function FilterButton({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterBtn, active ? styles.filterBtnActive : styles.filterBtnInactive]}
    >
      <Text style={[styles.filterBtnText, active ? styles.filterTextActive : styles.filterTextInactive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function LinkIconButton({ onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.linkIconBtn}>
      <Text style={styles.linkIcon}>▶</Text>
    </Pressable>
  );
}

/**
 * ✅ 깨짐 방지 버전 TrustGauge
 * - 게이지는 고정 사이즈로 가운데 정렬 + overflow hidden
 * - 아래 바 tick/marker는 "onLayout으로 barWidth 측정 → px 계산"
 */
function TrustGauge({ verdict }) {
  const color = verdictColor(verdict);
  const progress = verdictProgress(verdict);

  // 게이지 (작고 얇게)
  const size = 210;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const r = 74;
  const stroke = 12;

  // ✅ 스윕 기반 (원하는 범위를 정확히 고정)
  const startA = 240;     // 시작 각도
  const sweepA = 240;     // 총 스윕(이미지 느낌)
  const endA = startA + sweepA ;

  const progEnd = startA + sweepA * progress;

  const bgPath = arcPath(cx, cy, r, startA, endA);
const fgPath = arcPath(cx, cy, r, startA, progEnd);

  const innerPath = arcPath(cx, cy, r - 22, startA, endA);
  // 아래 바 위치 계산용
  const [barWidth, setBarWidth] = useState(0);

  // verdict → 0 / 0.5 / 1
  const markerPos = verdict === "안전" ? 0 : verdict === "주의" ? 0.5 : 1;

  // dot 사이즈
  const tickSize = 14;
  const markerSize = 16;

  const leftX = 0;
  const midX = barWidth > 0 ? (barWidth * 0.5 - tickSize / 2) : 0;
  const rightX = barWidth > 0 ? (barWidth - tickSize) : 0;

  const markerX =
    barWidth === 0 ? 0 :
    markerPos === 0 ? 0 :
    markerPos === 0.5 ? (barWidth * 0.5 - markerSize / 2) :
    (barWidth - markerSize);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>광고 신뢰도</Text>

      <View style={styles.gaugeWrap}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            <Path
              d={bgPath}
              stroke="#6a6a6a"
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              opacity={0.9}
            />
            <Path
              d={innerPath}
              stroke="#7a7a7a"
              strokeWidth={5}
              strokeLinecap="round"
              fill="none"
              opacity={0.65}
            />
            <Path
              d={fgPath}
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>

          <View style={styles.gaugeCenter}>
            <Text style={[styles.centerVerdictSmall, { color }]}>{verdict}</Text>
          </View>
        </View>
      </View>

      <View
        style={styles.scaleWrapSmall}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      >
        <View style={styles.scaleLineSmall} />

        {/* ticks */}
        <View style={[styles.tickSmall, { left: leftX, width: tickSize, height: tickSize, borderRadius: 999 }]} />
        <View style={[styles.tickSmall, { left: midX, width: tickSize, height: tickSize, borderRadius: 999 }]} />
        <View style={[styles.tickSmall, { left: rightX, width: tickSize, height: tickSize, borderRadius: 999 }]} />

        {/* marker */}
        <View style={[
          styles.markerSmall,
          { left: markerX, width: markerSize, height: markerSize, borderRadius: 999 }
        ]} />

        <View style={styles.scaleLabelsSmall}>
          <Text style={[styles.scaleTextSmall, verdict === "안전" && { color: verdictColor("안전"), fontWeight: "900" }]}>안전</Text>
          <Text style={[styles.scaleTextSmall, verdict === "주의" && { color: verdictColor("주의"), fontWeight: "900" }]}>주의</Text>
          <Text style={[styles.scaleTextSmall, verdict === "위험" && { color: verdictColor("위험"), fontWeight: "900" }]}>위험</Text>
        </View>
      </View>
    </View>
  );
}

// -------------------- APP --------------------
export default function App() {
  const [screen, setScreen] = useState("list"); // list | detail
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("전체");
  const [showEvidence, setShowEvidence] = useState(false);

  const filteredReports =
    filter === "전체" ? MOCK_REPORTS : MOCK_REPORTS.filter(r => r.verdict === filter);

  const openDetail = (item) => {
    setSelected(item);
    setShowEvidence(false);
    setScreen("detail");
  };

  const goBack = () => {
    setScreen("list");
    setSelected(null);
  };

  if (screen === "list") {
    return (
      <View style={styles.container}>
        <Text style={styles.headerTitle}>AD Astra</Text>
        <Text style={styles.headerSub}>검사 기록</Text>

        <View style={styles.filterRow}>
          <FilterButton label="전체" active={filter === "전체"} onPress={() => setFilter("전체")} />
          <FilterButton label="위험" active={filter === "위험"} onPress={() => setFilter("위험")} />
          <FilterButton label="주의" active={filter === "주의"} onPress={() => setFilter("주의")} />
          <FilterButton label="안전" active={filter === "안전"} onPress={() => setFilter("안전")} />
        </View>

        <FlatList
          style={{ width: "100%", marginTop: 14 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          data={filteredReports}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const color = verdictColor(item.verdict);
            return (
              <Pressable style={styles.listCard} onPress={() => openDetail(item)}>
                <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
                <View style={{ flex: 1 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.listTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={[styles.badgeBig, { borderColor: color }]}>
                      <Text style={[styles.badgeBigText, { color }]}>{item.verdict}</Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>{item.createdAt}</Text>
                  <Text style={styles.preview} numberOfLines={2}>{item.summary}</Text>
                </View>
              </Pressable>
            );
          }}
        />

        <StatusBar style="light" />
      </View>
    );
  }

  const vColor = verdictColor(selected.verdict);

  return (
    <View style={styles.modalContainer}>
      <View style={styles.modalTopBar}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 18 }}>🚀</Text>
          <Text style={styles.modalTitle}>AD ASTRA 분석</Text>
        </View>

        <Pressable onPress={goBack} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView style={{ width: "100%" }} contentContainerStyle={{ paddingBottom: 50 }}>
        <TrustGauge verdict={selected.verdict} />

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.detailTitle} numberOfLines={2}>{selected.title}</Text>
            <LinkIconButton onPress={() => Linking.openURL(selected.youtubeUrl)} />
          </View>

          <Text style={styles.meta}>{selected.createdAt}</Text>
          <Text style={styles.body}>{selected.summary}</Text>

          <Pressable onPress={() => setShowEvidence(!showEvidence)} style={styles.moreBtn}>
            <Text style={styles.moreBtnText}>판정 근거 더보기 ▼</Text>
          </Pressable>

          {showEvidence && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.sectionTitle}>의심 신호</Text>
              {selected.flags.map((f, idx) => (
                <Text key={`flag-${idx}`} style={styles.bullet}>• {f}</Text>
              ))}

              <Text style={styles.sectionTitle}>근거</Text>
              {selected.evidence.map((e, idx) => (
                <Text key={`ev-${idx}`} style={styles.bullet}>• {e}</Text>
              ))}
            </View>
          )}

          <View style={[styles.bigVerdictPill, { borderColor: vColor }]}>
            <Text style={[styles.bigVerdictText, { color: vColor }]}>{selected.verdict}</Text>
          </View>
        </View>
      </ScrollView>

      <StatusBar style="light" />
    </View>
  );
}

// -------------------- STYLES --------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0b0b",
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  headerTitle: { color: "#fff", fontSize: 28, fontWeight: "900" },
  headerSub: { color: "#bdbdbd", marginTop: 4, fontSize: 14 },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    width: "100%",
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
    borderWidth: 1,
  },
  filterBtnActive: { backgroundColor: "#fff", borderColor: "#fff" },
  filterBtnInactive: { backgroundColor: "transparent", borderColor: "#2a2a2a" },
  filterBtnText: { fontSize: 13, fontWeight: "900" },
  filterTextActive: { color: "#111" },
  filterTextInactive: { color: "#eaeaea" },

  listCard: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1c1c1c",
    marginBottom: 12,
    backgroundColor: "#141414",
  },
  thumb: { width: 96, height: 54, borderRadius: 12, backgroundColor: "#222" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },

  listTitle: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "800" },
  meta: { marginTop: 6, color: "#a6a6a6", fontSize: 12 },
  preview: { marginTop: 6, color: "#d9d9d9", fontSize: 13, lineHeight: 18 },

  badgeBig: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 2 },
  badgeBigText: { fontSize: 16, fontWeight: "900" },

  modalContainer: { flex: 1, backgroundColor: "#0b0b0b", paddingTop: 44 },
  modalTopBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f1f",
  },
  modalTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  closeBtn: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  closeText: { color: "#fff", fontSize: 22, fontWeight: "700" },

  card: {
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 18,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#222",
    padding: 18,
  },
  cardTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },

  // ✅ 게이지 래퍼(깨짐 방지 핵심)
  gaugeWrap: {
    marginTop: 12,
    alignSelf: "center",
    overflow: "hidden",
  },

  gaugeCenter: {
    position: "absolute",
    left: 0, right: 0, top: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  centerVerdictSmall: { fontSize: 40, fontWeight: "900", letterSpacing: 1 },

  scaleWrapSmall: { width: "100%", marginTop: 6, paddingHorizontal: 8 },
  scaleLineSmall: { height: 7, backgroundColor: "#7b7b7b", borderRadius: 999, opacity: 0.8 },

  tickSmall: {
    position: "absolute",
    top: -4,
    backgroundColor: "#1a1a1a",
    borderWidth: 2,
    borderColor: "#9a9a9a",
  },
  markerSmall: {
    position: "absolute",
    top: -6,
    backgroundColor: "#1a1a1a",
    borderWidth: 3,
    borderColor: "#fff",
  },

  scaleLabelsSmall: { marginTop: 10, flexDirection: "row", justifyContent: "space-between" },
  scaleTextSmall: { color: "#d0d0d0", fontSize: 16 },

  detailTitle: { color: "#fff", fontSize: 16, fontWeight: "900", flex: 1 },
  body: { marginTop: 10, color: "#eaeaea", fontSize: 14, lineHeight: 20 },

  sectionTitle: { marginTop: 14, color: "#fff", fontSize: 14, fontWeight: "900" },
  bullet: { marginTop: 8, color: "#dcdcdc", fontSize: 14, lineHeight: 20 },

  moreBtn: { marginTop: 16, alignSelf: "flex-end", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  moreBtnText: { color: "#cfcfcf", fontSize: 16, fontWeight: "800" },

  linkIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
  },
  linkIcon: { color: "#fff", fontSize: 18, fontWeight: "900" },

  bigVerdictPill: {
    marginTop: 16,
    alignSelf: "flex-end",
    borderWidth: 2,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.03)"
  },
  bigVerdictText: { fontSize: 22, fontWeight: "900" },
});
