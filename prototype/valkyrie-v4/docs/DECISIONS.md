# VALKYRIE v4 — Decision Log (financial logic & ontology)

This file records changes to **financial logic, ontology size, and data sources**. These are recorded here, separate from visual changes, as `주식/Valkyrie-Odin/CLAUDE.md` requires.
Date format: KST.

## D-001 · 2026-09-30 · Real equity samples replace the DEMO tables
- **Before:** `10_MODEL/ipo.csv` held about 100 fictional IPOs and `cb.csv` held 50 fictional CBs, both generated at random.
- **After:** `pipeline/collect_research.py` collects real data into `00_RAW/research`:
  - IPO demand forecasts and new listings: 38커뮤니케이션
  - CB issues: CB Zero Finder (DART)
  - Prices and annual financials: NAVER
- **IPO demand node** (IPO DEMAND): median institutional subscription ratio of the last 10 demand forecasts.
- **Loss-making share node** (eq_fin): share of IPOs whose net income in the fiscal year *before* the forecast was negative.
- **Point-in-time rules:**
  - A demand-forecast result is treated as known from the day after the forecast.
  - A CB is included only from its issue date.
- **Assumptions**, labelled on screen:
  - A put becomes exercisable 12 months after issue.
  - If no refixing floor is disclosed ('-'), the CB is treated as having no refixing.
- **CB score:** five checks, all based on real financials.
  - ΔOPM ≥ 0
  - Debt ratio ≤ 150%
  - Quick ratio ≥ 100%
  - Dilution ≤ 15%
  - Put outflow ≤ 30% of annual revenue
- **Focus issuer:** the real CB whose score falls most when the credit spread moves 52 → 68bp, selected automatically.

## D-002 · 2026-09-30 · Equity signal calibrated on real data
- **Why:** the level thresholds were tuned for the DEMO table, so with real data they were on almost all the time.
  - "CB put risk ≥ 20%": 68% of real KOSDAQ CBs trade below their conversion price (median P/CP 0.86).
  - "Demand < 300:1": the real median is about 900.
- **Change:** each element now reacts to a move, to its own history, or to the credit channel.
  - **Discount-rate jump:** KTB 10Y 20-day change + shock > +15bp.
  - **Credit alert:** AA- ≥ 65bp (unchanged).
  - **CB refinancing outflow pressure:** Σ(balance of put-risk CBs × (1 − refinancing access)) ÷ Σ(balance) ≥ 25%. This is the credit → CB bridge: at 52bp it is 14%, at 68bp it is 54%.
  - **Weak demand:** the demand median falls below the bottom 20% of its own trailing 1-year distribution.
- **Result:**
  - Across the five snapshots the IPO call now alternates between hold and selective.
  - Moving credit to 52bp switches the call to selective.

## D-003 · 2026-09-30 · RESEARCH STACK cross-check (owner deep models)
Each VALKYRIE terminal signal is shown next to the owner's own model for the same date, marked agree / partial / conflict. None of the apps were modified; VALKYRIE only reads them.
- **8511 bond crisis diagnosis** (정훈): reads `data/30_BOND/korea_bond_action_plan.json` for the latest date and `korea_bond_action_history.csv` for earlier dates.
  - The Kim filter is refit on the full sample, so this history is **not point-in-time**. The screen says so.
- **8512 equity market diagnosis** (김유찬): runs `equity/equity_plan.py` (load → build_signals → plan_for) read-only in the project `.venv`.
  - Its rules use expanding windows, so the history is point-in-time.
- **8501 macro terminal** (정희강): the app writes no output file, so VALKYRIE **reproduces** its regime rule from FRED data.
  - Rule: the quadrant of (core PCE YoY − 2%, real GDP YoY − 2%), with publication lags applied.

## D-004 · 2026-09-30 · Ontology 16/22 → 17/24: KOSPI object
- **Why:** portfolio managers need the market-wide equity risk (KOSPI) next to the IPO/CB lane, and 8512 already scores it.
- **Added object:** `eq_kospi`. Its value is the KOSPI index (ECOS EOD); its risk is the 8512 risk score (point-in-time).
- **Added relations:**
  - `rat_ust → eq_kospi`, β 0.45, function. Global rates act through foreign flows and the discount rate: ΔKOSPI% = −12 × 0.45 × ΔUST(bp)/100.
    - Under a shock, the 8512 score is re-approximated from its drawdown and 60-day-trend terms.
  - `eq_kospi → sig_equity`, β 0.35, evidence. This becomes the fifth IPO risk element: KOSPI risk score ≥ 0.45.
