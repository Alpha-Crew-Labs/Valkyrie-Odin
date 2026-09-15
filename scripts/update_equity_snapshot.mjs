import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'prototype', 'valkyrie-v3', 'data', 'equity-pulse.json');
const UA = 'Mozilla/5.0 (compatible; VALKYRIE-ResearchOS/1.0; +https://alpha-crew-labs.github.io/Valkyrie-Odin/)';

const NAVER = {
  KOSPI: {
    realtime: 'https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI',
    basic: 'https://m.stock.naver.com/api/index/KOSPI/basic',
    integration: 'https://m.stock.naver.com/api/index/KOSPI/integration',
  },
  KOSDAQ: {
    realtime: 'https://polling.finance.naver.com/api/realtime/domestic/index/KOSDAQ',
    basic: 'https://m.stock.naver.com/api/index/KOSDAQ/basic',
    integration: 'https://m.stock.naver.com/api/index/KOSDAQ/integration',
  },
};

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[^0-9+\-.]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson(url, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json,text/plain,*/*', 'user-agent': UA },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function safeFetch(url) {
  try { return { ok: true, value: await fetchJson(url), error: null }; }
  catch (error) { return { ok: false, value: null, error: String(error?.message || error) }; }
}

function firstValue(root, keys) {
  const queue = [root], seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        const n = toNumber(current[key]);
        if (n !== null) return n;
      }
    }
    if (Array.isArray(current)) queue.push(...current);
    else queue.push(...Object.values(current));
  }
  return null;
}

function findObject(root, keys) {
  const queue = [root], seen = new Set();
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

function totalInfo(integration, code) {
  const rows = Array.isArray(integration?.totalInfos) ? integration.totalInfos : [];
  const hit = rows.find((row) => row?.code === code || row?.key === code);
  return toNumber(hit?.value);
}

function normalizeIndex(code, realtime, basic, integration) {
  const row = realtime?.datas?.[0] || basic || {};
  let changePct = toNumber(row.fluctuationsRatioRaw ?? row.fluctuationsRatio ?? row.changeRate ?? row.changePct);
  const direction = row.compareToPreviousPrice?.name || row.compareToPreviousPrice?.text || row.fluctuationsType?.name || row.compareToPreviousPrice || '';
  if (changePct !== null && /FALL|DOWN|하락|LOW/i.test(String(direction))) changePct = -Math.abs(changePct);

  const level = toNumber(row.closePriceRaw ?? row.closePrice ?? row.currentPrice ?? basic?.closePrice);
  const change = toNumber(row.compareToPreviousClosePriceRaw ?? row.compareToPreviousClosePrice ?? row.fluctuations ?? basic?.compareToPreviousClosePrice);
  const tradedValueRaw = toNumber(row.accumulatedTradingValueRaw ?? row.accumulatedTradingValue);
  const tradedVolumeRaw = toNumber(row.accumulatedTradingVolumeRaw ?? row.accumulatedTradingVolume);

  return {
    code,
    level,
    change,
    changePct,
    open: toNumber(row.openPriceRaw ?? row.openPrice) ?? totalInfo(integration, 'openPrice'),
    high: toNumber(row.highPriceRaw ?? row.highPrice) ?? totalInfo(integration, 'highPrice'),
    low: toNumber(row.lowPriceRaw ?? row.lowPrice) ?? totalInfo(integration, 'lowPrice'),
    tradedValue: tradedValueRaw ?? totalInfo(integration, 'accumulatedTradingValue'),
    tradedVolume: tradedVolumeRaw ?? totalInfo(integration, 'accumulatedTradingVolume'),
    marketStatus: row.marketStatus || row.ms || basic?.marketStatus || 'SNAPSHOT',
    localTradedAt: row.localTradedAt || basic?.localTradedAt || null,
    source: 'NAVER/KRX',
  };
}

function normalizeFlow(integration) {
  const trend = integration?.dealTrendInfo || findObject(integration, ['personalValue', 'foreignValue', 'institutionalValue']) || {};
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
  const advancers = firstValue(root, ['riseCount', 'risingStockCount', 'riseStockCount', 'upStockCount', 'advancers']);
  const decliners = firstValue(root, ['fallCount', 'fallingStockCount', 'fallStockCount', 'downStockCount', 'decliners']);
  const unchanged = firstValue(root, ['steadyCount', 'unchangedStockCount', 'steadyStockCount', 'unchangedCount']);
  const upper = firstValue(root, ['upperCount', 'upperLimitCount']);
  const lower = firstValue(root, ['lowerCount', 'lowerLimitCount']);
  const directional = (advancers || 0) + (decliners || 0);
  return {
    advancers,
    decliners,
    unchanged,
    upper,
    lower,
    advanceDeclineRatio: directional ? (advancers || 0) / directional : null,
  };
}

function buildPulse(index, flow, breadth) {
  let score = 50;
  const reasons = [];
  if (index.changePct !== null) {
    score += Math.max(-22, Math.min(22, index.changePct * 6));
    reasons.push(`${index.code} ${index.changePct >= 0 ? '+' : ''}${index.changePct.toFixed(2)}%`);
  }
  if (flow.foreign !== null || flow.institution !== null) {
    const smart = (flow.foreign || 0) + (flow.institution || 0);
    score += smart > 0 ? 10 : smart < 0 ? -10 : 0;
    reasons.push(`외국인+기관 ${smart >= 0 ? '+' : ''}${Math.round(smart)}억`);
  }
  if (breadth.advanceDeclineRatio !== null) {
    score += Math.max(-10, Math.min(10, (breadth.advanceDeclineRatio - 0.5) * 24));
    reasons.push(`상승비중 ${(breadth.advanceDeclineRatio * 100).toFixed(0)}%`);
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, regime: score >= 63 ? 'RISK-ON' : score <= 37 ? 'RISK-OFF' : 'NEUTRAL', reasons };
}

function marketBlock(code, realtime, basic, integration) {
  const index = normalizeIndex(code, realtime, basic, integration);
  const flow = normalizeFlow(integration);
  const breadth = normalizeBreadth(integration, basic);
  return { index, flow, breadth, pulse: buildPulse(index, flow, breadth) };
}

async function collectMarket(code) {
  const cfg = NAVER[code];
  const [realtime, basic, integration] = await Promise.all([
    safeFetch(cfg.realtime), safeFetch(cfg.basic), safeFetch(cfg.integration),
  ]);
  if (!realtime.ok && !basic.ok && !integration.ok) {
    throw new Error(`${code}: all NAVER sources failed (${realtime.error}; ${basic.error}; ${integration.error})`);
  }
  return {
    block: marketBlock(code, realtime.value, basic.value, integration.value),
    sourceStatus: {
      realtime: realtime.ok ? 'ok' : realtime.error,
      basic: basic.ok ? 'ok' : basic.error,
      integration: integration.ok ? 'ok' : integration.error,
    },
  };
}

const generatedAt = new Date().toISOString();
const [kospiResult, kosdaqResult] = await Promise.allSettled([
  collectMarket('KOSPI'), collectMarket('KOSDAQ'),
]);

const kospi = kospiResult.status === 'fulfilled' ? kospiResult.value : null;
const kosdaq = kosdaqResult.status === 'fulfilled' ? kosdaqResult.value : null;
if (!kospi && !kosdaq) throw new Error('Both KOSPI and KOSDAQ NAVER collection failed');

const markets = {
  KOSPI: kospi?.block || null,
  KOSDAQ: kosdaq?.block || null,
};
const scores = Object.values(markets).filter(Boolean).map((m) => m.pulse.score);
const compositeScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 50;
const kospiPct = markets.KOSPI?.index?.changePct;
const kosdaqPct = markets.KOSDAQ?.index?.changePct;
const relativeValue = kospiPct !== null && kospiPct !== undefined && kosdaqPct !== null && kosdaqPct !== undefined
  ? Number((kosdaqPct - kospiPct).toFixed(2)) : null;

const payload = {
  ok: true,
  generatedAt,
  provider: 'NAVER Finance / KRX-Koscom redistributed market data',
  mode: 'GITHUB_ACTIONS_SNAPSHOT',
  markets,
  pulse: {
    score: compositeScore,
    regime: compositeScore >= 63 ? 'RISK-ON' : compositeScore <= 37 ? 'RISK-OFF' : 'NEUTRAL',
  },
  relative: {
    kosdaqMinusKospiPctPoint: relativeValue,
    regime: relativeValue === null ? 'N/A' : relativeValue >= 0.5 ? 'RISK CAPITAL LEADS' : relativeValue <= -0.5 ? 'LARGE CAP LEADS' : 'BALANCED',
  },
  sources: {
    KOSPI: kospi?.sourceStatus || { error: kospiResult.reason ? String(kospiResult.reason) : 'unavailable' },
    KOSDAQ: kosdaq?.sourceStatus || { error: kosdaqResult.reason ? String(kosdaqResult.reason) : 'unavailable' },
  },
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote ${OUT}`);
console.log(JSON.stringify({ generatedAt, pulse: payload.pulse, relative: payload.relative, sources: payload.sources }, null, 2));
