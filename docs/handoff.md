# Project handoff

Written for the incoming project lead. Everything you need is in **three files**: this
one (the map and the physics), `docs/analogue-mapping.md` (the black-hole-to-water-tank
dictionary in full), and `data/README.md` (the two data file formats). Read this file
in two sittings — Part I is *what the project is and how the code works*, Part II is
*the physics, the equations, the assumptions, and the units*. The other two files are
deep dives you can go to when you need them.

---

# Part I — What this is and how it works

## 1. The one-paragraph version

This project simulates a **rotating black hole that is actively growing** (an "ingoing
Kerr–Vaidya" black hole — Kerr means rotating, Vaidya means the mass increases with
time as stuff falls in). It renders it accurately in the browser by tracing real light
rays through the curved spacetime. But the picture is not the point. The point is that
a **draining vortex in a shallow tray of water** obeys, for its surface waves, the same
mathematics that light obeys near a black hole — so every frame, the simulator
translates the black hole's current state into a **build sheet for a real tabletop
experiment**: how big a tank, how deep the water, how hard to run the pump, and how to
ramp the pump over time so the growing vortex mimics the growing hole. The data
pipeline then records everything the simulation predicts, in a format designed to be
overlaid directly on measurements someone eventually takes at a real tank.

## 2. The three subsystems

Think of the codebase as three machines bolted together:

1. **The relativity simulator** (`src/physics/`, `src/shaders/`, `src/observer/`).
   Pure general relativity. Computes the spacetime geometry on the CPU (horizons,
   orbits, thermodynamics) and traces light rays on the GPU (that's the picture). The
   camera is itself a physical object falling along a real trajectory.

2. **The fluid-analogue mapper** (`src/physics/fluidVortexAnalogue.ts`). A pure
   function: black hole state in, water-tank specification out. Also reports how good
   the analogy is (some things match exactly, some approximately, one not at all) and
   whether the resulting tank is physically sensible.

3. **The data pipeline** (`src/data/`, `scripts/`, `data/`). Bundles everything the
   other two machines know into one big per-frame readout (~100 numbers), records it
   as JSONL, exports it as CSV for plotting, and defines the hand-written lab-notebook
   format for the eventual real experiment — joined to recordings by a run ID.

## 3. What happens every frame, step by step

The whole app is one loop, `frame()` in `src/main.ts`. Each pass:

1. **Advance the clock.** The simulation's time variable is `v`, "advanced time"
   (the natural time coordinate for things falling inward; see Part II). Wall-clock
   seconds × `timeScale` are added to `v`.
2. **Evaluate the mass.** `evaluateMassFunction(v)` returns the current mass `M(v)`
   and its growth rate `M′(v)`. This one function is what makes the hole "Vaidya."
3. **Solve the horizon.** `solveApparentHorizon` computes the true (slightly
   squashed, θ-dependent) horizon surface for a growing spinning hole — a small
   linear ODE solved in O(n) each frame at 64 polar angles.
4. **Move the observer.** If running, the camera's worldline is advanced by RK4
   integration of the geodesic equations (plus any thrust the user fires). If paused,
   the camera is a free non-physical placement instead.
5. **Render.** Uniforms (mass, spin, horizon shape, observer state) go to the GPU;
   the fragment shader integrates one null geodesic per pixel backwards from the
   camera and asks "does this ray hit the matter, the horizon, or escape to the
   stars?" Post-processing tone-maps the result.
6. **Build the readout.** `buildSimulationFrameState` (in `src/data/`) condenses
   *everything* — horizon mechanics, characteristic radii, the observer's conserved
   quantities, the entire fluid-tank specification with its ramp rates, and render
   stats — into one `SimulationReadout` object. This is the single source of truth:
   the UI panels display it, and the recorder writes it. Nothing else is recorded, so
   everything worth plotting must be in it.
7. **Offer the frame to the recorder.** If recording is on, the recorder writes the
   readout as one JSONL line (at the configured sample rate, 10 Hz by default), plus
   occasional horizon-profile lines and automatic event markers (e.g. the moment the
   observer crosses the horizon).

## 4. Where everything lives

```
src/main.ts                    the frame loop, default parameters, wiring, window.* API
src/types.ts                   SimulationState — every user-tunable parameter

src/physics/                   pure functions, no graphics, no DOM
  kerrVaidyaGeometry.ts        the metric, geodesic integration (RK4), horizons,
                               photon orbits, ISCO, shadow, horizon thermodynamics
  massFunction.ts              M(v) — the smooth monotone growth law
  apparentHorizon.ts           θ-dependent apparent-horizon ODE (tridiagonal solve)
  fluidVortexAnalogue.ts       the black-hole → water-tank mapping (the heart of
                               the project; heavily commented)

src/shaders/                   GLSL for the GPU raytracer
  kerrVaidya.ts                metric + Hamiltonian on the GPU
  geodesicIntegrator.ts        per-pixel RK4 ray marching
  matterInflow.ts              the glowing infalling matter (kinematics exact,
                               appearance deliberately cinematic)
  celestialSphere.ts, post.ts, spacetimeGeometry.ts, proceduralNoise.ts

src/observer/physicalObserver.ts   the camera as a physical worldline (tetrads,
                                   free fall, thrust, aberration)
src/controls/flightControls.ts     running-mode input (done)
src/controls/pausedCameraControls.ts   paused-mode orbit camera (done)

src/data/
  simulationFrameState.ts      physics → the one big per-frame readout
  telemetryRecorder.ts         readout → JSONL (run header, frames, events, capacity)
  experimentLog.ts             the lab-notebook schema + template generator

src/ui/
  contributorApi.ts            THE CONTRACT — every type a UI author needs (in src/)
  minimap.ts                   top-down live map (done)
  controlPanel.ts              simulation controls — UI-CONTRIBUTOR STUB
  dataPanel.ts                 tank readouts + recorder controls — UI-CONTRIBUTOR STUB

scripts/
  physicsChecks.ts             npm run check — 40 CPU physics tests
  validate-webgl.mjs,
  validateShadowGeometry.mjs   npm run validate — live-render tests via Chrome
  captureTelemetry.mjs         npm run capture — headless recording
  exportTelemetryTable.ts      npm run data:table — JSONL → CSV
  validateExperimentLog.ts     npm run log:check — lab-notebook validation
  chromeDevtools.mjs           shared DevTools-protocol helper

data/
  README.md                    both data formats, documented for a lab user
  experiment-log.jsonl         the hand-written lab notebook (template lines shipped)
  telemetry/                   recordings land here (git-ignored; regenerable)

docs/analogue-mapping.md       the full physics dictionary — read alongside Part II
references/normative/          the two Kerr–Vaidya papers (PDFs) the code implements
```

## 5. How to run everything

```sh
npm install
npm run dev          # the app, at http://127.0.0.1:5173
npm run check        # all CPU physics tests — run after ANY physics change
npm run log:check    # validate the lab notebook
npm run build        # type-check + production bundle
```

The three commands below additionally need Chrome listening on the DevTools port.
Start it (any platform's Chrome binary) with `--remote-debugging-port=9223`, keep
`npm run dev` running, then:

```sh
npm run validate     # render-level tests: WebGL health, shadow size vs theory
npm run capture -- data/telemetry/myrun.jsonl 30 '{"spin":0.90}'
                     # 30 s headless recording with parameter overrides
npm run data:table -- data/telemetry/myrun.jsonl figures/myrun.csv
                     # flatten to CSV, ~104 columns, ready for pandas/matplotlib
```

Everything the UI would show is also scriptable from the browser console:
`window.kerrVaidyaState` (the live readout), `window.kerrVaidyaControls.setSimulation`
(change any parameter), `window.kerrVaidyaRecorder` (record/drain headlessly).

## 6. What is finished and what is not

**Finished and verified:** all physics, the renderer, the observer, both control
modes, the analogue mapping, the entire data pipeline, and the validation suites
(40 physics checks pass; an end-to-end headless capture has been run and
sanity-checked).

A note on the two control modes, since the distinction confuses everyone at first:
the app **boots paused**. Paused means "compose the initial condition" — drag orbits
the hole, shift/right-drag pans, the wheel is a true zoom (clamped just outside the
growing horizon), q/e roll, and time is frozen. Pressing **Space** turns the camera
into a physical infalling observer: from then on the wheel is *thrust along the look
direction* (not zoom), drag turns your head, and the clock runs at your proper time —
so your speed genuinely changes how fast the hole evolves. Flying also produces two
famously counterintuitive sights — thrusting *toward* the hole makes it visually
shrink (relativistic aberration), and braking makes it balloon — see "What flying
actually looks like" in Part II §8 before filing either as a bug.

**Deliberately not done — the UI panels.** Two files are contributor-owned stubs.
Each contains a complete written spec in its header comment, and each needs *only*
itself plus the types in `src/contributorApi.ts` — no physics knowledge:

- `src/ui/controlPanel.ts` — sliders for the black-hole parameters, pause button,
  live readout labels, and a place to mount the (already working) minimap.
- `src/ui/dataPanel.ts` — the experiment panel: tank parameter controls, the pump
  build-sheet numbers, validity warnings, fidelity residuals, and the record /
  mark / download buttons. Until this exists, recording is driven via
  `window.kerrVaidyaRecorder` or `npm run capture` (both fully working).

The app runs fine with the stubs in place — you just see the render with no panels.

**The other open end is the actual experiment**: `data/experiment-log.jsonl` is
waiting for someone with a tank. The workflow (record a run → note its run ID → fill
in the lab notebook → `npm run log:check` → plot measured vs predicted) is fully
built; only the water is missing.

---

# Part II — The physics, the units, the assumptions

## 7. Units first, so nothing else is confusing

The codebase uses **two unit systems, on purpose**, and every variable name tells you
which side it is on:

- **Simulation side: geometrized units.** G = c = ħ = k_B = 1, and the initial mass
  `M₀ = 1` sets the scale. So *lengths and times are measured in units of the initial
  black-hole mass*. A radius of 1.6 means "1.6 initial-masses"; an advanced time of
  40 means the same. This is the standard convention of the GR literature and it makes
  every equation clean. Fields with plain names (`mass`, `outerHorizonRadius`,
  `advancedTime`) are geometrized.
- **Laboratory side: SI.** Anything in the analogue block ends in its unit —
  `...Metres`, `...Hertz`, `...LitresPerMinute`, `...Kelvin` — and means exactly that.

The bridge between them is built from **two lab choices** (details in
`docs/analogue-mapping.md` §3): the tank's anchor radius fixes the length conversion
`L` (metres per geometrized unit), and the water depth fixes the wave speed and hence
the time conversion `T = L/c_water` (seconds per geometrized unit).

**Physical constants used** (all in `fluidVortexAnalogue.ts`): water at 20 °C —
g = 9.80665 m/s², density ρ = 998.2 kg/m³, kinematic viscosity ν = 1.0034×10⁻⁶ m²/s,
surface tension σ = 0.0728 N/m — plus ħ and k_B (SI values) only for converting the
analogue surface gravity into a Hawking temperature in kelvin.

**Shipped defaults** (`src/main.ts`): spin a = 0.82, M₀ = 1, accretion rate
Ṁ = 0.0018, smoothing time s = 24; tank anchor 5 cm, depth 1 cm, tank radius 40 cm.
These were chosen so every tunable validity check passes (§11).

## 8. The spacetime: ingoing Kerr–Vaidya

Coordinates are **advanced coordinates** (v, r, θ, ψ). The unfamiliar one is `v`,
advanced time: v = t + (light-travel time inward). Its virtue is that nothing blows
up at the horizon — an infalling camera crosses in finite coordinate values, which is
why the app can fly you inside. The metric is Kerr's, with the constant mass replaced
by a growing **mass function M(v)** while the spin parameter `a` stays fixed
(references: Dahal & Terno arXiv:2008.13370; Dahal, Maharana, Simovic & Terno
arXiv:2311.02981 — both PDFs in `references/normative/`).

**The mass function** (`massFunction.ts`) is a smooth, strictly monotone ramp:

```
M(v)  = M₀ + Ṁ · (v + √(v² + s²))          s = smoothingTime
M′(v) = Ṁ · (1 + v/√(v² + s²))
```

Long before v = 0 the mass is flat at M₀; long after, it grows at rate 2Ṁ; the
turn-on is smooth (so the energy flux is always finite and non-negative — the
"null energy condition" the Vaidya solution requires). Note M(0) = M₀ + Ṁs, slightly
above M₀ — which is why a run starts with the horizon already a bit outside the
tank's anchor radius.

**Horizon structure and thermodynamics** (`kerrVaidyaGeometry.ts`), all instantaneous
functions of M(v), a:

```
r±   = M ± √(M² − a²)              outer (event-ish) and inner (Cauchy) horizons
r_E(θ) = M + √(M² − a² cos²θ)      ergosurface (frame-dragging boundary)
A    = 4π (r+² + a²)               horizon area
κ    = (r+ − r−) / 2(r+² + a²)     surface gravity
T_H  = κ / 2π                      Hawking temperature
S    = A / 4                       Bekenstein–Hawking entropy
M_irr = √(A/16π)                   irreducible mass
Ω_H  = a / (r+² + a²)              horizon angular velocity
J    = a·M                         angular momentum
```

Also computed exactly: prograde/retrograde photon-orbit radii, the ISCO (Bardeen's
formulas), and the shadow's critical impact parameters — these are what the shadow
you see on screen is tested against.

**Ray tracing.** Each pixel integrates the null geodesic Hamiltonian
H̃ = ½ ρ² g^{μν} p_μ p_ν backwards from the camera with RK4. Two beautiful facts make
Kerr–Vaidya cheap: in these coordinates only one metric component depends on M(v), so
the angular momentum p_ψ is *exactly* conserved even while the hole grows, and the
entire modification relative to Kerr is one term, `dp_v/dλ = M′(v) · r · p_r²`. The
integrator monitors H̃ = 0 (a ray must stay exactly lightlike) as a per-pixel error
estimate you can view as a diagnostic.

**The observer** is a timelike worldline integrated with the same machinery
(normalized to u·u = −1), free-falling unless thrust is applied. Its local frame (a
"tetrad") generates all aberration and Doppler/gravitational color shift. The journey
ends a safety margin *above the inner horizon*, where classical GR stops being
trustworthy — that is a physics statement, not a rendering limitation.

**What flying actually looks like — counterintuitive but verified, not bugs.** Two
exact relativistic effects make piloting feel "wrong" until you know them; everyone
who flies this thing reports both as bugs at first.

1. *Aberration: thrusting toward the hole makes it shrink on screen.* At relativistic
   speed the whole sky compresses toward your direction of motion, so the thing you
   are flying at appears to recede — and past a few units of rapidity it shrinks to a
   dot and vanishes into the blueshifted glare of the matter ahead, even while you are
   plunging faster than ever. The shadow's angular radius obeys
   `tan(θ_seen/2) = e^(−w) · tan(θ_static/2)` (w = your rapidity relative to a static
   observer at the same r). This was measured in the live renderer: diving at
   β = 0.986 at r = 11.3 M, a static observer would see a 24.7° shadow, the formula
   predicts 2.14°, and the rendered image measures 2.14°. Braking ("zooming out")
   removes the compression and the shadow balloons back over the screen — it feels
   like being suddenly sucked in, but you were falling the whole time. **The minimap
   dot is your actual radius and never lies; the main view is what a pilot's eyes
   would see. The gap between them is the physics.**
2. *The clock runs at your proper time.* The simulation's advanced time v advances at
   dv/dτ of *your* worldline — relativistic Doppler, ~γ(1±β) for radial motion. Flee
   at β = 0.96 and the hole evolves ~7.8× faster; dive at β = 0.96 and its growth
   nearly freezes (dv/dτ ≈ 0.14). So "zooming" genuinely changes how fast the
   universe runs. Free fall from rest at the default 19.4 M placement takes ~86 M of
   proper time ≈ 69 wall-seconds at the default time scale — being "sucked in" is
   slow out there.

**The apparent horizon.** For a growing hole the true trapping boundary sits slightly
*inside* the Kerr radius r+ and is θ-dependent. The code solves the linearized
horizon ODE from the 2020 paper (Eq. 25) — a first-order-in-M′ correction z(θ) — via
a tridiagonal linear solve at 64 angles per frame, validated against the paper's
Figure 1.

**What drifts, and why it matters.** In pure Kerr, three quantities are constants of
the motion for any free-falling body: the specific energy E = −p_v, the angular
momentum L = p_ψ, and Carter's constant Q = p_θ² + cos²θ·(a²(1−E²) + L²/sin²θ).
Under Vaidya growth, E and Q **drift** (L does not). The readout carries all three
per frame; plotting their drift is the cleanest visible signature that you are in a
Vaidya spacetime and not Kerr — arguably the headline plot of the whole simulator.

## 9. The fluid analogue in brief

(Full treatment with derivations: `docs/analogue-mapping.md`. This is the summary.
In particular its §8 states which apparatus quantities are free choices — tank size
included, with citations — and the ten-step chain that computes everything else.)

**Why water works at all** (Unruh 1981; Visser gr-qc/9712010): in a shallow water
layer of depth h, long surface waves travel at c = √(gh) regardless of wavelength.
If the water itself flows, waves ride the flow — and where the inward flow speed
exceeds c, waves can no longer escape: a **sonic horizon**, mathematically identical
to a black-hole horizon. The wave equation on a flowing background *is* the
Klein–Gordon equation on an effective curved metric.

**The specific flow** is the "draining bathtub": a point drain plus circulation,
`v = −(D/r) r̂ + (C/r) ψ̂`. Its effective geometry has a horizon at `r_h = D/c`, an
ergo-surface at `r_e = √(C²+D²)/c`, horizon angular velocity `Ω_h = C/r_h²`, and
surface gravity `κ_h = c/r_h` — the same cast of characters as Kerr.

**The matching game.** The tank has three knobs (size, depth, and the shape ratio
C/D) but Kerr has more independent dimensionless invariants than that — so **exactly
one** can be matched. By default the code matches the horizon angular velocity
(C/D = a/2M), because that governs **superradiance** — waves reflecting off the
vortex with *more* energy than they arrived with when their frequency satisfies
ω < mΩ_h — which is the one analogue effect actually measured in a real tank (Torres
et al. 2016). The alternative (ergosphere radius ratio) is selectable; whichever you
don't match is reported live as a residual.

**The unfixable residual.** The bathtub's surface gravity satisfies κ_h·r_h/c ≡ 1
always, but Kerr's equivalent is (r+−r−)/4M ≤ ½. So the analogue "runs hot" by a
factor ≥ 2 (×3.24 at the default spin) and *no* tank setting can fix it — it's a
statement about the 1/r flow profile itself. This is reported honestly as
`fidelity.surfaceGravityRatio` rather than hidden.

**Vaidya = a pump schedule.** As M(v) grows, the sonic horizon must march outward:
both the drain D and circulation C ramp *up*, but C/D ramps *down* (growing M at
fixed a means a/M falls — the hole effectively spins down). The code delivers all
these as per-lab-second rates; they are literally the setpoint ramps for a
programmable pump. At the defaults: ~63 L/min rising at ~1.7 L/min per second.

## 10. Assumptions — the honest list

Spacetime side:
- The spin parameter `a` is **constant**; only M grows (pure infalling null dust
  carrying no angular momentum). Ingoing radiation only; no outgoing flux, no
  Hawking-radiation backreaction — this is classical GR throughout.
- The apparent-horizon correction is **first order** in M′ (fine at the shipped
  accretion rates, which keep M′ ≪ 1).
- The infalling matter's *appearance* (density, glow) is artistic; its *kinematics*
  (velocities, redshifts, beaming) are exact. Never treat the rendered brightness as
  data.
- Spin is capped at |a| ≤ 0.999999·M to avoid the naked-singularity limit.

Fluid side (all standard in the analogue-gravity literature, all quantified live by
the validity block, §11):
- Inviscid, incompressible, irrotational-outside-the-core flow with an idealized
  1/r velocity profile from a point drain.
- **Constant depth** — but Bernoulli's principle forces the surface to dip ~50% of
  the depth at the horizon no matter what. The code reports this dip as a
  *prediction to measure*, and a real analysis would feed the measured depth profile
  back into the metric (documented future work).
- **Shallow-water regime** — wavelengths long compared to depth, frequencies below
  a dispersion ceiling the code computes from the full gravity–capillary relation
  ω² = (gk + σk³/ρ)·tanh(kh).
- Water at 20 °C; fixed material constants (§7).

## 11. The validity block — the numbers that make it an experiment

Every frame, `analogue.state.validity` answers "is this tank buildable and is the
analogy valid there?": ergosurface inside the tank? superradiance frequencies below
the dispersion ceiling? depth ≪ horizon radius? plus Reynolds number, capillary
length, and the predicted surface dip. The chosen defaults pass all tunable checks
with margin. Details and the reasoning for each bound: `docs/analogue-mapping.md` §6.

## 12. If you change the physics

`npm run check` is the contract: 40 assertions from "the metric inverse really
inverts" to "the analogue reproduces Kerr's frame-dragging rate when matched" to
"the drain ramp has the right sign." Run it after any change under `src/physics/`;
add an assertion when you add an equation. `npm run validate` closes the loop at the
render level (the on-screen shadow vs the analytic prediction). The recorded-data
schema is versioned (`schemaVersion` in every run header) — bump it if you change
the readout shape.

## References

- Dahal & Terno, arXiv:2008.13370 — the Kerr–Vaidya apparent horizon (normative).
- Dahal, Maharana, Simovic & Terno, arXiv:2311.02981 — the metric used (normative).
- Unruh, PRL 46, 1351 (1981) — the original acoustic-black-hole insight.
- Visser, gr-qc/9712010 — acoustic horizons and effective metrics, systematically.
- Cardoso, Lemos & Yoshida, gr-qc/0410107 — the draining bathtub as a Kerr analogue.
- Torres et al., arXiv:1612.06180 — superradiance actually observed in a water tank.