- **Unchanged:** all existing relations, betas and the MACRO → RATES → EQUITY causal order.

## D-005 · 2026-09-30 · Node risk and the risk thermometer
- **Node risk:** the point-in-time percentile of the node's value within the previous 250 business days, oriented so that the adverse direction scores high. Defined in `valkyrie/risk.py`.
  - Adverse direction: higher yields, wider credit, flatter curve, weaker IPO demand, and so on.
  - KOSPI uses the 8512 score ÷ 0.8.
- **Thermometer:** each lane's temperature is the mean of its nodes' risks; the overall temperature is the mean of the three lanes.
  - Scale 0 → 100 means calm → risk (Fear & Greed style).
- **Where it is used:** node colours (green / amber / red) and all the gauges.
  - Under a what-if shock, risks are recomputed from the shocked values.

## D-006 · 2026-09-30 · Action plan and hourly briefing
- `valkyrie/plan.py` turns VALKYRIE signals plus the owner models into executable lines per desk.
  - Examples: target duration, 3Y KTB futures contracts, KOSPI equity weight and KOSPI200 futures, CB/IPO stance.
- `valkyrie/briefing.py` rebuilds the briefing every hour; 06–10h is the morning briefing.
  - It produces 7 scenes of narration for the browser's speech synthesis.
- All wording is **templates over engine and owner-model numbers**. No LLM generates any number.

