import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'prototype', 'valkyrie-v3', 'data', 'equity-pulse.json');

const NAVER = {
  KOSPI: {
    realtime: 'https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI',
    basic: 'https://stock.naver.com/api/securityFe/api/index/KOSPI/basic',
    integration: 'https://stock.naver.com/api/securityFe/api/index/KOSPI/integration',
  },
  KOSDAQ: {
    realtime: 'https://polling.finance.naver.com/api/realtime/domestic/index/KOSDAQ',
    basic: 'https://stock.naver.com/api/securityFe/api/index/KOSDAQ/basic',
    integration: 'https://stock.naver.com/api/securityFe/api/index/KOSDAQ/integration',
  },
};

const YAHOO = {
  KOSPI: 'https://query1.finance.yahoo.com/v8/finance/chart/%5EKS11?interval=5m&range=1d',
  KOSDAQ: 'https://query1.finance.yahoo.com/v8/finance/chart/%5EKQ11?interval=5m&range=1d',
};

const AIK = {
  today: 'https://aikstockdata.com/data/public/today.json',
  index: 'https://aikstockdata.com/data/public/index.json',
  intraday: 'https://aikstockdata.com/data/public/disclosures_intraday.json',
};

const TRADINGVIEW_URL = 'https://scanner.tradingview.com/korea/scan';
const UA = 'Mozilla/5.0 (compatible; VALKYRIE-ResearchOS/1.3; +https://alpha-crew-labs.github.io/Valkyrie-Odin/)';

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/[^0-9+\-.]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson(url, { timeout = 7000, headers = {}, method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method,
      headers: { accept: 'application/json,text/plain,*/*', 'user-agent': UA, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function settled(name, fn) {
  try {
    return { name, ok: true, value: await fn() };
  } catch (error) {
    return { name, ok: false, error: String(error?.message || error), value: null };
  }
}

function firstObjectWithKeys(root, keys) {
  const queue = [root];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (keys.every((key) => Object.prototype.hasOwnProperty.call(current, key))) return current;
    if (Array.isArray(current)) queue.push(...current);
    else queue.push(...Object.values(current));
  }
  return null;
}

function pickFirst(root, candidates) {
  const queue = [root];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    for (const key of candidates) {
      if (!Object.prototype.hasOwnProperty.call(current, key)) continue;
      const value = toNumber(current[key]);
      if (value !== null) return value;
    }
    if (Array.isArray(current)) queue.push(...current);
    else queue.push(...Object.values(current));
  }
  return null;
}

function normalizeYahoo(chart) {
  const result = chart?.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta || {};
  const quote = result.indicators?.quote?.[0] || {};
  const finite = (arr) => Array.isArray(arr) ? arr.filter(Number.isFinite) : [];
  const closes = finite(quote.close);
  const opens = finite(quote.open);
  const highs = finite(quote.high);
  const lows = finite(quote.low);
  const volumes = finite(quote.volume);
  const level = toNumber(meta.regularMarketPrice) ?? closes.at(-1) ?? null;
  const prev = toNumber(meta.chartPreviousClose ?? meta.previousClose);
  const change = level !== null && prev !== null ? level - prev : null;
  const changePct = change !== null && prev ? (change / prev) * 100 : null;
  const ts = Array.isArray(result.timestamp) ? result.timestamp.at(-1) : null;
  return {
    level,
    change,
    changePct,
    open: opens[0] ?? null,
    high: highs.length ? Math.max(...highs) : null,
    low: lows.length ? Math.min(...lows) : null,
    volume: volumes.length ? volumes.reduce((a, b) => a + b, 0) : null,
    localTradedAt: ts ? new Date(ts * 1000).toISOString() : null,
  };
}

function normalizeIndex(code, realtime, basic, yahoo) {
  const row = realtime?.datas?.[0] || basic || {};
  let level = toNumber(row.closePriceRaw ?? row.closePrice ?? row.currentPrice);
  let change = toNumber(row.compareToPreviousClosePriceRaw ?? row.compareToPreviousClosePrice ?? row.fluctuations);
  let changePct = toNumber(row.fluctuationsRatioRaw ?? row.fluctuationsRatio ?? row.prevChangeRate);
  const direction = row.compareToPreviousPrice?.name || row.compareToPreviousPrice?.text || row.fluctuationsType?.name || '';
  if (changePct !== null && /FALL|하락|LOW/i.test(String(direction))) changePct = -Math.abs(changePct);
  let source = level !== null ? 'NAVER' : null;
  if (level === null && yahoo) {
    level = yahoo.level;
    change = yahoo.change;
    changePct = yahoo.changePct;
    source = yahoo.level !== null ? 'YAHOO_FALLBACK' : null;
  }
  return {
    code,
    level,
    change,
    changePct,
    open: toNumber(row.openPriceRaw ?? row.openPrice) ?? yahoo?.open ?? null,
    high: toNumber(row.highPriceRaw ?? row.highPrice) ?? yahoo?.high ?? null,
    low: toNumber(row.lowPriceRaw ?? row.lowPrice) ?? yahoo?.low ?? null,
    tradedValue: toNumber(row.accumulatedTradingValueRaw ?? row.accumulatedTradingValue),
    tradedVolume: toNumber(row.accumulatedTradingVolumeRaw ?? row.accumulatedTradingVolume) ?? yahoo?.volume ?? null,
    marketStatus: row.marketStatus || row.ms || basic?.marketStatus || (source === 'YAHOO_FALLBACK' ? 'DELAYED' : null),
    localTradedAt: row.localTradedAt || basic?.localTradedAt || yahoo?.localTradedAt || null,
    source,
  };
}

function normalizeInvestorFlow(integration) {
  const trend = integration?.dealTrendInfo || firstObjectWithKeys(integration, ['personalValue', 'foreignValue', 'institutionalValue']) || {};
  return {
    basisLabel: trend.bizdate || trend.localTradedAt || null,
    personal: toNumber(trend.personalValue),
    foreign: toNumber(trend.foreignValue),
    institution: toNumber(trend.institutionalValue),
    unit: '억원',
  };
}

function normalizeBreadth(integration, basic) {
  const root = { integration, basic };
  const advancers = pickFirst(root, ['risingStockCount', 'riseStockCount', 'upStockCount', 'advanceCount', 'advancers', 'riseCount']);
  const decliners = pickFirst(root, ['fallingStockCount', 'fallStockCount', 'downStockCount', 'declineCount', 'decliners', 'fallCount']);
  const unchanged = pickFirst(root, ['unchangedStockCount', 'steadyStockCount', 'flatStockCount', 'unchangedCount', 'steadyCount']);
  if (advancers === null && decliners === null && unchanged === null) return null;
  const directional = (advancers || 0) + (decliners || 0);
  return { advancers, decliners, unchanged, advanceDeclineRatio: directional ? (advancers || 0) / directional : null };
}

function buildPulse(index, flow, breadth) {
  let score = 50;
  const reasons = [];
  if (index.changePct !== null) {
    score += Math.max(-22, Math.min(22, index.changePct * 6));
    reasons.push(`${index.code} ${index.changePct >= 0 ? '+' : ''}${index.changePct.toFixed(2)}%`);
  }
  const smartFlow = (flow.foreign || 0) + (flow.institution || 0);
  if (flow.foreign !== null || flow.institution !== null) {
    score += smartFlow > 0 ? 10 : smartFlow < 0 ? -10 : 0;
    reasons.push(`외국인+기관 ${smartFlow >= 0 ? '+' : ''}${Math.round(smartFlow)}억`);
  }
  if (breadth?.advanceDeclineRatio !== null && breadth?.advanceDeclineRatio !== undefined) {
    score += Math.max(-10, Math.min(10, (breadth.advanceDeclineRatio - 0.5) * 24));
    reasons.push(`상승비중 ${(breadth.advanceDeclineRatio * 100).toFixed(0)}%`);
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, regime: score >= 63 ? 'RISK-ON' : score <= 37 ? 'RISK-OFF' : 'NEUTRAL', reasons };
}

function marketBlock(code, realtime, basic, integration, yahoo) {
  const index = normalizeIndex(code, realtime, basic, yahoo);
  const flow = normalizeInvestorFlow(integration);
  const breadth = normalizeBreadth(integration, basic);
  return { index, flow, breadth, pulse: buildPulse(index, flow, breadth) };
}

function dateAgeDays(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/[^0-9]/g, '');
  if (s.length < 8) return null;
  const d = new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function normalizeIntraday(raw) {
  const events = Array.isArray(raw?.events) ? raw.events : Array.isArray(raw) ? raw : [];
  return {
    count: events.length,
    preOpen: events.filter((e) => e?.session === 'pre_open').length,
    intraday: events.filter((e) => e?.session === 'intraday').length,
    afterClose: events.filter((e) => e?.session === 'after_close').length,
    top: events.slice(0, 8).map((item) => ({
      name: item?.name || item?.corp_name || item?.company || null,
      code: item?.code || item?.stock_code || null,
      market: item?.market || null,
      label: item?.label || item?.report_nm || item?.title || null,
      receiptTime: item?.receipt_time || item?.time || null,
      session: item?.session || null,
      score: toNumber(item?.score),
      fact: item?.fact || item?.summary || null,
      url: item?.url || item?.dart_url || null,
    })),
  };
}

function normalizeResearch(today, indexMeta, intradayRaw) {
  if (!today || typeof today !== 'object') return { ok: false, error: 'research_unavailable' };
  const quoteAsOf = today.quote_as_of || today.as_of || null;
  const ageDays = dateAgeDays(quoteAsOf);
  const freshness = indexMeta?.freshness?.status || null;
  const stale = ageDays !== null ? ageDays > 4 : freshness === 'stale';
  const safe = (value, n = 3) => Array.isArray(value) ? value.slice(0, n) : [];
  return {
    ok: true,
    provider: 'aikstockdata',
    source: today.source || 'DART · 금융위원회 공공데이터포털',
    generatedKst: today.generated_kst || indexMeta?.generated_kst || null,
    quoteAsOf,
    disclosureThrough: today.disclosure_through || null,
    freshness,
    ageDays,
    stale,
    marketBreadth: today.market_breadth || null,
    highsLows52w: today.highs_lows_52w || null,
    earnings: {
      reportedN: toNumber(today.earnings_reported_n ?? today.earnings_stats?.reported_n),
      improveRatePct: toNumber(today.earnings_improve_rate_pct ?? today.earnings_stats?.improve_rate_pct),
      turnaroundCount: toNumber(today.earnings_turnaround_n ?? today.earnings_turnaround?.count),
      scope: today.earnings_stats?.scope || null,
    },
    growthTop: safe(today.growth_top3, 3).map((item) => ({
      name: item?.name || null,
      code: item?.code || null,
      score: toNumber(item?.score),
      revenueYoyPct: toNumber(item?.revenue_yoy_pct),
      operatingIncomeYoyPct: toNumber(item?.operating_income_yoy_pct),
      status: item?.status || null,
      jsonUrl: item?.json_url || null,
    })),
    topDisclosures: safe(today.top_disclosures, 5).map((item) => ({
      name: item?.name || null,
      market: item?.market || null,
      label: item?.label || null,
      score: toNumber(item?.score),
      fact: item?.fact || null,
      dartUrl: item?.url || null,
    })),
    intraday: normalizeIntraday(intradayRaw),
  };
}

const TV_COLUMNS = [
  'name','description','close','change','volume','Value.Traded','relative_volume_10d_calc',
  'market_cap_basic','price_earnings_ttm','price_book_fq','RSI','Perf.W','Perf.1M','Perf.3M','sector'
];

function normalizeScanner(raw) {
  if (!raw || !Array.isArray(raw.data)) return { ok: false, error: 'scanner_unavailable' };
  const rows = raw.data.map((row) => {
    const d = Array.isArray(row?.d) ? row.d : [];
    const x = Object.fromEntries(TV_COLUMNS.map((key, i) => [key, d[i] ?? null]));
    const symbol = String(row?.s || '');
    return {
      symbol,
      code: String(x.name || symbol.split(':').pop() || '').replace(/^A/, ''),
      name: x.description || x.name || symbol,
      close: toNumber(x.close), changePct: toNumber(x.change), volume: toNumber(x.volume),
      tradedValue: toNumber(x['Value.Traded']), relativeVolume10d: toNumber(x.relative_volume_10d_calc),
      marketCap: toNumber(x.market_cap_basic), per: toNumber(x.price_earnings_ttm), pbr: toNumber(x.price_book_fq),
      rsi: toNumber(x.RSI), perf1w: toNumber(x['Perf.W']), perf1m: toNumber(x['Perf.1M']), perf3m: toNumber(x['Perf.3M']),
      sector: x.sector || null,
    };
  }).filter((r) => r.code || r.name);
  const topTurnover = rows.slice(0, 10);
  const topMomentum = [...rows].filter((r) => r.changePct !== null).sort((a,b) => b.changePct-a.changePct).slice(0,5);
  const topRelativeVolume = [...rows].filter((r) => r.relativeVolume10d !== null).sort((a,b) => b.relativeVolume10d-a.relativeVolume10d).slice(0,5);
  const sectorMap = new Map();
  for (const r of rows) {
    if (!r.sector) continue;
    const s = sectorMap.get(r.sector) || { sector:r.sector,n:0,up:0,avgChangePct:0,tradedValue:0 };
    s.n++; s.up += r.changePct > 0 ? 1 : 0; s.avgChangePct += r.changePct || 0; s.tradedValue += r.tradedValue || 0;
    sectorMap.set(r.sector,s);
  }
  const sectors = [...sectorMap.values()].map((s) => ({ ...s, avgChangePct:s.n?s.avgChangePct/s.n:null, upSharePct:s.n?s.up/s.n*100:null })).sort((a,b)=>b.tradedValue-a.tradedValue).slice(0,6);
  return {
    ok:true, provider:'TradingView Korea Scanner', universeReturned:rows.length,
    topTurnover, topMomentum, topRelativeVolume, sectors,
    technical:{
      rsi60SharePct:rows.length?rows.filter((r)=>(r.rsi||0)>=60).length/rows.length*100:null,
      positive1mSharePct:rows.length?rows.filter((r)=>(r.perf1m||0)>0).length/rows.length*100:null,
    },
  };
}

async function enrichCompany(row) {
  if (!/^\d{6}$/.test(String(row?.code || ''))) return { ...row, detail:null };
  const code = row.code;
  const [basic, integration, aik] = await Promise.all([
    settled('naverBasic', () => fetchJson(`https://m.stock.naver.com/api/stock/${code}/basic`, { headers:{referer:`https://m.stock.naver.com/domestic/stock/${code}/total`} })),
    settled('naverIntegration', () => fetchJson(`https://m.stock.naver.com/api/stock/${code}/integration`, { headers:{referer:`https://m.stock.naver.com/domestic/stock/${code}/total`} })),
    settled('aikStock', () => fetchJson(`https://aikstockdata.com/data/public/s/${code}.json`, { timeout:6000 })),
  ]);
  const b=basic.value||{},i=integration.value||{},a=aik.value||{};
  return {
    ...row,
    detail:{
      name:b.stockName||b.itemName||a.name||row.name,
      price:toNumber(b.closePriceRaw??b.closePrice??b.currentPrice)??row.close,
      marketCap:pickFirst(b,['marketValue','marketCap','marketValueRaw'])??row.marketCap,
      per:pickFirst(b,['per','perValue'])??pickFirst(a,['per','pe'])??row.per,
      pbr:pickFirst(b,['pbr','pbrValue'])??pickFirst(a,['pbr','pb'])??row.pbr,
      foreignOwnershipPct:pickFirst(b,['foreignRate','foreignRatio']),
      high52w:pickFirst(b,['highPriceOf52Weeks','highestPrice52Weeks','fiftyTwoWeekHigh']),
      low52w:pickFirst(b,['lowPriceOf52Weeks','lowestPrice52Weeks','fiftyTwoWeekLow']),
      foreignFlow:pickFirst(i,['foreignValue']), institutionFlow:pickFirst(i,['institutionalValue']),
      revenueYoyPct:pickFirst(a,['revenue_yoy_pct','sales_yoy_pct']),
      operatingIncomeYoyPct:pickFirst(a,['operating_income_yoy_pct','op_income_yoy_pct']),
      quoteAsOf:a.quote_as_of||a.as_of||null,
      providerHealth:{naverBasic:basic.ok,naverIntegration:integration.ok,aikStock:aik.ok},
    }
  };
}

function buildRelative(kospi,kosdaq){
  const kp=kospi?.index?.changePct,kd=kosdaq?.index?.changePct;
  const spread=Number.isFinite(kd)&&Number.isFinite(kp)?kd-kp:null;
  return { kosdaqMinusKospiPctPoint:spread, regime:spread===null?'N/A':spread>=.5?'RISK-CAPITAL LEADS':spread<=-.5?'LARGE-CAP LEADS':'BALANCED' };
}

const tasks = [
  settled('naverKospiRealtime',()=>fetchJson(NAVER.KOSPI.realtime,{headers:{referer:'https://stock.naver.com/'}})),
  settled('naverKospiBasic',()=>fetchJson(NAVER.KOSPI.basic,{headers:{referer:'https://stock.naver.com/'}})),
  settled('naverKospiIntegration',()=>fetchJson(NAVER.KOSPI.integration,{headers:{referer:'https://stock.naver.com/'}})),
  settled('naverKosdaqRealtime',()=>fetchJson(NAVER.KOSDAQ.realtime,{headers:{referer:'https://stock.naver.com/'}})),
  settled('naverKosdaqBasic',()=>fetchJson(NAVER.KOSDAQ.basic,{headers:{referer:'https://stock.naver.com/'}})),
  settled('naverKosdaqIntegration',()=>fetchJson(NAVER.KOSDAQ.integration,{headers:{referer:'https://stock.naver.com/'}})),
  settled('yahooKospi',()=>fetchJson(YAHOO.KOSPI)),
  settled('yahooKosdaq',()=>fetchJson(YAHOO.KOSDAQ)),
  settled('aikToday',()=>fetchJson(AIK.today,{timeout:8000})),
  settled('aikIndex',()=>fetchJson(AIK.index,{timeout:8000})),
  settled('aikIntraday',()=>fetchJson(AIK.intraday,{timeout:8000})),
  settled('tradingViewScanner',()=>fetchJson(TRADINGVIEW_URL,{method:'POST',timeout:8000,headers:{'content-type':'application/json'},body:{filter:[],options:{lang:'ko'},markets:['korea'],symbols:{query:{types:[]},tickers:[]},columns:TV_COLUMNS,sort:{sortBy:'Value.Traded',sortOrder:'desc'},range:[0,59]}})),
];

const results = await Promise.all(tasks);
const by = Object.fromEntries(results.map((r)=>[r.name,r]));
const yahooKospi=normalizeYahoo(by.yahooKospi.value),yahooKosdaq=normalizeYahoo(by.yahooKosdaq.value);
const kospi=marketBlock('KOSPI',by.naverKospiRealtime.value,by.naverKospiBasic.value,by.naverKospiIntegration.value,yahooKospi);
const kosdaq=marketBlock('KOSDAQ',by.naverKosdaqRealtime.value,by.naverKosdaqBasic.value,by.naverKosdaqIntegration.value,yahooKosdaq);
const scores=[kospi.pulse.score,kosdaq.pulse.score].filter(Number.isFinite);
const compositeScore=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):50;
const scanner=normalizeScanner(by.tradingViewScanner.value);
const topForEnrichment=scanner.ok?scanner.topTurnover.filter((x)=>/^\d{6}$/.test(String(x.code))).slice(0,6):[];
const companies=await Promise.all(topForEnrichment.map(enrichCompany));

