# The fluid analogue

The point of this project is not the picture. It is that an ingoing Kerr–Vaidya black
hole and a growing draining vortex in a shallow tray of water are close enough that
measuring one tells you about the other. This document is the mapping: what is matched
exactly, what is only approximated, what cannot be matched at all, and what to build.

Implementation: `src/physics/fluidVortexAnalogue.ts`. Checks: `npm run check`.

## 1. The two geometries

**Spacetime.** Ingoing Kerr–Vaidya in advanced coordinates `(v, r, θ, ψ)`, a Kerr hole
whose mass function `M(v)` grows monotonically while the spin parameter `a` stays put.
Its horizon structure is set by

```
r±  = M ± √(M² − a²)            horizons
r_E = 2M                        ergosurface, equatorial
Ω_H = a / (r+² + a²)            angular velocity of the horizon
κ   = (r+ − r−) / 2(r+² + a²)   surface gravity
```

**Fluid.** A layer of water of undisturbed depth `h` with a point drain and
circulation at the origin. Outside the core the flow is irrotational and
incompressible:

```
v = -(D/r) r̂ + (C/r) ψ̂        D, C > 0,  units m²/s
```

Long-wavelength surface perturbations of that flow obey a massless Klein–Gordon
equation on an effective Lorentzian metric (Unruh 1981; Visser, gr-qc/9712010):

```
ds² = -(c² - (C² + D²)/r²) dt² - 2(D/r) dr dt - 2C dψ dt + dr² + r² dψ²
```

where `c = √(gh)` is the shallow-water wave speed and plays the role of the speed of
light. This is the **draining bathtub**, described by Cardoso, Lemos & Yoshida
(gr-qc/0410107) as "the closest analogue found so far to the Kerr black hole". It has

```
r_h  = D/c                      sonic horizon
r_e  = √(C² + D²)/c             ergosurface
Ω_h  = C/r_h²                   angular velocity of the horizon
κ_h  = c²/D = c/r_h             surface gravity
```

It is *not* isometric to Kerr. Section 4 is the bill.

## 2. Counting the freedoms

The tank offers three knobs: an overall length scale, a wave speed (set by depth), and
the single dimensionless shape parameter `C/D`. Fixing where the horizon sits and how
fast waves travel consumes the first two, so **exactly one dimensionless Kerr
invariant can be matched** — the choice is
`AdjustableParameters.analogueMatchedInvariant`.

| matched invariant | Kerr value | gives |
| --- | --- | --- |
| `horizon-angular-velocity` (`Ω_H r+ / c`) | `a / 2M` | `C/D = a/2M` |
| `ergosphere-radius-ratio` (`r_E / r+`) | `2M / r+` | `C/D = √((2M/r+)² − 1)` |

Both vanish for a non-rotating hole — a Schwarzschild analogue is a pure sink with no
circulation — and both grow with spin, but they disagree badly near extremality: at
`a = M` the first gives `C/D = 1/2` and the second `√3`. Whichever you pick, the other
is reported as a residual every frame.

**Angular velocity is the default**, because superradiance — the one effect that has
actually been measured in a tank (Torres et al., arXiv:1612.06180) — is governed by
`ω < m Ω_h` and nothing else.

## 3. The unit map

Two lab choices fix the whole correspondence:

- `laboratoryHorizonRadiusMetres` — the sonic horizon radius the tank would have for a
  hole of the **initial mass `M₀`**. This is the ruler:
  `L = laboratoryHorizonRadiusMetres / r+(M₀)` metres per geometrized length unit. The
  apparatus is built once, so `L` is frozen; the horizon then marches outward across a
  tank of fixed size as `M(v)` grows, which is the whole Vaidya story. `M(v)` already
  exceeds `M₀` by `v = 0`, so a run starts with the horizon a little outside the
  anchor — 5.4 cm for a 5 cm anchor at the shipped defaults.
- `laboratoryLayerDepthMetres` — sets `c = √(gh)`, hence the time scale `T = L/c`
  seconds per geometrized time unit.

From those:

```
r_h(t) = L · r+(M(v))                        sonic horizon, growing
D      = c · r_h                             drain strength      [m²/s]
C      = (C/D) · D                           circulation strength
Q      = 2π h D                              volumetric drain rate [m³/s]
Γ      = 2π C                                circulation           [m²/s]
```

`Q` in litres per minute is the pump setting; `Γ` is what the tangential injectors
have to supply.

## 4. What the analogy costs

Three residuals are reported live in `analogue.state.fidelity`:

- **`horizonAngularVelocityResidual`** and **`ergosphereRadiusRatioResidual`** — the
  unmatched invariant's error. Zero for whichever one you selected.
- **`surfaceGravityRatio`** — and this one is unfixable. For the draining bathtub
  `κ_h r_h / c ≡ 1` identically, because the radial inflow is exactly `D/r`. For Kerr
  the same dimensionless combination is `(r+ − r−)/4M`, which is `1/2` at zero spin
  and falls to zero at extremality. So

  ```
  κ_fluid / κ_Kerr = 4M / (r+ − r−)  ≥  2
  ```

  The analogue always runs hot relative to its horizon size — exactly twice as hot for
  Schwarzschild, diverging as the hole approaches extremality. No choice of `C`, `D`,
  `h` or `L` moves this, because it is a statement about the *shape* of the radial
  velocity profile. A real tank, whose inflow is not exactly `1/r` near the core, does
  better than the idealization; matching it would mean replacing the draining-bathtub
  profile with a measured one, which is future work, not a knob.

