"""Asset / object specific live news.

Google News RSS search (Korean edition; aggregates 연합뉴스·연합인포맥스·다음·언론사 원문), last 3 days, cached 10 min.
Each market tile and each ontology object has a fixed query, so the same click always asks the same question.
"""
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

KST = timezone(timedelta(hours=9))
TTL = 600
UA = {"User-Agent": "Mozilla/5.0 (VALKYRIE-local)", "Accept": "application/rss+xml,application/xml,*/*"}

QUERIES = {
    # market strip tiles (NAVER codes)
    "RTYcv1": "러셀2000", "US10YT=RR": "미국 국채 금리", ".IXIC": "나스닥", ".INX": "S&P500", ".DJI": "다우지수",
    "CLcv1": "국제유가 WTI", "GCcv1": "금값 국제 금", "FX_USDKRW": "원달러 환율", "KOSPI": "코스피", "KOSDAQ": "코스닥",
    "BTC": "비트코인",
    ".N225": "닛케이 지수", ".HSI": "항셍지수", ".SSEC": "상해종합지수", ".TWII": "대만 가권지수", ".GDAXI": "독일 DAX 지수", ".FTSE": "영국 FTSE 지수",
    ".STOXX50E": "유로스톡스", ".VIX": "VIX 변동성지수", "US2YT=RR": "미국 2년물 국채 금리", "US30YT=RR": "미국 30년물 국채 금리",
    "KR3YT=RR": "국고채 3년물 금리", "KR10YT=RR": "국고채 10년물 금리", "FX_JPYKRW": "엔화 환율", "FX_EURKRW": "유로 환율", "FX_CNYKRW": "위안화 환율",
    ".DXY": "달러인덱스", "HGcv1": "구리 가격", "SIcv1": "은 가격", "NGcv1": "천연가스 가격",
    # ontology objects
    "mac_gdp": "GDP 성장률 경기", "mac_uscpi": "미국 CPI 물가", "mac_krcpi": "소비자물가 한국은행", "mac_fed": "연준 FOMC 금리",
    "mac_bok": "한국은행 기준금리", "sig_macro": "기준금리 전망 금통위", "rat_ust": "미국채 10년물 금리", "rat_ktb": "국고채 금리",
    "rat_curve": "장단기 금리차 국고채", "rat_credit": "회사채 스프레드 크레딧", "sig_rates": "채권시장 금리 전망",
    "eq_fin": "기술특례 적자기업 상장", "eq_val": "코스닥 밸류에이션 성장주", "eq_cb": "전환사채 CB 발행",
    "eq_ipo": "공모주 수요예측", "eq_kospi": "코스피 외국인 수급", "sig_equity": "공모주 청약 IPO 시장",
}


class News:
    def __init__(self):
        self.cache = {}
        self.lock = threading.Lock()

    @staticmethod
    def _fetch(q, n):
        url = ("https://news.google.com/rss/search?q=" + urllib.parse.quote(f"{q} when:3d") +
               "&hl=ko&gl=KR&ceid=KR:ko")
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15) as r:
            root = ET.fromstring(r.read())
        items = []
        for it in root.findall("./channel/item")[: n * 2]:
            title = (it.findtext("title") or "").strip()
            src = (it.findtext("source") or "").strip()
            if src and title.endswith(" - " + src):
                title = title[: -len(src) - 3]
            try:
                ts = parsedate_to_datetime(it.findtext("pubDate")).astimezone(KST)
            except (TypeError, ValueError):
                ts = None
            items.append({"title": title, "source": src, "url": it.findtext("link"),
                          "publishedAt": ts.isoformat(timespec="minutes") if ts else None})
        items.sort(key=lambda x: x["publishedAt"] or "", reverse=True)
        seen, out = set(), []
        for x in items:                      # the same wire story often appears under several outlets
            k = x["title"][:28]
            if k not in seen:
                seen.add(k)
                out.append(x)
        return out[:n]

    def search(self, key=None, q=None, n=12):
        q = q or QUERIES.get(key or "")
        if not q:
            return {"query": None, "items": [], "error": "unknown key"}
        now = time.time()
        with self.lock:
            hit = self.cache.get((q, n))
        if hit and now - hit["_t"] < TTL:
            return {k: v for k, v in hit.items() if k != "_t"}
        try:
            items = self._fetch(q, n)
            out = {"query": q, "key": key, "items": items, "source": "Google News RSS (다음·연합 등 집계)",
                   "fetchedAt": datetime.now(KST).isoformat(timespec="seconds"), "status": "LIVE"}
        except Exception as exc:
            if hit:   # keep serving the last good answer
                return {**{k: v for k, v in hit.items() if k != "_t"}, "status": "STALE", "error": str(exc)[:120]}
            return {"query": q, "key": key, "items": [], "status": "ERROR", "error": str(exc)[:120]}
        with self.lock:
            self.cache[(q, n)] = {**out, "_t": now}
        return out
