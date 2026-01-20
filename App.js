import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet, Text, View, FlatList, Pressable, Image, ScrollView, Linking, TextInput, ActivityIndicator
} from 'react-native';
import React, { useMemo, useState } from 'react';
import Svg, { Path } from 'react-native-svg';

// ✅ 백엔드 명세서 기반 엔드포인트 설정
const API_BASE = "http://172.30.1.65:8080/api/video"; 

// -------------------- UTILS --------------------
function verdictColor(verdict) {
  if (verdict === "위험") return "#ff3b30";
  if (verdict === "주의") return "#ffcc66";
  if (verdict === "안전") return "#6fe3a5";
  return "#555"; 
}

function verdictProgress(verdict) {
  if (verdict === "안전") return 1.0;
  if (verdict === "주의") return 0.66;
  if (verdict === "위험") return 0.33;
  return 0.5;
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

function TrustGauge({ verdict }) {
  const color = verdictColor(verdict);
  const progress = verdictProgress(verdict);
  const size = 210;
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
    <View style={styles.card}>
      <Text style={styles.cardTitle}>광고 신뢰도</Text>
      <View style={styles.gaugeWrap}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            <Path d={bgPath} stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} strokeLinecap="round" fill="none" />
            <Path d={fgPath} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" />
          </Svg>
          <View style={styles.gaugeCenter}>
            <Text style={[styles.centerVerdictSmall, { color }]}>{verdict}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// -------------------- MAIN APP --------------------
export default function App() {
  const [screen, setScreen] = useState("list");
  const [reports, setReports] = useState([
    { id: "ex-1", video_id: "I5u6ATxWXbs", title: "[광고] 국내최초 먹는 성장인자 IGF-1 유효성 검증", createdAt: "2026-01-20", thumbnail: "https://i.ytimg.com/vi/I5u6ATxWXbs/hqdefault.jpg", verdict: "주의", summary: "과장된 의학적 주장이 포함되어 있습니다. 전문의 상의가 필요합니다.", issues: ["검증되지 않은 특허", "공포 마케팅"] },
    { id: "ex-2", video_id: "wbWIWbI0D4k", title: "단 2주만에 10kg 감량? 다이어트 보조제의 진실", createdAt: "2026-01-20", thumbnail: "https://i.ytimg.com/vi/wbWIWbI0D4k/hqdefault.jpg", verdict: "위험", summary: "딥페이크 기술을 이용한 허위 광고 정황이 포착되었습니다.", issues: ["딥페이크 의심", "허위 사실 유포"] },
    { id: "ex-3", video_id: "dQw4w9WgXcQ", title: "안전한 유기농 화장품 브랜드 팩트 체크", createdAt: "2026-01-18", thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", verdict: "안전", summary: "성분 분석 결과 유해 물질이 발견되지 않은 깨끗한 제품입니다.", issues: [] },
    { id: "ex-4", video_id: "9bZkp7q19f0", title: "수익률 500% 보장? 주식 리딩방의 실체", createdAt: "2026-01-12", thumbnail: "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg", verdict: "위험", summary: "불법 금융 투자 사기 유형과 매우 유사합니다.", issues: ["사기 의심", "고수익 미끼"] },
    { id: "ex-5", video_id: "kJQP7kiw5Fk", title: "유명 연예인이 추천하는 비타민 영양제 분석", createdAt: "2026-01-10", thumbnail: "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg", verdict: "주의", summary: "연예인의 인지도를 이용했으나 함량 정보가 불투명합니다.", issues: ["함량 미달 가능성", "뒷광고 의심"] },
    { id: "ex-6", video_id: "60ItHLz5WEA", title: "집에서 하는 5분 스트레칭 효과 검증", createdAt: "2026-01-08", thumbnail: "https://i.ytimg.com/vi/60ItHLz5WEA/hqdefault.jpg", verdict: "안전", summary: "운동 생리학적으로 검증된 동작들로 구성되어 있습니다.", issues: [] },
    { id: "ex-7", video_id: "OPf0YbXqDm0", title: "바르기만 해도 탈모 치료? 식약처 인증 여부", createdAt: "2026-01-05", thumbnail: "https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg", verdict: "위험", summary: "식약처 미인증 제품을 의약품으로 오인하게 광고하고 있습니다.", issues: ["허위 광고", "의약품 오인"] },
    { id: "ex-8", video_id: "3JZ_D3ELwOQ", title: "최신 스마트폰 90% 할인 쿠폰의 진실", createdAt: "2026-01-03", thumbnail: "https://i.ytimg.com/vi/3JZ_D3ELwOQ/hqdefault.jpg", verdict: "위험", summary: "개인정보 탈취를 목적으로 하는 피싱 사이트 링크가 포함됨.", issues: ["피싱 의심", "개인정보 위협"] },
    { id: "ex-9", video_id: "L_jWHffIx5E", title: "아이 깨끗해! 천연 성분 아기 세제 리뷰", createdAt: "2026-01-01", thumbnail: "https://i.ytimg.com/vi/L_jWHffIx5E/hqdefault.jpg", verdict: "안전", summary: "환경 마크를 획득한 실제 천연 제품임이 확인되었습니다.", issues: [] },
    { id: "ex-10", video_id: "V-_O7nl0Ii0", title: "AI가 그려주는 초상화? 서비스 신뢰도 분석", createdAt: "2025-12-28", thumbnail: "https://i.ytimg.com/vi/V-_O7nl0Ii0/hqdefault.jpg", verdict: "주의", summary: "결제 후 결과물이 광고와 다르다는 후기가 많습니다.", issues: ["과장 광고", "환불 정책 불투명"] },
    { id: "ex-11", video_id: "fRh_vgS2dFE", title: "잠 잘오는 ASMR 채널 광고 분석", createdAt: "2025-12-25", thumbnail: "https://i.ytimg.com/vi/fRh_vgS2dFE/hqdefault.jpg", verdict: "안전", summary: "단순 제품 홍보이며 과학적 근거를 남용하지 않았습니다.", issues: [] },
    { id: "ex-12", video_id: "y6120QOlsfU", title: "무조건 합격하는 자소서 작성법 강좌", createdAt: "2025-12-20", thumbnail: "https://i.ytimg.com/vi/y6120QOlsfU/hqdefault.jpg", verdict: "주의", summary: "강사의 이력이 일부 부풀려진 정황이 있습니다.", issues: ["경력 허위 기재 의심"] }
  ]);

  const [selected, setSelected] = useState(null);
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("전체");
  const [searchText, setSearchText] = useState("");
  const [dateFilter, setDateFilter] = useState("전체");

  // ⭐ 기간 필터 로직이 완벽하게 추가된 부분
  const filteredReports = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);

    return reports.filter(item => {
      const matchSearch = item.title.toLowerCase().includes(searchText.toLowerCase());
      const matchCategory = filter === "전체" || item.verdict === filter;
      
      let matchDate = true;
      const itemDate = new Date(item.createdAt);
      if (dateFilter === "오늘") {
        matchDate = item.createdAt === todayStr;
      } else if (dateFilter === "1주일") {
        matchDate = itemDate >= oneWeekAgo && itemDate <= now;
      }

      return matchSearch && matchCategory && matchDate;
    });
  }, [reports, searchText, filter, dateFilter]);

  async function onAddUrl() {
    const url = urlInput.trim();
    if (!url) return;
    setLoading(true); setUrlInput("");

    const tempId = `temp-${Date.now()}`;
    const initialItem = {
      id: tempId, title: "분석 정보를 불러오는 중...",
      createdAt: new Date().toISOString().split('T')[0],
      thumbnail: null, youtubeUrl: url, verdict: "대기", summary: "서버 연결 중입니다...",
    };
    setReports(prev => [initialItem, ...prev]);

    try {
      const infoRes = await fetch(`${API_BASE}/info`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url })
      });
      const infoJson = await infoRes.json();
      if (infoJson.status === "success") {
        const info = infoJson.data;
        setReports(prev => prev.map(item => 
          item.id === tempId ? {
            ...item, video_id: info.video_id, title: info.title,
            thumbnail: info.thumbnail_url, createdAt: info.published_at.split('T')[0],
            summary: "기본 정보 로드 완료. 심층 분석 중...",
          } : item
        ));
        // 병렬 분석 요청 (기존 로직 유지)
        fetch(`${API_BASE}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) })
        .then(res => res.json()).then(json => {
          if (json.status === "success") {
            const res = json.data.analysis_result;
            setReports(prev => prev.map(item => item.video_id === json.data.video_id ? { ...item, verdict: res.reliability_level, summary: res.summary, issues: res.issues } : item));
          }
        });
      }
    } catch (e) {
      setReports(prev => prev.map(item => item.id === tempId ? { ...item, title: "서버 연결 실패" } : item));
    } finally { setLoading(false); }
  }

  if (screen === "list") {
    return (
      <View style={styles.container}>
        <Text style={styles.headerTitle}>AD Astra</Text>
        <Text style={styles.headerSub}>검사 기록</Text>

        <View style={styles.urlRow}>
          <TextInput value={urlInput} onChangeText={setUrlInput} placeholder="유튜브 링크를 입력하세요" placeholderTextColor="#666" style={styles.urlInput} />
          <Pressable onPress={onAddUrl} style={styles.urlBtn}>
            {loading ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.urlBtnText}>추가</Text>}
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <Text style={{color: '#888', marginRight: 8}}>🔍</Text>
          <TextInput value={searchText} onChangeText={setSearchText} placeholder="결과 내 제목 검색" placeholderTextColor="#444" style={styles.searchField} />
        </View>

        <View style={styles.dateRow}>
          {["전체", "오늘", "1주일"].map(d => (
            <Pressable key={d} onPress={() => setDateFilter(d)} style={[styles.dateChip, dateFilter === d && styles.dateChipActive]}>
              <Text style={{color: dateFilter === d ? '#000' : '#888', fontSize: 12, fontWeight: 'bold'}}>{d}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.filterRow}>
          {["전체", "위험", "주의", "안전"].map(l => (
            <FilterButton key={l} label={l} active={filter === l} onPress={() => setFilter(l)} />
          ))}
        </View>

        <FlatList
          data={filteredReports}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable style={styles.listCard} onPress={() => { setSelected(item); setScreen("detail"); }}>
              {item.thumbnail ? (
                <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, {backgroundColor: '#222', justifyContent: 'center', alignItems: 'center'}]}>
                   <ActivityIndicator size="small" color="#444" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.listTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={{ color: verdictColor(item.verdict), fontSize: 10, fontWeight: 'bold' }}>{item.verdict}</Text>
                </View>
                <Text style={styles.meta}>{item.createdAt}</Text>
                <Text style={styles.preview} numberOfLines={2}>{item.summary}</Text>
              </View>
            </Pressable>
          )}
        />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.modalContainer}>
      <View style={styles.modalTopBar}>
        <Pressable onPress={() => setScreen("list")}><Text style={{color: '#fff', fontSize: 16}}>← 목록</Text></Pressable>
        <Text style={styles.modalTitle}>분석 상세</Text>
        <View style={{width: 40}} />
      </View>
      <ScrollView contentContainerStyle={{paddingBottom: 40}}>
        <TrustGauge verdict={selected?.verdict || "대기"} />
        <View style={styles.card}>
          <Text style={styles.detailTitle}>{selected?.title}</Text>
          <Text style={styles.body}>{selected?.summary}</Text>
          {selected?.issues && (
            <View style={styles.analysisBox}>
              <Text style={styles.analysisBoxTitle}>주요 이슈</Text>
              {selected.issues.map((issue, i) => (
                <Text key={i} style={styles.analysisBoxBullet}>• {issue}</Text>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0b", paddingTop: 60, paddingHorizontal: 16 },
  headerTitle: { color: "#fff", fontSize: 26, fontWeight: "900" },
  headerSub: { color: "#888", fontSize: 13, marginBottom: 20 },
  urlRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  urlInput: { flex: 1, backgroundColor: "#161616", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", borderWidth: 1, borderColor: "#222" },
  urlBtn: { width: 55, backgroundColor: "#fff", borderRadius: 10, justifyContent: "center", alignItems: "center" },
  urlBtnText: { fontWeight: "bold", fontSize: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 10, height: 36, marginBottom: 15, borderWidth: 1, borderColor: '#1a1a1a' },
  searchField: { flex: 1, color: '#fff', fontSize: 12 },
  dateRow: { flexDirection: 'row', gap: 6, marginBottom: 15 },
  dateChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15, backgroundColor: '#161616' },
  dateChipActive: { backgroundColor: '#fff' },
  filterRow: { flexDirection: "row", gap: 6, marginBottom: 20 },
  filterBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: '#222' },
  filterBtnActive: { backgroundColor: '#fff', borderColor: '#fff' },
  filterBtnText: { color: '#666', fontWeight: 'bold', fontSize: 12 },
  filterTextActive: { color: '#000' },
  filterTextInactive: { color: '#666' },
  listCard: { flexDirection: "row", gap: 12, padding: 12, borderRadius: 12, backgroundColor: "#141414", marginBottom: 10, borderWidth: 1, borderColor: '#1c1c1c' },
  thumb: { width: 85, height: 50, borderRadius: 6 },
  listTitle: { color: "#fff", fontSize: 14, fontWeight: "800", flex: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { color: "#555", fontSize: 11, marginTop: 2 },
  preview: { color: "#888", fontSize: 12, marginTop: 4 },
  modalContainer: { flex: 1, backgroundColor: '#000', paddingTop: 40 },
  modalTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  card: { padding: 16 },
  detailTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  body: { color: '#aaa', fontSize: 14, lineHeight: 22 },
  gaugeWrap: { alignItems: 'center', marginVertical: 20 },
  gaugeCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  centerVerdictSmall: { fontSize: 36, fontWeight: '900' },
  analysisBox: { marginTop: 15, padding: 15, backgroundColor: '#111', borderRadius: 10, borderWidth: 1, borderColor: '#222' },
  analysisBoxTitle: { color: '#fff', fontWeight: 'bold', marginBottom: 8 },
  analysisBoxBullet: { color: '#ffcc66', fontSize: 13, marginBottom: 4 }
});