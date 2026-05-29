<script lang="ts">
  import { onDestroy, createEventDispatcher } from "svelte";
  import { explainCommunity, communityExplanationKey } from "./serverApi";
  import type { CommunitySummary } from "./communityDetection";

  const dispatch = createEventDispatcher();

  export let community: CommunitySummary | null = null;

  let label = "";
  let explanation = "";
  let loading = false;
  let error: string | null = null;

  function handleClose() {
    dispatch("close");
  }

  async function loadExplanation() {
    if (!community) return;
    loading = true;
    error = null;

    // Build payload: top-N nodes by degree, context sentences from top-5 edges
    const nodeNames = community.nodeIds.slice(0, 30);
    const totalNodes = community.nodeCount;

    // Get context sentences from top-5 edges within the community
    const communityNodeSet = new Set(community.nodeIds);
    const graph = communityNodeSet; // we need access to graph edges — passed via community
    // The nodeIds come from communityDetection which only has node IDs.
    // Context sentences are extracted in App.svelte from the full graph.
    // Here we receive pre-built contextSentences from the parent.
    // For now, load with whatever contextSentences the parent provides.

    // Check localStorage cache
    const key = await communityExplanationKey(community.nodeIds);
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      label = parsed.label;
      explanation = parsed.explanation;
      loading = false;
      return;
    }

    try {
      // Get context sentences from parent-provided data
      const contextSentences = (community as any)._contextSentences || [];
      const result = await explainCommunity(
        nodeNames,
        totalNodes,
        contextSentences,
      );

      if (result.error) {
        error = result.error;
        label = "";
        explanation = "";
      } else {
        label = result.label;
        explanation = result.explanation;
        // Cache in localStorage
        localStorage.setItem(key, JSON.stringify({ label, explanation }));
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to generate explanation";
    } finally {
      loading = false;
    }
  }

  // Load explanation when community changes
  $: if (community) {
    label = "";
    explanation = "";
    error = null;
    loadExplanation();
  }
</script>

{#if community}
  <div class="community-panel" role="dialog" aria-label="Community details">
    <div class="panel-header">
      <span class="community-label">
        Community {community.id}
      </span>
      <button class="close-btn" on:click={handleClose} aria-label="Close">✕</button>
    </div>

    <div class="panel-stats">
      <span class="stat">{community.nodeCount} nodes</span>
    </div>

    {#if label && explanation}
      <div class="panel-section">
        <h4>Explanation</h4>
        <div class="community-label-badge">{label}</div>
        <p class="explanation-text">{explanation}</p>
      </div>
    {:else if loading}
      <div class="loading">
        <div class="spinner"></div>
        <span>Generating...</span>
      </div>
    {:else if error}
      <p class="error-text">{error}</p>
      <button class="retry-btn" on:click={loadExplanation}>Retry</button>
    {/if}
  </div>
{/if}

<style>
  .community-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 200;
    background: #ffffff;
    border: 1px solid #dbeafe;
    border-radius: 10px;
    padding: 20px 24px;
    min-width: 360px;
    max-width: 520px;
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

  .community-label {
    font-size: 15px;
    color: #1a1a1a;
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

  .community-label-badge {
    display: inline-block;
    padding: 4px 10px;
    background: #eff6ff;
    border-radius: 4px;
    font-weight: 600;
    font-size: 14px;
    color: #1a1a1a;
    margin-bottom: 8px;
  }

  .explanation-text {
    margin: 0;
    padding: 10px 14px;
    background: #f8fafc;
    border-radius: 6px;
    font-size: 14px;
    line-height: 1.5;
    color: #1a1a1a;
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
</style>
