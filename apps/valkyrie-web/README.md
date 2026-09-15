# apps/valkyrie-web

Primary VALKYRIE user interface.

## Responsibilities

- application shell
- Intelligence Chain / ontology visualization
- Inspector
- VALKYRIE Command
- MACRO / RATES / EQUITY workspaces
- Replay / timeline
- cinematic motion system
- chart and object-action surfaces

## Design rule

This app must feel like one operating system.

Do not embed three visually unrelated domain apps as iframes unless used only as a temporary development bridge.

Preferred state model:

```text
selectedObject
activeDomain
activeScenario
snapshotDate
objectStates
terminalSignals
inspectorEvidence
workspaceFocus
```

A single state change should be able to update the graph, Inspector, domain workspace and terminal signal coherently.

## Prototype migration

The existing single-file HTML prototype is valid as the reference implementation for interaction and demo behavior.

Migrate incrementally. Do not rewrite working interaction merely to move to Next.js.

Suggested component boundaries:

```text
components/
  intelligence-chain/
  inspector/
  command/
  replay/
  terminal-signal/
  system-hud/

modules/
  macro/
  rates/
  equity/

lib/
  ontology/
  scenarios/
  replay/
  motion/
  adapters/
```

## Data rule

UI components should consume normalized VALKYRIE objects, not provider-specific FRED/ECOS/Streamlit response shapes.

See:

- `../../docs/ARCHITECTURE.md`
- `../../docs/PRODUCT_SPEC.md`
- `../../docs/MOTION_SYSTEM.md`
- `../../docs/QUANT_INTEGRATION.md`
