import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const OUT = path.join(process.cwd(), 'prototype', 'valkyrie-v3', 'data', 'research-insights.json');
const IPO_META = 'https://ipo-market-report.vercel.app/report-meta.json';
const IPO_PDF = 'https://ipo-market-report.vercel.app/report.pdf';
const CB_API = 'https://cb-zero-finder.vercel.app/api/cb-latest';
const UA = 'Mozilla/5.0 (compatible; VALKYRIE-ResearchOS/1.0; +https://alpha-crew-labs.github.io/Valkyrie-Odin/)';

async function fetchAny(url, { json = false, timeout = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { accept: json ? 'application/json,text/plain,*/*' : '*/*', 'user-agent': UA },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return json ? await response.json() : Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9+\-.]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function first(text, regex) {
  const m = String(text || '').match(regex);
  return m ? m : null;
}
function round(v, d = 1) {
  if (!Number.isFinite(v)) return null;
  const p = 10 ** d;
  return Math.round(v * p) / p;
}
function has(v) {
  return v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '-';
}
function isZero(v) {
  const n = num(v);
  return has(v) && n !== null && Math.abs(n) < 1e-9;
}
function cleanName(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

async function collectIpo() {
  const out = {
    ok: false,
    source: 'IPO Market Report',
    url: 'https://ipo-market-report.vercel.app/',
    generatedAt: null,
    period: null,
    companies: null,
    dataDate: null,
    avgCurrentReturnPct: null,
    medianCurrentReturnPct: null,
    aboveOfferCount: null,
    aboveOfferPct: null,
    belowOfferPct: null,
    best: null,
    worst: null,
    status: 'pending',
  };

  let meta = null;
  try {
    meta = await fetchAny(IPO_META, { json: true });
    out.generatedAt = meta?.generatedAt || null;
    out.period = meta?.period || null;
    out.companies = num(meta?.companies);
    out.dataDate = meta?.dataDate || null;
    out.ok = true;
    out.status = 'meta';
  } catch (error) {
    out.metaError = String(error?.message || error);
  }

  try {
    const pdf = await fetchAny(IPO_PDF, { timeout: 30000 });
    const tmp = path.join(os.tmpdir(), `valkyrie-ipo-${process.pid}.pdf`);
    await fs.writeFile(tmp, pdf);
    const { stdout } = await execFileAsync('pdftotext', ['-layout', tmp, '-'], { maxBuffer: 16 * 1024 * 1024 });
    await fs.rm(tmp, { force: true });
    const text = String(stdout || '');

    const avg = first(text, /현재\s*수익률\s*평균\s*\(공모가\s*대비\)\s*[:：]\s*([+-]?\d+(?:\.\d+)?)\s*%/i)
      || first(text, /전체\s*평균\s*[:：]\s*([+-]?\d+(?:\.\d+)?)\s*%/i);
    const med = first(text, /중앙값\s*[:：]\s*([+-]?\d+(?:\.\d+)?)\s*%/i);
    const above = first(text, /공모가\s*상회\s*종목\s*[:：]\s*(\d+)\s*개\s*\(\s*([+-]?\d+(?:\.\d+)?)\s*%\s*\)/i);
    const below = first(text, /공모가\s*하회\s*종목\s*[:：]\s*(\d+)\s*개\s*\(\s*([+-]?\d+(?:\.\d+)?)\s*%\s*\)/i);
    const best = first(text, /최고\s*수익\s*[:：]\s*([^\n(]+?)\s*\(\s*([+-]?\d+(?:\.\d+)?)\s*%\s*\)/i);
    const worst = first(text, /최저\s*수익\s*[:：]\s*([^\n(]+?)\s*\(\s*([+-]?\d+(?:\.\d+)?)\s*%\s*\)/i);

    out.avgCurrentReturnPct = avg ? num(avg[1]) : null;
    out.medianCurrentReturnPct = med ? num(med[1]) : null;
    out.aboveOfferCount = above ? num(above[1]) : null;
    out.aboveOfferPct = above ? num(above[2]) : null;
    out.belowOfferPct = below ? num(below[2]) : null;
    out.best = best ? { name: cleanName(best[1]), returnPct: num(best[2]) } : null;
    out.worst = worst ? { name: cleanName(worst[1]), returnPct: num(worst[2]) } : null;
    out.ok = true;
    out.status = [out.avgCurrentReturnPct, out.aboveOfferPct, out.medianCurrentReturnPct].some(v => v !== null) ? 'ready' : 'meta';
  } catch (error) {
    out.pdfError = String(error?.message || error);
  }

  return out;
}

async function collectCb() {
  const out = {
    ok: false,
    source: 'CB Zero Finder',
    url: 'https://cb-zero-finder.vercel.app/',
    updatedAt: null,
    period: null,
    totalCount: null,
    totalAmountEok: null,
    zeroZeroCount: null,
    zeroZeroSharePct: null,
    averageDilutionPct: null,
    highDilutionSharePct: null,
    topIssue: null,
    status: 'pending',
  };

  try {
    const raw = await fetchAny(CB_API, { json: true, timeout: 30000 });
    const rows = Array.isArray(raw?.rows) ? raw.rows : (Array.isArray(raw?.data?.rows) ? raw.data.rows : []);
    if (!rows.length) throw new Error('CB public endpoint returned no rows');

    const totalAmount = rows.reduce((s, r) => s + (num(r?.amountEok) || 0), 0);
    const zeroZero = rows.filter(r => isZero(r?.surfaceRate) && isZero(r?.maturityRate));
    const dilution = rows.map(r => num(r?.dilutionRate)).filter(v => v !== null);
    const highDilution = dilution.filter(v => v >= 20);
    const top = rows
      .map(r => ({
        name: cleanName(r?.corpName),
        amountEok: num(r?.amountEok),
        dilutionRate: num(r?.dilutionRate),
        date: r?.receiptDate || null,
      }))
      .filter(r => r.amountEok !== null)
      .sort((a, b) => b.amountEok - a.amountEok)[0] || null;

    out.updatedAt = raw?.updatedAt || raw?.generatedAt || null;
    out.period = raw?.period || null;
    out.totalCount = rows.length;
    out.totalAmountEok = round(totalAmount, 1);
    out.zeroZeroCount = zeroZero.length;
    out.zeroZeroSharePct = round(zeroZero.length / rows.length * 100, 1);
    out.averageDilutionPct = dilution.length ? round(dilution.reduce((s, v) => s + v, 0) / dilution.length, 1) : null;
    out.highDilutionSharePct = dilution.length ? round(highDilution.length / dilution.length * 100, 1) : null;
    out.topIssue = top;
    out.ok = true;
    out.status = 'ready';
  } catch (error) {
    out.error = String(error?.message || error);
  }

  return out;
}

const generatedAt = new Date().toISOString();
const [ipo, cb] = await Promise.all([collectIpo(), collectCb()]);
const payload = {
  ok: Boolean(ipo.ok || cb.ok),
  generatedAt,
  cadence: '12H',
  runtimeDependency: 'NONE',
  note: 'Aggregated public insight snapshot only. Browser runtime never calls the source Vercel apps.',
  ipo,
  cb,
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote ${OUT}`);
console.log(JSON.stringify({
  generatedAt,
  ipo: { ok: ipo.ok, status: ipo.status, companies: ipo.companies, avg: ipo.avgCurrentReturnPct, above: ipo.aboveOfferPct },
  cb: { ok: cb.ok, status: cb.status, count: cb.totalCount, zeroZero: cb.zeroZeroSharePct, dilution: cb.averageDilutionPct },
}, null, 2));

if (!payload.ok) process.exitCode = 1;
