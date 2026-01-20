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
  ActivityIndicator,
} from 'react-native';
import React, { useMemo, useState } from 'react';
import Svg, { Path } from 'react-native-svg';

// -------------------- 1. 환경 설정 & 시연용 예시 데이터 --------------------
const API_BASE = "http://localhost:8080"; 

const INITIAL_REPORTS = [
  { id: '1', title: "수익률 500% 보장? 주식 리딩방의 실체", createdAt: "2026-01-18 12:45", verdict: "위험", summary: "전형적인 사기 수법이 발견되었습니다. 금융감독원 미등록 업체입니다.", thumbnail: "https://picsum.photos/id/1/200/120" },
  { id: '2', title: "임영웅이 광고하는 관절약? 가짜 영상 주의", createdAt: "2026-01-18 11:20", verdict: "위험", summary: "딥페이크 기술을 이용한 허위 광고입니다. 공식 사이트가 아닙니다.", thumbnail: "https://picsum.photos/id/10/200/120" },
  { id: '3', title: "정부 지원금 선착순 지급, 클릭 한 번으로?", createdAt: "2026-01-17 09:00", verdict: "주의", summary: "개인정보 탈취 목적의 피싱 사이트로 유도할 가능성이 큽니다.", thumbnail: "https://picsum.photos/id/20/200/120" },
  { id: '4', title: "삼성전자 공식 이벤트: 갤럭시 S26 무료 증정", createdAt: "2026-01-17 08:30", verdict: "안전", summary: "삼성전자 공식 유튜브 채널에서 확인된 이벤트입니다.", thumbnail: "https://picsum.photos/id/30/200/120" },
  { id: '5', title: "단 3일만! 명품 가방 90% 창고 대방출", createdAt: "2026-01-16 22:15", verdict: "위험", summary: "해외 사기 쇼핑몰입니다. 결제 시 환불이 불가능합니다.", thumbnail: "https://picsum.photos/id/40/200/120" },
  { id: '6', title: "자면서 살 빠지는 패치, 의학적 근거는?", createdAt: "2026-01-16 14:10", verdict: "주의", summary: "식약처 허가 사항과 다른 과대 광고 표현이 다수 포함되어 있습니다.", thumbnail: "https://picsum.photos/id/50/200/120" },
  { id: '7', title: "비트코인 자동 매매 프로그램 무료 배포", createdAt: "2026-01-15 19:50", verdict: "위험", summary: "악성 코드가 포함된 파일 다운로드를 유도하고 있습니다.", thumbnail: "https://picsum.photos/id/60/200/120" },
  { id: '8', title: "나이키 2026 신상 런닝화 리뷰 (내돈내산)", createdAt: "2026-01-15 13:05", verdict: "안전", summary: "뒷광고 정황이 없으며 실제 구매 리뷰로 확인되었습니다.", thumbnail: "https://picsum.photos/id/70/200/120" },
  { id: '9', title: "탈모 완치율 100% 기적의 샴푸 등장", createdAt: "2026-01-14 10:22", verdict: "주의", summary: "효능이 과장되어 있습니다. 질병 치료 의약품이 아닙니다.", thumbnail: "https://picsum.photos/id/80/200/120" },
  { id: '10', title: "[단독] 유명 연예인 도박장 출입 포착 영상", createdAt: "2026-01-14 09:15", verdict: "위험", summary: "자극적인 제목의 낚시성 링크이며 사이트 접속 시 악성 스크립트 실행.", thumbnail: "https://picsum.photos/id/90/200/120" },
  { id: '11', title: "집에서 월 500 벌기? 부업 사기 주의보", createdAt: "2026-01-13 18:40", verdict: "주의", summary: "초기 비용 결제를 유도하는 다단계 방식의 부업입니다.", thumbnail: "https://picsum.photos/id/100/200/120" },
  { id: '12', title: "2026 CES 혁신상 수상 제품 시연 영상", createdAt: "2026-01-13 11:00", verdict: "안전", summary: "공식 기술 시연 영상이며 허위 정보가 없습니다.", thumbnail: "https://picsum.photos/id/110/200/120" },
  { id: '13', title: "유명 유튜버 추천 코인, 지금 사면 대박?", createdAt: "2026-01-12 15:30", verdict: "위험", summary: "전형적인 펌프 앤 덤프(Pump and Dump) 패턴이 의심됩니다.", thumbnail: "https://picsum.photos/id/120/200/120" },
  { id: '14', title: "현대자동차 아이오닉 7 무결점 테스트 완료", createdAt: "2026-01-12 08:20", verdict: "안전", summary: "현대자동차 공식 미디어 채널의 홍보 자료입니다.", thumbnail: "https://picsum.photos/id/130/200/120" },
  { id: '15', title: "아이폰 17 Pro 렌더링 유출 영상", createdAt: "2026-01-11 20:05", verdict: "주의", summary: "단순 예측 영상이며 공식 정보와 다를 수 있습니다.", thumbnail: "https://picsum.photos/id/140/200/120" },
  { id: '16', title: "로또 당첨 번호 예측 알고리즘 판매", createdAt: "2026-01-11 12:45", verdict: "위험", summary: "수학적으로 불가능한 예측을 담보로 결제를 유도합니다.", thumbnail: "https://picsum.photos/id/150/200/120" },
  { id: '17', title: "넷플릭스 2026 상반기 신작 라인업", createdAt: "2026-01-10 10:10", verdict: "안전", summary: "넷플릭스 공식 보도자료에 기반한 정보입니다.", thumbnail: "https://picsum.photos/id/160/200/120" },
  { id: '18', title: "먹기만 해도 눈이 좋아지는 영양제?", createdAt: "2026-01-09 17:30", verdict: "주의", summary: "건강기능식품 심의를 받지 않은 광고 표현이 포함됨.", thumbnail: "https://picsum.photos/id/170/200/120" },
  { id: '19', title: "무료로 풀어주는 유료 유틸리티 10선", createdAt: "2026-01-08 21:50", verdict: "위험", summary: "크랙 파일 설치를 유도하여 랜섬웨어를 유포하고 있습니다.", thumbnail: "https://picsum.photos/id/180/200/120" },
  { id: '20', title: "테슬라 로보택시 서울 주행 현황", createdAt: "2026-01-08 09:40", verdict: "안전", summary: "공식 실증 사업 데이터를 기반으로 한 분석 리포트입니다.", thumbnail: "https://picsum.photos/id/190/200/120" },
];

