<script lang="ts">
  import { onMount } from 'svelte';
  import { appState, performSearch, watchState } from './lib/state';
  import { apiClient, isMobile } from './lib/apiClient';
  import { queryStore } from './lib/store';
  import { SigmaRenderer } from './lib/sigmaRenderer';
  import { detectCommunities, hasCommunityData } from './lib/communityDetection';
  import { runForceAtlas2 } from './lib/layouts/forceAtlas2';
import { runCirclePack } from './lib/layouts/circlePack';
  import BookUpload from './lib/BookUpload.svelte';
  import About from './lib/About.svelte';
  import WikiSearch from './lib/WikiSearch.svelte';

  let sigmaContainer: HTMLDivElement;
  let renderer: SigmaRenderer | null = null;
  let aboutVisible = false;

  // Layout state
  let fa2Running = false;
  let circlePackAvailable = false;
  let currentLayout = 'fa2';

  // Search filter state
  let searchQuery = '';
  let labelThreshold = 30;
  let sizeThreshold = 0;

  // Initialize
  const DEFAULT_LANG = 'en';
  apiClient.setLang(appState.lang || DEFAULT_LANG);

  function initRenderer() {
    if (!sigmaContainer || !appState.graph) return;

    renderer = new SigmaRenderer(appState.graph, {
      container: sigmaContainer,
      labelThreshold,
      sizeThreshold,
    });

    renderer.render();
    setupEventListeners();
  }

  function setupEventListeners() {
    if (!sigmaContainer) return;

    // Navigate (double-click)
    sigmaContainer.addEventListener('navigate', (e: CustomEvent) => {
      const nodeId = e.detail;
      appState.query = nodeId;
      queryStore.set(appState.query);
      onSearch({ detail: nodeId });
    });

    // Expand (right-click)
    sigmaContainer.addEventListener('expand', async (e: CustomEvent) => {
      const nodeId = e.detail;
      if (!appState.graph) return;

      const node = appState.graph.getNode(nodeId);
      const wikiTitle = node.data.wikipedia_title || nodeId;
      if (!wikiTitle) return;

      try {
        const backlinks = await apiClient.getResponse(wikiTitle);
        if (backlinks.length === 0) return;

        const summaries = await Promise.all(
          backlinks.map(async (bl) => {
            const summary = await apiClient.getSummary(bl.title);
            return apiClient.getItem(summary);
          })
        );

        const newNodes = summaries.filter(Boolean);
        const anchorDepth = node.data.depth ?? 0;
        const newDepth = anchorDepth + 1;

        if (newDepth > (appState.graph.maxDepth || 0)) {
          appState.graph.maxDepth = newDepth;
        }

        let added = 0;
        newNodes.forEach((other) => {
          if (other && !appState.graph.hasNode(other.id)) {
            appState.graph.addNode(other.id, {
              depth: newDepth,
              ...other.data,
            });
            appState.graph.addLink(nodeId, other.id);
            added += 1;
          }
        });

        if (added > 0) {
          // Re-run community detection
          detectCommunities(appState.graph.getGraphology());
          // Re-run layout
          runForceAtlas2(appState.graph.getGraphology());
          // Update renderer
          if (renderer) renderer.updateGraph();
          circlePackAvailable = hasCommunityData(appState.graph.getGraphology());
        }
      } catch (err) {
        console.error('[expandNode] failed:', err);
      }
    });
  }

  async function onSearch(e: CustomEvent | { detail: string }) {
    const q = typeof e.detail === 'string' ? e.detail : e.detail;
    const summary = await apiClient.getSummary(q);
    const entryItem = apiClient.getItem(summary);

    if (entryItem) {
      const graph = await performSearch(entryItem);

      // Run community detection
      detectCommunities(graph.getGraphology());

      // Run layout
      runForceAtlas2(graph.getGraphology());

      // Init renderer
      initRenderer();

      // Check if CirclePack is available
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
    currentLayout = 'circlepack';
  }

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
    if (renderer) renderer.setLabelThreshold(value);
  }

  function onSizeThreshold(value: number) {
    sizeThreshold = value;
    if (renderer) renderer.setSizeThreshold(value);
  }

  // Handle initial query from URL
  if (appState.query) {
    (async () => {
      const summary = await apiClient.getSummary(appState.query);
      const entryItem = apiClient.getItem(summary);
      if (entryItem) {
        await onSearch({ detail: appState.query });
      }
    })();
  }

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
      placeholder="search in titles..."
      value={searchQuery}
      on:input={(e) => onFilterInput(e.target.value)}
    />

    <div class="sliders">
      <input
        type="range"
        min="0"
        max="100"
        value={labelThreshold}
        on:input={(e) => onLabelThreshold(Number(e.target.value))}
        title="Label threshold"
      />
      <input
        type="range"
        min="0"
        max="10"
        value={sizeThreshold}
        on:input={(e) => onSizeThreshold(Number(e.target.value))}
        title="Size threshold"
      />
    </div>

    <div class="layout-buttons">
      <button class:active={fa2Running} on:click={toggleFA2}>
        {fa2Running ? 'Force Atlas ◼' : 'Force Atlas ▶'}
      </button>
      <button disabled={!circlePackAvailable} on:click={applyCirclePack}>
        CirclePack
      </button>
    </div>
  </div>

  <!-- Sigma.js container -->
  <div class="sigma-container" bind:this={sigmaContainer}></div>

  <!-- Book upload -->
  <BookUpload on:book-graph={onBookGraph} />

  <!-- Links -->
  <div class="about-links">
    <a href="#" on:click={() => (aboutVisible = true)}>about</a>
    <a
      href="https://github.com/souzadevinicius/wiki-graph"
      target="_blank"
      rel="noopener noreferrer"
    >code</a>
  </div>

  {#if aboutVisible}
    <About on:hide={() => (aboutVisible = false)} />
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
    top: 1em;
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

  .about-links a {
    color: inherit;
    text-decoration: none;
  }

  .about-links a:hover {
    color: #4a9eff;
  }
</style>
