import { StatusBar } from "expo-status-bar";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
  Linking,
  TextInput,
  Alert,
} from "react-native";
import React, { useMemo, useState } from "react";
import Svg, { Path } from "react-native-svg";

// ✅ 폰: PC IPv4로 바꾸기
// 예) http://10.243.117.150:8080
const URL_PHONE = "http://10.243.117.150:8080";
const URL_EMUL = "http://10.0.2.2:8080";

// ---------- verdict utils ----------
function parsePercent(str) {
  if (!str) return null;
  const n = Number(String(str).replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}
function verdictFromAiRate(aiRatePercent) {
  if (aiRatePercent == null) return "주의";
  if (aiRatePercent >= 70) return "위험";
  if (aiRatePercent >= 35) return "주의";
  return "안전";
}
function verdictColor(verdict) {
  if (verdict === "위험") return "#ff3b30";
  if (verdict === "주의") return "#ffcc66";
  return "#6fe3a5";
}
function progressFromAiRate(aiRatePercent) {
  if (aiRatePercent == null) return 0.5;
  return Math.max(0, Math.min(1, aiRatePercent / 100));
}

// ---------- gauge utils ----------
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

function TrustGauge({ verdict, aiRatePercent }) {
  const color = verdictColor(verdict);
  const progress = progressFromAiRate(aiRatePercent);

  const size = 220;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const r = 78;
  const stroke = 12;

  // 240° arc (왼아래 -> 오른아래)
  const startA = 210;
  const endA = -30;
  const totalSweep = endA - startA; // -240
  const progEnd = startA + totalSweep * progress;

  const bgPath = arcPath(cx, cy, r, startA, endA);
  const fgPath = arcPath(cx, cy, r, startA, progEnd);

  const markerPos = verdict === "안전" ? 0 : verdict === "주의" ? 0.5 : 1;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>광고 신뢰도</Text>

      <View style={{ alignItems: "center", marginTop: 12 }}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            <Path d={bgPath} stroke="#6a6a6a" strokeWidth={stroke} strokeLinecap="round" fill="none" opacity={0.9} />
            <Path
              d={arcPath(cx, cy, r - 24, startA, endA)}
              stroke="#7a7a7a"
              strokeWidth={5}
              strokeLinecap="round"
              fill="none"
              opacity={0.65}
            />
            <Path d={fgPath} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" />
          </Svg>

          <View style={styles.gaugeCenter}>
            <Text style={[styles.centerVerdictSmall, { color }]}>{verdict}</Text>
            {aiRatePercent != null && (
              <Text style={styles.aiRateText}>AI 생성률 {aiRatePercent.toFixed(2)}%</Text>
            )}
          </View>
        </View>

        <View style={styles.scaleWrapSmall}>
          <View style={styles.scaleLineSmall} />
          <View style={[styles.tickSmall, { left: 0 }]} />
          <View style={[styles.tickSmall, { left: "50%", marginLeft: -7 }]} />
          <View style={[styles.tickSmall, { right: 0 }]} />

          <View
            style={[
              styles.markerSmall,
              markerPos === 0 ? { left: 0 } : markerPos === 0.5 ? { left: "50%", marginLeft: -8 } : { right: 0 },
            ]}
          />

          <View style={styles.scaleLabelsSmall}>
            <Text style={[styles.scaleTextSmall, verdict === "안전" && { color: verdictColor("안전"), fontWeight: "900" }]}>안전</Text>
            <Text style={[styles.scaleTextSmall, verdict === "주의" && { color: verdictColor("주의"), fontWeight: "900" }]}>주의</Text>
            <Text style={[styles.scaleTextSmall, verdict === "위험" && { color: verdictColor("위험"), fontWeight: "900" }]}>위험</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState("list");
  const [selected, setSelected] = useState(null);

  const [filter, setFilter] = useState("전체");
  const [baseUrl, setBaseUrl] = useState(URL_PHONE);

  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 서버에서 받은 memo들
  const [memos, setMemos] = useState([]);

  const memosWithVerdict = useMemo(() => {
    return memos.map((m) => {
      const aiRate = parsePercent(m.ai_generation_rate);
      const verdict = verdictFromAiRate(aiRate);
      return { ...m, verdict };
    });
  }, [memos]);

  const filteredMemos = useMemo(() => {
    if (filter === "전체") return memosWithVerdict;
    return memosWithVerdict.filter((m) => m.verdict === filter);
  }, [filter, memosWithVerdict]);

  const runPipeline = async () => {
    if (!urlInput.trim()) {
      Alert.alert("URL 필요", "유튜브 링크를 입력해줘.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${baseUrl}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });

      const data = await res.json();

      if (!res.ok || data?.status !== "success") {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }

      const memo = data.memo;

      // 최신을 위로
      setMemos((prev) => [memo, ...prev]);
      setUrlInput("");
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const openDetail = (item) => {
    setSelected(item);
    setScreen("detail");
  };

  const goBack = () => {
    setScreen("list");
    setSelected(null);
    setError("");
  };

  // -------- LIST --------
  if (screen === "list") {
    return (
      <View style={styles.container}>
        <Text style={styles.headerTitle}>AD Astra</Text>
        <Text style={styles.headerSub}>검사 기록</Text>

        {/* base URL toggle */}
        <View style={styles.urlRow}>
          <Pressable onPress={() => setBaseUrl(URL_PHONE)} style={[styles.urlBtn, baseUrl === URL_PHONE && styles.urlBtnActive]}>
            <Text style={[styles.urlBtnText, baseUrl === URL_PHONE && styles.urlBtnTextActive]}>폰(PC IP)</Text>
          </Pressable>
          <Pressable onPress={() => setBaseUrl(URL_EMUL)} style={[styles.urlBtn, baseUrl === URL_EMUL && styles.urlBtnActive]}>
            <Text style={[styles.urlBtnText, baseUrl === URL_EMUL && styles.urlBtnTextActive]}>에뮬(10.0.2.2)</Text>
          </Pressable>
        </View>
        <Text style={styles.baseUrlText}>BASE_URL: {baseUrl}</Text>

        {/* 입력 + 분석 버튼 */}
        <View style={styles.inputRow}>
          <TextInput
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder="유튜브 링크 붙여넣기"
            placeholderTextColor="#777"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.analyzeBtn} onPress={runPipeline} disabled={loading}>
            <Text style={styles.analyzeBtnText}>{loading ? "..." : "분석"}</Text>
          </Pressable>
        </View>

        {!!error && <Text style={styles.errorText}>에러: {error}</Text>}
        {loading && <ActivityIndicator size="large" style={{ marginTop: 14 }} />}

        {/* 필터 */}
        <View style={styles.filterRow}>
          <FilterButton label="전체" active={filter === "전체"} onPress={() => setFilter("전체")} />
          <FilterButton label="위험" active={filter === "위험"} onPress={() => setFilter("위험")} />
          <FilterButton label="주의" active={filter === "주의"} onPress={() => setFilter("주의")} />
          <FilterButton label="안전" active={filter === "안전"} onPress={() => setFilter("안전")} />
        </View>

        <FlatList
          style={{ width: "100%", marginTop: 14 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          data={filteredMemos}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={{ color: "#777", marginTop: 20 }}>
              아직 기록이 없어. 링크 입력 → 분석 눌러봐.
            </Text>
          }
          renderItem={({ item }) => {
            const color = verdictColor(item.verdict);
            return (
              <Pressable style={styles.listCard} onPress={() => openDetail(item)}>
                <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} />
                <View style={{ flex: 1 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.listTitle} numberOfLines={2}>{item.title || item.video_id}</Text>
                    <View style={[styles.badgeBig, { borderColor: color }]}>
                      <Text style={[styles.badgeBigText, { color }]}>{item.verdict}</Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>{item.createdAt}</Text>
                  <Text style={styles.preview} numberOfLines={1}>
                    {item.ai_generation_rate ? `AI 생성률: ${item.ai_generation_rate}` : "(임시) 요약 한 줄"}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />

        <StatusBar style="light" />
      </View>
    );
  }

  // -------- DETAIL --------
  const aiRate = parsePercent(selected.ai_generation_rate);
  const verdict = verdictFromAiRate(aiRate);
  const vColor = verdictColor(verdict);

  // transcript가 리스트면 텍스트 합치기
  const transcriptText = Array.isArray(selected.transcript)
    ? selected.transcript.map((t) => t.text).join(" ")
    : String(selected.transcript || "");

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
        <TrustGauge verdict={verdict} aiRatePercent={aiRate} />

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.detailTitle} numberOfLines={2}>{selected.title || selected.video_id}</Text>
            <LinkIconButton onPress={() => Linking.openURL(selected.youtube_url)} />
          </View>

          <Text style={styles.meta}>{selected.createdAt}</Text>

          <Text style={styles.sectionTitle}>AI 생성률</Text>
          <Text style={styles.kv}>{selected.ai_generation_rate || "-"}</Text>

          <Text style={styles.sectionTitle}>Gemini 보고서</Text>
          <Text style={styles.body}>{selected.report || "(보고서 없음)"}</Text>

          <Text style={styles.sectionTitle}>스크립트(요약/원문)</Text>
          <Text style={styles.body} numberOfLines={12}>
            {transcriptText || "(자막 없음)"}
          </Text>

          <View style={[styles.bigVerdictPill, { borderColor: vColor }]}>
            <Text style={[styles.bigVerdictText, { color: vColor }]}>{verdict}</Text>
          </View>
        </View>
      </ScrollView>

      <StatusBar style="light" />
    </View>
  );
}

// ---------- styles ----------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0b0b",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  headerTitle: { color: "#fff", fontSize: 28, fontWeight: "900" },
  headerSub: { color: "#bdbdbd", marginTop: 4, fontSize: 14 },

  urlRow: { flexDirection: "row", gap: 8, marginTop: 14, width: "100%" },
  urlBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "transparent",
    alignItems: "center",
  },
  urlBtnActive: { backgroundColor: "#1b1b1b", borderColor: "#4a4a4a" },
  urlBtnText: { color: "#d0d0d0", fontWeight: "800" },
  urlBtnTextActive: { color: "#fff" },
  baseUrlText: { width: "100%", color: "#8d8d8d", marginTop: 8, fontSize: 12 },

  inputRow: { flexDirection: "row", gap: 10, width: "100%", marginTop: 14 },
  input: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    color: "#fff",
    backgroundColor: "#121212",
  },
  analyzeBtn: {
    width: 78,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#1f6fff",
    alignItems: "center",
    justifyContent: "center",
  },
  analyzeBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  errorText: { marginTop: 12, color: "#ff4d4d", lineHeight: 20, width: "100%" },

  filterRow: { flexDirection: "row", gap: 8, marginTop: 12, width: "100%" },
  filterBtn: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center", borderWidth: 1 },
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

  gaugeCenter: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  centerVerdictSmall: { fontSize: 44, fontWeight: "900", letterSpacing: 1 },
  aiRateText: { marginTop: 8, color: "#bdbdbd", fontWeight: "700" },

  scaleWrapSmall: { width: "100%", marginTop: 4, paddingHorizontal: 8 },
  scaleLineSmall: { height: 7, backgroundColor: "#7b7b7b", borderRadius: 999, opacity: 0.8 },
  tickSmall: { position: "absolute", top: -4, width: 14, height: 14, borderRadius: 999, backgroundColor: "#1a1a1a", borderWidth: 2, borderColor: "#9a9a9a" },
  markerSmall: { position: "absolute", top: -6, width: 16, height: 16, borderRadius: 999, backgroundColor: "#1a1a1a", borderWidth: 3, borderColor: "#fff" },
  scaleLabelsSmall: { marginTop: 10, flexDirection: "row", justifyContent: "space-between" },
  scaleTextSmall: { color: "#d0d0d0", fontSize: 16 },

  detailTitle: { color: "#fff", fontSize: 16, fontWeight: "900", flex: 1 },
  sectionTitle: { marginTop: 14, color: "#fff", fontSize: 14, fontWeight: "900" },
  kv: { marginTop: 8, color: "#dcdcdc", fontSize: 14, lineHeight: 20 },
  body: { marginTop: 10, color: "#eaeaea", fontSize: 14, lineHeight: 20 },

  linkIconBtn: { width: 42, height: 42, borderRadius: 999, borderWidth: 1, borderColor: "#333", alignItems: "center", justifyContent: "center", backgroundColor: "#111" },
  linkIcon: { color: "#fff", fontSize: 18, fontWeight: "900" },

  bigVerdictPill: { marginTop: 16, alignSelf: "flex-end", borderWidth: 2, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.03)" },
  bigVerdictText: { fontSize: 22, fontWeight: "900" },
});
