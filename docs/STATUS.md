# Project Status

_Last updated: 2026-09-15_

## Current state

VALKYRIE now has a documented product/engineering operating system, a preserved **v2 reference implementation**, and a new **v2.5 release candidate** based on the team's latest Hydro Flow HUD prototype.

### Current release candidate

The current UI source of truth is:

```text
prototype/valkyrie-v2.5/
```

File roles:

```text
index.html       application shell
styles.css       visual / motion system + restrained OSIRIS-lite HUD polish
data.js          ontology / snapshots / evidence / decision-log demo data
core.js          graph construction + Hydro Flow + Canvas field + propagation
view.js          Inspector + domain workspaces
interaction.js   Replay + Command + RUN SIGNATURE + boot / event runtime
```

v2.5 preserves the latest prototype behavior while removing the unused embedded Chart.js/date-adapter payload and keeping the GitHub Pages build local/self-contained.

Implemented v2.5 behavior includes:

- Hydro Flow HUD
- boot / system-initialization sequence
- 16-object Intelligence Chain
- 22 explicit causal relations
- 3 terminal signals
- Shared Duration Logic
- ambient Canvas data field and scanning layer
- cursor telemetry / object acquisition brackets
- causal propagation and signal lock states
- rolling market values
- Evidence / Confidence Inspector
- MACRO / RATES / EQUITY workspaces
- deterministic command routing
- cinematic RUN SIGNATURE
- 5-snapshot temporal Replay
- Decision Log / benchmark-relative outcomes
- restrained OSIRIS-inspired scanline / vignette / mono-HUD treatment without changing VALKYRIE's information architecture

### Preserved reference build

The earlier modular reference remains under:

```text
prototype/valkyrie-v2/
```

Keep v2 as a regression/reference baseline until v2.5 has passed the full demo QA gate. Do not delete it simply because v2.5 is newer.

## Validation

GitHub Actions now validates both builds.

v2 reference checks:

- JavaScript syntax
- exactly 16 objects
- exactly 22 relations
- exactly 5 snapshots
- edge endpoint integrity

v2.5 release checks additionally cover:

- required release files
- local asset references
- no external HTTP runtime dependency from `index.html`
- self-only script CSP
- unique object IDs
- metadata coverage
- snapshot state completeness
- terminal-signal confidence range
- bundled demo date consistency

Validation entry points:

```text
scripts/validate_prototype.mjs
scripts/validate_v25.mjs
.github/workflows/prototype-validation.yml
```

## GitHub Pages

A Pages deployment workflow is committed at:

```text
.github/workflows/pages.yml
```

It publishes only:

```text
prototype/valkyrie-v2.5/
```

Expected project URL after repository-level Pages activation:

```text
https://alpha-crew-labs.github.io/Valkyrie-Odin/
```

### Current blocker

The repository has not yet completed its one-time GitHub Pages activation. The deployment workflow reached `actions/configure-pages` but GitHub returned 404 because Pages is not enabled for the repository yet.

One repository-admin action is required:

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```

After that one-time setting is enabled, the committed workflow can deploy v2.5 and future updates to the same Pages URL automatically.

## Completed foundation

- public organization repository
- product README
- contribution workflow
- PR template / issue templates
- data/security policy
- architecture / product specification
- AI coding guide (`CLAUDE.md`)
- motion system guide
- Quant Engine integration contract
- canonical state / interaction contract
- demo playbook + demo QA gate
- roadmap / decisions / workstreams documentation
- `apps/valkyrie-web` scaffold
- `quant-core` scaffold
- safe `data/sample` boundary
- public-repository guard workflow
- v2 reference prototype
- v2.5 release candidate
- dual prototype validation
- GitHub Pages deployment workflow

## Collaboration branches

Initial domain branches remain:

```text
feat/macro
feat/rates
feat/equity
feat/platform
feat/quant-integration
```

Before starting new domain work, sync the branch from current `main`; main may have advanced since the original branch baseline.

## Next S0 actions

1. Enable GitHub Pages once and verify the public v2.5 URL.
2. Run `docs/DEMO_QA.md` against v2.5 at 1920×1080, 1440×900, and 1366×768.
3. Continue Motion System refinement without breaking causal readability.
4. Integrate Quant Stress as the first object action.
5. Synchronize Macro Clock and Replay semantics.
6. Harden Decision Log / post-performance data semantics.
7. Preserve a deterministic offline fallback for the final hackathon demo.

## Open product decisions

### Ontology count

The current validated implementation is **16 objects / 22 relations**. An earlier planning version referenced 23 relations.

Do not manufacture an extra edge for consistency. Confirm the intended financial relationship with the domain owners, then update ontology, docs, tests, and boot telemetry together if necessary.

### Quant boundary

Preferred architecture:

```text
Python Quant Logic
→ normalized state / JSON
→ VALKYRIE canonical state
→ Ontology / Evidence / Signal / Workspace
```

Do not make Streamlit iframe embedding the final product experience.

## Repository / product risk

The repository is public. Never upload confidential internal data, unpublished internal research, credentials, or restricted datasets.

The largest product risk remains feature accumulation without system integration. New functionality should normally enter through:

```text
OBJECT / SYSTEM ACTION
→ STATE CHANGE
→ ONTOLOGY
→ EVIDENCE
→ SIGNAL
→ ACTION / REPLAY
```

rather than another isolated dashboard tab.