## D-012 · 2026-09-30 · Betas re-calibrated on data; every relation explains itself
- **User request:** the relation tooltips ("β0.68 · 판단 규칙의 입력 · 사전 정의 관계 · 런타임에 추가/삭제되지 않음") were meaningless to a PM, and the β values should be checked per node and adjusted sensibly.
- **Method:** OLS of h-day changes (5/20/60 business days, in bp, no intercept) — 2024-01~2026-09 from `10_MODEL/daily.csv`, and 2017~2026 from the bond pipeline's `30_BOND` files (read-only) including the 2022–23 stress window. Script kept in the session scratchpad; results recorded here.
- **Changed betas** (old → new, basis):
  - rat_ust → rat_ktb: 0.62 → **0.35** (5–20d regression 0.33, R² 0.18–0.22)
  - rat_ktb → rat_curve: −0.58 → **−0.10** (stress 2022–23: −0.10 ~ −0.15, R² 0.15–0.22; calm periods ≈ 0)
  - rat_ktb → rat_credit: +0.33 → **+0.20** (stress 60d +0.23, R² 0.11; calm periods −0.09 → stress pass-through kept for what-ifs)
  - rat_ktb → eq_val: 0.57 → **0.90** (KTB 3Y→10Y 0.93, R² 0.79–0.94; now consistent with 1 + curve β)
  - mac_fed → rat_ust: 0.74 → **0.45** (expert: policy step function can't be regressed daily; 2024–26 sign is even negative)
  - mac_fed → mac_bok: 0.46 → **0.40** (60d regression 0.37, R² 0.26)
  - mac_gdp → mac_krcpi: 0.42 → **0.30** (60d 0.23, R² 0.25)
  - rat_ust → eq_kospi: 0.45 → **0.30** (−3.3% per 100bp in 2024–26; D 12y × 0.30 = −3.6%)
- **Kept as expert priors** (labelled on screen): US CPI→Fed 0.71, KR CPI→BOK 0.58, GDP→BOK 0.30, BOK→KTB 0.35, 적자비중→할인율 0.28, 할인율→IPO 0.44 (theory; the 2024–26 sample shows no significant relation, R² 0.04), all evidence weights, CB model couplings.
- **`EDGE_META`** in `valkyrie/ontology.py` now carries `meaning` (what the relation means for a decision, with a worked example) and `basis` (where β comes from). Tooltips, the inspector, node insight and the AI system prompt show them. Ontology size unchanged (17/24).

## D-017 · 2026-09-30 · Forecast-style questions get conditional paths, never "엔진에 없다"; no vendor names on screen
- **Why (user):** "코스피 한달 뒤 전망?" was answered "1개월 점 전망은 엔진에 없다". The PM wants VALKYRIE logic + market state
  combined into a real answer even without a direct data point — for any asset, not just KOSPI. Separately: "NAVER LIVE" on
  screen looks cheap; vendor names are removed from every surface and from the AI's source tags.
- **Rule (ai.py system prompt):** numbers still only from the engine; but for N-month / target / probability / off-engine
  questions the assistant must (1) run 2–3 scenarios (base / up / down) and quote the engine levels per path, (2) weigh the
  paths with 1y percentiles, 20d moves, owner models, flows/money, watch list and news and state a direction with a
  confidence, (3) give numeric triggers, (4) note the limit in one line. Section tags PATHS / JUDGEMENT.
  A target→node/scenario/model map covers KOSPI, KOSDAQ·IPO·CB, KTB/duration/curve, credit, BOK/KR CPI, US rates/Fed,
  off-engine assets (FX, oil, gold, foreign indices → live market + transmission links) and sectors/themes (watch list).
- **Scenario sizing from data:** `Engine.ranges(d)` → per key (ust10, ktb3, ktb10, credit_bp, curve_bp, bok, fed, kospi, kosdaq,
  ipo_demand, kr_cpi, us_cpi): current, 1y min/max/percentile, 20d change and the realised 20d / 60d forward-change
  distribution (p10/p50/p90) over the trailing year. Served in the state as `ranges` and to the AI as `ranges_1y`, so "1개월"
  paths use shocks that actually happened in the last year (e.g. UST 20d p10/p90 = −11/+27bp) instead of round numbers.
- Verified: "코스피 한달 뒤 전망?" → base 6,871 / UST −25bp 6,933 / UST +50bp·크레딧 80bp 6,747, down-path 6:4, PATHS + JUDGEMENT,
  no "엔진에 없다".

## D-016 · 2026-09-30 · The kick: VALKYRIE starts as a question box; the three conclusions are gold
- **Why (mentor via user):** "기능이 너무 많아서 킥이 눈에 안 보인다". The product is an autopilot for PM decisions: the PM asks,
  the chain computes, the desks get an action plan. So the first screen is the question, not the dashboard.
- **Home (`#home`)**: Google-style start on every load — wordmark, one big ask box (rotating example placeholder), 6 example chips,
  today's three conclusions as gold pills (click → that desk's tab), a status line (EOD date · 담당 모델 반영 n/3 · LIVE).
  Submitting hides the home and runs the normal `command(q)` path (AI assistant → chain follows the answer). `url#chain` skips the
  home (QA/deep links), ODIN "홈" and the header wordmark bring it back, Esc closes it.
- **Gold decision nodes**: `g.nd[data-id^="sig_"]` — gold stroke/fill, gold call text and confidence bar, soft pulsing glow
  (`gdp`), regardless of the level colouring that other nodes carry. Everything else on the chain stays as it was.

## D-015 · 2026-09-30 · Briefing player v2 — live, alive, interactive (still no LLM in the script)
- **Live:** a NAVER strip (코스피·코스닥·국고3Y·미10Y·원달러·WTI) and the market-scene tiles keep updating from the market poll while
  the player runs (`VK.brief.live()` from `VK.market` onUpdate), with count-ups and green/red flashes; LIVE/STALE badge + KST clock.
- **Alive:** gauge needles sweep in, bars fill, big numbers count up, sparks draw themselves, each desk scene opens with its
  transmission path (lane nodes → signal) carrying packets, subtitles land word by word, a slow sheen crosses the stage.
- **Interactive:** tile → 110-day chart (player pauses, ▶ 계속), node/pill → node insight, every card → its workspace tab, title → tab,
  new WHAT-IF scene with the engine's preset shocks (auto-plays UST +50bp; a chip click recomputes the chain via `/api/state`,
  shows before/after, the three calls and the 8511 σ-adjusted duration; "체인에 적용" puts it on the main chain), "✦ AI에게 묻기"
  submits a scene-specific question to the assistant. Keys: Space ←→ 1-9 M A Esc.
