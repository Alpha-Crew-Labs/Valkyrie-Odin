# VALKYRIE Motion System

## Objective

VALKYRIE should feel like a continuously operating intelligence system, not a static dashboard.

The screen should remain alive when idle, but important events must still dominate attention.

## Four motion layers

### 1. Ambient System Motion

Always on, very low salience.

- slow particle/data-field drift
- slow causal-edge flow
- live clock
- subtle heartbeat
- tiny system-activity updates

Purpose: communicate that the system is continuously watching the market.

### 2. Interaction Feedback

Triggered by pointer/selection.

- cursor telemetry
- targeting bracket
- object acquisition state
- evidence focus
- workspace focus

Purpose: communicate that the user is manipulating an operational system.

### 3. Intelligence Propagation

The core motion language.

Example:

```text
US CPI
→ FED
→ UST10Y
→ KTB
→ CURVE
→ SHORT DURATION
```

Each step should activate sequentially. A moving spark may represent the information packet travelling through an edge.

### 4. Cinematic System Events

Reserved for high-value events:

- boot
- RUN SIGNATURE
- REPLAY
- signal lock
- command resolution
- conflict detection

These may use stronger sweeps, contrast shifts and coordinated multi-panel changes.

## Motion grammar

| Effect | Meaning |
|---|---|
| Spark | intelligence transmission |
| Sweep | state/time transition |
| Bracket | target selection/acquisition |
| Rolling number | quantitative state change |
| Pulse | event or signal |
| Mask reveal | new information becoming available |
| Dim | context outside current reasoning path |

The same visual effect should not mean multiple unrelated things.

## Always-alive requirements

When no user input occurs, the screen should still contain restrained movement:

1. data-field particles drift slowly
2. causal edges move slowly
3. LIVE heartbeat pings every few seconds
4. clock advances
5. optional system activity updates every 5–10 seconds

Do not auto-select random nodes or create fake alerts merely to create motion.

## Cursor telemetry

Inside the Intelligence Chain, show small telemetry such as:

```text
CURSOR X 0632 / Y 0214
SCAN ACTIVE
```

On hover:

```text
TARGET · RAT_KTB
TYPE · RATES OBJECT
STATUS · ALERT
```

On click:

```text
OBJECT ACQUIRED
RAT_KTB
06 LINKED
```

Keep this low contrast and compact.

## Targeting bracket

Hover should not rely only on border-color change.

Use four small corner brackets around the target object.

- hover: muted bracket
- selected: cyan bracket
- acquisition: short lock animation

Avoid heavy scaling or glow.

## Causal propagation

Selection sequence:

1. target object locks
2. unrelated objects dim
3. first edge activates
4. spark travels along edge
5. destination object activates
6. next edge activates
7. terminal signal resolves

Recommended delay: `110–160ms` per node/edge step.

## Terminal signal lock

Terminal signals should resolve differently from normal nodes.

Suggested sequence:

```text
ACQUIRING
→ VALIDATING
→ LOCKED
```

Then reveal:

```text
SHORT DURATION
CONFIDENCE 82%
```

Use a thin line sweep or bracket lock rather than neon glow.

## Inspector transition

Do not blank/re-render the entire Inspector.

Sequence:

1. object label changes
2. main value rolls/reveals
3. evidence rows stagger in
4. confidence resolves
5. analyst view reveals

Total target: `400–650ms`.

Evidence stagger: `60–90ms`.

## Workspace transition

Do not make domain changes feel like page navigation.

Preferred sequence:

1. current data fades down
2. active-tab indicator moves
3. panel skeleton/dividers establish
4. new values mask in
5. relevant row/chart receives focus

Target: `280–420ms`.

## Node → Workspace synchronization

A node click should trigger several coherent reactions.

Example `CB 조달 · 풋`:

```text
CB node selected
→ causal path highlighted
→ Inspector evidence changes
→ EQUITY workspace activated
→ CB card/row highlighted
→ relevant value rolls
→ equity terminal signal resolves
```

This synchronization is more important than adding more tabs.

## RUN SIGNATURE

Target duration: 6–9 seconds.

Suggested sequence:

```text
INITIALIZING VALKYRIE
MACRO SHOCK DETECTED
RATES TRANSMISSION
RATES SIGNAL LOCK
CROSS-ASSET TRANSMISSION
EQUITY DECISION
SHARED DURATION LOGIC
DECISION GRAPH RESOLVED
```

At the end, keep the resolved active chain visible long enough for the presenter to explain it.

## Replay motion

Replay should communicate temporal access, not a page refresh.

Start:

```text
TEMPORAL ACCESS
REWINDING
```

During snapshot change:

- timeline cursor moves
- date rolls
- node values interpolate
- states change
- signals update
- Decision Log focus moves
- sweep indicates temporal transition

Conflict event:

- emphasize only the conflicting objects/signals
- use a brief red/amber divider or bracket
- avoid full-screen red flash

End:

```text
TIMELINE RESTORED · LIVE
```

## Command motion

Command is a system command interface, not a chatbot.

Recommended sequence:

```text
QUERY RECEIVED
SCANNING 16 OBJECTS
TRACING RELATIONS
EVIDENCE FOUND
```

Then manipulate the UI:

```text
nodes activate
→ evidence updates
→ terminal signal locks
→ workspace focuses
```

The system should answer through state changes before prose.

## Chart behavior

- initial line chart: draw left-to-right
- snapshot update: interpolate existing marks
- selection: brighten related series, dim others
- hover: thin crosshair + exact value + date
- avoid recreating charts on every transition

## Timing reference

| Motion | Target |
|---|---:|
| Hover | 100–160ms |
| Selection | 160–220ms |
| Inspector | 220–420ms |
| Workspace | 280–420ms |
| Number roll | 350–550ms |
| Edge propagation | 110–160ms/node |
| Signal lock | 400–700ms |
| Sweep | 700–900ms |
| Replay snapshot | 650–900ms |
| Boot | 1.5–2.2s |
| Signature | 6–9s |

Recommended easing:

```css
cubic-bezier(.2,.7,.2,1)
```

or

```css
cubic-bezier(.16,1,.3,1)
```

Do not use bounce or elastic easing.

## Performance guardrails

- cap ambient animation if needed to 30–45fps
- pause animation when `document.hidden`
- keep particle count approximately 100–180
- clamp devicePixelRatio for canvas
- avoid per-frame DOM mutation
- reuse SVG paths and chart instances
- support `prefers-reduced-motion`

## What makes it look futuristic

Use:

- coordinated state changes
- data propagation
- precise thin lines
- masked reveals
- contextual dimming
- object targeting
- rolling values
- timeline transitions
- micro telemetry

Avoid:

- rainbow gradients
- excessive neon
- lens flares
- particle explosions
- meaningless 3D
- giant cyberpunk type
- Matrix rain
- flashing borders

The final product should look futuristic because **data moves, state changes and decisions resolve visibly**, not because decorative effects were added.