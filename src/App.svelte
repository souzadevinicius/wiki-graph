<script lang="ts">
  import WikiSearch from "./lib/WikiSearch.svelte";
  import { onMount } from 'svelte';
  import { bus, createRenderer } from "./core-anvaka-vs";
  import { appState, performSearch } from "./lib/state";
  import { apiClient, isMobile } from "./lib/apiClient";
  import { queryStore } from './lib/store';

  import About from "./lib/About.svelte";

  import { Confetti } from "svelte-confetti";

  let renderer: any = null;
  let showConfetti = false;
  let showConfettiContainer = false;
  let aboutVisible = false;

  const DEFAULT_LANG = "en";
  apiClient.setLang(appState.lang || DEFAULT_LANG);

  let iframe: HTMLIFrameElement | null = null;
  let iframeUrl = '';

  function setupIframeListener(frame: HTMLIFrameElement, callback: (url: string) => void) {
    const messageHandler = (event: MessageEvent) => {
      if (!event.origin.includes("wikipedia.org")) return;
      callback(event?.data?.subFrameData?.url);
    };
    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }

  // this function guarantees that hidden nodes don't flash on first render
  function getText(node: any) {
    return node.id;
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

    // create renderer after DOM is mounted so SVG exists
    renderer = createRenderer(appState.progress, isMobile, getText);

    if (appState.query) {
      performSearchWrap(appState.query).then(() => {
        if (appState.graph && renderer) {
          renderer.render(appState.graph);
        }
      });
    }
  });

  // ------------------------------------------ tooltip
  let isTooltipHidden = true;
  let tooltipHTML = "";
  let tooltipEl: HTMLElement | null = null;
  let hidingTimer: ReturnType<typeof setTimeout> | null = null;
  let showingTimer: ReturnType<typeof setTimeout> | null = null;

  const ttWidth = 400;
  const ttHeight = 500;

  function scheduleHide() {
    return setTimeout(() => {
      isTooltipHidden = true;
    }, 100);
  }

  function scheduleShow() {
    return setTimeout(() => {
      isTooltipHidden = false;
      if (showingTimer) {
        clearTimeout(showingTimer);
        showingTimer = null;
      }
    }, 200);
  }

  function onEnterTooltip() {
    if (hidingTimer) clearTimeout(hidingTimer);
  }

  function onLeaveTooltip() {
    hidingTimer = scheduleHide();
  }

  function showTooltipNode(e: any) {
    clearTimeout(hidingTimer as any);

    if (!e.node) {
      hidingTimer = scheduleHide();
      if (showingTimer) { clearTimeout(showingTimer); showingTimer = null; }
      return;
    }

    if (showingTimer) return;

    const center = { x: visualViewport.width / 2, y: visualViewport.height / 2 };
    const sign = { x: center.x - e.x, y: center.y - e.y };
    const isUp = sign.y < 0;

    const { thumbnail, extract_html, page_url } = e.node.data;
    // thumbnail can be either a string URL or an object { source }
    let thumbSrc = null;
    if (thumbnail) {
      if (typeof thumbnail === 'string') thumbSrc = thumbnail;
      else if (thumbnail.source) thumbSrc = thumbnail.source;
    }
    tooltipHTML = thumbSrc ? `<img src="${thumbSrc}" />` : "";
    const fallbackText = `Can't find a preview. See <a href="${page_url}">the original article</a>`;
    tooltipHTML += `<div class="text">${extract_html || fallbackText}</div>`;

    showingTimer = scheduleShow();

    requestAnimationFrame(() => {
      let left = e.x - ttWidth / 3;
      left = Math.max(10, left);
      left = Math.min(visualViewport.width - ttWidth - 10, left);

      if (tooltipEl) {
        tooltipEl.style.left = left + "px";
        if (isUp) {
          tooltipEl.style.top = "unset";
          tooltipEl.style.bottom = visualViewport.height - e.y + 20 + "px";
        } else {
          tooltipEl.style.top = e.y + 20 + "px";
          tooltipEl.style.bottom = "unset";
        }
      }
    });
  }

  bus.on("show-tooltip-node", showTooltipNode, {});

  // --------------------------------------- node click
  function onNodeClick(e: any) {
    appState.query = e.node.id;
    queryStore.set(appState.query);
  }

  bus.on("show-details-node", onNodeClick, {});

  function onNodeClickRight(e: any) {
    appState.query = e.node.id;
    // directly perform search for right-click
    performSearchWrap(e.node.id);
  }

  bus.on("node-click-right", onNodeClickRight, {});

  // --------------------------------------- functions
  async function onSearch(e: CustomEvent<string>) {
    const q = e.detail;
    await performSearchWrap(q);
    if (renderer) renderer.render(appState.graph);
  }

  // Emit filter events whenever the query store changes (live filtering)
  $: if ($queryStore !== undefined) {
    bus.fire('filter', $queryStore);
  }

  async function performSearchWrap(query: string) {
    const summary = await apiClient.getSummary(query);
    const entryItem = apiClient.getItem(summary);
    if (iframe) iframe.src = entryItem?.data?.page_url || '';
    performSearch(entryItem);
  }
</script>

<!-- <main class="app-container"> -->
<WikiSearch on:search={onSearch} />


<div class="parent-container">
  <div id="graphtest-wrapper">
    <svg id="graphtest">
      <g id="scene">
        <g id="edges"></g>
        <g id="nodes"></g>
      </g>
    </svg>
  </div>

  <div class="iframe-container">
    <iframe
      bind:this={iframe}
      title="Embedded Content"
      width="100%"
    ></iframe>
  </div>
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
  <button class="link-like" on:click={() => (aboutVisible = true)}>about</button>
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

  /* dimming for filtered nodes and links */
  :global(.dimmed) {
    opacity: 0.12;
    transition: opacity 180ms ease;
  }

  :global(.matched) {
    opacity: 1;
    transition: opacity 180ms ease;
  }
</style>
