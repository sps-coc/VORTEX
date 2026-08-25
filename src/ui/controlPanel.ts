import type { ControlPanel, ControlPanelContext, SimulationReadout } from "../contributorApi.ts";

// ---------------------------------------------------------------------------------
// YOUR FILE. Build the control panel here — your own HTML/CSS/TS, positioned
// anywhere on screen. Everything you need is in `context` — see ControlPanelContext
// in src/contributorApi.ts. You do not need to read any other file, and none of
// this involves the physics: assigning to context.parameters and calling
// context.setPaused are the only "outputs"; live values arrive via updateReadout.
//
// The laboratory/analogue side and the recorder are NOT yours — they live in
// src/ui/dataPanel.ts. Do not duplicate them here.
//
// Required features:
// 1. Parameter controls (sliders or your own widgets) bound to context.parameters:
//      spin              0    .. 0.98   step 0.001
//      accretionRate     0    .. 0.006  step 0.0001
//      exposureScale     0.35 .. 2.4    step 0.01
//      timeScale         0    .. 4      step 0.05
//      maximumStepCount  60   .. 600    step 10     (render quality)
//    Assigning the new value to the field is all it takes — no events to fire.
// 2. A diagnostic-view selector (e.g. <select>) built from
//    context.diagnosticFieldOptions, writing the chosen option's value to
//    context.parameters.diagnosticField.
// 3. A pause/resume button using context.isPaused() / context.setPaused(...).
//    The space bar also toggles pause elsewhere, so refresh the button's label from
//    isPaused() inside updateReadout rather than assuming your button is the only
//    writer.
// 4. Real-time labels, refreshed in updateReadout (called once per frame), showing
//    readout.blackHole, readout.observer and readout.rendering. Every field of those
//    three is worth surfacing; group them as you see fit. Suggested formatting:
//      masses, radii, areas, advancedTimeRate  -> value.toFixed(2..4)
//      massDerivative, hawkingTemperature      -> value.toExponential(2)
//      advancedTime, frameMilliseconds         -> value.toFixed(1)
//      angles                                  -> degrees, value.toFixed(1)
//      observer.mode / insideHorizon           -> text badge ("free fall — INSIDE HORIZON")
//      observer.journeyEnded                   -> a notice like "inner horizon reached —
//                                                 journey ends here" when true
//    readout.observer.specificEnergy, specificAngularMomentum and carterConstant are
//    constants of the motion in Kerr; under Vaidya accretion they drift, so showing
//    them next to each other makes the whole point of the simulation visible.
//    Consider throttling DOM writes if you add heavy styling (e.g. update text at
//    10 Hz) but a straight textContent update every frame is fine.
// 5. Mount context.minimapElement (a finished, self-updating top-down map) wherever
//    fits your layout — it is inert HTML from your perspective: append + style its
//    position/size, nothing else.
//
// Append everything under context.mountRoot. Create any helper functions, style
// tags, or CSS classes you like in this file (a <style> element is fine).
// The placeholder body below only mounts the minimap so the app stays usable.
// ---------------------------------------------------------------------------------

export function createControlPanel(context: ControlPanelContext): ControlPanel {
  context.mountRoot.appendChild(context.minimapElement);
  return {
    updateReadout: (readout: SimulationReadout) => {
      void readout;
    }
  };
}
