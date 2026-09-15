# Project Status

_Last updated: 2026-09-15_

## Current state

VALKYRIE now has both a project operating system **and a runnable v2 reference implementation** inside the repository.

### Completed foundation

- public organization repository
- product README
- contribution workflow
- PR template
- issue templates
- data/security policy
- architecture guide
- product specification
- AI coding guide (`CLAUDE.md`)
- motion system guide
- Quant Engine integration contract
- canonical state / interaction contract
- demo playbook
- demo QA / release gate
- roadmap / decisions / workstreams documentation
- `apps/valkyrie-web` scaffold
- `quant-core` scaffold
- safe `data/sample` boundary
- public-repository guard workflow

### Runnable reference prototype imported

The working VALKYRIE v2 prototype now lives under:

```text
prototype/valkyrie-v2/
```

It has been split into collaboration-friendly modules:

```text
index.html     UI shell
styles.css     visual / motion system
data.js        ontology / snapshots / evidence
system.js      graph + Inspector + workspace rendering
runtime.js     Replay / Command / Signature / event runtime
```

The previous single-file prototype bundled a large unused Chart.js/date-adapter payload. The repository reference removes that dependency and keeps the current demo path framework-light and local.

Implemented reference behavior includes:

- boot sequence
- 16-object Intelligence Chain
- 22 explicit relations in the current v2 build
- terminal signals
- causal propagation
- ambient Canvas data field
- cursor telemetry / target acquisition
- rolling numbers
- Inspector
- MACRO / RATES / EQUITY workspaces
- deterministic Command routing
- RUN SIGNATURE
- 5-snapshot temporal Replay
- Decision Log / benchmark-relative outcomes
- `window.VALKYRIE` demo/debug API

### Collaboration branches

All initial domain branches were created and synchronized to the imported prototype baseline:

```text
feat/macro
feat/rates
feat/equity
feat/platform
```

Domain work should stay narrow; platform-level state, Replay, motion, and ontology synchronization belong in `feat/platform` or a focused feature branch.

## Current S0 issues

1. Import prototype + stable app shell
2. Motion System v3
3. Quant Stress as ontology action
4. Replay + Decision Log
5. Deterministic demo hardening

The prototype-import portion of Issue #1 is complete. Production-shell migration and parity validation remain open.

## Next S0 actions

1. Validate the repository prototype in Chrome using `docs/DEMO_QA.md`.
2. Preserve v2 behavior while establishing the production app shell.
3. Implement Motion System v3 interactions.
4. Integrate Quant Stress as the first object action.
5. Synchronize Macro Clock with Replay.
6. Harden Decision Log / post-performance semantics.
7. Add deployment and deterministic offline fallback.

## Open product decisions

### Ontology count

The current v2 reference implements **16 objects / 22 relations**. An earlier planning version referenced 23 relations.

Do not manufacture an extra edge for consistency. Confirm the intended financial relationship with the domain owners, then update ontology, docs, tests, and boot telemetry together if necessary.

### Quant boundary

The preferred architecture remains:

```text
Python Quant Logic
→ normalized state / JSON
→ VALKYRIE canonical state
→ Ontology / Evidence / Signal / Workspace
```

Do not make Streamlit iframe embedding the final product experience.

## Repository risk

The repository is public.

Do not upload confidential internal data, unpublished internal research, credentials, or restricted datasets.

## Product risk

The largest product risk is feature accumulation without system integration.

New functionality should normally enter VALKYRIE through:

```text
OBJECT / SYSTEM ACTION
→ STATE CHANGE
→ ONTOLOGY
→ EVIDENCE
→ SIGNAL
→ ACTION / REPLAY
```

rather than through another isolated dashboard tab.