There is also a structural limit that is not a fidelity residual but a fact about
shallow water. At the sonic horizon the flow speed equals `√(gh)` by definition, so
Bernoulli forces the free surface to dip by

```
Δh(r_h) = (C² + D²) / 2g r_h²  =  h · (1 + (C/D)²) / 2
```

— about half the depth, always. The constant-depth idealization behind the effective
metric is therefore never better than ~50% accurate near the core. Real experiments
handle this by measuring the depth profile and feeding it back into the metric; here
it is reported as a **prediction to check with a depth gauge**
(`validity.freeSurfaceDepressionAtHorizonMetres`), not as a warning.

## 5. Driving the growth

Kerr–Vaidya accretion is a schedule, delivered in `analogue.rates` as per-second lab
quantities (central-differenced in `v` and converted through `T`):

```
dr_h/dt,  dD/dt,  dC/dt,  dQ/dt,  dΓ/dt,  d(C/D)/dt,  dΩ_h/dt
```

The signs are worth internalizing: at fixed `a`, a growing `M` means `a/M` falls, so
the hole **spins down in the only dimensionless sense the vortex can see**.
`d(C/D)/dt < 0` while `dD/dt > 0` and `dC/dt > 0` — you ramp both pumps up, but the
drain faster than the circulation.

## 6. Validity envelope

Reported every frame in `analogue.state.validity`; the data panel is expected to shout
when one goes out of range.

| quantity | want | why |
| --- | --- | --- |
| `ergosurfaceFitsInsideTank` | true | the interesting region has to be in the water |
| `superradianceBandFitsNondispersiveWindow` | true | probes must be slower than `mΩ_h` **and** long enough to be non-dispersive |
| `shallowWaterRatioAtHorizon` = `h/r_h` | ≪ 1 | shallow water is the entire basis of the effective metric |
| `nondispersiveCeilingFrequencyHertz` | above your probe | the highest frequency whose phase speed is within 5% of `√(gh)`, from the full gravity-capillary relation `ω² = (gk + σk³/ρ) tanh(kh)` |
| `froudeNumberAtTankRadius` = `r_h/R` | ≪ 1 | the far field should be nearly at rest |
| `reynoldsNumber` = `√(C²+D²)/ν` | — | radius-independent for this flow; a few 10⁴ is normal and turbulent |
| `capillaryLengthMetres` | ≈ 2.7 mm | wavelengths near this are capillary-dominated, not gravity waves |

The dispersion ceiling deserves a warning. At a depth of 6.25 cm — the Torres et al.
rig — it sits near **1.1 Hz**, well below the 3.70 Hz probe that experiment used: their
waves were *not* in the shallow-water regime, and their analysis used the full
dispersion relation rather than the non-dispersive metric. Since the ceiling scales
roughly as `1/√h`, a shallower layer buys a wider usable band, which is why the
defaults here are 1 cm of water rather than 6.

## 7. The default rig

`src/main.ts` ships with a bench-scale tank chosen so every tunable flag above passes
at the default spin of 0.82:

| | |
| --- | --- |
| sonic horizon anchor (`M = M₀`) | 5 cm — 5.4 cm at `v = 0` |
| undisturbed depth | 1 cm |
| tank radius | 40 cm |
| wave speed `√(gh)` | 0.313 m/s |
| drain rate `Q` | 63.4 L/min, ramping at 1.7 L/min per second |
| circulation `Γ` | 0.0415 m²/s |
| `Ω_h` | 2.29 rad/s |
| `m = 1` superradiance threshold | 0.365 Hz (`m = 3`: 1.09 Hz) |
| non-dispersive ceiling | 3.17 Hz |
| shallow-water ratio `h/r_h` | 0.186 |
| free-surface dip at the horizon | 5.8 mm — a prediction, §4 |
| `κ` mismatch at `a = 0.82` | ×3.24 (×2 in the Schwarzschild limit, §4) |

Sixty-three litres a minute through a 40 cm tray is a real pump and a real drain, not
a thought experiment. That is the intended reading of this whole file.

One number is worth stating plainly because it is the reason analogue gravity is done
this way at all: the analogue Hawking *temperature* here is 7 × 10⁻¹² K, utterly
unmeasurable — but the same surface gravity expressed as a *frequency* is 0.93 Hz,
which is a ripple you can photograph. The classical kinematics of the horizon survive
the analogy; the quantum thermodynamics does not.

## References

- Unruh, *Experimental black-hole evaporation?*, PRL 46, 1351 (1981).
- Visser, *Acoustic black holes: horizons, ergospheres and Hawking radiation*,
  gr-qc/9712010.
- Cardoso, Lemos & Yoshida, *Quasinormal modes and stability of the rotating acoustic
  black hole*, gr-qc/0410107.
- Torres, Patrick, Coutant, Richartz, Tedford & Weinfurtner, *Observation of
  superradiance in a vortex flow*, arXiv:1612.06180.
- Dahal & Terno, arXiv:2008.13370, and Dahal, Maharana, Simovic & Terno,
  arXiv:2311.02981 — the Kerr–Vaidya side, normative for this repository.
