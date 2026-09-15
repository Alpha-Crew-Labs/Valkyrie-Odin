# Project Status

_Last updated: 2026-09-15_

## Current state

Repository foundation is in place.

### Completed

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
- demo playbook
- roadmap
- `apps/valkyrie-web` scaffold
- `quant-core` scaffold
- safe `data/sample` boundary

### Existing prototype outside repository

A working VALKYRIE v2 single-file HTML prototype exists and should be imported next as the current interaction reference implementation.

Key implemented ideas in that prototype include:

- boot sequence
- 16-object Intelligence Chain
- 22 explicit relations in the current v2 build
- terminal signals
- causal propagation
- ambient Canvas data field
- rolling numbers
- Inspector
- MACRO / RATES / EQUITY workspaces
- Command routing
- RUN SIGNATURE
- temporal Replay

Before changing node/edge counts, verify the intended ontology version with the team.

## Next S0 actions

1. Import the working v2 prototype into the repository.
2. Establish a stable app shell around the prototype without breaking demo behavior.
3. Add Motion System v3 interactions.
4. Integrate Quant Stress as the first object action.
5. Synchronize Macro Clock with Replay.
6. Harden Decision Log and post-performance.
7. Deploy and verify deterministic fallback.

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
