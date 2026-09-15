# VALKYRIE v2.5 — Hydro Flow HUD

This directory is the current **release candidate / UI source of truth** for the VALKYRIE hackathon demo.

## Run locally

Serve this directory with any static HTTP server. Example:

```bash
cd prototype/valkyrie-v2.5
python -m http.server 8080
```

Then open `http://localhost:8080`.

## File map

```text
index.html       semantic shell and CSP
styles.css       VALKYRIE visual system + Hydro Flow + restrained OSIRIS-lite polish
data.js          fixed ontology, evidence, snapshots, Decision Log demo data
core.js          SVG graph, Canvas field, propagation and signal engine
view.js          Inspector and MACRO/RATES/EQUITY workspaces
interaction.js   Replay, Command, RUN SIGNATURE and boot interactions
```

## Product invariants

- 16 Objects
- 22 causal Relations
- 3 Terminal Signals
- 5 bundled demo Snapshots
- fixed ontology; data drives state/lighting
- Quant calculations remain deterministic
- LLM is for synthesis/explanation, not numerical truth
- Replay must expose data-vintage limitations
- Decision Log uses benchmark-relative outcomes, not a misleading hit-rate metric

## Visual direction

The visual target remains:

> Bloomberg information density × Gotham operational UX × cinematic system behavior × VALKYRIE financial ontology

The v2.5 release adds a **very restrained OSIRIS-inspired HUD layer**: subtle scanlines, vignette depth, monospaced telemetry, and tiny cyan/gold highlights. It is intentionally not a clone and must not replace VALKYRIE's causal-information hierarchy.

## Runtime policy

The Pages build has no external JavaScript runtime dependency. The large Chart.js/date-adapter bundle embedded in the original single-file prototype was not used by the current app and is omitted here.

## Validate

```bash
node --check prototype/valkyrie-v2.5/data.js
node --check prototype/valkyrie-v2.5/core.js
node --check prototype/valkyrie-v2.5/view.js
node --check prototype/valkyrie-v2.5/interaction.js
node scripts/validate_v25.mjs
```

GitHub Actions runs the v2 and v2.5 validation suites together.

## GitHub Pages

Deployment source:

```text
.github/workflows/pages.yml
```

Published artifact:

```text
prototype/valkyrie-v2.5/
```

Expected project URL after the repository's one-time Pages activation:

```text
https://alpha-crew-labs.github.io/Valkyrie-Odin/
```

Once Pages is enabled with **Source = GitHub Actions**, future changes to this directory on `main` automatically trigger a redeploy.
