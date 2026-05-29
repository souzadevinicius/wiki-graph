<script lang="ts">
  import { onDestroy } from 'svelte';
  import { appState, performSearch, addToGraph, watchState } from './lib/state';
  import { apiClient } from './lib/apiClient';
  import { queryStore } from './lib/store';
  import { SigmaRenderer } from './lib/sigmaRenderer';
  import { detectCommunities, hasCommunityData } from './lib/communityDetection';
  import { runForceAtlas2 } from './lib/layouts/forceAtlas2';
  import { runCirclePack } from './lib/layouts/circlePack';
  import { fetchBridgeEdges } from './lib/bridgeBuilder';
  import BookUpload from './lib/BookUpload.svelte';
  import About from './lib/About.svelte';
  import WikiSearch from './lib/WikiSearch.svelte';
  import GraphStats from './lib/GraphStats.svelte';
  import EdgePanel from './lib/EdgePanel.svelte';
  import EdgeTable from './lib/EdgeTable.svelte';

  let sigmaContainer: HTMLDivElement;
  let renderer: SigmaRenderer | null = null;
  let aboutVisible = false;
  let statsVisible = false;
  let eventListenersAttached = false;
  let edgeTableVisible = false;

  // Edge panel state
  let selectedEdge: {
    source: string;
    target: string;
    pmi: number;
    weight: number;
    contextSentences: string[];
  } | null = null;

  // Layout state
  let fa2Running = false;
  let circlePackAvailable = false;

  function bumpGraphVersion() {
    appState.graphVersion += 1;
  }

  // Search filter state
  let searchQuery = '';
  let labelThreshold = 12;
  let sizeThreshold = 0;
  let pruningIntensity = 0;

  // API options
  let fetchSummaries = false;

  // Initialize
  const DEFAULT_LANG = 'en';
  const LABEL_THRESHOLD_STORAGE_KEY = 'wiki-graph:label-threshold';
  const SIZE_THRESHOLD_STORAGE_KEY = 'wiki-graph:size-threshold';
  const PRUNING_INTENSITY_STORAGE_KEY = 'wiki-graph:pruning-intensity';

  function readStoredNumber(key: string, fallback: number): number {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw === null || raw === undefined) return fallback;

    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  labelThreshold = readStoredNumber(LABEL_THRESHOLD_STORAGE_KEY, labelThreshold);
  sizeThreshold = readStoredNumber(SIZE_THRESHOLD_STORAGE_KEY, sizeThreshold);
  pruningIntensity = readStoredNumber(PRUNING_INTENSITY_STORAGE_KEY, pruningIntensity);

  apiClient.setLang(appState.lang || DEFAULT_LANG);

  function initRenderer() {
    if (!sigmaContainer || !appState.graph) return;

    const cameraRatio = renderer?.getSigma()?.getCamera().getState().ratio;

    renderer?.kill();
    renderer = null;
    sigmaContainer.replaceChildren();

    renderer = new SigmaRenderer(appState.graph, {
      container: sigmaContainer,
      labelThreshold,
      sizeThreshold,
      lang: appState.lang,
      pruningIntensity,
    });

    renderer.render();

    if (typeof cameraRatio === 'number') {
      const camera = renderer.getSigma()?.getCamera();
      camera?.setState({
        ...camera.getState(),
        ratio: cameraRatio,
      });
    }

    renderer.setLabelThreshold(labelThreshold);
    renderer.setSizeThreshold(sizeThreshold);
    renderer.setPruningIntensity(pruningIntensity);

    if (searchQuery) {
      renderer.setSearchQuery(searchQuery);
    }

    setupEventListeners();
  }

  function handleNavigate(e: CustomEvent) {
    onNavigate(e);
  }

  async function handleExpand(e: CustomEvent) {
    const nodeId = e.detail;
    if (!appState.graph) return;

    appState.query = nodeId;
    queryStore.set(nodeId);

    const node = appState.graph.getNode(nodeId);
    const wikiTitle = node.data.wikipedia_title || nodeId;
    if (!wikiTitle) return;

    try {
      const backlinks = await apiClient.getResponse(wikiTitle);
      if (backlinks.length === 0) return;

      const summaries = await Promise.all(
        backlinks.map(async (bl) => {
          if (fetchSummaries) {
            const summary = await apiClient.getSummary(bl.title);
            return apiClient.getItem(summary);
          }
          return { id: bl.title, data: { description: '', extract_html: bl.extract || '', thumbnail: bl.thumbnail?.source || null } };
        })
      );

      const newNodes = summaries.filter(Boolean);
      const anchorDepth = node.data.depth ?? 0;
      const newDepth = anchorDepth + 1;
      const connectsToRenderedGraph = appState.graph.hasNode(nodeId) || newNodes.some((other) =>
        other ? appState.graph!.hasNode(other.id) : false
      );

      if (!connectsToRenderedGraph) return;

      const newNodeIds: string[] = [];
      let added = 0;
      newNodes.forEach((other) => {
        if (!other) return;

        if (!appState.graph!.hasNode(other.id)) {
          appState.graph!.addNode(other.id, {
            depth: newDepth,
            ...other.data,
          });
          added += 1;
          newNodeIds.push(other.id);
        }

        appState.graph!.addLink(nodeId, other.id, 5.0);
      });

      if (added > 0) {
        // Build bridge edges between new backlinks and existing nodes
        await fetchBridgeEdges(newNodeIds, appState.graph, appState.lang);

        detectCommunities(appState.graph.getGraphology());
        runForceAtlas2(appState.graph.getGraphology());
        bumpGraphVersion();
        initRenderer();
        circlePackAvailable = hasCommunityData(appState.graph.getGraphology());
      } else if (renderer) {
        renderer.updateGraph();
      }
    } catch (err) {
      console.error('[expandNode] failed:', err);
    }
  }

  function setupEventListeners() {
    if (!sigmaContainer || eventListenersAttached) return;
    eventListenersAttached = true;

    // Navigate (double-click) — replace graph
    sigmaContainer.addEventListener('navigate', handleNavigate as EventListener);

    // Expand (middle-click)
    sigmaContainer.addEventListener('expand', handleExpand as EventListener);

    // Edge click — show edge panel
    sigmaContainer.addEventListener('clickEdge', handleEdgeClick as EventListener);
  }

  /** Handle search from WikiSearch — add to existing graph. */
  async function onSearch(e: CustomEvent | { detail: string }) {
    const q = typeof e.detail === 'string' ? e.detail : e.detail;
    const summary = fetchSummaries ? await apiClient.getSummary(q) : null;
    const entryItem = summary ? apiClient.getItem(summary) : { id: q, data: {} };
    if (!entryItem) return;

    // If no graph exists, create one via performSearch
    if (!appState.graph) {
      const graph = await performSearch(entryItem, fetchSummaries);
      detectCommunities(graph.getGraphology());
      runForceAtlas2(graph.getGraphology());
      initRenderer();
      circlePackAvailable = hasCommunityData(graph.getGraphology());
      return;
    }

    // Add to existing graph
    const newNodeIds = await addToGraph(entryItem, appState.graph, fetchSummaries);

    // Build bridge edges between new nodes and existing graph
    await fetchBridgeEdges(newNodeIds, appState.graph, appState.lang);

    detectCommunities(appState.graph.getGraphology());
    runForceAtlas2(appState.graph.getGraphology());
    bumpGraphVersion();
    initRenderer();
    circlePackAvailable = hasCommunityData(appState.graph.getGraphology());
  }

  /** Handle navigate (double-click) — always replaces the graph. */
  async function onNavigate(e: CustomEvent) {
    const nodeId = e.detail;
    appState.query = nodeId;
    queryStore.set(appState.query);
    const summary = fetchSummaries ? await apiClient.getSummary(nodeId) : null;
    const entryItem = summary ? apiClient.getItem(summary) : { id: nodeId, data: {} };
    if (entryItem) {
      const graph = await performSearch(entryItem, fetchSummaries);
      detectCommunities(graph.getGraphology());
      runForceAtlas2(graph.getGraphology());
      initRenderer();
      circlePackAvailable = hasCommunityData(graph.getGraphology());
    }
  }

  function onBookGraph(e: CustomEvent) {
    const graph = e.detail;
    appState.hasGraph = true;
    appState.graph = graph;

    // Book graphs have communities from backend
    detectCommunities(graph.getGraphology());
    runForceAtlas2(graph.getGraphology());

    initRenderer();
    circlePackAvailable = true;
  }

  // Layout controls
  function toggleFA2() {
    if (!appState.graph) return;
    fa2Running = !fa2Running;
    if (fa2Running) {
      runForceAtlas2(appState.graph.getGraphology());
      if (renderer) renderer.updateGraph();
    }
  }

  function applyCirclePack() {
    if (!appState.graph || !circlePackAvailable) return;
    runCirclePack(appState.graph.getGraphology());
    if (renderer) renderer.updateGraph();
  }

  // Stats panel
  function toggleStats() {
    statsVisible = !statsVisible;
  }

  // Edge table
  function toggleEdgeTable() {
    edgeTableVisible = !edgeTableVisible;
  }

  // Edge panel
  function handleEdgeClick(e: CustomEvent) {
    selectedEdge = e.detail;
  }

  function closeEdgePanel() {
    selectedEdge = null;
  }

  function handleEdgeTableSelect(e: CustomEvent) {
    selectedEdge = e.detail;
  }

  function handleKeydown(e: KeyboardEvent) {
    // Don't trigger if typing in an input
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
    if (e.key === 's' || e.key === 'S') {
      toggleStats();
    }
    if (e.key === 'e' || e.key === 'E') {
      toggleEdgeTable();
    }
    if (e.key === 'Escape') {
      if (selectedEdge) {
        closeEdgePanel();
      }
    }
  }

  // Attach keyboard listener
  globalThis.addEventListener('keydown', handleKeydown);

  // Search filter
  function onFilterInput(value: string) {
    searchQuery = value;
    if (renderer) {
      if (value) {
        renderer.setSearchQuery(value);
      } else {
        renderer.clearSearch();
      }
    }
  }

  function onLabelThreshold(value: number) {
    labelThreshold = value;
    globalThis.localStorage?.setItem(LABEL_THRESHOLD_STORAGE_KEY, String(value));
    if (renderer) renderer.setLabelThreshold(value);
  }

  function onSizeThreshold(value: number) {
    sizeThreshold = value;
    globalThis.localStorage?.setItem(SIZE_THRESHOLD_STORAGE_KEY, String(value));
    if (renderer) renderer.setSizeThreshold(value);
  }

  // Event handlers for template
  function handleFilterInput(e: Event) {
    onFilterInput((e.target as HTMLInputElement).value);
  }

  function handleLabelThreshold(e: Event) {
    onLabelThreshold(Number((e.target as HTMLInputElement).value));
  }

  function handleSizeThreshold(e: Event) {
    onSizeThreshold(Number((e.target as HTMLInputElement).value));
  }

  function handlePruningIntensity(e: Event) {
    onPruningIntensity(Number((e.target as HTMLInputElement).value));
  }

  function onPruningIntensity(value: number) {
    pruningIntensity = value;
    globalThis.localStorage?.setItem(PRUNING_INTENSITY_STORAGE_KEY, String(value));
    if (renderer) renderer.setPruningIntensity(value);
  }

  // Handle initial query from URL
  if (appState.query) {
    (async () => {
      await onSearch({ detail: appState.query });
    })();
  }

  onDestroy(() => {
    renderer?.kill();

    if (sigmaContainer && eventListenersAttached) {
      sigmaContainer.removeEventListener('navigate', handleNavigate as EventListener);
      sigmaContainer.removeEventListener('expand', handleExpand as EventListener);
    }

    globalThis.removeEventListener('keydown', handleKeydown);
  });

  type AppState = typeof appState;
  watchState((target: AppState, prop: keyof AppState, val: any) => {
    // Watch for graph changes
    if (prop === 'graph' && val !== renderer?.['adapter']) {
      // Graph changed, reinitialize
    }
  });