- New SECTORS scene from the watch list (D-014). 9 scenes ≈ 1:05 at 1.25×. Narration stays templated over engine numbers.

## D-014 · 2026-09-30 · 주목 섹터·테마·종목 (auto watch list) replaces the single CB issuer table
- **Why (user):** the CB·IPO tab led with one auto-picked issuer (아리바이오홀딩스) and its 5-line score table — too narrow to act on.
  The desk wants "what to look at today": sectors first, themes and event stocks next.
- **Rule (`valkyrie/watch.py`, no LLM):** NAVER 업종 (79) and 테마 (new live set `themes`, `stock.naver.com/api/domestic/market/theme/list`)
  ranked by |move| percentile (45%), turnover percentile (25%) and breadth aligned with the move (30%), +15% when a VALKYRIE tag applies.
  Tags come from the current judgement: 할인율 민감 (growth sectors while VALKYRIE rate pressure is up), 금리 상승 수혜 (은행·보험),
  크레딧 경계 (건설·증권·해운 while AA- ≥ 65bp), 시장 위험 경계 (cyclicals while 8512 KOSPI risk ≥ 0.45), 환율 수혜 (exporters on a
  ≥ +0.5% USDKRW day), IPO 보류 국면 (신규상장 themes while the IPO stance is AVOID). Stocks/events: NAVER briefing leaders
  (거래대금·상승률·하락률·관심), leaders of the top sectors, the next IPO 청약/상장 with 경쟁률, the largest KOSDAQ CB filings with
  dilution ≥ 15% (CB Zero Finder) and the engine's soonest Put-risk issuers. Every row keeps its reason and source; "자동 선정 · 투자 권유 아님".
- Surfaces: CB·IPO tab (first two cards), SITREP "주목 섹터", AI context `watch_list`, offline bundle. The credit → CB transmission
  stays as three numbers (spread, refi access, Put-risk count) plus the real CB sample table.

## D-013 · 2026-09-30 · 8511 duration is risk sizing (volatility target), not a rate view; 8512 trades sized against the recorded book
- **Why (from the 8511 owner):** `duration.target = BM × clip(σ_ref / σ20, 0.3..1.2)`. 8511's own finding is that its crisis signals do not
  predict rate direction (corr ±0.06), so `target < BM` means "carry less risk because volatility is high", not "rates go up".
  D-011 had read it as a base *direction* and let a ≥25bp what-if shock "flip" it — that attributed to 8511 a call it never makes.
