import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Image,
  ScrollView,
  Linking,
  TextInput,
  ActivityIndicator
} from 'react-native';
import React, { useState } from 'react';
import Svg, { Path } from 'react-native-svg';

// ✅ 환경에 맞게 수정
const API_BASE = "http://172.30.1.35:8080"; // Android Emulator 기준
// const API_BASE = "http://localhost:8080"; // iOS Simulator
// const API_BASE = "http://192.168.0.23:8080"; // 실제 폰(PC IP)

// -------------------- UTILS --------------------
function verdictColor(verdict) {
  if (verdict === "위험") return "#ff3b30";
  if (verdict === "주의") return "#ffcc66";
  return "#6fe3a5";
}
function verdictProgress(verdict) {
  if (verdict === "안전") return 1.0;
  if (verdict === "주의") return 0.66;
  return 0.33;
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
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
    return json;
  } catch (e) {
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

function parsePercentString(p) {
  if (p == null) return null;
  if (typeof p === "number") return p;
  const s = String(p).trim().replace("%", "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ✅ NPR ai_generation_rate 기준으로 verdict 결정 (필요하면 기준 조정)
function verdictFromAiRate(ratePercent) {
  if (ratePercent == null) return "주의";
  if (ratePercent >= 60) return "위험";
  if (ratePercent >= 30) return "주의";
  return "안전";
}

function normalizeVerdict(v) {
  if (v === "안전" || v === "주의" || v === "위험") return v;
  return "주의";
}

// report가 string / dict 무엇이든 대비
function summarizeReport(report) {
  if (!report) return "";
  if (typeof report === "string") return report.slice(0, 140);
  try {
    return JSON.stringify(report).slice(0, 140);
  } catch {
    return "";
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

// -------------------- GEMINI JSON RENDER UTILS --------------------
function isObj(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}
function safeText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

// -------------------- API PIPELINE (팀 백엔드 app.py 기준) --------------------
// ✅ /api/video/info    : 메타데이터(제목/썸네일/게시일 등)
// ✅ /api/video/detect  : NPR 딥페이크 분석(생성률)
// ✅ /api/video/analyze : 자막+Gemini 분석(JSON)
async function pipelineAnalyze(youtubeUrl) {
  // 1) 영상 메타
  let info = null;
  try {
    info = await fetchJson(`${API_BASE}/api/video/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: youtubeUrl }),
    });
  } catch (e) {
    info = { status: "error", message: String(e.message || e), data: null };
  }

  // 2) NPR 딥페이크 분석
  let detect = null;
  try {
    detect = await fetchJson(`${API_BASE}/api/video/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: youtubeUrl }),
    });
  } catch (e) {
    detect = { status: "error", message: String(e.message || e), data: null };
  }

  // 3) Gemini(자막 기반) 분석
  let analyze = null;
  try {
    analyze = await fetchJson(`${API_BASE}/api/video/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: youtubeUrl }),
    });
  } catch (e) {
    analyze = { status: "error", message: String(e.message || e), data: null };
  }

  // -------------------- 데이터 추출 --------------------
  const infoData = info?.data ?? null;
  const detectData = detect?.data ?? null;
  const analyzeData = analyze?.data ?? null;

  const videoId =
    infoData?.video_id ||
    detectData?.video_id ||
    analyzeData?.video_id ||
    extractYouTubeId(youtubeUrl);

  // ✅ 제목: info에서 가져오기
  const title = infoData?.title || (videoId ? `(${videoId})` : "(unknown)");

  // ✅ 썸네일: info 우선, 없으면 유튜브 기본 썸네일
  const thumbnail =
    infoData?.thumbnail_url ||
    (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null);

  // ✅ Gemini 결과(JSON): analysis_result
  const report = analyzeData?.analysis_result ?? null;

  // ✅ verdict: reliability_level만
  const verdict =
    (isObj(report) && report?.reliability_level)
      ? normalizeVerdict(report.reliability_level)
      : verdictFromAiRate(parsePercentString(detectData?.detection_result?.confidence_score));

  // ✅ summary: JSON의 summary 우선
  const summary =
    (isObj(report) && report?.summary)
      ? String(report.summary)
      : (report ? summarizeReport(report) : "");

  // ✅ 분석 상태
  const analysisStatus =
    (info?.status === "success" && detect?.status === "success" && analyze?.status === "success")
      ? "Done"
      : (info?.status === "error" || detect?.status === "error" || analyze?.status === "error")
        ? "분석 실패"
        : "Done";

  return {
    videoId,
    title,
    thumbnail,
    verdict,
    summary,
    analysisStatus,
    raw: { info, detect, analyze },
  };
}

// -------------------- UI COMPONENTS --------------------
function FilterButton({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterBtn,
        active ? styles.filterBtnActive : styles.filterBtnInactive
      ]}
    >
      <Text
        style={[
          styles.filterBtnText,
          active ? styles.filterTextActive : styles.filterTextInactive
        ]}
      >
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
  const stroke = 18;
  const pad = 12;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - stroke / 2 - pad;

  // “∩ 모양” arc
  const startA = -120;
  const endA = 120;
  const totalSweep = endA - startA;
  const progEnd = startA + totalSweep * progress;

  const bgPath = arcPath(cx, cy, r, startA, endA);
  const fgPath = arcPath(cx, cy, r, startA, progEnd);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>광고 신뢰도</Text>

      <View style={[styles.gaugeWrap, { alignItems: "center", justifyContent: "center" }]}>
        <View style={{ width: size, height: size }}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
            <Path
              d={bgPath}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d={fgPath}
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>

          <View style={styles.gaugeCenterAbs}>
            <Text style={[styles.centerVerdictSmall, { color }]}>{verdict}</Text>
          </View>
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

  const [reports, setReports] = useState([]);
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

    // 1) UX: 분석중 카드 먼저 추가
    const tempId = `tmp-${Date.now()}`;
    const tempVideoId = extractYouTubeId(url);

    const tempItem = {
      id: tempId,
      title: "분석 중...",
      createdAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      youtubeUrl: url,
      thumbnail: tempVideoId ? `https://img.youtube.com/vi/${tempVideoId}/hqdefault.jpg` : null,
      verdict: "주의",
      summary: "",
      analysisStatus: "분석중",
      raw: { status: "processing" },
    };

    setReports(prev => [tempItem, ...prev]);

    try {
      const { videoId, title, thumbnail, verdict, summary, analysisStatus, raw } =
        await pipelineAnalyze(url);

      const finalItem = {
        id: `r-${Date.now()}`,
        title, // ✅ 영상 제목
        createdAt: new Date().toISOString().replace("T", " ").slice(0, 16),
        youtubeUrl: url,
        thumbnail: thumbnail || tempItem.thumbnail,
        verdict,
        summary,
        analysisStatus: analysisStatus || "Done",
        raw: { videoId, ...raw },
      };

      // tempItem 교체
      setReports(prev => {
        const withoutTemp = prev.filter(x => x.id !== tempId);
        return [finalItem, ...withoutTemp];
      });

      setUrlInput("");
    } catch (e) {
      setReports(prev =>
        prev.map(x =>
          x.id === tempId
            ? {
              ...x,
              title: "분석 실패",
              verdict: "위험",
              summary: String(e.message || e),
              analysisStatus: "분석 실패",
              raw: { status: "error" },
            }
            : x
        )
      );
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
          <Pressable
            onPress={onAddUrl}
            style={[styles.urlBtn, loading && { opacity: 0.6 }]}
            disabled={loading}
          >
            {loading ? <ActivityIndicator /> : <Text style={styles.urlBtnText}>추가</Text>}
          </Pressable>
        </View>

        {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}

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
                  <Text style={styles.meta}>상태: {item.analysisStatus || "Done"}</Text>

                  {!!item.summary && (
                    <Text style={styles.preview} numberOfLines={2}>{item.summary}</Text>
                  )}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={{ marginTop: 30, opacity: 0.85 }}>
              <Text style={{ color: "#bdbdbd" }}>
                아직 분석 기록이 없습니다. URL을 추가해보세요.
              </Text>
            </View>
          }
        />

        <StatusBar style="light" />
      </View>
    );
  }

  const vColor = verdictColor(selected?.verdict || "주의");
  const analyzeResult = selected?.raw?.analyze?.data?.analysis_result;

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

      <ScrollView style={{ width: "100%" }} contentContainerStyle={{ paddingBottom: 60 }}>
        <TrustGauge verdict={selected?.verdict || "주의"} />

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.detailTitle} numberOfLines={2}>{selected?.title}</Text>
            <LinkIconButton
              onPress={() => selected?.youtubeUrl && Linking.openURL(selected.youtubeUrl)}
            />
          </View>

          <Text style={styles.meta}>{selected?.createdAt}</Text>
          <Text style={styles.meta}>상태: {selected?.analysisStatus || "Done"}</Text>

          {/* ✅ summary는 JSON summary를 쓰도록 pipeline에서 맞춰둠 */}
          {!!selected?.summary && <Text style={styles.body}>{selected.summary}</Text>}

          {/* ✅ Gemini JSON 박스 렌더 */}
          {isObj(analyzeResult) && (
            <View style={{ marginTop: 14, gap: 12 }}>
              {!!analyzeResult.reliability_level && (
                <View style={styles.sectionBox}>
                  <Text style={styles.sectionBoxTitle}>판정</Text>
                  <Text style={styles.sectionBoxBody}>{safeText(analyzeResult.reliability_level)}</Text>
                </View>
              )}

              {!!analyzeResult.summary && (
                <View style={styles.sectionBox}>
                  <Text style={styles.sectionBoxTitle}>요약</Text>
                  <Text style={styles.sectionBoxBody}>{safeText(analyzeResult.summary)}</Text>
                </View>
              )}

              {Array.isArray(analyzeResult.issues) && analyzeResult.issues.length > 0 && (
                <View style={styles.sectionBox}>
                  <Text style={styles.sectionBoxTitle}>주요 문제점</Text>
                  <View style={{ marginTop: 8, gap: 6 }}>
                    {analyzeResult.issues.map((it, idx) => (
                      <View key={`iss-${idx}`} style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>{safeText(it)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {isObj(analyzeResult.patent_check) && (
                <View style={styles.sectionBox}>
                  <Text style={styles.sectionBoxTitle}>특허/검증</Text>

                  {!!analyzeResult.patent_check.status && (
                    <Text style={styles.sectionBoxBody}>
                      <Text style={styles.sectionBoxLabel}>상태: </Text>
                      {safeText(analyzeResult.patent_check.status)}
                    </Text>
                  )}

                  {!!analyzeResult.patent_check.patent_number && (
                    <Text style={styles.sectionBoxBody}>
                      <Text style={styles.sectionBoxLabel}>특허번호: </Text>
                      {safeText(analyzeResult.patent_check.patent_number)}
                    </Text>
                  )}

                  {!!analyzeResult.patent_check.details && (
                    <Text style={[styles.sectionBoxBody, { marginTop: 8 }]}>
                      {safeText(analyzeResult.patent_check.details)}
                    </Text>
                  )}
                </View>
              )}

              {Array.isArray(analyzeResult.evidence) && analyzeResult.evidence.length > 0 && (
                <View style={styles.sectionBox}>
                  <Text style={styles.sectionBoxTitle}>근거 자료</Text>

                  <View style={{ marginTop: 8, gap: 10 }}>
                    {analyzeResult.evidence.map((ev, idx) => {
                      const source = ev?.source;
                      const fact = ev?.fact;
                      const url = ev?.url;

                      return (
                        <View key={`ev-${idx}`} style={styles.evidenceCard}>
                          {!!source && <Text style={styles.evidenceSource}>{safeText(source)}</Text>}
                          {!!fact && <Text style={styles.evidenceFact}>{safeText(fact)}</Text>}

                          {!!url && (
                            <Pressable onPress={() => Linking.openURL(url)} style={styles.evidenceLinkBtn}>
                              <Text style={styles.evidenceLinkText}>자료 열기</Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {!!analyzeResult.consultation && (
                <View style={styles.sectionBox}>
                  <Text style={styles.sectionBoxTitle}>권고</Text>
                  <Text style={styles.sectionBoxBody}>{safeText(analyzeResult.consultation)}</Text>
                </View>
              )}
            </View>
          )}

          <Pressable onPress={() => setShowEvidence(!showEvidence)} style={styles.moreBtn}>
            <Text style={styles.moreBtnText}>상세/원본 더보기 →</Text>
          </Pressable>

          {showEvidence && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.sectionTitle}>원본 리포트 (Gemini)</Text>
              <Text style={styles.bullet}>
                {prettyReport(analyzeResult).slice(0, 2500) || "(없음)"}
              </Text>

              <Text style={styles.sectionTitle}>NPR 결과</Text>
              <Text style={styles.bullet}>
                {prettyReport(selected?.raw?.detect).slice(0, 2000) || "(없음)"}
              </Text>

              <Text style={styles.sectionTitle}>INFO</Text>
              <Text style={styles.bullet}>
                {prettyReport(selected?.raw?.info).slice(0, 1200) || "(없음)"}
              </Text>
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
    backgroundColor: "#101114", // ✅ 좀 더 밝게
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  headerTitle: { color: "#fff", fontSize: 28, fontWeight: "900" },
  headerSub: { color: "#c6c6c6", marginTop: 4, fontSize: 14 },

  // ✅ URL 입력 UI
  urlRow: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  urlInput: {
    flex: 1,
    backgroundColor: "#1b1c20",
    borderWidth: 1,
    borderColor: "#2a2b32",
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

  filterRow: { flexDirection: "row", gap: 8, marginTop: 16, width: "100%" },
  filterBtn: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center", borderWidth: 1 },
  filterBtnActive: { backgroundColor: "#fff", borderColor: "#fff" },
  filterBtnInactive: { backgroundColor: "transparent", borderColor: "#3a3b45" },
  filterBtnText: { fontSize: 13, fontWeight: "900" },
  filterTextActive: { color: "#111" },
  filterTextInactive: { color: "#f0f0f0" },

  listCard: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2b2c35",
    marginBottom: 12,
    backgroundColor: "#1a1b20",
  },
  thumb: { width: 96, height: 54, borderRadius: 12, backgroundColor: "#2a2a2a" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  listTitle: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "800" },
  meta: { marginTop: 6, color: "#c0c0c0", fontSize: 12 },
  preview: { marginTop: 6, color: "#ededed", fontSize: 13, lineHeight: 18 },
  badgeBig: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 2 },
  badgeBigText: { fontSize: 16, fontWeight: "900" },

  modalContainer: { flex: 1, backgroundColor: "#101114", paddingTop: 44 },
  modalTopBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#2a2b32",
  },
  modalTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  closeBtn: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  closeText: { color: "#fff", fontSize: 22, fontWeight: "700" },

  card: {
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 18,
    backgroundColor: "#1f2024", // ✅ 좀 더 밝게
    borderWidth: 1,
    borderColor: "#2e2f35",
    padding: 16,
  },
  cardTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },

  gaugeWrap: { marginTop: 12, alignSelf: "center", overflow: "hidden" },
  gaugeCenterAbs: {
    position: "absolute",
    left: 0, right: 0, top: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  centerVerdictSmall: { fontSize: 44, fontWeight: "900", letterSpacing: 1 },

  detailTitle: { color: "#fff", fontSize: 16, fontWeight: "900", flex: 1 },
  body: { marginTop: 10, color: "#f0f0f0", fontSize: 14, lineHeight: 20 },

  sectionTitle: { marginTop: 14, color: "#fff", fontSize: 14, fontWeight: "900" },
  bullet: { marginTop: 8, color: "#e6e6e6", fontSize: 14, lineHeight: 20 },

  moreBtn: { marginTop: 16, alignSelf: "flex-end", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  moreBtnText: { color: "#e0e0e0", fontSize: 16, fontWeight: "800" },

  linkIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3a3a3a",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#15161a",
  },
  linkIcon: { color: "#fff", fontSize: 18, fontWeight: "900" },

  bigVerdictPill: {
    marginTop: 16,
    alignSelf: "flex-end",
    borderWidth: 2,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  bigVerdictText: { fontSize: 22, fontWeight: "900" },

  // ✅ Gemini JSON 섹션 박스 UI
  sectionBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#31323b",
    backgroundColor: "#181a20",
    padding: 14,
  },
  sectionBoxTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 8,
  },
  sectionBoxBody: {
    color: "#e7e7e7",
    fontSize: 14,
    lineHeight: 20,
  },
  sectionBoxLabel: {
    color: "#bdbdbd",
    fontWeight: "900",
  },

  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bulletDot: {
    color: "#d7d7d7",
    fontSize: 16,
    lineHeight: 20,
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    color: "#e7e7e7",
    fontSize: 14,
    lineHeight: 20,
  },

  evidenceCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2c2d36",
    backgroundColor: "#121318",
    padding: 12,
  },
  evidenceSource: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  evidenceFact: {
    marginTop: 6,
    color: "#e0e0e0",
    fontSize: 13,
    lineHeight: 18,
  },
  evidenceLinkBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3b3c46",
    backgroundColor: "#1a1b20",
  },
  evidenceLinkText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
});