// -------------------- 2. UTILS (기존 함수들 통합) --------------------
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
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

// 기간 필터 판별 함수
function isWithinRange(dateStr, range) {
  if (range === "전체") return true;
  const itemDate = new Date(dateStr.replace(" ", "T"));
  const now = new Date();
  const diffInDays = (now - itemDate) / (1000 * 60 * 60 * 24);
  if (range === "오늘") return diffInDays <= 1;
  if (range === "1주") return diffInDays <= 7;
  if (range === "1달") return diffInDays <= 30;
  return true;
}

function extractYouTubeId(url) {
  const m = url.match(/[?&]v=([^&]+)|youtu\.be\/([^?&]+)|shorts\/([^?&]+)/);
  return m ? (m[1] || m[2] || m[3]) : null;
}

// -------------------- 3. API PIPELINE --------------------
async function pipelineAnalyze(youtubeUrl) {
  try {
    const res = await fetch(`${API_BASE}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: youtubeUrl }),
    });
    const data = await res.json();
    return {
      videoId: data?.video_id || extractYouTubeId(youtubeUrl),
      title: data?.data?.api_data?.video_info?.items?.[0]?.snippet?.title || "신규 분석 영상",
      verdict: "주의", // 기본값
      summary: "실시간 분석이 완료되었습니다. 상세 내용을 확인하세요.",
    };
  } catch (e) {
    throw new Error("서버 연결 실패");
  }
}

// -------------------- 4. UI COMPONENTS --------------------
function TrustGauge({ verdict }) {
  const color = verdictColor(verdict);
  const progress = verdictProgress(verdict);
  const size = 200;
  const stroke = 16;
  const r = size / 2 - stroke;
  const bgPath = arcPath(size/2, size/2, r, -120, 120);
  const fgPath = arcPath(size/2, size/2, r, -120, -120 + (240 * progress));

  return (
    <View style={styles.gaugeContainer}>
      <Svg width={size} height={size}>
        <Path d={bgPath} stroke="#222" strokeWidth={stroke} strokeLinecap="round" fill="none" />
        <Path d={fgPath} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" />
      </Svg>
      <View style={styles.gaugeOverlay}>
        <Text style={[styles.gaugeVerdictText, { color }]}>{verdict}</Text>
      </View>
    </View>
  );
}

// -------------------- 5. APP MAIN --------------------
export default function App() {
  const [screen, setScreen] = useState("list");
  const [selected, setSelected] = useState(null);
  const [reports, setReports] = useState(INITIAL_REPORTS);
  
  const [filter, setFilter] = useState("전체");
  const [dateFilter, setDateFilter] = useState("전체");
  const [searchText, setSearchText] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ 실시간 다중 필터 통합 (검색어 + 카테고리 + 기간)
  const filteredReports = useMemo(() => {
    return reports.filter(item => {
      const matchCategory = filter === "전체" || item.verdict === filter;
      const matchSearch = item.title.toLowerCase().includes(searchText.toLowerCase());
      const matchDate = isWithinRange(item.createdAt, dateFilter);
      return matchCategory && matchSearch && matchDate;
    });
  }, [reports, filter, searchText, dateFilter]);

  async function handleAnalyze() {
    if (!urlInput.trim()) return;
    setLoading(true);
    try {
      const result = await pipelineAnalyze(urlInput);
      const newItem = {
        id: `r-${Date.now()}`,
        title: result.title,
        createdAt: new Date().toISOString().replace("T", " ").slice(0, 16),
        thumbnail: `https://img.youtube.com/vi/${result.videoId}/hqdefault.jpg`,
        verdict: result.verdict,
        summary: result.summary,
      };
      setReports(prev => [newItem, ...prev]);
      setUrlInput("");
    } catch (e) {
      alert("서버 연결에 실패했습니다. (기존 데이터로 시연 가능)");
    } finally {
      setLoading(false);
    }
  }

  if (screen === "list") {
    return (
      <View style={styles.container}>
        <Text style={styles.logo}>AD Astra</Text>
        <Text style={styles.subLogo}>총 {filteredReports.length}건의 기록</Text>

        <View style={styles.inputRow}>
          <TextInput 
            value={urlInput} 
            onChangeText={setUrlInput} 
            placeholder="URL을 입력하여 분석" 
            placeholderTextColor="#666" 
            style={styles.urlInput} 
          />
          <Pressable onPress={handleAnalyze} style={styles.analyzeBtn}>
            {loading ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.btnText}>분석</Text>}
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <TextInput 
            value={searchText} 
            onChangeText={setSearchText} 
            placeholder="제목으로 검색..." 
            placeholderTextColor="#444" 
            style={styles.searchBar} 
          />
        </View>

        {/* 기간 필터 */}
        <View style={styles.filterGroup}>
          {['전체', '오늘', '1주', '1달'].map(l => (
            <Pressable key={l} onPress={() => setDateFilter(l)} style={[styles.miniBtn, dateFilter === l && styles.activeBtn]}>
              <Text style={[styles.miniBtnText, dateFilter === l && styles.activeBtnText]}>{l}</Text>
            </Pressable>
          ))}
        </View>

        {/* 상태 필터 */}
        <View style={styles.filterGroup}>
          {['전체', '위험', '주의', '안전'].map(l => (
            <Pressable key={l} onPress={() => setFilter(l)} style={[styles.filterBtn, filter === l && styles.activeBtn]}>
              <Text style={[styles.filterBtnText, filter === l && styles.activeBtnText]}>{l}</Text>
            </Pressable>
          ))}
        </View>

        <FlatList
          data={filteredReports}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <Pressable style={styles.listCard} onPress={() => { setSelected(item); setScreen("detail"); }}>
              <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
              <View style={{ flex: 1 }}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.verdictTag, { color: verdictColor(item.verdict) }]}>{item.verdict}</Text>
                </View>
                <Text style={styles.cardDate}>{item.createdAt}</Text>
                <Text style={styles.cardSummary} numberOfLines={1}>{item.summary}</Text>
              </View>
            </Pressable>
          )}
        />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.detailContainer}>
      <Pressable onPress={() => setScreen("list")} style={styles.backBtn}><Text style={styles.backBtnText}>← 목록으로</Text></Pressable>
      <ScrollView>
        <TrustGauge verdict={selected?.verdict} />
        <View style={styles.detailContent}>
          <Text style={styles.detailTitle}>{selected?.title}</Text>
          <Text style={styles.detailDate}>{selected?.createdAt}</Text>
          <View style={styles.divider} />
          <Text style={styles.detailSummary}>{selected?.summary}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", paddingTop: 60, paddingHorizontal: 20 },
  logo: { color: "#fff", fontSize: 28, fontWeight: "900", textAlign: "center" },
  subLogo: { color: "#555", textAlign: "center", marginBottom: 20 },
  inputRow: { flexDirection: "row", gap: 10, marginBottom: 15 },
  urlInput: { flex: 1, backgroundColor: "#111", borderRadius: 12, padding: 12, color: "#fff", borderWidth: 1, borderColor: "#222" },
  analyzeBtn: { backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 20, justifyContent: "center" },
  btnText: { fontWeight: "900", color: "#000" },
  searchRow: { backgroundColor: "#111", borderRadius: 10, paddingHorizontal: 15, marginBottom: 15 },
  searchBar: { height: 40, color: "#fff" },
  filterGroup: { flexDirection: "row", gap: 8, marginBottom: 10 },
  filterBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: "#111", alignItems: "center", borderWidth: 1, borderColor: "#222" },
  miniBtn: { flex: 1, paddingVertical: 5, borderRadius: 8, backgroundColor: "#0a0a0a", alignItems: "center" },
  miniBtnText: { color: "#444", fontSize: 12 },
  activeBtn: { backgroundColor: "#fff", borderColor: "#fff" },
  activeBtnText: { color: "#000", fontWeight: "bold" },
  filterBtnText: { color: "#666", fontWeight: "bold" },
  listCard: { flexDirection: "row", backgroundColor: "#111", padding: 12, borderRadius: 15, marginBottom: 12, gap: 12 },
  thumb: { width: 70, height: 45, borderRadius: 8 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between" },
  cardTitle: { color: "#fff", fontWeight: "bold", flex: 1, marginRight: 10 },
  verdictTag: { fontWeight: "900", fontSize: 12 },
  cardDate: { color: "#444", fontSize: 10, marginTop: 2 },
  cardSummary: { color: "#888", fontSize: 12, marginTop: 5 },
  detailContainer: { flex: 1, backgroundColor: "#000", paddingTop: 50 },
  backBtn: { padding: 20 },
  backBtnText: { color: "#fff", fontSize: 16 },
  gaugeContainer: { alignItems: "center", justifyContent: "center", marginVertical: 20 },
  gaugeOverlay: { position: "absolute" },
  gaugeVerdictText: { fontSize: 40, fontWeight: "900" },
  detailContent: { padding: 25, backgroundColor: "#111", margin: 20, borderRadius: 25 },
  detailTitle: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  detailDate: { color: "#555", marginTop: 5 },
  divider: { height: 1, backgroundColor: "#222", marginVertical: 20 },
  detailSummary: { color: "#ccc", fontSize: 16, lineHeight: 26 }
});