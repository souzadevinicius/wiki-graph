<script lang="ts">
  import WikiSearch from "./lib/WikiSearch.svelte";
  import BookUpload from "./lib/BookUpload.svelte";
  import LayoutControls from "./lib/LayoutControls.svelte";
  import { onMount } from 'svelte';
  import { bus, createRenderer } from "./core-anvaka-vs";
  import { appState, performSearch } from "./lib/state";
  import { apiClient, isMobile } from "./lib/apiClient";
  import { queryStore } from './lib/store';

  // Expansion color palette — one color per expansion bloom
  const EXPANSION_COLORS = [
    'hsl(210, 70%, 50%)',  // blue
    'hsl(160, 60%, 40%)',  // teal
    'hsl(280, 60%, 55%)',  // purple
    'hsl(30, 80%, 50%)',   // orange
    'hsl(340, 65%, 50%)',  // pink
    'hsl(120, 55%, 40%)',  // green
  ];

  import About from "./lib/About.svelte";

  import { Confetti } from "svelte-confetti";
  let showConfetti = false
  let showConfettiContainer = false

  let aboutVisible = false;

  // console.log('[App] appState:', appState)

  // ------------------------------------------ language
  /**
   * can't do this in useState
   * (core-anvaka-vs module doesn't know about apiClient.setLang method)
   *
   * so setting a language here.
   *
   * Use case:
   *  1. first load
   *  2. collect appState from url
   *  3. perform search if query isn't empty (to this moment `lang` should be properly set)
   */

  const DEFAULT_LANG = "en";
 apiClient.setLang(appState.lang || DEFAULT_LANG);
  // ---------------------------------------------------

  // ------------------------------------------ layout config
  const LAYOUT_STORAGE_KEY = "wiki-graph-layout-config";
  const DEFAULT_LAYOUT = { springLength: 100, gravity: -3 };

  function loadLayoutConfig() {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          springLength: typeof parsed.springLength === 'number' ? parsed.springLength : DEFAULT_LAYOUT.springLength,
          gravity: typeof parsed.gravity === 'number' ? parsed.gravity : DEFAULT_LAYOUT.gravity
        };
      }
    } catch(e) {
      console.warn('Failed to load layout config', e);
    }
    return DEFAULT_LAYOUT;
  }

  function saveLayoutConfig(config) {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(config));
    } catch(e) {
      console.warn('Failed to save layout config', e);
    }
  }

  let layoutConfig = loadLayoutConfig();
  let layoutControlsVisible = false;
  let isReLayouting = false;

  /**
   * this funciton garantees that hidden
   * nodes don't flash on first render
   **/
  function getText(node) {
    return node.id
  }

  const renderer = createRenderer(appState.progress, isMobile, getText, null, layoutConfig);

  function onSettingsChange(config) {
    layoutConfig = config;
    saveLayoutConfig(config);
    renderer.setLayout(config);
  }

  function onReLayout() {
    isReLayouting = true;
    renderer.reLayout(layoutConfig);
    setTimeout(() => { isReLayouting = false; }, 3000);
  }

  if (appState.query) {
    performSearchWrap(appState.query).then((res) => {
      if (appState.graph) {
        renderer.render(appState.graph);
      }
    });
  }

  let iframe;
  let iframeUrl = '';

  // Expansion state
  let expansionIndex = 0;

  async function expandNode(node) {
    const wikiTitle = node.data.wikipedia_title || node.id;
    if (!wikiTitle) return;

    try {
      const backlinks = await apiClient.getResponse(wikiTitle);
      if (backlinks.length === 0) return;

      const color = EXPANSION_COLORS[expansionIndex % EXPANSION_COLORS.length];
      expansionIndex += 1;

      const anchorDepth = node.data.depth ?? 0;

      // Fetch summaries for rich tooltip data
      const summaries = await Promise.all(
        backlinks.map(async (bl) => {
          const summary = await apiClient.getSummary(bl.title);
          return apiClient.getItem(summary);
        })
      );

      const newNodes = summaries.filter(Boolean);
      if (newNodes.length === 0) return;

      // Ensure maxDepth accommodates the new depth
      const newDepth = anchorDepth + 1;
      if (newDepth > (appState.graph.maxDepth || 0)) {
        appState.graph.maxDepth = newDepth;
      }

      let added = 0;
      newNodes.forEach((other) => {
        if (appState.graph.hasNode(other.id)) return;

        appState.graph.addNode(other.id, {
          depth: newDepth,
          expansionColor: color,
          ...other.data,
        });
        appState.graph.addLink(node.id, other.id);
        added += 1;
      });

      if (added > 0) {
        appState.progress.reset();
        appState.progress.startLayout();
        renderer.reLayout(layoutConfig);
      }
    } catch (err) {
      console.error('[expandNode] failed:', err);
    }
  }

  function setupIframeListener(iframeEl, callback) {
    const messageHandler = (event) => {
      if (!event.origin.includes("wikipedia.org")) return;
      callback(event?.data?.subFrameData?.url);
    };
    window.addEventListener('message', messageHandler);
    return () => {
      window.removeEventListener('message', messageHandler);
    };
  }

  onMount(() => {
    if (iframe) {
      iframe.onload = () => {
        const iframeChange = setupIframeListener(iframe, (newUrl) => {
          iframeUrl = newUrl;
          const lastpath = decodeURIComponent(iframeUrl.split('/').filter(Boolean).pop() || '/');
          queryStore.set(lastpath);
        });
        return iframeChange;
      };
    }
  });


  // ------------------------------------------ tooltip
  let isTooltipHidden = true;
  let tooltipHTML = "";
  let tooltipEl;
  let hidingTimer: NodeJS.Timeout;
  let showingTimer: NodeJS.Timeout;

  const ttWidth = 400;
  const ttHeight = 500;

  function scheduleHide() {
    // console.log("🚀 sheduleHide")

    return setTimeout(() => {
      // console.log("🚀🚀 hide")

      isTooltipHidden = true;
    }, 100);
  }

  function scheduleShow() {
    // console.log("🚀 sheduleShow")

    return setTimeout(() => {
      // console.log("🚀🚀 show")

      isTooltipHidden = false;
      clearTimeout(showingTimer);
      showingTimer = null;
    }, 200);
  }

  function onEnterTooltip() {
    // console.log("🚀 ~ onEnterTooltip")
    clearTimeout(hidingTimer);
  }

  function onLeaveTooltip() {
    // console.log("🚀 ~ onLeaveTooltip")
    hidingTimer = scheduleHide();
  }

  function showTooltipNode(e) {
    console.log("🚀 ~ showTooltipNode ~ e", e)
    // console.log("🚀 ~ showTooltipNode ~ e", visualViewport)

    clearTimeout(hidingTimer);

    if (!e.node) {
      hidingTimer = scheduleHide();
      clearTimeout(showingTimer);
      showingTimer = null;
      return;
    }

    if (showingTimer) {
      return;
    }

    // ------------------------ direction
    const center = {
      x: visualViewport.width / 2,
      y: visualViewport.height / 2,
    };

    const sign = {
      x: center.x - e.x,
      y: center.y - e.y,
    };

    const isUp = sign.y < 0;
    // ----------------------------------

    // TODO: should sanitize?
    // https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API
    const data = e.node.data;

    // Book entity: has wikipedia_title and type
    if (data.wikipedia_title !== undefined) {
      const typeLabel = data.type ? `<span class="entity-type">${data.type}</span>` : "";
      let html = "";
      if (data.wikipedia_title) {
        html += `<div class="wiki-title"><a href="${data.page_url}" target="_blank">${data.wikipedia_title}</a></div>`;
      }
      html += typeLabel;
      if (data.mentions && data.mentions.length > 1) {
        html += `<div class="mentions">Also: ${data.mentions.join(", ")}</div>`;
      }
      tooltipHTML = `<div class="text">${html}</div>`;
    } else {
      // Wikipedia node: has thumbnail and extract_html
      const { thumbnail, extract_html, page_url } = data;
      tooltipHTML = thumbnail ? `<img src="${thumbnail.source}" />` : "";
      const fallbackText = `Can't find a preview. See <a href="${page_url}">the original article</a>`;
      tooltipHTML += `<div class="text">${extract_html || fallbackText}</div>`;
    }

    // reuse current tooltip
    // if (!isTooltipHidden) {
    //   return
    // }

    showingTimer = scheduleShow();

    let left: number;
    requestAnimationFrame(() => {
      // shift a bit left
      left = e.x - ttWidth / 3;

      // keep within viewport
      left = Math.max(10, left);
      left = Math.min(visualViewport.width - ttWidth - 10, left);

      if (tooltipEl){
        tooltipEl.style.left = left + "px";

        if (isUp) {
          tooltipEl.style.top = "unset";
          tooltipEl.style.bottom = visualViewport.height - e.y + 20 + "px";
        } else {
          tooltipEl.style.top = e.y + 20 + "px";
          tooltipEl.style.bottom = "unset";
        }
      }

      // ---------------- test: static corner
      // tooltipEl.style.bottom = 0
      // tooltipEl.style.top = 'unset'
      // tooltipEl.style.right = 0
      // tooltipEl.style.left = 'unset'
      // ---------------------------------------
    });
  }

  bus.on("show-tooltip-node", showTooltipNode, {});

  // --------------------------------------- node click
  function onNodeClick(e) {
    // Open Wikipedia article for both book entities and wiki nodes
    const wikiTitle = e.node.data.wikipedia_title || e.node.id;
    const wikiUrl = e.node.data.page_url || `https://${appState.lang || 'en'}.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`;
    window.open(wikiUrl, '_blank');
  }

  function onNodeDoubleClick(e) {
    appState.query = e.node.id;
    queryStore.set(appState.query);
    onSearch({ detail: e.node.id });
  }

  function onNodeClickRight(e) {
    expandNode(e.node);
  }

  bus.on("show-details-node", onNodeClick, {});
  bus.on("node-double-click", onNodeDoubleClick, {});
  bus.on("node-click-right", onNodeClickRight, {});

  // --------------------------------------- functions
  async function onSearch(e: CustomEvent) {
    const q = e.detail;
    await performSearchWrap(q);
    renderer.render(appState.graph);
  }

  async function performSearchWrap(query) {
    const summary = await apiClient.getSummary(query);
    const entryItem = apiClient.getItem(summary);
    iframe.src = entryItem?.data?.page_url;
    performSearch(entryItem);
  }

  // --------------------------------------- book graph
  function onBookGraph(e: CustomEvent) {
    const graph = e.detail;
    appState.hasGraph = true;
    appState.progress.reset();
    appState.graph = graph;
    renderer.render(graph);
    bus.fire("graph-ready", graph);
  }