- **Rule now:** the RATES signal answers two questions separately.
  - *How much* (sizing) — 8511 volatility target. A what-if shock enters as one more day in the 20-day window,
    `σ' = √((19σ20² + Δ10Y²)/20)`, `target' = clip(σ_ref/σ', 0.3, 1.2) × BM`: it shortens duration whichever way rates move
    (today: σ20 5.57, σ_ref 3.48, BM 5.39 → 3.37y; ±25bp → 2.41y; ±50bp → 1.62y, the 0.3 floor). Trade only when the target
    differs from the held duration by ≥ 0.5y (8511's band). `signals.rates.sizing`, hedge contracts = Δduration × 8511's
    contracts-per-year factor (labelled "근사" under a shock). The stance label reads "듀레이션 축소 · 위험 축소", never SHORT = rates up.
  - *Which way* — VALKYRIE's own pressure rule (`Δ국고3Y + 0.35×UST 20d + 20×clamp(Taylor gap)`, ±8bp) is shown as
    "금리 상승/하락 압력 (VALKYRIE)" next to the sizing, as a reference view. It never overrides or "flips" 8511.
  - The internal check between the macro path and VALKYRIE's own pressure is labelled "점검", not "충돌"; the owner-model
    cross-check keeps `conflicts = []` by construction.
- **8512 (from its owner):** `plan_for` sizes `exposure.change` / futures against `current = 1.0` (100% equity). Recommending
  "166계약 매도" every day after the hedge is on is wrong. v4 now keeps a small book (`data/state/book.json`, `/api/book`,
  "보유 기록" in the action-plan card): the held equity weight is passed as `current`, the held duration replaces 8511's BM
  assumption, and a trade line is shown only outside the models' bands (±10%p / 0.5y). Without a record every line says
  "보유 100% 가정" / "보유 = BM 가정" so the reader knows what the number assumes.

## D-011 · 2026-09-30 · Owner models are inputs, not competitors — no more "conflicts"
- **User request:** "모델 일치 2/3 충돌 1 — 앞으로도 모델들이 발키리와 충돌 안 되게".
- **Diagnosis:** the old cross-check compared different questions (8512's KOSDAQ price risk vs VALKYRIE's IPO funding stance) and called the difference a conflict.
- **Change (fusion):** `Tools.anchors(date)` feeds the owner models into `Engine.state(..., anchors)`:
  - **RATES:** the desk's base direction comes from 8511's target duration vs benchmark (±0.5y). A what-if shock can only flip it when the scenario moves KTB 3Y by ≥ 25bp against that direction; the flip is then labelled "충격이 8511 방향을 뒤집음" (informational, PARTIAL).
  - **EQUITY:** the terminal signal is now two parts — market weight and futures hedge from 8512 (`signals.equity.market`, shown as the action line) and the IPO/CB stance from VALKYRIE's funding rules. Different questions, so no comparison.
  - **MACRO:** 8501's US regime is attached as `us_regime` and a reason line; US vs KR divergence is information, not a conflict.
- **Cross-check semantics:** `match` now reports how each model was reflected (✓ 반영 / △ 참고 / · 대기); `conflicts` is empty by construction. Header shows "모델 반영 3/3".
- **Guarantee going forward:** any new owner model must enter through `anchors()` (as an input) rather than as a post-hoc comparison.

## D-010 · 2026-09-30 · "Level, not forecast" — and the research stack is always consulted
- **User correction:** the node gauges (e.g. "위험 99") show **where today's value sits in the last year** (percentile, adverse direction up). They describe the present and the past; they are **not** a judgement about the future. The judgement — how we respond — belongs to the terminal signals, the owner models and the action plan.
- **Changes:**
  - Wording everywhere: "위험 N · 높음" → "LEVEL N · 1년 상단/중간/하단", gauges titled "현재 수준 · 전망 아님", thermometer "현재 스트레스 수준", labels 매우 낮음 … 극단 (level words, not verdict words).
  - Node insight now shows, next to the level, **the desk action plan for that object's domain** (VALKYRIE + owner model), so the "how to respond" is one glance away.
  - AI assistant: keys renamed to `level_pct_1y` / `stress_level_now` with an explicit "not a forecast" note; prompt rule forbids "위험 NN" and requires level wording.
- **Research stack always in the loop:** every engine state carries `tools` (8501 · 8511 · 8512 verdicts and plans) **and** `public_tools` (IPO Market Report meta, CB Zero Finder statistics: issues, zero-coupon share, dilution). They appear in node insights (eq_ipo/eq_fin → IPO Market Report; eq_cb → CB Zero Finder), in the desk plans, and the AI must include a CROSS-CHECK section against them in every answer.
- **8511 credit model (D-009 from the bond session):** v4 reads `verdict / driver / rate_verdict / credit_verdict` from the bond history CSV as-is (no reconstruction), and the latest JSON's credit block (stress, state, target weight, trade) feeds the rates desk plan.

## D-008 · 2026-09-30 · AI decision assistant (Claude) — where the LLM boundary sits
- **User request:** a free-form question box that answers immediately and turns the answer into an action plan, in an operational (Palantir-style) tone. Model: Claude Sonnet 5.5 (`claude-sonnet-5-5`), user's choice; Haiku 4.5 is a supported cheaper switch (`VALKYRIE_AI_MODEL`).
- **Boundary (CLAUDE.md: LLMs must not silently replace deterministic calculations):**
  - Claude only **interprets the question, chooses scenarios, and writes the explanation**.
  - Every number comes from tool results: `run_scenario` → `Engine.state()` + owner models + action plan (deterministic), `search_news` → Google News RSS.
  - The answer is submitted through a strict-schema tool (`finish_answer`): headline, interpretation, actions (desk / action / size / rationale / source / urgency), risks, checkpoints, scenario to apply on the chain, proposed decision, confidence.
  - Prompt rules: numbers only from tools/context, a source tag on every figure, what-if questions must run a scenario, provisional (intraday) values are labelled, conflicts between VALKYRIE and owner models are stated.
- **Trace is shown to the user:** which scenarios were computed and the model's progress notes, so the provenance of each answer is visible.
- **Human stays in the loop:** "apply to chain", "record decision" and "publish draft" are user clicks; the AI never writes to the decision log by itself.
- **Fallback:** without an API key or SDK, the deterministic keyword router (`valkyrie/command.py`) still answers the three preset questions.
- **Cost (measured 2026-09-30, Sonnet 5.5, medium effort):** status question ≈ $0.05 (16 s), what-if with two scenarios ≈ $0.09 (31 s). The system prompt is cached.
- **Secrets:** `ANTHROPIC_API_KEY` lives in `대시보드/.env` (gitignored) and is read only by the server; the browser never sees it.

## D-007 · 2026-09-30 · Live data policy
- Per the user, "external calls 0" is **not** a principle. Investment data is fetched live and aggressively:
  - NAVER quotes, sectors, flows, calendar and news
  - Google News RSS for asset-specific news
  - CB Zero Finder, 38커뮤니케이션, FRED, ECOS
- Every surface is labelled LIVE / FILE / SNAPSHOT / STALE, and falls back to on-disk snapshots when a fetch fails.
- The server refreshes the EOD data (ECOS/FRED → model) every hour. `run.ps1 -Offline` / `--no-refresh` turns this off for demos.

## D-009 · 2026-09-30 · 8511 bond: credit spread model (Model C) and credit sleeve rule
- **Why:** the rate-based diagnosis missed the 2020 COVID credit crunch. From March to June 2020 the rate crisis score peaked at 0.27 (normal) while credit spreads blew out: AA- spread 59 → 141bp, CP−CD 26 → 114bp.
- **Model C · credit stress** (`bond/crisis_dashboard.py`). All z-scores are expanding, so the score is point-in-time.
  - Score = 0.3 × AA- spread z/3 + 0.3 × AA- 20-day widening/20bp + 0.2 × CP−CD z/3 + 0.2 × CP−CD 20-day widening/30bp. Each term is clipped to 0–1, and only widening counts as risk.
  - Result: exactly two credit crisis spans, 2020-03 ~ 2020-09 (COVID) and 2022-10 ~ 2023-01 (Legoland).
- **Verdict change (read by v4):** `diagnosis.verdict` is now the **worse of** rate (Model A + Kim) and credit (Model C).
  - New keys: `driver`, `rate_verdict`, `credit_verdict`, `credit_stress`, `credit_state`.
  - Effect: 2020-04 now reads 위기 (credit-driven); it used to read 안정.
- **Credit sleeve rule** (`bond/action_plan.py`): corporate AA- 3Y swapped against KTB 3Y, so duration is unchanged.
  - Benchmark 20%. Cut to 10% while the AA- spread widened by more than 5bp over 20 days.
  - Otherwise 20% + 10%p × spread z, with z clipped to −1…+2, giving a range of 10–40%. A 2%p no-trade band applies.
- **Evidence (2017–2026):**
  - Wide spreads predict higher 60-day credit excess return (corr +0.21; CP−CD +0.27). 20-day widening predicts further short-term widening (+0.47).
  - Against a fixed 20%: +5.8bp/yr of AUM, credit-sleeve max drawdown −0.50% vs −0.56%, better in 2020, 2022 and 2023.
  - All 6 threshold × coefficient combinations (0/5/10bp × 0.05/0.10) beat the fixed 20% in all three crisis years. The adopted setting is the middle one, not the best.
- **Not modelled:** default losses, and a single AA- 3Y proxy stands for all corporates. Only two big credit episodes are in the sample. The CP-vs-MSB short-term suggestion is a conservative rule without a backtest.
- **Context:** the duration rule is volatility targeting. It was chosen because the crisis signals do not predict rate direction; the first direction-based rule underperformed (0.53% vs 0.99%/yr).
