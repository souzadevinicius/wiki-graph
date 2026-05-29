<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type Graph from 'graphology';
  import { getCommunitySummaries, type CommunitySummary } from './communityDetection';

  export let graph: Graph;
  export let graphVersion: number;

  const dispatch = createEventDispatcher();

  let visible = false;

  // Reactive: recompute when graph changes
  $: graphVersion;
  $: communities = getCommunitySummaries(graph);

  function toggle() {
    visible = !visible;
  }

  function handleCommunityClick(community: CommunitySummary) {
    dispatch('select', { community });
  }

  function handleCommunityHover(community: CommunitySummary) {
    dispatch('preview', { community });
  }

  function handleCommunityLeave() {
    dispatch('previewClear');
  }

  function handleClear() {
    dispatch('clear');
  }
</script>

<div class="community-panel-wrapper">
  <button class="community-toggle-btn" on:click={toggle} class:active={visible} aria-label="Toggle communities panel">
    Communities
  </button>

  {#if visible && communities.length > 0}
    <div class="community-panel" role="list" aria-label="Communities">
      <div class="community-panel-header">
        <span class="title">Communities ({communities.length})</span>
        <button class="close-btn" on:click={handleClear} aria-label="Clear selection">✕</button>
      </div>
      <div class="community-list">
        {#each communities as community (community.id)}
          <button
            class="community-item"
            role="listitem"
            on:click={() => handleCommunityClick(community)}
            on:mouseenter={() => handleCommunityHover(community)}
            on:mouseleave={handleCommunityLeave}
            on:focus={() => handleCommunityHover(community)}
            on:blur={handleCommunityLeave}
            title="{community.nodeCount} nodes"
          >
            <span class="color-swatch" style="background-color: {community.color}"></span>
            <span class="node-count">{community.nodeCount}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .community-panel-wrapper {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 150;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }

  .community-toggle-btn {
    padding: 6px 14px;
    background: #ffffff;
    border: 1px solid hsl(220, 10%, 88%);
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    color: hsl(220, 5%, 50%);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: all 0.15s;
  }

  .community-toggle-btn:hover {
    background: #f5f7fa;
    color: hsl(220, 10%, 45%);
  }

  .community-toggle-btn.active {
    background: #4f8cff;
    color: #ffffff;
    border-color: #4f8cff;
  }

  .community-panel {
    background: #ffffff;
    border: 1px solid hsl(220, 10%, 88%);
    border-radius: 8px;
    padding: 12px;
    min-width: 140px;
    max-height: 60vh;
    overflow-y: auto;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  }

  .community-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid hsl(220, 10%, 94%);
  }

  .title {
    font-size: 0.75rem;
    font-weight: 600;
    color: hsl(220, 10%, 45%);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 0.9rem;
    color: hsl(220, 5%, 60%);
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
  }

  .close-btn:hover {
    color: hsl(220, 10%, 40%);
  }

  .community-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .community-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    background: none;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .community-item:hover {
    background: hsl(220, 50%, 96%);
  }

  .color-swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .node-count {
    font-size: 0.8rem;
    color: hsl(220, 10%, 45%);
  }
</style>
