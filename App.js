import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet, Text, View, FlatList, Pressable, Image, ScrollView, Linking, TextInput, ActivityIndicator
} from 'react-native';
import React, { useMemo, useState } from 'react';
import Svg, { Path } from 'react-native-svg';

// ✅ 환경에 맞게 수정
const API_BASE = "http://10.243.117.150:8080"; // Android Emulator 기준
// const API_BASE = "http://localhost:8080"; // iOS Simulator
// const API_BASE = "http://192.168.0.23:8080"; // 실제 폰(PC IP)


// -------------------- UTILS --------------------
function verdictColor(verdict) {
  if (verdict === "위험") return "#ff3b30";
  if (verdict === "주의") return "#ffcc66";
  return "#6fe3a5";
}

function verdictProgress(verdict) {
  if (verdict === "안전") return 0.28;
  if (verdict === "주의") return 0.62;
  return 0.88;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) <= 180 ? "0" : "1";
  const sweep = "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}

// ✅ 서버가 JSON 대신 HTML(에러페이지) 보내도 안 죽게 하는 파서
async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text(); // ✅ 먼저 text로 받음

  try {
    const json = JSON.parse(text);
    if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
    return json;
  } catch (e) {
    // JSON이 아니면(대부분 HTML 404/500 페이지)
    throw new Error(`Not JSON response (HTTP ${res.status}). head=${text.slice(0, 80)}`);
  }
}

function extractYouTubeId(url) {
  if (!url) return null;
  const m1 = url.match(/[?&]v=([^&]+)/);
  if (m1?.[1]) return m1[1];
  const m2 = url.match(/youtu\.be\/([^?&]+)/);
  if (m2?.[1]) return m2[1];
  const m3 = url.match(/shorts\/([^?&]+)/);
  if (m3?.[1]) return m3[1];
  return null;
}

function normalizeVerdict(v) {
  if (v === "안전" || v === "주의" || v === "위험") return v;
  // report에서 안 나오면 일단 "주의"
  return "주의";
}

// report가 string / dict 무엇이든 대비
function summarizeReport(report) {
  if (!report) return "분석 결과가 없습니다.";
  if (typeof report === "string") return report.slice(0, 140);
  try {
    return JSON.stringify(report).slice(0, 140);
  } catch {
    return "분석 완료";
  }
}

function prettyReport(report) {
  if (!report) return "";
  if (typeof report === "string") return report;
  try {
    return JSON.stringify(report, null, 2);
  } catch {
    return String(report);
  }
}


// -------------------- API PIPELINE (app.py 그대로 사용) --------------------
async function pipelineAnalyze(youtubeUrl) {
  // 1) extract
  const extract = await fetchJson(`${API_BASE}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: youtubeUrl }),
  });

  const videoId = extract.video_id || extractYouTubeId(youtubeUrl);
  const storagePath = extract.storage_path;

  // 2) analyze-youtube (자막 + gemini)
  const ay = await fetchJson(`${API_BASE}/analyze-youtube`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_url: youtubeUrl,
      languages: ["ko", "en"],
      // prompt: 필요하면 추가
    }),
  });

  const report = ay.report;

  // 3) (선택) npr 분석: extract가 저장한 video.mp4 경로를 사용
  // 백엔드 저장 구조가 다르면 이 부분만 맞추면 됨.
  let npr = null;
  try {
    const videoPath = `${storagePath}/video.mp4`;
    npr = await fetchJson(`${API_BASE}/analyze/npr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_path: videoPath }),
    });
  } catch (e) {
    // npr 실패해도 전체는 성공 처리
    npr = { status: "error", message: String(e.message || e) };
  }

  return { videoId, storagePath, report, npr };
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