const payload={
  ok: kospi.index.level!==null||kosdaq.index.level!==null,
  generatedAt:new Date().toISOString(),
  refreshHintMs:300000,
  mode:'GITHUB_ACTIONS_SNAPSHOT',
  source:{
    livePrimary:'Naver Stock public market data · KRX/Koscom redistributed',
    liveFallback:'Yahoo Finance chart API',
    scannerProvider:'TradingView Korea Scanner public web endpoint',
    researchProvider:'aikstockdata public JSON · DART/FSC processed data',
    runtimeProxy:false,
    note:'Static same-origin snapshot generated by GitHub Actions. Public web endpoints may change; licensed feeds are preferred for production trading.'
  },
  sources:Object.fromEntries(results.map((r)=>[r.name,r.ok])),
  markets:{KOSPI:kospi,KOSDAQ:kosdaq},
  relative:buildRelative(kospi,kosdaq),
  pulse:{score:compositeScore,regime:compositeScore>=63?'RISK-ON':compositeScore<=37?'RISK-OFF':'NEUTRAL',reasons:[...kospi.pulse.reasons,...kosdaq.pulse.reasons]},
  scanner,
  research:normalizeResearch(by.aikToday.value,by.aikIndex.value,by.aikIntraday.value),
  companies,
  errors:Object.fromEntries(results.filter((r)=>!r.ok).map((r)=>[r.name,r.error])),
};

if (!payload.ok) {
  console.error('No KOSPI/KOSDAQ market level available; refusing to replace the snapshot.');
  process.exit(2);
}

await fs.mkdir(path.dirname(OUT),{recursive:true});
await fs.writeFile(OUT,JSON.stringify(payload,null,2)+'\n','utf8');
console.log(`Wrote ${OUT}`);
console.log(JSON.stringify({generatedAt:payload.generatedAt,pulse:payload.pulse,relative:payload.relative,sources:payload.sources,companies:payload.companies.length},null,2));
