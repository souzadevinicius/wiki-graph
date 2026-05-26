# Sigma.js Reimplementation

Rebuild the entire frontend rendering and interaction layer to match citationgraph.org's visual style and UX.

## Dependencies to install

- `sigma` — WebGL graph renderer
- `@sigma/layout-forceatlas2` — ForceAtlas2 layout
- `@sigma/layout-circlepack` — CirclePack hierarchical layout
- `graphology` — graph data structure
- `graphology-communities-louvain` — community detection (frontend, for Wikipedia graphs)
- `graphology-gexf` — GEXF import/export (for Sigma.js integration)
- `@sigma/controls` — built-in zoom/pan controls (optional, may use custom)

Remove `panzoom` and `simplesvg`.

## Phase 1: Infrastructure — graphology adapter

**Goal:** Create a `GraphologyAdapter` class that wraps `graphology.Graph` and provides the same interface as the current `buildGraph` output.

- [ ] 1.1 Create `src/lib/graphologyAdapter.ts`
  - Methods: `addNode`, `addLink`, `hasNode`, `getNode`, `forEachNode`, `forEachLink`, `on('changed')`, `maxDepth`
  - Under the hood: `graphology.Graph` instance
  - Node attributes: `depth`, `wikipedia_title`, `type`, `mentions`, `community`, `x`, `y`, `size`, `color`, `label`
  - Edge attributes: `color` (community-derived)

- [ ] 1.2 Update `src/lib/apiClient.ts` `getItem()` to return data compatible with graphologyAdapter
- [ ] 1.3 Update `src/lib/state.ts` to use graphologyAdapter instead of the old graph
- [ ] 1.4 Verify: load a Wikipedia graph, log node count, verify no crashes

## Phase 2: Sigma.js renderer

**Goal:** Replace the SVG renderer with a Sigma.js instance.

- [ ] 2.1 Create `src/lib/sigmaRenderer.ts`
  - Accepts a `graphologyAdapter` instance
  - Creates a Sigma.js instance on `#sigma-container`
  - Renders nodes as circles, sized by degree, colored by community
  - Renders edges as thin lines, colored by source node's community
  - No arrowheads
  - Label threshold slider support
  - Size threshold slider support (hide nodes below degree threshold)

- [ ] 2.2 Implement node hover: highlight node + neighbors, dim everything else
  - Use Sigma.js `render` pipeline or `nodeReducer` / `edgeReducer`
  - Hovered node: normal
  - Neighbor nodes: normal
  - Non-neighbor nodes: label hidden, color `#e3e3e3`

- [ ] 2.3 Implement click handler: open Wikipedia in new tab
  - `node.data.wikipedia_title` or `node.id` → `https://{lang}.wikipedia.org/wiki/{title}`

- [ ] 2.4 Implement double-click handler: fire `navigate` event (replace graph)

- [ ] 2.5 Implement right-click handler: fire `expand` event (add backlinks)

- [ ] 2.6 Replace `src/core-anvaka-vs/createRenderer.js` usage in `App.svelte`
- [ ] 2.7 Remove `src/core-anvaka-vs/` directory entirely
- [ ] 2.8 Remove `src/assets/anvaka-vs.css`
- [ ] 2.9 Update `index.html` — replace SVG structure with `<div id="sigma-container"></div>`
- [ ] 2.10 Verify: load Wikipedia graph, see nodes rendered, can pan/zoom, click opens Wikipedia

## Phase 3: ForceAtlas2 layout

**Goal:** Integrate ForceAtlas2 as the default layout engine.

- [ ] 3.1 Install `@sigma/layout-forceatlas2`
- [ ] 3.2 Create `src/lib/layouts/forceAtlas2.ts`
  - Accepts graphology graph
  - Runs ForceAtlas2 for N iterations (or until converged)
  - Applies positions as node attributes (`x`, `y`)
  - Returns layouted graph

- [ ] 3.3 Integrate into render flow: after graph is built, run FA2 before rendering
- [ ] 3.4 Add FA2 toggle button to UI (start/stop layout)
- [ ] 3.5 Verify: graph layout looks reasonable, hubs are in center, leaves spread out

## Phase 4: Community detection and coloring

**Goal:** Color nodes by community. Book graphs get communities from backend; Wikipedia graphs compute on frontend.

### Frontend (Wikipedia graphs)

