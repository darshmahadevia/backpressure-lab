# Backpressure Lab visual system

The first dashboard is an **operations runroom**: a precise dark instrument for watching finite capacity become visible. It uses a deep blue-black field, quiet blue-gray rules, amber for offered load and pressure, cyan for active processing, green for healthy outcomes, and red only for overload/failure. The pipeline is the hero; charts support the mechanism instead of replacing it.

Typography uses a restrained sans-serif UI voice for explanation and a monospace measurement voice for rates, IDs, states, and chart labels. Surfaces are flat and structured with thin rules, small radii, and no decorative gradients or shadows. Controls are native-feeling, clearly labeled, keyboard-visible, and reachable without hover.

The responsive composition keeps the experiment controls and current pipeline first, then collapses the pipeline into a readable grid and turns the metric rail into a two-column stack on narrow screens. Motion is limited to live progress changes and respects `prefers-reduced-motion`; the data is readable in its settled state.

The page's memorable moment is the operator reading under the pipeline: a short explanation changes from healthy to degrading to overloaded while the live queue and tail latency show why.
