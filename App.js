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
import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import Svg, { Path } from "react-native-svg";
import { useShareIntent } from "expo-share-intent";

/**
 * ✅ 백엔드(팀 app.py) 기준
 * POST /api/video/info    { url }
 * POST /api/video/detect  { url }   -> avg_fake_score, avg_real_score (0~1)
 * POST /api/video/analyze { url }
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
  return 0.0;
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

function normalizeVerdict(v) {
  if (v === "안전" || v === "주의" || v === "위험") return v;
  return "주의";
}

function summarizeReport(report) {
  if (!report) return "";
  if (typeof report === "string") return report.slice(0, 180);
  try {
    return JSON.stringify(report).slice(0, 180);
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

/**
 * ✅ 공유로 들어온 문자열에서 "진짜 유튜브 URL" 최대한 견고하게 추출
 */
function pickYouTubeUrlFromAnyText(incoming) {
  if (!incoming) return null;
  const decoded = decodeURIComponent(String(incoming));

  const direct = decoded.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/);
  if (direct?.[0]) return direct[0];

  const noScheme = decoded.match(/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/);
  if (noScheme?.[0]) return `https://${noScheme[0]}`;

  return null;
}

function clamp01(x) {
  if (x == null || !Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
function scoreToPercent01(x) {
  const v = clamp01(x);
  return Math.round(v * 100);
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
          <Path d={bgPath} stroke="rgba(255,255,255,0.20)" strokeWidth={stroke} strokeLinecap="round" fill="none" />
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

function DualBar({ label = "AI 생성률", fakeScore, realScore }) {
  const fakeP = clamp01(fakeScore);
  const realP = clamp01(realScore);
  const fakePct = scoreToPercent01(fakeScore);
  const realPct = scoreToPercent01(realScore);

  return (
    <View style={styles.gaugeCell}>
      <View style={styles.dualBarWrap}>
        <View style={styles.dualBarRow}>
          <View style={styles.barCol}>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { height: `${Math.round(fakeP * 100)}%` }]} />
            </View>
            <Text style={styles.barValue}>{fakePct}%</Text>
            <Text style={styles.barLabel}>Fake</Text>
          </View>

          <View style={styles.barCol}>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { height: `${Math.round(realP * 100)}%` }]} />
            </View>
            <Text style={styles.barValue}>{realPct}%</Text>
            <Text style={styles.barLabel}>Real</Text>
          </View>
        </View>
      </View>

      <Text style={styles.gaugeLabel}>{label}</Text>
    </View>
  );
}