function TrustGauge({ verdict }) {
  const color = verdictColor(verdict);
  const progress = verdictProgress(verdict);

  const size = 210;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const r = 74;
  const stroke = 12;

  const startA = 210;
  const endA = -30;
  const totalSweep = endA - startA; // -240
  const progEnd = startA + totalSweep * progress;

  const bgPath = arcPath(cx, cy, r, startA, endA);
  const fgPath = arcPath(cx, cy, r, startA, progEnd);
  const innerPath = arcPath(cx, cy, r - 22, startA, endA);

  const [barWidth, setBarWidth] = useState(0);
  const markerPos = verdict === "안전" ? 0 : verdict === "주의" ? 0.5 : 1;

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

        <View style={[styles.tickSmall, { left: leftX, width: tickSize, height: tickSize, borderRadius: 999 }]} />
        <View style={[styles.tickSmall, { left: midX, width: tickSize, height: tickSize, borderRadius: 999 }]} />
        <View style={[styles.tickSmall, { left: rightX, width: tickSize, height: tickSize, borderRadius: 999 }]} />

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

  // ✅ 서버 통합용 state
  const [reports, setReports] = useState([]); // MOCK_REPORTS 대신
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const filteredReports =
    filter === "전체" ? reports : reports.filter(r => r.verdict === filter);

  const openDetail = (item) => {
    setSelected(item);
    setShowEvidence(false);
    setScreen("detail");
  };

  const goBack = () => {
    setScreen("list");
    setSelected(null);
  };

  async function onAddUrl() {
    const url = urlInput.trim();
    if (!url) return;

    setLoading(true);
    setErrorText("");

    // 1) UI에 "분석중" 카드 먼저 추가(UX)
    const tempId = `tmp-${Date.now()}`;
    const tempVideoId = extractYouTubeId(url);
    const tempItem = {
      id: tempId,
      title: "분석 중...",
      createdAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      youtubeUrl: url,
      thumbnail: tempVideoId ? `https://img.youtube.com/vi/${tempVideoId}/hqdefault.jpg` : null,
      verdict: "주의",
      summary: "서버에서 데이터를 수집/분석 중입니다…",
      flags: [],
      evidence: [],
      raw: { status: "processing" },
    };

    setReports(prev => [tempItem, ...prev]);

    try {
      const { videoId, storagePath, report, npr } = await pipelineAnalyze(url);

      // ✅ 결과를 하나의 report 카드로 정리
      const finalVerdict = normalizeVerdict(
        // report가 dict면 report.verdict를 기대할 수 있지만, 지금은 형식이 불명이라 기본값 유지
        (typeof report === "object" && report?.verdict) ? report.verdict : "주의"
      );

      const summary = summarizeReport(report);

      const finalItem = {
        id: `r-${Date.now()}`,
        title: `YouTube 분석 (${videoId || "unknown"})`,
        createdAt: new Date().toISOString().replace("T", " ").slice(0, 16),
        youtubeUrl: url,
        thumbnail: (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : tempItem.thumbnail),
        verdict: finalVerdict,
        summary,
        flags: [],
        evidence: [],
        raw: { videoId, storagePath, report, npr },
      };

      // tempItem 교체
      setReports(prev => {
        const withoutTemp = prev.filter(x => x.id !== tempId);
        return [finalItem, ...withoutTemp];
      });

      setUrlInput("");
    } catch (e) {
      // tempItem을 에러 카드로 교체
      setReports(prev => prev.map(x => x.id === tempId ? {
        ...x,
        title: "분석 실패",
        verdict: "위험",
        summary: String(e.message || e),
        raw: { status: "error" },
      } : x));

      setErrorText(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  if (screen === "list") {
    return (
      <View style={styles.container}>
        <Text style={styles.headerTitle}>AD Astra</Text>
        <Text style={styles.headerSub}>검사 기록</Text>

        {/* ✅ URL 입력 */}
        <View style={styles.urlRow}>
          <TextInput
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder="YouTube URL 붙여넣기"
            placeholderTextColor="#7f7f7f"
            style={styles.urlInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable onPress={onAddUrl} style={[styles.urlBtn, loading && { opacity: 0.6 }]}>
            {loading ? <ActivityIndicator /> : <Text style={styles.urlBtnText}>추가</Text>}
          </Pressable>
        </View>

        {!!errorText && (
          <Text style={styles.errorText}>{errorText}</Text>
        )}

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
                {item.thumbnail ? (
                  <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
                ) : (
                  <View style={styles.thumb} />
                )}
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
          ListEmptyComponent={
            <View style={{ marginTop: 30, opacity: 0.8 }}>
              <Text style={{ color: "#bdbdbd" }}>아직 분석 기록이 없습니다. URL을 추가해보세요.</Text>
            </View>
          }
        />

        <StatusBar style="light" />
      </View>
    );
  }

  const vColor = verdictColor(selected?.verdict || "주의");

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
        <TrustGauge verdict={selected?.verdict || "주의"} />

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.detailTitle} numberOfLines={2}>{selected?.title}</Text>
            <LinkIconButton onPress={() => selected?.youtubeUrl && Linking.openURL(selected.youtubeUrl)} />
          </View>

          <Text style={styles.meta}>{selected?.createdAt}</Text>
          <Text style={styles.body}>{selected?.summary}</Text>

          <Pressable onPress={() => setShowEvidence(!showEvidence)} style={styles.moreBtn}>
            <Text style={styles.moreBtnText}>상세/원본 더보기 →</Text>
          </Pressable>

          {showEvidence && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.sectionTitle}>원본 리포트</Text>
              <Text style={styles.bullet}>
                {prettyReport(selected?.raw?.report).slice(0, 2500) || "(없음)"}
              </Text>

              <Text style={styles.sectionTitle}>NPR 결과</Text>
              <Text style={styles.bullet}>
                {prettyReport(selected?.raw?.npr).slice(0, 1200) || "(없음)"}
              </Text>

              <Text style={styles.sectionTitle}>저장 경로</Text>
              <Text style={styles.bullet}>• {selected?.raw?.storagePath || "(없음)"}</Text>
              <Text style={styles.bullet}>• video_id: {selected?.raw?.videoId || "(없음)"}</Text>
            </View>
          )}

          <View style={[styles.bigVerdictPill, { borderColor: vColor }]}>
            <Text style={[styles.bigVerdictText, { color: vColor }]}>{selected?.verdict}</Text>
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

  // ✅ URL 입력 UI
  urlRow: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  urlInput: {
    flex: 1,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#1c1c1c",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
  },
  urlBtn: {
    width: 76,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  urlBtnText: { color: "#111", fontWeight: "900" },

  errorText: { marginTop: 10, color: "#ff8b8b", fontSize: 12 },

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
    padding: 16,
  },
  cardTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },

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

  centerVerdictSmall: { fontSize: 44, fontWeight: "900", letterSpacing: 1 },

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
