# Ingoing Kerr–Vaidya Black Hole Visualization

A scientifically accurate, real-time WebGL2 visualization of an **ingoing (accreting)
Kerr–Vaidya black hole**, built to monitor the properties needed to design a physical
fluid experiment in which a growing water vortex plays the role of the black hole:
rotation ↔ Kerr spin, expansion ↔ Vaidya mass growth.

## Physics

- **Spacetime**: the ingoing Kerr–Vaidya metric in advanced coordinates (v, r, θ, ψ)
  with a smooth monotone mass function M(v) — Dahal & Terno 2020 (arXiv:2008.13370)
  Eq. 12; Dahal, Maharana, Simovic & Terno 2025 (arXiv:2311.02981) Eq. 2. PDFs of both
  papers are in `references/normative/`.
- **Ray tracing**: every pixel integrates a genuine null geodesic backward from the
  observer with RK4 on the conformal Hamiltonian
  H̃ = ρ²·½ g^{μν} p_μ p_ν. In these coordinates only g^rr depends on M(v), so p_ψ is
  exactly conserved and the entire Vaidya modification is dp_v/dλ = M′(v) r p_r².
  H̃ = 0 is monitored per ray as the null-constraint error (a selectable diagnostic
  view).
- **Observer**: while the simulation runs, the camera is a genuine timelike worldline
  integrated in the Kerr–Vaidya spacetime (RK4 on the full Hamiltonian, u·u = −1
  enforced): it free-falls unless the user fires bounded proper-acceleration thrust
  (wheel = forward/backward, shift-drag = lateral), and dragging only rotates the
  head. What is reachable is dictated by the geometry — hovering fails close to the
  hole, and inside the horizon no thrust increases r. The worldline crosses the event
  horizon regularly (advanced coordinates), the view continuing — aberration and sky
  blueshift come from the tetrad of the actual four-velocity — until the journey ends
  a safety buffer above the inner (Cauchy) horizon, where classical evolution stops
  being trustworthy. Pausing freezes v and switches to a free, unphysical placement
  camera ("setting the initial condition"), with progressive supersampling toward a
  converged still; resuming starts a new worldline at rest there.
- **Apparent horizon**: the θ-dependent correction z(θ) to r₀ = M + √(M² − a²) solves
  the linearized horizon ODE (2020 paper Eq. 25, fixed to its cos 2θ form) with an
  O(n) tridiagonal solve per frame; for accretion the horizon sits slightly inside r₀
  (2025 paper Eq. 15).
- **Matter**: the inflow tells the fluid-experiment story. At v = 0 it is a ring of
  separated clumps at rest in the local ZAMO frame — "still water", already dragged
  by the hole's rotation — and differential orbital shear (inner radii spin up first)
  winds the same clump field into trailing spiral streams while the inner edge
  migrates to the horizon and the matter heats. Density/emissivity patterns are
  deliberately cinematic (the source of mass is out of scope), but the kinematics are
  exact: the emitter four-velocity is a normalized ZAMO + infall + prograde-swirl
  combination gated by the spin-up factor, and all gravitational redshift, Doppler
  shift, beaming (g⁴), and color shifts come from g = 1/(p·u) along the traced
  geodesic. The celestial sphere — anti-aliased point stars over a tilted galactic
  band with dust lanes — is sampled only by rays that escape to the celestial radius.

## The fluid analogue

The visualization exists to design an experiment. Every frame, the black hole's live
state is mapped onto a **draining bathtub vortex** — a shallow layer of water with a
point drain and circulation, whose surface waves obey a Klein-Gordon equation on an
effective metric with a horizon, an ergoregion, frame dragging and superradiance
(Unruh 1981; Visser gr-qc/9712010; Cardoso, Lemos & Yoshida gr-qc/0410107). The tank
has exactly one dimensionless shape freedom, so exactly one Kerr invariant is matched
(horizon angular velocity by default, or the ergosphere radius ratio) and the rest are
reported as residuals — including one, the surface gravity, that no apparatus can
match. Vaidya accretion becomes a pump schedule: the drain and the circulation both
have to be ramped, the drain faster, because a growing M at fixed a is a spin-down.
At the shipped defaults that is a 40 cm tray, 1 cm of water, and 63 L/min through the
drain. `docs/analogue-mapping.md` is the full mapping, the validity envelope, and the
bill; `src/physics/fluidVortexAnalogue.ts` is the implementation.

