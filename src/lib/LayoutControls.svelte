<script>
  import { createEventDispatcher } from 'svelte';

  export let springLength = 100;
  export let gravity = -3;
  export let isReLayouting = false;
  export let visible = false;

  const dispatch = createEventDispatcher();

  const SLIDER_MIN_SPRING = 10;
  const SLIDER_MAX_SPRING = 200;
  const SLIDER_MIN_GRAVITY = -20;
  const SLIDER_MAX_GRAVITY = 0;

  function toggle() {
    visible = !visible;
    dispatch('toggle', { visible: !visible });
  }

  function onInput() {
    dispatch('settingsChange', { springLength, gravity });
  }

  function handleReLayout() {
    dispatch('reLayout');
  }

  function resetToDefaults() {
    springLength = 100;
    gravity = -3;
    dispatch('settingsChange', { springLength, gravity });
    dispatch('reLayout');
  }
</script>

<button class="layout-gear" on:click={toggle} aria-label="Layout settings">
  {#if visible}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
  {:else}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  {/if}
</button>

{#if visible}
<div class="layout-panel" role="dialog" aria-label="Layout settings">
  <div class="panel-header">
    <span>Layout Settings</span>
  </div>

  <div class="control-row">
    <label for="spring-slider">Node Spacing: <span class="value">{Math.round(springLength)}</span></label>
    <input
      type="range"
      id="spring-slider"
      bind:value={springLength}
      min={SLIDER_MIN_SPRING}
      max={SLIDER_MAX_SPRING}
      on:input={onInput}
    />
  </div>

  <div class="control-row">
    <label for="gravity-slider">Spread: <span class="value">{gravity.toFixed(1)}</span></label>
    <input
      type="range"
      id="gravity-slider"
      bind:value={gravity}
      min={SLIDER_MIN_GRAVITY}
      max={SLIDER_MAX_GRAVITY}
      step="0.5"
      on:input={onInput}
    />
  </div>

  <div class="button-row">
    <button class="relayout-btn" on:click={handleReLayout} disabled={isReLayouting}>
      {isReLayouting ? 'Layout...' : 'Re-layout'}
    </button>
    <button class="reset-btn" on:click={resetToDefaults}>Reset</button>
  </div>
</div>
{/if}

<style>
  button.layout-gear {
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 1000;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #ccc;
    border-radius: 6px;
    width: 36px;
    height: 36px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.15s;
  }

  button.layout-gear svg {
    width: 20px;
    height: 20px;
  }

  button.layout-gear:hover {
    background: rgba(240, 240, 240, 1);
  }

  div.layout-panel {
    position: fixed;
    top: 50px;
    right: 10px;
    z-index: 999;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 16px;
    width: 260px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }

  .panel-header span {
    font-weight: 600;
    font-size: 14px;
    display: block;
    margin-bottom: 12px;
  }

  .control-row {
    margin-bottom: 14px;
  }

  .control-row label {
    display: block;
    font-size: 12px;
    margin-bottom: 4px;
    color: #333;
  }

  .control-row .value {
    font-weight: 600;
  }

  .control-row input[type="range"] {
    width: 100%;
  }

  .button-row {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }

  .relayout-btn, .reset-btn {
    flex: 1;
    padding: 6px 10px;
    font-size: 12px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid #ccc;
    transition: background 0.15s;
  }

  .relayout-btn {
    background: #4a90d9;
    color: white;
    border-color: #357abd;
  }

  .relayout-btn:hover:not(:disabled) {
    background: #357abd;
  }

  .relayout-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .reset-btn {
    background: #f5f5f5;
    color: #333;
  }

  .reset-btn:hover {
    background: #e8e8e8;
  }
</style>