</script>

<!-- <main class="app-container"> -->
<WikiSearch on:search={onSearch} />
<BookUpload on:book-graph={onBookGraph} />
<LayoutControls
  bind:visible={layoutControlsVisible}
  bind:springLength={layoutConfig.springLength}
  bind:gravity={layoutConfig.gravity}
  {isReLayouting}
  on:reLayout={onReLayout}
  on:settingsChange={(e) => onSettingsChange(e.detail)}
/>


<div class="iframe-container">
  <iframe 
  bind:this={iframe}
  title="Embedded Content"
  width="100%"
></iframe>
</div>


{#if showConfettiContainer}
<div 

  style="
  opacity: {showConfetti ? 1 : 0};
  transition: opacity 1.2s linear;
  position: fixed;
  bottom: -40px;
  left: 0;
  height: 100vh;
  width: 100vw;
  display: flex;
  justify-content: center;
  overflow: visible;
  pointer-events: none;">
  <!-- <Confetti x={[-5, 5]} y={[0, 0.2]} delay={[0, 2000]} duration=5500 infinite amount=300 fallDistance="100vh" /> -->
  <!-- <Confetti class="left" x={[1.2, 5.5]} y={[1.25, 2.75]} delay={[0, 2500]} xSpread=0.2 amount=400 /> -->
  <!-- <Confetti class="right" x={[-1.2, -5.5]} y={[1.25, 2.75]} delay={[0, 2500]} xSpread=0.2 amount=400 /> -->
  <Confetti
    class="left"
    x={[-2.3, 2.3]} y={[1, 3.3]}
    infinite
    delay={[0, 1200]} xSpread=0.1 amount=300
    destroyOnComplete={false}
    />
    <!-- bind:infinite={showConfetti} -->
    <!-- iterationCount -->

</div>

{/if}

<div class="layout-container about-links muted">
  <a href="#" on:click={() => (aboutVisible = true)}>about</a>
  <a
    href="https://github.com/souzadevinicius/wiki-graph"
    target="_blank"
    rel="noopener noreferrer">code</a
  >
</div>

<div
  id="tooltip"
  bind:this={tooltipEl}
  hidden={isTooltipHidden}
  on:mouseenter={onEnterTooltip}
  on:mouseleave={onLeaveTooltip}
>
  {@html tooltipHTML}
</div>
<!-- </main> -->

{#if aboutVisible}
  <About on:hide={() => (aboutVisible = false)} />
{/if}

<style lang="postcss">
  /* order matters */
  @import "./assets/style.css";
  @import "normalize.css";

  /* :global(.confetti-holder) {
    position: absolute;
    bottom: 0;
  } */
  :global(.confetti) {
    position: fixed;
    bottom: 0px;
    /* left: 0; */
  }
</style>
