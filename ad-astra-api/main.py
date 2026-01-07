import math
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# -------------------- APP --------------------
app = FastAPI(title="AD ASTRA API", version="0.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------- PATHS --------------------
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

# -------------------- IN-MEMORY STORE --------------------
REPORTS: List[Dict[str, Any]] = []
REPORTS_BY_ID: Dict[str, Dict[str, Any]] = {}

# -------------------- HELPERS --------------------
def sanitize_json(value: Any) -> Any:
    """NaN/Inf/NaT 등을 JSON-safe로 변환 (FastAPI 500 방지)"""
    if value is None:
        return None

    # pandas NaN (float)
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value

    # pandas Timestamp / datetime
    if isinstance(value, pd.Timestamp):
        dt = value.to_pydatetime()
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()

    # dict/list 재귀
    if isinstance(value, dict):
        return {str(k): sanitize_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_json(v) for v in value]

    return value


def to_iso(dt_val: Any) -> str:
    """엑셀의 날짜(문자/숫자/타임스탬프)를 ISO8601로 변환"""
    try:
        ts = pd.to_datetime(dt_val, errors="coerce")
        if pd.isna(ts):
            raise ValueError("NaT")
        dt = ts.to_pydatetime()
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def thumb_from_video_id(video_id: str) -> str:
    return f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"


def stable_mock_verdict(video_id: str) -> str:
    """실제 분석 전 임시 verdict: video_id 기반으로 항상 같은 값"""
    h = sum(ord(c) for c in video_id) % 100
    if h >= 70:
        return "위험"
    elif h >= 35:
        return "주의"
    return "안전"


def stable_mock_summary(verdict: str) -> str:
    if verdict == "위험":
        return "임시 요약: 과장·유도 표현 가능성이 높습니다."
    if verdict == "주의":
        return "임시 요약: 일부 표현이 오해를 부를 수 있어 주의가 필요합니다."
    return "임시 요약: 현재로선 큰 위험 신호가 낮아 보입니다."


def load_excels() -> None:
    """data 폴더의 모든 xlsx를 읽어서 REPORTS 생성"""
    global REPORTS, REPORTS_BY_ID

    REPORTS = []
    REPORTS_BY_ID = {}

    if not DATA_DIR.exists():
        print(f"[WARN] data folder not found: {DATA_DIR}")
        return

    excel_files = sorted(DATA_DIR.glob("*.xlsx"))
    if not excel_files:
        print(f"[WARN] no xlsx files in: {DATA_DIR}")
        return

    all_rows: List[Dict[str, Any]] = []
    for f in excel_files:
        df = pd.read_excel(f)
        all_rows.extend(df.to_dict(orient="records"))

    for row in all_rows:
        # ✅ 네 엑셀 헤더에 맞춤
        video_id = str(row.get("영상ID", "")).strip()
        title = str(row.get("영상제목", "")).strip()

        # 필수값 없으면 skip
        if not video_id or not title:
            continue

        report_id = f"rep_{video_id}"
        verdict = stable_mock_verdict(video_id)

        checked_at_raw = row.get("추출일시")  # 검사 날짜로 사용
        checked_at = to_iso(checked_at_raw)

        youtube_url = row.get("원본URL") or f"https://www.youtube.com/watch?v={video_id}"

        item = {
            "id": report_id,
            "title": title,
            "thumbnailUrl": thumb_from_video_id(video_id),
            "checkedAt": checked_at,
            "verdict": verdict,
            "summaryOneLine": stable_mock_summary(verdict),
            "status": "DONE",

            "source": {
                "videoId": video_id,
                "youtubeUrl": sanitize_json(youtube_url),
                "channelName": sanitize_json(row.get("채널명")),
                "channelId": sanitize_json(row.get("채널ID")),
                "durationIso": sanitize_json(row.get("영상길이(ISO)")),
                "viewCount": sanitize_json(row.get("조회수")),
                "likeCount": sanitize_json(row.get("좋아요수")),
                "commentCount": sanitize_json(row.get("댓글수")),
                "publishedAt": sanitize_json(row.get("게시일시")) and to_iso(row.get("게시일시")),
                "extractedAt": to_iso(row.get("추출일시")) if row.get("추출일시") else checked_at,
            },

            # ✅ raw는 꼭 sanitize 해서 넣어야 500 안 남
            "raw": sanitize_json(row),

            "analysis": {
                "verdict": verdict,
                "summaryOneLine": stable_mock_summary(verdict),
                "flags": ["임시 플래그 1", "임시 플래그 2"],
                "evidence": ["임시 근거 A", "임시 근거 B"],
                "model": {"version": "mock-v0"},
            },
        }

        REPORTS.append(item)
        REPORTS_BY_ID[report_id] = item

    # 최신순 정렬
    REPORTS.sort(key=lambda x: x["checkedAt"], reverse=True)
    print(f"[OK] Loaded reports: {len(REPORTS)} from {len(excel_files)} excel files")


@app.on_event("startup")
def on_startup():
    load_excels()


# -------------------- ROUTES --------------------
@app.get("/api/reports")
def list_reports(verdict: Optional[str] = None, limit: int = 50):
    items = REPORTS
    if verdict and verdict != "전체":
        items = [x for x in items if x["verdict"] == verdict]

    limit = max(1, min(limit, 200))

    # 목록 화면용 “가벼운 응답”
    lite = [
        {
            "id": x["id"],
            "title": x["title"],
            "thumbnailUrl": x["thumbnailUrl"],
            "checkedAt": x["checkedAt"],
            "verdict": x["verdict"],
            "summaryOneLine": x["summaryOneLine"],
            "status": x["status"],
        }
        for x in items[:limit]
    ]

    return {"count": len(lite), "items": lite}


@app.get("/api/reports/{report_id}")
def get_report(report_id: str):
    if report_id not in REPORTS_BY_ID:
        raise HTTPException(status_code=404, detail="Report not found")
    return REPORTS_BY_ID[report_id]


@app.post("/api/reload")
def reload_data():
    load_excels()
    return {"ok": True, "count": len(REPORTS)}
