# Architecture

## Goal

The codebase is organized so the project remains modular, readable, testable, and extensible.

Phase 1 is 2D browser-based visualizer for apparent horizon growth in an ingoing Vaidya black hole model.

The core observable is:

`incoming energy -> M(v) -> r_A(v) = 2M(v) grows`

## Layer Structure

### `src/app`

Application bootstrap.

This layer starts the app, creates the simulation, creates the renderer, and connects major systems together.

Allowed:
- initialize app
- connect simulation, rendering, UI, and data systems

Not allowed:
- physics formulas
- direct packet absorption rules
- Three.js object internals outside setup code

### `src/config`

Default configuration values.

Examples:
- initial mass
- packet speed
- packet spawn rate
- time scale
- max packet count

Allowed:
- default settings
- user-facing parameter ranges

Not allowed:
- simulation state
- rendering code

### `src/physics`

Pure physics and math formulas.

Examples:
- `r_A = 2M`
- mass functions
- absorption condition
- packet motion helpers

Allowed:
- pure functions
- deterministic calculations
- formulas

Not allowed:
- Three.js imports
- DOM access
- UI code
- mutable simulation state

### `src/simulation`

Simulation state and time stepping.

This layer owns:
- advanced time `v`
- black hole state
- energy packet state
- packet absorption
- mass updates
- simulation snapshots

Allowed:
- classes like `Simulation`, `VaidyaBlackHole`, `EnergyPacket`
- update loops
- state ownership

Not allowed:
- Three.js rendering code
- DOM manipulation
- graph drawing

### `src/rendering`

Three.js visual objects. This layer receives simulation snapshots and draws them.

Allowed:
- Three.js scene objects
- horizon ring rendering
- packet rendering
- trail rendering
- background rendering

Not allowed:
- physics formulas
- mass updates
- absorption decisions
- direct mutation of simulation internals

### `src/ui`

Controls and readouts.

Allowed:
- pause/resume buttons
- reset button
- parameter inputs
- live readouts

Not allowed:
- hidden physics calculations
- direct mutation of private simulation fields
- Three.js scene object ownership

### `src/data`

History recording, graph data, and CSV export.

Allowed:
- record snapshots over time
- prepare graph data
- export CSV

Not allowed:
- physics formulas
- simulation state mutation
- rendering decisions

### `src/utils`

General helper functions that are not specific to Vaidya physics.

Examples:
- vector math
- clamp
- random helpers
- formatting helpers

### `src/tests`

Test files for physics, simulation, and utilities

## Dependency Rules

Allowed dependency direction:

`app -> simulation`
`app -> rendering`
`app -> ui`
`app -> data`
`app -> utils`

`simulation -> physics`
`simulation -> utils`

`rendering -> simulation`
`rendering -> Three.js`
`rendering -> utils`

`ui -> simulation`
`data -> simulation`

Forbidden:
- `physics` importing Three.js
- `physics` importing UI
- `physics` importing rendering
- `simulation` importing Three.js
- `rendering` changing simulation internals
- `ui` duplicating physics formulas

## Snapshot Pattern

Rendering, UI, and data should read from a plain simulation snapshot.

A snapshot contains:
- advanced time
- black hole state
- energy packet states
- absorbed packet count
- config

This prevents unrelated systems from depending on private simulation internals.

## Core Types

Core shared types live in:

`src/simulation/types.ts`

These include:
- `Vector2`
- `MassFunctionMode`
- `VaidyaBlackHoleState`
- `EnergyPacketState`
- `SimulationConfig`
- `SimulationSnapshot`

## Future Extensibility

This architecture supports later phases:

### Phase 1.5: 3D View

The rendering layer can be expanded to support 3D cameras and 3D scene objects without rewriting physics or simulation.

### Phase 2: CFD Matching

The data layer can export `targetHorizonRadius(t)` / `r_A(v)` curves for CFD matching.

### Phase 3: Geometry Optimization

The exported target behavior can be used as an input to an optimizer that searches for water-system geometry producing the desired analog horizon motion.

