# Sigma.js WebGL rendering and ForceAtlas2 layout

We rewrote the entire renderer, layout engine, and interaction model to match the visual language and UX of [citationgraph.org](https://citationgraph.org).

**What changed:**

- **Rendering:** SVG → Sigma.js (WebGL canvas). Handles 10K+ nodes with GPU acceleration, built-in zoom/pan, label thresholding, and hover dimming out of the box.
- **Layout:** Custom boid force layout → ForceAtlas2. Battle-tested on large graphs (used by Gephi). Physics parameters hidden from user — just an on/off toggle button.
- **Graph library:** Custom graph → `graphology`. Required by ForceAtlas2 and CirclePack; provides community detection, GEXF I/O, and layout pipelines.
- **Visuals:** Degree-based node sizing, community-colored nodes/edges, no arrowheads, no stroke borders, no tooltips (click opens Wikipedia in new tab).
- **Search:** Split into **filter** (highlight in current graph) and **search from Wikipedia** (additive, appends new nodes). Double-click remains **navigate** (replace graph).
- **Controls:** Physics sliders (springLength, gravity) → layout toggle buttons (ForceAtlas2, CirclePack). Two sliders remain: label threshold and node size threshold.

**Why:**

- Sigma.js gives us the citation graph's clean, minimal aesthetic with fullscreen canvas rendering.
- ForceAtlas2 is more scalable than boid layout for large graphs and is the industry standard for graph visualization.
- Community coloring (Louvain) reveals topological structure rather than expansion history — more useful for exploration.
- Dropped tooltips, physics sliders, and the Wikipedia iframe to reduce UI chrome. The reference design proves a fullscreen graph with minimal controls works well.

**Considered alternatives:**

- **Keep SVG, match visual style only.** Rejected — SVG doesn't scale to 10K+ nodes; we'd hit the same performance wall the citation graph avoids with WebGL.
- **Keep boid layout.** Rejected — ForceAtlas2 is better maintained, handles large graphs, and is required by the CirclePack layout we're adding.
- **Community detection on the frontend only.** Rejected for book entity graphs — the backend already builds the graph in memory, so running Louvain there is cheap and deterministic.
