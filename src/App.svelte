<script lang="ts">
  import WikiSearch from "./lib/WikiSearch.svelte";
  import { onMount } from 'svelte';
  import { bus, createRenderer } from "./core-anvaka-vs";
  import { appState, performSearch } from "./lib/state";
  import { apiClient, isMobile } from "./lib/apiClient";
  import { queryStore } from './lib/store';
  
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

  
  

  let iframe;
  let iframeUrl = '';


  function setupIframeListener(iframe, callback) {

    const messageHandler = (event) => {
      // Verify the sender's origin for security
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
  
  /**
   * this funciton garantees that hidden
   * nodes don't flash on first render
   **/
  function getText(node) {
    console.log("🚀 | getText | node", node)
    return node.id
  }


  const renderer = createRenderer(appState.progress, isMobile, getText);

  if (appState.query) {
    performSearchWrap(appState.query).then((res) => {
      if (appState.graph) {
        renderer.render(appState.graph);
      }
    });
  }


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
    const { thumbnail, extract_html, page_url } = e.node.data;
    tooltipHTML = thumbnail ? `<img src="${thumbnail.source}" />` : "";

    const fallbackText = `Can't find a preview. See <a href="${page_url}">the original article</a>`;
    tooltipHTML += `<div class="text">${extract_html || fallbackText}</div>`;

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
    console.log("🚀 ~ onNodeClick ~ e", e)
    // window.open(e.node.data.page_url);
    appState.query = e.node.id;
    queryStore.set(appState.query);
  }

    // window.open(e.node.data.page_url, '_blank')

  bus.on("show-details-node", onNodeClick, {});

  function onNodeClickRight(e) {
    // console.log("🚀 ~ onNodeClickRight ~ e", e)

    appState.query = e.node.id;
    onSearch({ detail: e.node.id });
  }

  bus.on("node-click-right", onNodeClickRight, {});

  // --------------------------------------- functions
  async function onSearch(e: CustomEvent) {
    const q = e.detail;
    // console.log('[onSearch] query:', q);

    await performSearchWrap(q);
    renderer.render(appState.graph);
  }

  async function performSearchWrap(query) {
    const summary = await apiClient.getSummary(query);
    // console.log('[summary]', summary);

    const entryItem = apiClient.getItem(summary);
    // iframe.src = 'https://ge.globo.com';
    iframe.src = entryItem?.data?.page_url;
    performSearch(entryItem);
  }

</script>

<!-- <main class="app-container"> -->
<WikiSearch on:search={onSearch} />


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