- [ ] 4.1 Install `graphology-communities-louvain`
- [ ] 4.2 Create `src/lib/communityDetection.ts`
  - `detectCommunities(graphologyGraph): Map<nodeId, communityId>`
  - Assign colors per community (use a fixed palette, e.g., d3 category10 or citation graph's palette)
  - Set `community` and `color` attributes on each node

- [ ] 4.3 Call `detectCommunities()` after graph is built (Wikipedia search)
- [ ] 4.4 Set edge colors to match source node's community color

### Backend (Book entity graphs)

- [ ] 4.5 Add Louvain community detection to `book-entities` Python backend
  - Use `python-louvain` or `networkx` community detection
  - Add `community` integer attribute to each node
  - Add `color` hex string to each node (use same palette as frontend for consistency)

- [ ] 4.6 Update `src/lib/serverApi.ts` to pass through community/color from backend
- [ ] 4.7 Verify: book graph shows distinct colored clusters, Wikipedia graph also shows clusters

## Phase 5: CirclePack layout

**Goal:** Add CirclePack layout as an alternative to ForceAtlas2.

- [ ] 5.1 Install `@sigma/layout-circlepack`
- [ ] 5.2 Create `src/lib/layouts/circlePack.ts`
  - Accepts graphology graph with community attributes
  - Runs CirclePack layout
  - Applies positions to nodes

- [ ] 5.3 Add CirclePack button to UI (top-left, alongside FA2)
  - Enabled only when graph has community data (book entity graphs)
  - Disabled/hidden for Wikipedia graphs

- [ ] 5.4 Verify: clicking CirclePack re-layouts into nested circles

## Phase 6: Search filter

**Goal:** Search bar highlights matching nodes instead of navigating.

- [ ] 6.1 Create `src/lib/SearchFilter.svelte`
  - Text input with debounced search
  - On input: filter graph nodes by label (node.id) containing the query
  - Highlight matching nodes, dim non-matching (use Sigma.js nodeReducer)
  - Show matching count

- [ ] 6.2 Add "Search Wikipedia" button next to filter input
  - On click: fetch article + backlinks, add to existing graph
  - Run community detection again (re-color all nodes)
  - Re-run layout (warm restart from current positions)

- [ ] 6.3 Remove old `WikiSearch.svelte` search behavior (navigate on enter)
- [ ] 6.4 Keep double-click navigate behavior on graph nodes
- [ ] 6.5 Verify: typing filters nodes, button adds nodes, double-click replaces graph

## Phase 7: Visual polish

**Goal:** Match citation graph's clean aesthetic.

- [ ] 7.1 Update `src/assets/style.css` — clean light theme, minimal chrome
- [ ] 7.2 Controls: search input + two sliders (label threshold, size threshold) in top-left
- [ ] 7.3 Buttons: "Force Atlas ▶" / "CirclePack" in top-left below sliders
- [ ] 7.4 Remove gear icon panel (`LayoutControls.svelte`)
- [ ] 7.5 Remove tooltip overlay (delete tooltip CSS, remove tooltip event handlers)
- [ ] 7.6 Remove `src/assets/tooltip.pcss`
- [ ] 7.7 Node labels: font size scaled by degree, shown/hidden by label threshold
- [ ] 7.8 Background: clean white (`#ffffff` or `#fafafa`)
- [ ] 7.9 About link: small, top-right corner
- [ ] 7.10 Verify: page looks like citation graph reference, but with Wikipedia content

## Phase 8: Book upload cleanup

**Goal:** Clean up the book upload floating panel to match new aesthetic.

- [ ] 8.1 Update `BookUpload.svelte` styles — light theme, minimal chrome
- [ ] 8.2 Position: bottom-right, floating, appears when triggered
- [ ] 8.3 Remove dark theme CSS variables (the app is now light-themed)
- [ ] 8.4 Verify: upload flow works, styles match new theme

## Phase 9: Cleanup

**Goal:** Remove dead code, verify everything works.

- [ ] 9.1 Remove `src/core-anvaka-vs/` directory
- [ ] 9.2 Remove `panzoom`, `simplesvg` from dependencies
- [ ] 9.3 Remove old CSS: `anvaka-vs.css`, `tooltip.pcss`
- [ ] 9.4 Remove old components: `LayoutControls.svelte`, `IconArrow.svelte` (if unused)
- [ ] 9.5 Remove confetti code from `App.svelte` (unused)
- [ ] 9.6 Remove Wikipedia iframe from `App.svelte`
- [ ] 9.7 Audit `package.json` — add new deps, remove old deps
- [ ] 9.8 Build and test: `npm run build`, verify no errors
- [ ] 9.9 Manual test: Wikipedia search, expand, navigate, filter, book upload, CirclePack

## Migration notes

- The `buildGraph.js` output format changes to graphology. All code that reads `appState.graph` must use the adapter.
- The `bus` event system can be simplified — Sigma.js has its own event system (`sigma.on('clickNode', ...)`) but we may keep the bus for Svelte interop.
- The `Progress.js` class (layout progress indicator) can be removed — Sigma.js handles layout animations internally.