</script>

<div id="app">
  <WikiSearch on:search={onSearch} />

  <!-- Graph controls -->
  <div class="graph-controls">
    <input
      type="search"
      aria-label="Filter graph nodes"
      placeholder="filter nodes..."
      value={searchQuery}
      on:input={handleFilterInput}
    />

    <div class="sliders">
      <input
        type="range"
        min="0"
        max="100"
        value={labelThreshold}
        on:input={handleLabelThreshold}
        title="Label threshold"
      />
      <input
        type="range"
        min="0"
        max="10"
        value={sizeThreshold}
        on:input={handleSizeThreshold}
        title="Size threshold"
      />
      <input
        type="range"
        min="0"
        max="100"
        value={pruningIntensity}
        on:input={handlePruningIntensity}
        title="Pruning intensity"
      />
    </div>

    <div class="layout-buttons">
      <button class:active={fa2Running} on:click={toggleFA2}>
        {fa2Running ? 'Force Atlas ◼' : 'Force Atlas ▶'}
      </button>
      <button disabled={!circlePackAvailable} on:click={applyCirclePack}>
        CirclePack
      </button>
      <button class:active={statsVisible} on:click={toggleStats}>
        Stats
      </button>
      <button class:active={edgeTableVisible} on:click={toggleEdgeTable}>
        Edges
      </button>
    </div>

    <label class="summary-toggle">
      <input type="checkbox" bind:checked={fetchSummaries} />
      Fetch Wikipedia summaries
    </label>
  </div>

  <!-- Sigma.js container -->
  <div class="sigma-container" bind:this={sigmaContainer}></div>

  <!-- Book upload -->
  <BookUpload on:book-graph={onBookGraph} />

  <!-- Links -->
  <div class="about-links">
    <button class="about-link" on:click={() => (aboutVisible = true)}>about</button>
    <a
      href="https://github.com/souzadevinicius/wiki-graph"
      target="_blank"
      rel="noopener noreferrer"
    >code</a>
  </div>

  {#if aboutVisible}
    <About on:hide={() => (aboutVisible = false)} />
  {/if}

  <!-- Stats panel -->
  {#if statsVisible && appState.graph}
    <div class="stats-panel-container">
      <GraphStats
        graph={appState.graph.getGraphology()}
        graphVersion={appState.graphVersion}
        searchQuery={searchQuery}
        sizeThreshold={sizeThreshold}
        pruningIntensity={pruningIntensity}
        chapters={appState.chapters}
      />
    </div>
  {/if}

  <!-- Edge table -->
  {#if edgeTableVisible && appState.graph}
    <div class="edge-table-container">
      <EdgeTable
        graph={appState.graph}
        on:edge-select={handleEdgeTableSelect}
      />
    </div>
  {/if}

  <!-- Edge detail panel -->
  {#if selectedEdge}
    <EdgePanel edgeData={selectedEdge} on:close={closeEdgePanel} />
  {/if}
</div>

<style lang="postcss">
  @import './assets/style.css';

  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #fafafa;
    color: #333;
  }

  #app {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .graph-controls {
    position: absolute;
    top: 4em;
    left: 1em;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    pointer-events: none;
  }

  .graph-controls > * {
    pointer-events: auto;
  }

  .graph-controls input[type="search"] {
    padding: 8px 12px;
    border: 1px solid #dbeafe;
    border-radius: 6px;
    font-size: 0.9rem;
    background: #f5f7fa;
    outline: none;
    width: 200px;
  }

  .graph-controls input[type="search"]:focus {
    border-color: #4f8cff;
    box-shadow: 0 2px 8px rgba(79, 140, 255, 0.15);
  }

  .sliders {
    display: flex;
    gap: 0.5em;
  }

  .sliders input[type="range"] {
    width: 100px;
  }

  .layout-buttons {
    display: flex;
    gap: 0.5em;
  }

  .layout-buttons button {
    background: #f5f7fa;
    border: 1px solid #dbeafe;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .layout-buttons button:hover {
    background: #e0e7ff;
  }

  .layout-buttons button.active {
    background: #4f8cff;
    color: white;
  }

  .layout-buttons button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .summary-toggle {
    display: flex;
    align-items: center;
    gap: 0.4em;
    font-size: 0.8rem;
    color: #666;
    cursor: pointer;
    user-select: none;
  }

  .summary-toggle input[type="checkbox"] {
    cursor: pointer;
  }

  .sigma-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .about-links {
    position: absolute;
    top: 1em;
    right: 1em;
    z-index: 100;
    font-size: 0.9rem;
    opacity: 0.6;
    display: flex;
    gap: 1em;
  }

  .about-links a,
  .about-links .about-link {
    color: inherit;
    text-decoration: none;
    background: none;
    border: none;
    font: inherit;
    cursor: pointer;
    padding: 0;
  }

  .about-links a:hover,
  .about-links .about-link:hover {
    color: #4a9eff;
  }

  .stats-panel-container {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 200;
    height: 40vh;
    min-height: 200px;
    max-height: 60vh;
    background: #ffffff;
    border-top: 1px solid hsl(220, 10%, 88%);
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
    display: flex;
    flex-direction: column;
  }

  .edge-table-container {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 200;
    height: 40vh;
    min-height: 200px;
    max-height: 60vh;
    background: #ffffff;
    border-top: 1px solid hsl(220, 10%, 88%);
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
