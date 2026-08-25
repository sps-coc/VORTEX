# Data

Two JSONL files, one schema key. Everything here exists so that a curve predicted by
the simulation and a curve measured in a tank can be plotted on the same axes without
anybody transcribing numbers.

| file | written by | contains |
| --- | --- | --- |
| `telemetry/<runIdentifier>.jsonl` | the app (data panel → record, then download) | every variable the simulation knows, once per sample |
| `experiment-log.jsonl` | you, by hand | the rig, the runs, and what you measured |

The join key is the **run identifier** — a string like `run-04871233` shown in the
data panel and stamped on every telemetry line. Write it into the `run` line of your
experiment log as `simulationRunIdentifier`.

## Recording telemetry

In the app: set the tank parameters, press record, run the simulation, press download.
You get `run-XXXXXXXX.jsonl`. Put it in `telemetry/` (git-ignored — these get large;
commit only the ones a figure depends on).

Headless, for sweeps and reproducible figures — with the dev server up and Chrome on
the DevTools port (same prerequisites as `npm run validate`):

```sh
npm run capture -- data/telemetry/spin-090.jsonl 30 '{"spin":0.90,"accretionRate":0.004}'
```

Line kinds, each carrying `kind` and `runIdentifier`:

- `run` — first line: schema version, wall-clock start, full simulation parameters,
  analogue configuration, unit scaling, and the working-fluid constants used.
- `frame` — one complete `SimulationReadout` plus `sequence` and `elapsedSeconds`.
  This is the bulk of the file; see `src/contributorApi.ts` for every field.
- `horizon-profile` — the θ-resolved apparent horizon, every 25th recorded frame
  (64 samples of `{ theta, radius, correction }`).
- `event` — `recording-started`, `recording-stopped`, automatic transitions
  (`inside-horizon`, `inside-ergosphere`, `journey-ended`, `paused`) and anything you
  stamped by hand with the panel's mark button.

## Plotting

Flatten the frame lines into a CSV whose columns are dot paths:

```sh
npm run data:table -- data/telemetry/spin-090.jsonl figures/spin-090.csv
```

Columns come out as `blackHole.horizonArea`, `analogue.state.flow.drainStrength`,
`analogue.state.thermodynamics.superradianceThresholdFrequenciesHertz[0]` and so on —
about a hundred per frame. Figures worth making from a single run:

- `blackHole.mass` and `blackHole.outerHorizonRadius` against `advancedTime` — the
  Vaidya growth itself.
- `observer.specificEnergy`, `observer.specificAngularMomentum` and
  `observer.carterConstant` against `advancedTime` — constants of the motion in Kerr,
  visibly drifting under accretion. This is the whole point of the spacetime.
- `analogue.state.flow.volumetricDrainRateLitresPerMinute` against `elapsedSeconds` —
  the pump schedule, directly.
- `analogue.state.fidelity.*` against `blackHole.spinToMassRatio` — where the analogy
  stops being faithful as the hole accretes.
- `blackHole.hawkingTemperature` against
  `analogue.state.thermodynamics.hawkingFrequencyHertz` — the two temperature scales,
  separated by `analogue.state.fidelity.surfaceGravityRatio`.

`horizon-profile` lines are θ-resolved and belong in their own table; the exporter
reports how many it skipped.

## Filling in the experiment log

`experiment-log.jsonl` ships with four example lines carrying `"status": "template"`.
Copy them, drop the `status` field, and delete the examples once the file has real
entries — the validator skips anything still marked as a template.

Faster: press the data panel's lab-log button. It hands back the `apparatus` and `run`
lines for the run on screen with every setpoint the analogue mapping already worked
out — drain rate, circulation, ramp rates, probe frequency — so you only fill in the
blanks about your hardware.

Four record kinds:

- **`apparatus`** — one per rig. Required: `apparatusId`, `tankRadiusMetres`,
  `undisturbedDepthMetres`, `drainApertureRadiusMetres`, `workingFluid`,
  `fluidTemperatureCelsius`. Everything else (pump, flow meter, camera, wave maker) is
  optional but is what makes a run reproducible by somebody else.
- **`run`** — one per experimental run. Required: `runId`, `apparatusId`,
  `simulationRunIdentifier`, `startedAt`. Setpoints and the ramp schedule go here.
- **`measurement`** — one per measured number. Required: `runId`, `elapsedSeconds`,
  `quantity`, `value`, `unit`. Optional but wanted: `uncertainty`, `method`, `notes`.
  Radius-resolved quantities also need `radiusMetres`.
- **`note`** — required: `runId`, `text`. Anything that would make you distrust a
  measurement.

`quantity` is not free text: it must be one of the names in `MeasurableQuantities`
(`src/data/experimentLog.ts`), which also pins the unit and — where one exists — the
dot path of the predicted counterpart in the telemetry. That mapping is what turns
"measured 4.92 cm" into a point on a predicted curve. If you measure something real
that isn't in the list, add it there rather than inventing a name in the log.

Quantities with a prediction to plot against:

| quantity | unit |
| --- | --- |
| `sonicHorizonRadius`, `ergosurfaceRadius`, `freeSurfaceDepressionAtHorizon` | `m` |
| `horizonAngularVelocity` | `rad/s` |
| `volumetricDrainRate` | `L/min` |
| `circulation` | `m^2/s` |
| `radialSpeedAtHorizon`, `tangentialSpeedAtHorizon`, `waveSpeed` | `m/s` |
| `surfaceGravity` | `1/s` |
| `hawkingFrequency` | `Hz` |

Quantities only the tank can tell you: `waveAmplificationFactor` (dimensionless — the
superradiance observable, greater than one is amplification), `incidentWaveAmplitude`,
`reflectedWaveAmplitude`, `layerDepth` (radius-resolved),
`radialVelocity`/`azimuthalVelocity` (radius-resolved),
`quasinormalRingdownFrequency`, `quasinormalDecayRate`.

Check it before committing:

```sh
npm run log:check
```

It validates every line, resolves `apparatusId`/`runId` references, enforces the unit
per quantity, and prints how many of your measurements have a predicted counterpart.
