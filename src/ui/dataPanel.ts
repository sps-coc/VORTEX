import type { DataPanel, DataPanelContext, SimulationReadout } from "../contributorApi.ts";

// ---------------------------------------------------------------------------------
// YOUR FILE. Build the experiment panel here — your own HTML/CSS/TS, positioned
// anywhere on screen. Everything you need is in `context` — see DataPanelContext in
// src/contributorApi.ts. No physics is involved: you read numbers out of
// updateReadout and write numbers into context.parameters.
//
// This panel answers two questions the rest of the app deliberately does not:
//   "what would I have to build in a water tank to reproduce this black hole?"
//   "how do I get the numbers out so I can plot them?"
//
// Required features:
// 1. Tank controls bound to context.parameters (assigning is all it takes):
//      laboratoryHorizonRadiusMetres  0.01 .. 0.30  step 0.005
//        the sonic horizon radius for a hole of the initial mass; this is the ruler
//        that fixes the whole length scale, so it does not move as the horizon grows
//        past it (readout gives the live radius under geometry)
//      laboratoryLayerDepthMetres     0.005 .. 0.20 step 0.005
//        undisturbed water depth; sets the wave speed sqrt(g h) and hence the
//        analogue speed of light and the entire time scale
//      laboratoryTankRadiusMetres     0.10 .. 2.00  step 0.05
//      analogueMatchedInvariant       a selector built from
//                                     context.analogueMatchingOptions
// 2. Analogue readouts from readout.analogue.state (see FluidVortexAnalogueState in
//    src/physics/fluidVortexAnalogue.ts for what every field means). The build
//    sheet a contributor actually needs, at minimum:
//      flow.volumetricDrainRateLitresPerMinute     the pump setting
//      flow.circulationMetresSquaredPerSecond      the injected circulation
//      geometry.sonicHorizonRadiusMetres           where the horizon is now
//      geometry.ergosurfaceRadiusMetres
//      thermodynamics.hawkingFrequencyHertz        the measurable temperature scale
//      thermodynamics.superradianceThresholdFrequenciesHertz  probe below these to
//                                                  see amplification (m = 1, 2, 3)
// 3. The driving schedule from readout.analogue.rates — as the hole accretes, the
//    drain and the circulation both have to be ramped:
//      volumetricDrainRateRateLitresPerMinutePerSecond
//      circulationRate, sonicHorizonRadiusRateMetresPerSecond
// 4. Validity warnings from readout.analogue.state.validity. Show these loudly when
//    they go out of range — they are the difference between an experiment and a
//    puddle:
//      ergosurfaceFitsInsideTank              must be true
//      superradianceBandFitsNondispersiveWindow  must be true
//      shallowWaterRatioAtHorizon             want << 1 (depth much less than the
//                                             horizon radius)
//      reynoldsNumber, froudeNumberAtTankRadius, nondispersiveCeilingFrequencyHertz
//    freeSurfaceDepressionAtHorizonMetres is a prediction rather than a warning —
//    show it as a measurable (a depth gauge at the horizon should read this much
//    less than the far field). Its fraction of the depth is pinned near a half by
//    the geometry and cannot be tuned away; say so rather than flagging it red.
// 5. Fidelity readouts from readout.analogue.state.fidelity. The draining vortex is
//    not isometric to Kerr: only the selected invariant is matched. Show the two
//    residuals and surfaceGravityRatio so nobody mistakes the analogy for an
//    identity.
// 6. Recording controls, from context.recording:
//      a record/stop button          setRecording(!isRecording())
//      a sample-rate control         setSampleIntervalSeconds(...)  (0.005 .. 2 s)
//      a "mark" button + text field  markEvent(label, { ...optional detail })
//        for anything the operator does by hand; crossings and pauses are marked
//        automatically
//      a download button             downloadRecording()
//      a lab-log button              downloadExperimentLogTemplate()
//        hands back a starter data/experiment-log.jsonl with this run's setpoints
//        already filled in — the contributor edits blanks instead of transcribing
//      a clear button                clear()
//    and live status from readout.recording: runIdentifier, recordedLineCount,
//    recordedByteCount (render as KB/MB), and a warning when reachedCapacityLimit
//    is true. Show runIdentifier prominently — it is the key a contributor writes
//    into data/experiment-log.jsonl to tie measurements to this run.
//
// Append everything under context.mountRoot. The placeholder body below records
// nothing and shows nothing; the app runs fine without it.
// ---------------------------------------------------------------------------------

export function createDataPanel(context: DataPanelContext): DataPanel {
  void context;
  return {
    updateReadout: (readout: SimulationReadout) => {
      void readout;
    }
  };
}
