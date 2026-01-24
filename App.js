import { StatusBar } from "expo-status-bar";
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
  ActivityIndicator,
} from "react-native";
import React, { useMemo, useState, useEffect } from "react"; // ✅ useEffect 추가
import Svg, { Path } from "react-native-svg";
import * as ExpoLinking from 'expo-linking'; // ✅ Expo Linking 추가

/**
 * ✅ 백엔드(팀 app.py) 기준
 */
const API_ROOT = "https://uncloistral-pseudoheroical-milena.ngrok-free.dev";
const EP_INFO = `${API_ROOT}/api/video/info`;
const EP_DETECT = `${API_ROOT}/api/video/detect`;
const EP_ANALYZE = `${API_ROOT}/api/video/analyze`;

// -------------------- UTILS --------------------
function verdictColor(verdict) {
  if (verdict === "위험") return "#ff3b30";
  if (verdict === "주의") return "#ffcc66";
  if (verdict === "안전") return "#6fe3a5";
  return "#9aa0a6";
}
function verdictProgress(verdict) {
  if (verdict === "안전") return 1.0;
  if (verdict === "주의") return 0.66;
  if (verdict === "위험") return 0.33;
  return 0.5;
}
function aiRateColor(ratePercent) {
  if (ratePercent == null || !Number.isFinite(ratePercent)) return "#9aa0a6";
  if (ratePercent <= 33) return "#6fe3a5";
  if (ratePercent <= 66) return "#ffcc66";
  return "#ff3b30";
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

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
    return json;
  } catch {
    throw new Error(`Not JSON response (HTTP ${res.status}). head=${text.slice(0, 120)}`);
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
function normalizeVerdict(v) {
  if (v === "안전" || v === "주의" || v === "위험") return v;
  return "주의";
}
function summarizeReport(report) {
  if (!report) return "";
  if (typeof report === "string") return report.slice(0, 140);
  try {
    return JSON.stringify(report).slice(0, 140);
  } catch {
    return "";
  }
}
function isObj(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}
function safeText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
function formatKST(isoLike) {
  try {
    const d = new Date(isoLike);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return String(isoLike);
  }
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
function ChipButton({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MiniGauge({ label, mainText, color, progress }) {
  const size = 190;
  const stroke = 18;
  const pad = 12;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - stroke / 2 - pad;

  const startA = -120;
  const endA = 120;
  const progEnd = startA + (endA - startA) * progress;

  const bgPath = arcPath(cx, cy, r, startA, endA);
  const fgPath = arcPath(cx, cy, r, startA, progEnd);

  return (
    <View style={styles.gaugeCell}>
      <View style={{ width: size, height: size }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
          <Path d={bgPath} stroke="rgba(255,255,255,0.30)" strokeWidth={stroke} strokeLinecap="round" fill="none" />
          <Path d={fgPath} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        </Svg>
        <View style={styles.gaugeCenterAbs}>
          <Text style={[styles.gaugeMainText, { color }]}>{mainText}</Text>
        </View>
      </View>
      <Text style={styles.gaugeLabel}>{label}</Text>
    </View>
  );
}

// -------------------- MAIN APP --------------------
export default function App() {
  const [screen, setScreen] = useState("list");
  const [selected, setSelected] = useState(null);

  const [reports, setReports] = useState([]);
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [filter, setFilter] = useState("전체");
  const [searchText, setSearchText] = useState("");
  const [dateFilter, setDateFilter] = useState("전체");
  const [expanded, setExpanded] = useState(false);

  // ✅ [공유 기능 핵심] 외부 URL 감지 로직
  useEffect(() => {
    const handleDeepLink = (event) => {
      let { url } = event;
      if (url) processSharedUrl(url);
    };

    // 초기 실행 시 URL 확인
    ExpoLinking.getInitialURL().then((url) => {
      if (url) processSharedUrl(url);
    });

    const subscription = ExpoLinking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, []);

  const processSharedUrl = (url) => {
    // expo-share-intent 등을 통해 전달된 실제 유튜브 URL 추출
    // 보통 쿼리 파라미터나 전체 URL 문자열로 들어옵니다.
    const decodedUrl = decodeURIComponent(url);
    const youtubeMatch = decodedUrl.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\S+/);
    if (youtubeMatch) {
      const targetUrl = youtubeMatch[0];
      handleAutoAnalyze(targetUrl);
    }
  };

  const handleAutoAnalyze = (url) => {
    // 기존 onAddUrl 로직을 재사용하되 파라미터를 받음
    onAddUrl(url);
  };

  const filteredReports = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);

    return reports
      .filter((item) => {
        const title = (item.title || "").toLowerCase();
        const matchSearch = title.includes(searchText.toLowerCase());
        const matchCategory = filter === "전체" || item.verdict === filter;

        const t = item.createdAtISO ? new Date(item.createdAtISO) : new Date(0);
        let matchDate = true;

        if (dateFilter === "오늘") {
          const itemDay = t.toISOString().split("T")[0];
          matchDate = itemDay === todayStr;
        } else if (dateFilter === "1주일") {
          matchDate = t >= oneWeekAgo && t <= now;
        }
        return matchSearch && matchCategory && matchDate;
      })
      .sort((a, b) => new Date(b.createdAtISO || 0) - new Date(a.createdAtISO || 0));
  }, [reports, searchText, filter, dateFilter]);

  const openDetail = (item) => {
    setSelected(item);
    setExpanded(false);
    setScreen("detail");
  };
  const goBack = () => {
    setScreen("list");
    setSelected(null);
    setExpanded(false);
  };

  function patchReport(tempId, patch) {
    setReports((prev) =>
      prev.map((x) => (x.id === tempId ? { ...x, ...patch } : x))
    );
    setSelected((prevSel) => (prevSel?.id === tempId ? { ...prevSel, ...patch } : prevSel));
  }

  async function startParallelUpdate(tempId, youtubeUrl) {
    const body = JSON.stringify({ url: youtubeUrl });
    const options = { method: "POST", headers: { "Content-Type": "application/json" }, body };

    const pInfo = fetchJson(EP_INFO, options);
    const pDetect = fetchJson(EP_DETECT, options);
    const pAnalyze = fetchJson(EP_ANALYZE, options);

    pInfo
      .then((info) => {
        const d = info?.data || {};
        const videoId = d.video_id || extractYouTubeId(youtubeUrl);
        patchReport(tempId, {
          video_id: videoId,
          title: d.title || "제목 없음",
          thumbnail: d.thumbnail_url || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null),
          publishedAt: d.published_at || null,
        });
        setReports((prev) => prev.map((x) => x.id === tempId ? { ...x, raw: { ...(x.raw || {}), info } } : x));
        setSelected((prevSel) => prevSel?.id === tempId ? { ...prevSel, raw: { ...(prevSel.raw || {}), info } } : prevSel);
      })
      .catch((e) => {
        setReports((prev) => prev.map((x) => x.id === tempId ? { ...x, raw: { ...(x.raw || {}), info: { status: "error", message: String(e.message || e) } } } : x));
      });

    pDetect
      .then((detect) => {
        const dd = detect?.data || {};
        const score = dd?.detection_result?.confidence_score;
        const aiRateRaw = parsePercentString(score);
        const aiRate = aiRateRaw == null ? null : Math.max(0, Math.min(100, aiRateRaw));
        const aiProgress = aiRate == null ? 0.0 : aiRate / 100;

        patchReport(tempId, { aiRate, aiProgress });
        setReports((prev) => prev.map((x) => x.id === tempId ? { ...x, raw: { ...(x.raw || {}), detect } } : x));
        setSelected((prevSel) => prevSel?.id === tempId ? { ...prevSel, raw: { ...(prevSel.raw || {}), detect } } : prevSel);
      })
      .catch((e) => {
        setReports((prev) => prev.map((x) => x.id === tempId ? { ...x, raw: { ...(x.raw || {}), detect: { status: "error", message: String(e.message || e) } } } : x));
      });

    pAnalyze
      .then((analyze) => {
        const ad = analyze?.data || {};
        const report = ad?.analysis_result ?? null;
        const verdict = isObj(report) && report?.reliability_level ? normalizeVerdict(report.reliability_level) : "주의";
        const summary = isObj(report) && report?.summary ? String(report.summary) : (report ? summarizeReport(report) : "");

        patchReport(tempId, { verdict, summary, report });
        setReports((prev) => prev.map((x) => x.id === tempId ? { ...x, raw: { ...(x.raw || {}), analyze } } : x));
        setSelected((prevSel) => prevSel?.id === tempId ? { ...prevSel, raw: { ...(prevSel.raw || {}), analyze } } : prevSel);
      })
      .catch((e) => {
        setReports((prev) => prev.map((x) => x.id === tempId ? { ...x, raw: { ...(x.raw || {}), analyze: { status: "error", message: String(e.message || e) } } } : x));
      });

    const settled = await Promise.allSettled([pInfo, pDetect, pAnalyze]);
    const anyRejected = settled.some((s) => s.status === "rejected");
    patchReport(tempId, { analysisStatus: anyRejected ? "분석 일부 실패" : "Done" });
  }

  // ✅ 파라미터(sharedUrl)가 있을 경우 이를 우선 사용하도록 보강
  async function onAddUrl(sharedUrl) {
    const url = (typeof sharedUrl === 'string' ? sharedUrl : urlInput).trim();
    if (!url) return;

    setLoading(true);
    setErrorText("");

    const nowIso = new Date().toISOString();
    const tempId = `tmp-${Date.now()}`;
    const tempVideoId = extractYouTubeId(url);

    const tempItem = {
      id: tempId,
      video_id: tempVideoId || null,
      title: "분석 중...",
      createdAtISO: nowIso,
      youtubeUrl: url,
      thumbnail: tempVideoId ? `https://img.youtube.com/vi/${tempVideoId}/hqdefault.jpg` : null,
      verdict: "주의",
      summary: "요약 생성 중...",
      analysisStatus: "분석중",
      publishedAt: null,
      aiRate: null,
      aiProgress: 0.0,
      report: null,
      raw: {},
    };

    setReports((prev) => [tempItem, ...prev]);
    setUrlInput("");

    try {
      await startParallelUpdate(tempId, url);
    } catch (e) {
      patchReport(tempId, {
        title: "분석 실패",
        verdict: "위험",
        summary: String(e.message || e),
        analysisStatus: "분석 실패",
      });
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
          <Pressable onPress={() => onAddUrl()} style={[styles.urlBtn, loading && { opacity: 0.6 }]} disabled={loading}>
            {loading ? <ActivityIndicator /> : <Text style={styles.urlBtnText}>추가</Text>}
          </Pressable>
        </View>

        {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}

        <View style={styles.searchRow}>
          <Text style={{ color: "#bdbdbd", marginRight: 8 }}>🔍</Text>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="제목 검색"
            placeholderTextColor="#8a8a8a"
            style={styles.searchField}
          />
        </View>

        <View style={styles.dateRow}>
          {["전체", "오늘", "1주일"].map((d) => (
            <ChipButton key={d} label={d} active={dateFilter === d} onPress={() => setDateFilter(d)} />
          ))}
        </View>

        <View style={styles.filterRow}>
          {["전체", "위험", "주의", "안전"].map((l) => (
            <FilterButton key={l} label={l} active={filter === l} onPress={() => setFilter(l)} />
          ))}
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
                  <View style={[styles.thumb, { justifyContent: "center", alignItems: "center" }]}>
                    <ActivityIndicator size="small" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.listTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={[styles.badgeBig, { borderColor: color }]}>
                      <Text style={[styles.badgeBigText, { color }]}>{item.verdict}</Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>검사: {item.createdAtISO ? formatKST(item.createdAtISO) : "(없음)"}</Text>
                  <Text style={styles.meta}>상태: {item.analysisStatus || "Done"}</Text>
                  {!!item.summary && (
                    <Text style={styles.preview} numberOfLines={2}>{item.summary}</Text>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
        <StatusBar style="light" />
      </View>
    );
  }

  const factVerdict = selected?.verdict || "주의";
  const factColor = verdictColor(factVerdict);
  const aiRate = selected?.aiRate;
  const aiColor = aiRateColor(aiRate);
  const aiProgress = typeof selected?.aiProgress === "number" ? selected.aiProgress : 0.0;
  const aiCenterText = aiRate == null ? "--%" : `${Math.round(aiRate)}%`;

  const report = selected?.report;
  const issues = isObj(report) && Array.isArray(report.issues) ? report.issues : [];
  const evidence = isObj(report) && Array.isArray(report.evidence) ? report.evidence : [];

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

      <ScrollView style={{ width: "100%" }} contentContainerStyle={{ paddingBottom: 70 }}>
        <View style={styles.bigCard}>
          <Text style={styles.bigCardTitle}>광고 신뢰도</Text>
          <View style={styles.gaugesRow}>
            <MiniGauge label="사실 확인" mainText={factVerdict} color={factColor} progress={verdictProgress(factVerdict)} />
            <MiniGauge label="AI 생성률" mainText={aiCenterText} color={aiColor} progress={aiProgress} />
          </View>
        </View>

        <View style={styles.bigCard}>
          <View style={styles.detailTopRow}>
            <Text style={styles.detailTitle} numberOfLines={2}>{selected?.title}</Text>
            <Pressable onPress={() => selected?.youtubeUrl && Linking.openURL(selected.youtubeUrl)} style={styles.playBtn}>
              <Text style={styles.playIcon}>▶</Text>
            </Pressable>
          </View>

          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>검사 시각 </Text>
            <Text style={styles.metaValue}>{selected?.createdAtISO ? formatKST(selected.createdAtISO) : "(없음)"}</Text>
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>영상 제작 </Text>
            <Text style={styles.metaValue}>{selected?.publishedAt ? formatKST(selected.publishedAt) : "(없음)"}</Text>
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>검사 상태 </Text>
            <Text style={styles.metaValue}>{selected?.analysisStatus || "Done"}</Text>
          </Text>

          {!!selected?.summary && <Text style={styles.summaryText}>{selected.summary}</Text>}

          <Pressable onPress={() => setExpanded(!expanded)} style={styles.expandBtn}>
            <Text style={styles.expandText}>판정 근거 더보기 {expanded ? "▲" : "▼"}</Text>
          </Pressable>

          {expanded && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.sectionHeader}>의심 신호</Text>
              {issues.length === 0 ? (
                <Text style={styles.sectionBodyMuted}>표시할 의심 신호가 없습니다.</Text>
              ) : (
                <View style={{ marginTop: 10, gap: 10 }}>
                  {issues.map((it, idx) => (
                    <View key={`iss-${idx}`} style={styles.bulletRow}>
                      <Text style={styles.bulletDot}>•</Text>
                      <Text style={styles.bulletText}>{safeText(it)}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text style={[styles.sectionHeader, { marginTop: 22 }]}>근거</Text>
              {evidence.length === 0 ? (
                <Text style={[styles.sectionBodyMuted, { marginTop: 10 }]}>표시할 근거가 없습니다.</Text>
              ) : (
                <View style={{ marginTop: 10, gap: 12 }}>
                  {evidence.map((ev, idx) => {
                    const source = ev?.source;
                    const fact = ev?.fact;
                    const url = ev?.url;
                    return (
                      <View key={`ev-${idx}`} style={styles.evidenceBox}>
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
              )}
            </View>
          )}

          <View style={[styles.verdictPill, { borderColor: factColor }]}>
            <Text style={[styles.verdictPillText, { color: factColor }]}>{factVerdict}</Text>
          </View>
        </View>
      </ScrollView>
      <StatusBar style="light" />
    </View>
  );
}

// -------------------- STYLES (건드리지 않음) --------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#101114", alignItems: "center", paddingTop: 60, paddingHorizontal: 16 },
  headerTitle: { color: "#fff", fontSize: 28, fontWeight: "900" },
  headerSub: { color: "#c6c6c6", marginTop: 4, fontSize: 14 },
  urlRow: { width: "100%", flexDirection: "row", gap: 10, marginTop: 14 },
  urlInput: { flex: 1, backgroundColor: "#1b1c20", borderWidth: 1, borderColor: "#2a2b32", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 14 },
  urlBtn: { width: 76, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  urlBtnText: { color: "#111", fontWeight: "900" },
  errorText: { marginTop: 10, color: "#ff8b8b", fontSize: 12 },
  searchRow: { width: "100%", flexDirection: "row", alignItems: "center", backgroundColor: "#1b1c20", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#2a2b32", marginTop: 12 },
  searchField: { flex: 1, color: "#fff", fontSize: 14 },
  dateRow: { width: "100%", flexDirection: "row", gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "#3a3b45", backgroundColor: "transparent" },
  chipActive: { backgroundColor: "#fff", borderColor: "#fff" },
  chipText: { color: "#f0f0f0", fontWeight: "900", fontSize: 12 },
  chipTextActive: { color: "#111" },
  filterRow: { flexDirection: "row", gap: 8, marginTop: 16, width: "100%" },
  filterBtn: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center", borderWidth: 1 },
  filterBtnActive: { backgroundColor: "#fff", borderColor: "#fff" },
  filterBtnInactive: { backgroundColor: "transparent", borderColor: "#3a3b45" },
  filterBtnText: { fontSize: 13, fontWeight: "900" },
  filterTextActive: { color: "#111" },
  filterTextInactive: { color: "#f0f0f0" },
  listCard: { flexDirection: "row", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "#2b2c35", marginBottom: 12, backgroundColor: "#1a1b20" },
  thumb: { width: 96, height: 54, borderRadius: 12, backgroundColor: "#2a2a2a" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  listTitle: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "800" },
  meta: { marginTop: 6, color: "#c0c0c0", fontSize: 12 },
  preview: { marginTop: 6, color: "#ededed", fontSize: 13, lineHeight: 18 },
  badgeBig: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 2 },
  badgeBigText: { fontSize: 16, fontWeight: "900" },
  modalContainer: { flex: 1, backgroundColor: "#101114", paddingTop: 44 },
  modalTopBar: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#2a2b32" },
  modalTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  closeBtn: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  closeText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  bigCard: { marginTop: 16, marginHorizontal: 16, borderRadius: 22, backgroundColor: "#2b2c2e", borderWidth: 1, borderColor: "#3a3b40", padding: 16 },
  bigCardTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  gaugesRow: { marginTop: 18, flexDirection: "row", justifyContent: "space-between", gap: 16 },
  gaugeCell: { flex: 1, alignItems: "center" },
  gaugeCenterAbs: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  gaugeMainText: { fontSize: 44, fontWeight: "900", letterSpacing: 1 },
  gaugeLabel: { marginTop: 10, color: "#ffffff", fontSize: 16, fontWeight: "900" },
  detailTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 },
  detailTitle: { flex: 1, color: "#fff", fontSize: 22, fontWeight: "900", lineHeight: 28 },
  playBtn: { width: 58, height: 58, borderRadius: 999, backgroundColor: "#111", borderWidth: 1, borderColor: "#2a2b32", alignItems: "center", justifyContent: "center" },
  playIcon: { color: "#fff", fontSize: 18, fontWeight: "900" },
  metaLine: { marginTop: 10, color: "#d5d5d5" },
  metaLabel: { color: "#cfcfcf", fontWeight: "900" },
  metaValue: { color: "#e9e9e9" },
  summaryText: { marginTop: 16, color: "#f0f0f0", fontSize: 16, lineHeight: 24 },
  expandBtn: { marginTop: 18, alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12 },
  expandText: { color: "#e5e5e5", fontSize: 16, fontWeight: "900" },
  sectionHeader: { marginTop: 6, color: "#fff", fontSize: 18, fontWeight: "900" },
  sectionBodyMuted: { marginTop: 10, color: "#d0d0d0", fontSize: 15, lineHeight: 22 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bulletDot: { color: "#e8e8e8", fontSize: 18, lineHeight: 22, marginTop: 1 },
  bulletText: { flex: 1, color: "#f0f0f0", fontSize: 16, lineHeight: 24 },
  evidenceBox: { borderRadius: 16, borderWidth: 1, borderColor: "#414247", backgroundColor: "#242527", padding: 14, marginBottom: 12 }, // marginBottom 약간 추가
  evidenceSource: { color: "#fff", fontSize: 14, fontWeight: "900" },
  evidenceFact: { marginTop: 8, color: "#efefef", fontSize: 15, lineHeight: 22 },
  evidenceLinkBtn: { marginTop: 12, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: "#4a4b52", backgroundColor: "#1a1b20" },
  evidenceLinkText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  verdictPill: { marginTop: 18, alignSelf: "flex-end", borderWidth: 2, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.10)" },
  verdictPillText: { fontSize: 20, fontWeight: "900" },
});