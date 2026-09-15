# Architecture Decision Log

This file records high-level decisions that should not be casually reversed during hackathon development.

## ADR-001 — VALKYRIE is a unified operating surface

**Decision:** Do not present MACRO, RATES and EQUITY as three unrelated embedded apps.

**Reason:** The product value is the connected decision loop, not the number of tools.

**Consequence:** Domain features should share state, interaction grammar and visual language.

---

## ADR-002 — Fixed financial ontology

**Decision:** Use a team-defined causal ontology rather than a free-layout/LLM-generated graph.

**Reason:** The system should communicate known financial reasoning clearly and reproducibly.

**Consequence:** Data may change node state and signal confidence, but not silently invent causal edges.

---

## ADR-003 — Quant logic is separate from UI

**Decision:** Treat Python/Streamlit work as Quant Engine logic and data products; render results inside VALKYRIE.

**Reason:** Embedding a separate Streamlit visual experience would fragment the platform.

**Consequence:** Prefer normalized JSON/API contracts.

---

## ADR-004 — Static fallback is mandatory

**Decision:** Core demo flows must work from bundled snapshots/presets.

**Reason:** Hackathon network/API reliability cannot be assumed.

**Consequence:** Live data is an enhancement, not a single point of failure.

---

## ADR-005 — Replay uses explicit data vintage

**Decision:** Historical replay must disclose whether values are point-in-time or revision-adjusted.

**Reason:** Replaying revised macro data as if it were available historically can create look-ahead bias.

**Consequence:** Show `DATA VINTAGE`; use PIT data for serious validation when available.

---

## ADR-006 — Motion carries semantic meaning

**Decision:** Reuse a consistent motion grammar rather than adding independent decorative animation.

**Reason:** VALKYRIE should feel advanced without becoming a game/cyberpunk interface.

**Consequence:** Spark = transmission, Sweep = state/time transition, Bracket = acquisition, Rolling = data change, Pulse = event/signal.

---

## ADR-007 — Public repository means public-safe data only

**Decision:** No confidential internal data is committed while the repository remains public.

**Reason:** Public repositories are searchable, cloneable and forkable even if the URL is not widely shared.

**Consequence:** Internal sources must remain outside the repository or move behind an approved private/internal boundary.