function StatusPill({ text }) {
  return (
    <View style={styles.statusPill}>
      <Text style={styles.statusPillText}>{text}</Text>
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

  // ✅ "정보 더보기" 토글
  const [expanded, setExpanded] = useState(false);

  // ✅ 공유 이벤트 중복 방지
  const lastShareRef = useRef({ key: "", ts: 0 });

  const { hasShareIntent, shareIntent, resetShareIntent, error: shareError } = useShareIntent();

  const openDetail = (item) => {
    setSelected(item);
    setExpanded(false); // 상세 들어갈 때 정보는 접힌 상태
    setScreen("detail");
  };

  const goBack = () => {
    setScreen("list");
    setSelected(null);
    setExpanded(false);
  };

  const patchReport = useCallback((tempId, patch) => {
    setReports((prev) =>
      prev.map((x) => {
        if (x.id !== tempId) return x;
        const delta = typeof patch === "function" ? patch(x) : patch;
        return { ...x, ...(delta || {}) };
      })
    );

    setSelected((prevSel) => {
      if (!prevSel || prevSel.id !== tempId) return prevSel;
      const delta = typeof patch === "function" ? patch(prevSel) : patch;
      return { ...prevSel, ...(delta || {}) };
    });
  }, []);

  const mergeRaw = useCallback(
    (tempId, key, payload) => {
      patchReport(tempId, (prevItem) => ({
        raw: { ...(prevItem.raw || {}), [key]: payload },
      }));
    },
    [patchReport]
  );

  useEffect(() => {
    if (!hasShareIntent) return;

    const rawText = shareIntent?.text ? String(shareIntent.text) : "";
    const rawWebUrl = shareIntent?.webUrl ? String(shareIntent.webUrl) : "";

    const yt = pickYouTubeUrlFromAnyText(rawWebUrl) || pickYouTubeUrlFromAnyText(rawText);

    const now = Date.now();
    const key = `${rawWebUrl}||${rawText}||${yt || ""}`;
    if (lastShareRef.current.key === key && now - lastShareRef.current.ts < 2000) {
      resetShareIntent();
      return;
    }
    lastShareRef.current = { key, ts: now };

    if (yt) {
      setUrlInput(yt);
      setErrorText("");
      resetShareIntent();
    } else {
      resetShareIntent();
    }
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  useEffect(() => {
    if (shareError) setErrorText(String(shareError));
  }, [shareError]);

  function isAnalyzing(item) {
    return item?.analysisStatus === "분석중";
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

        mergeRaw(tempId, "info", info);
      })
      .catch((e) => {
        mergeRaw(tempId, "info", { status: "error", message: String(e.message || e) });
      });

    pDetect
      .then((detect) => {
        const dd = detect?.data || {};
        const dr = dd?.detection_result || {};

        const fakeScore = Number(dr?.avg_fake_score);
        const realScore = Number(dr?.avg_real_score);

        patchReport(tempId, {
          fakeScore: Number.isFinite(fakeScore) ? clamp01(fakeScore) : null,
          realScore: Number.isFinite(realScore) ? clamp01(realScore) : null,
          fakeFrameCount: dr?.fake_frame_count ?? null,
          realFrameCount: dr?.real_frame_count ?? null,
          totalAnalyzedFrames: dr?.total_analyzed_frames ?? null,
        });

        mergeRaw(tempId, "detect", detect);
      })
      .catch((e) => {
        mergeRaw(tempId, "detect", { status: "error", message: String(e.message || e) });
      });

    pAnalyze
      .then((analyze) => {
        const ad = analyze?.data || {};
        const report = ad?.analysis_result ?? null;

        const verdict =
          isObj(report) && report?.reliability_level ? normalizeVerdict(report.reliability_level) : "주의";

        const summary =
          isObj(report) && report?.summary
            ? String(report.summary)
            : report
            ? summarizeReport(report)
            : "";

        patchReport(tempId, { verdict, summary, report });
        mergeRaw(tempId, "analyze", analyze);
      })
      .catch((e) => {
        mergeRaw(tempId, "analyze", { status: "error", message: String(e.message || e) });
      });

    const settled = await Promise.allSettled([pInfo, pDetect, pAnalyze]);
    const anyRejected = settled.some((s) => s.status === "rejected");
    patchReport(tempId, { analysisStatus: anyRejected ? "분석 일부 실패" : "Done" });
  }

  async function onAddUrl(sharedUrl) {
    const url = (typeof sharedUrl === "string" ? sharedUrl : urlInput).trim();
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

      verdict: null,
      summary: "",

      analysisStatus: "분석중",
      publishedAt: null,

      fakeScore: null,
      realScore: null,
      fakeFrameCount: null,
      realFrameCount: null,
      totalAnalyzedFrames: null,

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

  const filteredReports = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);

    return reports
      .filter((item) => {
        const title = (item.title || "").toLowerCase();
        const matchSearch = title.includes(searchText.toLowerCase());
        const matchCategory =
          filter === "전체" ||
          (filter === "위험" && item.verdict === "위험") ||
          (filter === "주의" && item.verdict === "주의") ||
          (filter === "안전" && item.verdict === "안전");

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

  // -------------------- LIST --------------------
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
            const analyzing = isAnalyzing(item);
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
                    <Text style={styles.listTitle} numberOfLines={2}>
                      {item.title}
                    </Text>

                    {analyzing ? (
                      <StatusPill text="분석중" />
                    ) : item.verdict ? (
                      <View style={[styles.badgeBig, { borderColor: color }]}>
                        <Text style={[styles.badgeBigText, { color }]}>{item.verdict}</Text>
                      </View>
                    ) : (
                      <StatusPill text={item.analysisStatus || "상태"} />
                    )}
                  </View>

                  <Text style={styles.meta}>검사: {item.createdAtISO ? formatKST(item.createdAtISO) : "(없음)"}</Text>

                  {!!item.summary && !analyzing && (
                    <Text style={styles.preview} numberOfLines={2}>
                      {item.summary}
                    </Text>
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

  // -------------------- DETAIL --------------------
  const analyzing = isAnalyzing(selected);
  const factVerdict = analyzing ? "분석중" : selected?.verdict || "주의";
  const factColor = analyzing ? "#9aa0a6" : verdictColor(factVerdict);
  const factProgress = analyzing ? 0.0 : verdictProgress(factVerdict);

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
        {/* 1) 신뢰도 카드 */}
        <View style={styles.bigCard}>
          <Text style={styles.bigCardTitle}>광고 신뢰도</Text>

          <View style={styles.gaugesRow}>
            <MiniGauge label="사실 확인" mainText={factVerdict} color={factColor} progress={factProgress} />
            <DualBar label="AI 생성률" fakeScore={selected?.fakeScore ?? 0} realScore={selected?.realScore ?? 0} />
          </View>
        </View>

        {/* 2) 상세 분석 결과 + (안쪽) 영상 정보 더보기 */}
        <View style={styles.bigCard}>
          <Text style={styles.bigCardTitle}>상세 분석 결과</Text>

          {!!selected?.summary && !analyzing && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.sectionHeader}>요약</Text>
              <Text style={styles.summaryText}>{selected.summary}</Text>
            </View>
          )}

          {(analyzing || issues.length > 0) && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.sectionHeader}>의심 신호</Text>

              {analyzing && issues.length === 0 ? (
                <Text style={styles.sectionBodyMuted}>분석 중입니다. 잠시 후 의심 신호가 표시됩니다.</Text>
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
            </View>
          )}


          <View style={{ marginTop: 20 }}>
            <Text style={styles.sectionHeader}>근거</Text>
            {evidence.length === 0 ? (
              <Text style={[styles.sectionBodyMuted, { marginTop: 10 }]}>
                {analyzing ? "분석 중입니다. 잠시 후 근거가 표시됩니다." : "표시할 근거가 없습니다."}
              </Text>
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

          {/* ✅ 영상 정보 박스 (근거 박스 톤 + 정보 더보기) */}
          <View style={styles.innerDivider} />

          <View style={styles.videoInfoBox}>
            <View style={styles.videoInfoHeaderRow}>
              <Text style={styles.videoInfoTitle}>영상 정보</Text>

              <Pressable onPress={() => setExpanded(!expanded)} style={styles.metaToggleBtn}>
                <Text style={styles.metaToggleText}>{expanded ? "접기 ▲" : "정보 더보기 ▼"}</Text>
              </Pressable>
            </View>

            {expanded && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.metaTitle} numberOfLines={3}>
                  {selected?.title}
                </Text>

                {!!selected?.youtubeUrl && (
                  <Pressable onPress={() => Linking.openURL(selected.youtubeUrl)} style={styles.playInlineBtn}>
                    <Text style={styles.playInlineText}>▶ 영상 열기</Text>
                  </Pressable>
                )}

                <Text style={styles.metaLine}>
                  <Text style={styles.metaLabel}>검사 시각 </Text>
                  <Text style={styles.metaValue}>
                    {selected?.createdAtISO ? formatKST(selected.createdAtISO) : "(없음)"}
                  </Text>
                </Text>

                <Text style={styles.metaLine}>
                  <Text style={styles.metaLabel}>영상 제작 </Text>
                  <Text style={styles.metaValue}>{selected?.publishedAt ? formatKST(selected.publishedAt) : "(없음)"}</Text>
                </Text>

                <Text style={styles.metaLine}>
                  <Text style={styles.metaLabel}>검사 상태 </Text>
                  <Text style={styles.metaValue}>{selected?.analysisStatus || "Done"}</Text>
                </Text>
                
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <StatusBar style="light" />
    </View>
  );
}

// -------------------- STYLES --------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#101114", alignItems: "center", paddingTop: 60, paddingHorizontal: 16 },
  headerTitle: { color: "#fff", fontSize: 28, fontWeight: "900" },
  headerSub: { color: "#c6c6c6", marginTop: 4, fontSize: 14 },

  urlRow: { width: "100%", flexDirection: "row", gap: 10, marginTop: 14 },
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
  urlBtn: { width: 76, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  urlBtnText: { color: "#111", fontWeight: "900" },
  errorText: { marginTop: 10, color: "#ff8b8b", fontSize: 12 },

  searchRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1b1c20",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#2a2b32",
    marginTop: 12,
  },
  searchField: { flex: 1, color: "#fff", fontSize: 14 },

  dateRow: { width: "100%", flexDirection: "row", gap: 8, marginTop: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3a3b45",
    backgroundColor: "transparent",
  },
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

  statusPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#70757a",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  statusPillText: { fontSize: 16, fontWeight: "900", color: "#cfcfcf" },

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

  bigCard: {
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 22,
    backgroundColor: "#2b2c2e",
    borderWidth: 1,
    borderColor: "#3a3b40",
    padding: 16,
  },
  bigCardTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },

  gaugesRow: { marginTop: 18, flexDirection: "row", justifyContent: "space-between", gap: 16 },
  gaugeCell: { flex: 1, alignItems: "center" },
  gaugeCenterAbs: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  gaugeMainText: { fontSize: 44, fontWeight: "900", letterSpacing: 1 },
  gaugeLabel: { marginTop: 10, color: "#ffffff", fontSize: 16, fontWeight: "900" },

  dualBarWrap: {
    width: 190,
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
  },
  dualBarRow: { marginTop: 12, flexDirection: "row", gap: 18, alignItems: "flex-end" },
  barCol: { alignItems: "center", width: 70 },
  barTrack: {
    width: 34,
    height: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#51525b",
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  barFill: { width: "100%", backgroundColor: "rgba(255,255,255,0.55)" },
  barValue: { marginTop: 8, color: "#f0f0f0", fontSize: 14, fontWeight: "900" },
  barLabel: { marginTop: 4, color: "#cfcfcf", fontSize: 12, fontWeight: "900" },

  summaryText: { marginTop: 10, color: "#f0f0f0", fontSize: 16, lineHeight: 24 },

  sectionHeader: { marginTop: 6, color: "#fff", fontSize: 18, fontWeight: "900" },
  sectionBodyMuted: { marginTop: 10, color: "#d0d0d0", fontSize: 15, lineHeight: 22 },

  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bulletDot: { color: "#e8e8e8", fontSize: 18, lineHeight: 22, marginTop: 1 },
  bulletText: { flex: 1, color: "#f0f0f0", fontSize: 16, lineHeight: 24 },

  evidenceBox: { borderRadius: 16, borderWidth: 1, borderColor: "#414247", backgroundColor: "#242527", padding: 14 },
  evidenceSource: { color: "#fff", fontSize: 14, fontWeight: "900" },
  evidenceFact: { marginTop: 8, color: "#efefef", fontSize: 15, lineHeight: 22 },
  evidenceLinkBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4a4b52",
    backgroundColor: "#1a1b20",
  },
  evidenceLinkText: { color: "#fff", fontSize: 13, fontWeight: "900" },

  innerDivider: {
    marginTop: 18,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
  },

  // ✅ 영상 정보 박스 (근거 박스 톤)
  videoInfoBox: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#414247",
    backgroundColor: "#242527",
    padding: 14,
  },
  videoInfoHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  videoInfoTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },

  // 토글 버튼 공용
  metaToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3a3b45",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  metaToggleText: { color: "#e5e5e5", fontSize: 13, fontWeight: "900" },

  metaTitle: {
    marginTop: 6,
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
  },

  playInlineBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4a4b52",
    backgroundColor: "#1a1b20",
  },
  playInlineText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },

  metaLine: { marginTop: 10, color: "#d5d5d5" },
  metaLabel: { color: "#cfcfcf", fontWeight: "900" },
  metaValue: { color: "#e9e9e9" },

});