## Data collection

Nothing is retained unless it is recorded, so the recorded record is exhaustive: one
JSONL line per sample carrying the complete per-frame readout — horizon mechanics
(area, irreducible mass, entropy, surface gravity, Hawking temperature, angular
velocity), characteristic radii, the observer's constants of the motion (specific
energy, angular momentum, Carter constant — all three visibly drifting under
accretion, which is the point of the spacetime), the full fluid-analogue state and its
driving rates, and the render diagnostics. Roughly a hundred plottable columns.

Record and download from the data panel, or headlessly:

```sh
npm run capture -- data/telemetry/spin-090.jsonl 30 '{"spin":0.90}'
npm run data:table -- data/telemetry/spin-090.jsonl figures/spin-090.csv
```

The laboratory half is `data/experiment-log.jsonl`, filled in by hand and joined to a
recording on its run identifier; `npm run log:check` validates it and reports which
measurements have a predicted counterpart to plot against. `data/README.md` documents
both formats.

## Running

```sh
npm install
npm run dev        # http://127.0.0.1:5173
```

The app boots **paused** in the free-placement camera: drag = orbit,
shift/right-drag = pan, wheel = zoom (clamped just outside the growing horizon),
q/e = roll. Space starts the journey; while running the camera is the physical
observer: drag = look around, wheel = forward/backward **thrust** (not zoom),
shift/right-drag = lateral thrust, space = pause. Expect the two counterintuitive
relativistic effects of flying: thrusting toward the hole visually *shrinks* it
(aberration — verified against the exact formula), and your speed changes how fast
the hole evolves (the clock runs at the observer's proper time). The minimap always
shows your true radius.
The panel (top left) exposes spin, accretion rate, exposure, time scale,
integration quality, and diagnostic views; the data panel exposes the tank parameters,
the fluid targets, and the recorder; the minimap shows the apparent horizon,
ergosphere, photon-orbit band, ISCO, and the observer position. Everything in the
readouts is also published on `window.kerrVaidyaState`,
`window.kerrVaidyaRecorder` drives data collection headlessly, and
`window.kerrVaidyaDiagnostics.captureFieldStatistics(field, thresholds)` reads back
full-frame diagnostic statistics.

## Validation

```sh
npm run check      # CPU physics: metric inverse, ZAMO tetrads, null rays,
                   # p_v conservation in Kerr, traced shadow edge vs sqrt(27)M,
                   # horizon ODE vs 2020 Fig. 1, Kerr limits (photon orbits, ISCO),
                   # Kerr horizon mechanics, and the fluid analogue (invariant
                   # matching, surface-wave dispersion, accretion ramp signs)
npm run log:check  # data/experiment-log.jsonl against its schema
```

With the dev server running and Chrome listening on the DevTools port
(`--remote-debugging-port=9223`):

```sh
npm run validate   # live render: WebGL health + screenshot, Schwarzschild shadow
                   # angle vs Synge's formula, Kerr shadow asymmetry vs critical
                   # impact parameters, frame-wide null-constraint tolerance
```

## Contributing (UI)

Two files are deliberately unimplemented and owned by UI contributors — each is
self-contained: read only the file itself plus the argument types in
`src/contributorApi.ts`, no physics involved. (Both control modes — the running-mode
flight controls in `src/controls/flightControls.ts` and the paused-mode orbit camera
in `src/controls/pausedCameraControls.ts` — are already implemented.)

- `src/ui/controlPanel.ts` — the control panel: your own HTML/CSS/TS, positioned
  anywhere; parameter sliders, a diagnostic-view selector, a pause/resume button,
  real-time readout labels (values arrive every frame via `updateReadout`), and the
  ready-made self-updating minimap element to mount wherever fits.
- `src/ui/dataPanel.ts` — the experiment panel: the tank parameters, the fluid targets
  and ramp schedule the simulation is asking someone to build, the validity warnings,
  the fidelity residuals, and the recorder (record / sample rate / mark / download /
  lab-log template). Shares nothing with the control panel but the readout.

`references/informative/` holds a Shadertoy Kerr renderer consulted for shader
technique ideas only; nothing normative comes from it.
