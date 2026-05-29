<script lang="ts">
  import { onDestroy, createEventDispatcher } from "svelte";
  import { explainEdge, edgeExplanationKey } from "./serverApi";

  const dispatch = createEventDispatcher();

  export let edgeData: {
    source: string;
    target: string;
    pmi: number;
    weight: number;
    contextSentences: string[];
  } | null = null;

  let explanation = "";
  let loading = false;
  let error: string | null = null;

  function handleClose() {
    dispatch("close");
  }

  async function loadExplanation() {
    if (!edgeData) return;
    loading = true;
    error = null;

    // Check localStorage cache
    const key = edgeExplanationKey(edgeData.source, edgeData.target);
    const cached = localStorage.getItem(key);
    if (cached) {
      explanation = cached;
      loading = false;
      return;
    }

    try {
      const result = await explainEdge(
        edgeData.source,
        edgeData.target,
        edgeData.contextSentences,
      );

      if (result.error) {
        error = result.error;
        explanation = "";
      } else {
        explanation = result.explanation;
        // Cache in localStorage
        localStorage.setItem(key, explanation);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to generate explanation";
    } finally {
      loading = false;
    }
  }

  // Load explanation when edge changes
  $: if (edgeData) {
    explanation = "";
    error = null;
    loadExplanation();
  }
</script>

{#if edgeData}
  <div class="edge-panel" role="dialog" aria-label="Edge details">
    <div class="panel-header">
      <span class="edge-labels">
        <strong>{edgeData.source}</strong> <span class="arrow">—</span> <strong>{edgeData.target}</strong>
      </span>
      <button class="close-btn" on:click={handleClose} aria-label="Close">✕</button>
    </div>

    <div class="panel-stats">
      <span class="stat">PMI: {edgeData.pmi.toFixed(2)}</span>
      <span class="stat">Weight: {edgeData.weight}</span>
    </div>

    {#if edgeData.contextSentences.length > 0}
      <div class="panel-section">
        <h4>Context</h4>
        {#each edgeData.contextSentences as sentence}
          <p class="context-sentence">{sentence}</p>
        {/each}
      </div>
    {/if}

    <div class="panel-section">
      <div class="explanation-header">
        <h4>Explanation</h4>
        {#if !loading && !explanation}
          <button class="generate-btn" on:click={loadExplanation}>Generate</button>
        {/if}
      </div>

      {#if loading}
        <div class="loading">
          <div class="spinner"></div>
          <span>Generating...</span>
        </div>
      {:else if explanation}
        <p class="explanation-text">{explanation}</p>
      {:else if error}
        <p class="error-text">{error}</p>
        <button class="retry-btn" on:click={loadExplanation}>Retry</button>
      {:else}
        <p class="placeholder">Click "Generate" to get an AI explanation of why these entities are connected.</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .edge-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 200;
    background: #ffffff;
    border: 1px solid #dbeafe;
    border-radius: 10px;
    padding: 20px 24px;
    min-width: 400px;
    max-width: 560px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    font-size: 14px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .edge-labels {
    font-size: 15px;
    color: #1a1a1a;
  }

  .arrow {
    color: #999;
    margin: 0 6px;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 18px;
    color: #888;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .close-btn:hover {
    color: #333;
  }

  .panel-stats {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
    font-size: 12px;
    color: #666;
  }

  .stat {
    background: #f5f7fa;
    padding: 3px 8px;
    border-radius: 4px;
  }

  .panel-section {
    margin-bottom: 16px;
  }

  .panel-section h4 {
    margin: 0 0 8px 0;
    font-size: 12px;
    text-transform: uppercase;
    color: #888;
    letter-spacing: 0.5px;
  }

  .explanation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .explanation-header h4 {
    margin: 0;
  }

  .generate-btn {
    background: #4f8cff;
    color: white;
    border: none;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .generate-btn:hover {
    background: #3a7ae5;
  }

  .context-sentence {
    margin: 0 0 6px 0;
    padding: 8px 12px;
    background: #f8fafc;
    border-left: 3px solid #4f8cff;
    border-radius: 0 4px 4px 0;
    font-size: 13px;
    line-height: 1.5;
    color: #333;
  }

  .explanation-text {
    margin: 0;
    padding: 10px 14px;
    background: #eff6ff;
    border-radius: 6px;
    font-size: 14px;
    line-height: 1.5;
    color: #1a1a1a;
  }

  .placeholder {
    margin: 0;
    color: #999;
    font-size: 13px;
    font-style: italic;
  }

  .error-text {
    margin: 0 0 6px 0;
    color: #ff6b6b;
    font-size: 13px;
  }

  .retry-btn {
    background: none;
    border: 1px solid #ff6b6b;
    color: #ff6b6b;
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .loading {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #666;
    font-size: 13px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #dbeafe;
    border-top-color: #4f8cff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
