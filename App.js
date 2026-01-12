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
  RefreshControl,
  Linking,
} from "react-native";
import React, { useEffect, useState } from "react";

// ✅ Android Emulator에서 PC localhost 접근: 10.0.2.2
// Flask 기본 포트: 5000
const BASE_URL = "http://10.0.2.2:5000";

// -------------------- utils --------------------
function verdictColor(verdict) {
  if (verdict === "위험") return "#ff3b30";
  if (verdict === "주의") return "#ffcc66";
  return "#6fe3a5"; // 안전
}

function formatTime(isoString) {
  if (!isoString) return "날짜 없음";
  try {
    const d = new Date(isoString);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return String(isoString);
  }
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

function LinkIconButton({ onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.linkIconBtn, disabled && { opacity: 0.35 }]}
    >
      <Text style={styles.linkIcon}>▶</Text>
    </Pressable>
  );
}

// -------------------- App --------------------
export default function App() {
  const [screen, setScreen] = useState("list"); // list | detail
  const [filter, setFilter] = useState("전체");

  // list
  const [reports, setReports] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState("");

  // detail
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  async function fetchList(isRefresh = false) {
    try {
      setListError("");
      if (isRefresh) setRefreshing(true);
      else setListLoading(true);

      const qs = filter && filter !== "전체" ? `?verdict=${encodeURIComponent(filter)}` : "";
      const res = await fetch(`${BASE_URL}/api/reports${qs}`);

      if (!res.ok) throw new Error(`List API failed: ${res.status}`);
      const data = await res.json();

      setReports(data.items || []);
    } catch (e) {
      setListError(
        `목록을 불러오지 못했어.\n\n` +
          `체크:\n` +
          `1) Flask 서버 실행 중? (http://localhost:5000/health)\n` +
          `2) 에뮬에서 10.0.2.2:5000 접속 가능?\n\n` +
          `에러: ${String(e?.message || e)}`
      );
    } finally {
      setListLoading(false);
      setRefreshing(false);
    }
  }

  async function openDetail(item) {
    setSelectedId(item.id);
    setScreen("detail");

    setDetail(null);
    setDetailError("");
    setDetailLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/api/reports/${item.id}`);
      if (!res.ok) throw new Error(`Detail API failed: ${res.status}`);
      const data = await res.json();
      setDetail(data);
    } catch (e) {
      setDetailError(`상세를 불러오지 못했어: ${String(e?.message || e)}`);
    } finally {
      setDetailLoading(false);
    }
  }

  function goBack() {
    setScreen("list");
    setSelectedId(null);
    setDetail(null);
    setDetailError("");
  }

  // filter 바뀌면 list 재요청
  useEffect(() => {
    fetchList(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // ---------------- LIST SCREEN ----------------
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

        {listLoading && reports.length === 0 ? (
          <View style={{ marginTop: 24, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ color: "#bdbdbd", marginTop: 12 }}>불러오는 중…</Text>
          </View>
        ) : listError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>연결 오류</Text>
            <Text style={styles.errorText}>{listError}</Text>
            <Pressable style={styles.retryBtn} onPress={() => fetchList(false)}>
              <Text style={styles.retryBtnText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            style={{ width: "100%", marginTop: 14 }}
            contentContainerStyle={{ paddingBottom: 40 }}
            data={reports}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                tintColor="#fff"
                refreshing={refreshing}
                onRefresh={() => fetchList(true)}
              />
            }
            ListEmptyComponent={
              <Text style={{ color: "#bdbdbd", marginTop: 30 }}>
                데이터가 없어. (서버에 업로드가 됐는지 확인!)
              </Text>
            }
            renderItem={({ item }) => {
              // Flask list 응답 스키마:
              // item = { id, title, thumbnailUrl, checkedAt, verdict, summaryOneLine, status }
              const color = verdictColor(item.verdict);

              return (
                <Pressable style={styles.listCard} onPress={() => openDetail(item)}>
                  <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} />

                  <View style={{ flex: 1 }}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.listTitle} numberOfLines={2}>
                        {item.title}
                      </Text>

                      <View style={[styles.badgeBig, { borderColor: color }]}>
                        <Text style={[styles.badgeBigText, { color }]}>{item.verdict}</Text>
                      </View>
                    </View>

                    <Text style={styles.meta}>{formatTime(item.checkedAt)}</Text>
                    <Text style={styles.preview} numberOfLines={1}>
                      {item.summaryOneLine || "요약 없음"}
                    </Text>

                    {item.status && item.status !== "DONE" && (
                      <Text style={{ marginTop: 6, color: "#8f8f8f", fontSize: 12 }}>
                        상태: {item.status}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            }}
          />
        )}

        <StatusBar style="light" />
      </View>
    );
  }

  // ---------------- DETAIL SCREEN ----------------
  const verdict = detail?.verdict || "주의";
  const vColor = verdictColor(verdict);

  // 상세 스키마:
  // detail.video.youtubeUrl, detail.video.title, detail.video.thumbnailUrl ...
  const ytUrl = detail?.video?.youtubeUrl;

  return (
    <View style={styles.modalContainer}>
      <View style={styles.modalTopBar}>
        <Text style={styles.modalTitle}>AD ASTRA 분석</Text>
        <Pressable onPress={goBack} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      {detailLoading ? (
        <View style={{ marginTop: 24, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ color: "#bdbdbd", marginTop: 12 }}>상세 불러오는 중…</Text>
        </View>
      ) : detailError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>상세 로딩 오류</Text>
          <Text style={styles.errorText}>{detailError}</Text>

          <Pressable style={styles.retryBtn} onPress={() => openDetail({ id: selectedId })}>
            <Text style={styles.retryBtnText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView style={{ width: "100%" }} contentContainerStyle={{ paddingBottom: 50 }}>
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.detailTitle} numberOfLines={2}>
                {detail?.video?.title || "제목 없음"}
              </Text>

              <LinkIconButton
                disabled={!ytUrl}
                onPress={() => ytUrl && Linking.openURL(ytUrl)}
              />
            </View>

            <Text style={styles.meta}>{formatTime(detail?.checkedAt)}</Text>

            {!!detail?.video?.thumbnailUrl && (
              <Image source={{ uri: detail.video.thumbnailUrl }} style={styles.detailThumb} />
            )}

            {/* verdict pill */}
            <View style={[styles.bigVerdictPill, { borderColor: vColor }]}>
              <Text style={[styles.bigVerdictText, { color: vColor }]}>{verdict}</Text>
            </View>

            {/* one-line summary */}
            <Text style={styles.sectionTitle}>요약</Text>
            <Text style={styles.body}>{detail?.summaryOneLine || "요약 없음"}</Text>

            {/* flags/evidence */}
            <Text style={styles.sectionTitle}>의심 신호</Text>
            {(detail?.analysis?.flags || []).length === 0 ? (
              <Text style={styles.body}>없음</Text>
            ) : (
              detail.analysis.flags.map((f, idx) => (
                <Text key={`flag-${idx}`} style={styles.bullet}>
                  • {f}
                </Text>
              ))
            )}

            <Text style={styles.sectionTitle}>근거</Text>
            {(detail?.analysis?.evidence || []).length === 0 ? (
              <Text style={styles.body}>없음</Text>
            ) : (
              detail.analysis.evidence.map((e, idx) => (
                <Text key={`ev-${idx}`} style={styles.bullet}>
                  • {String(e)}
                </Text>
              ))
            )}

            {/* extra video info */}
            <Text style={styles.sectionTitle}>영상 정보</Text>
            <Text style={styles.body}>채널: {detail?.video?.channelName || "-"}</Text>
            <Text style={styles.body}>댓글수: {detail?.video?.commentCount ?? "-"}</Text>
            <Text style={styles.body}>길이(초): {detail?.video?.durationSec ?? "-"}</Text>
            <Text style={styles.body}>Video ID: {detail?.video?.videoId || "-"}</Text>
          </View>
        </ScrollView>
      )}

      <StatusBar style="light" />
    </View>
  );
}

// -------------------- styles --------------------
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

  detailTitle: { color: "#fff", fontSize: 16, fontWeight: "900", flex: 1 },
  detailThumb: { marginTop: 12, width: "100%", height: 190, borderRadius: 16, backgroundColor: "#222" },

  sectionTitle: { marginTop: 14, color: "#fff", fontSize: 14, fontWeight: "900" },
  body: { marginTop: 10, color: "#eaeaea", fontSize: 14, lineHeight: 20 },
  bullet: { marginTop: 8, color: "#dcdcdc", fontSize: 14, lineHeight: 20 },

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
    marginTop: 14,
    alignSelf: "flex-start",
    borderWidth: 2,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  bigVerdictText: { fontSize: 22, fontWeight: "900" },

  errorBox: {
    marginTop: 20,
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#141414",
    padding: 16,
  },
  errorTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  errorText: { color: "#cfcfcf", marginTop: 10, lineHeight: 18 },
  retryBtn: {
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  retryBtnText: { color: "#111", fontWeight: "900" },
});
