# VALKYRIE Documentation Index

Start here when joining the project.

## 30-second orientation

VALKYRIE is not a collection of dashboards. It is a shared decision system built around:

```text
OBJECT
→ ONTOLOGY
→ EVIDENCE
→ SIGNAL
→ ACTION
→ REPLAY / TRACK RECORD
```

The current runnable behavior reference is under [`../prototype/valkyrie-v2/`](../prototype/valkyrie-v2/).

## Product

- [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md) — what VALKYRIE is and what the MVP must do
- [`STATUS.md`](./STATUS.md) — current repository/project status
- [`ROADMAP.md`](./ROADMAP.md) — implementation milestones and priorities
- [`DECISIONS.md`](./DECISIONS.md) — architecture decisions that should not be casually reversed
- [`ONTOLOGY.md`](./ONTOLOGY.md) — current object/relation map and ontology rules

## Architecture & state

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system architecture
- [`STATE_MODEL.md`](./STATE_MODEL.md) — canonical state and interaction contract
- [`QUANT_INTEGRATION.md`](./QUANT_INTEGRATION.md) — how Quant Macro Terminal capabilities enter VALKYRIE
- [`DATA_POLICY.md`](./DATA_POLICY.md) — public-repository data rules

## UX / Motion / Demo

- [`MOTION_SYSTEM.md`](./MOTION_SYSTEM.md) — cinematic motion and always-alive interaction grammar
- [`DEMO_PLAYBOOK.md`](./DEMO_PLAYBOOK.md) — 60s/30s demo sequence and fallback plan
- [`DEMO_QA.md`](./DEMO_QA.md) — acceptance criteria / release gate for hackathon presentation

## Team & collaboration

- [`WORKSTREAMS.md`](./WORKSTREAMS.md) — MACRO / RATES / EQUITY / platform ownership
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — Git/PR workflow
- [`../CLAUDE.md`](../CLAUDE.md) — working contract for AI-assisted development
- [`../SECURITY.md`](../SECURITY.md) — security and data handling

## Code landmarks

```text
prototype/valkyrie-v2/   runnable behavior reference
apps/valkyrie-web/        target production web application
quant-core/               Python quant logic
scripts/                  repository validation / safety tooling
data/sample/              public-safe sample data only
```

## Automated checks

Two GitHub Actions workflows protect `main`:

1. **Public Repo Guard** — checks tracked files for public-repository safety patterns.
2. **Prototype Validation** — checks JavaScript syntax, required prototype files, ontology invariants, valid edge endpoints, terminal-signal metadata and snapshot completeness.

Treat a failing check as a release blocker for demo-critical changes.

## Recommended reading order for a new teammate

1. `README.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/STATUS.md`
4. `docs/ONTOLOGY.md`
5. `docs/STATE_MODEL.md`
6. your domain section / `docs/WORKSTREAMS.md`
7. `docs/MOTION_SYSTEM.md`
8. `docs/DEMO_QA.md`

## Recommended reading order for AI coding agents

1. `CLAUDE.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/ARCHITECTURE.md`
4. `docs/STATE_MODEL.md`
5. relevant domain/integration document
6. `docs/MOTION_SYSTEM.md` for UI/interaction work
7. `docs/DEMO_QA.md` before changing demo-critical behavior

## Non-negotiable public-repo rule

Do not commit confidential Hanwha Asset Management data, unpublished internal research, credentials, personal/customer data, or restricted datasets. Use sample/synthetic data here and keep internal adapters/data in an approved private environment.
