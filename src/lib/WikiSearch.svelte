<script lang="ts">
  import { queryStore } from './store';
  import { apiClient, type SuggestionsCustom } from './apiClient';
  import Suggestions from './Suggestions.svelte';
  import LanguageSelect from './LanguageSelect.svelte';
  import { createEventDispatcher, onDestroy } from 'svelte';

  const dispatch = createEventDispatcher();

  let query: string = '';
  let suggestions: SuggestionsCustom = [];
  let selected = 0;

  // Subscribe to store
  const unsubscribe = queryStore.subscribe(value => {
    query = value;
  });

  onDestroy(unsubscribe);

  async function onKeyup(e: KeyboardEvent) {
    const q = query.trim();

    if (!q) {
      dropSuggest();
      return;
    }

    if (e.key === 'Escape') {
      dropSuggest();
      return;
    }

    if (e.key === 'Enter') {
      // Enter triggers search from Wikipedia (additive)
      const title = suggestions[selected]?.title || q;
      dispatch('search', title);
      dropSuggest();
    }

    getSuggestions();
  }

  function handleArrows(e: KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selected = selected ? selected - 1 : suggestions.length - 1;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selected = selected === suggestions.length - 1 ? 0 : selected + 1;
    }
  }

  async function getSuggestions() {
    const q = query.trim();
    if (!q) return;

    suggestions = await apiClient.suggestCustom(q);
  }

  function onSelect(e: CustomEvent<number>) {
    query = suggestions[e.detail]?.title;
    dispatch('search', query);
    dropSuggest();
  }

  function dropSuggest() {
    suggestions = [];
    selected = 0;
  }
</script>

<div class="search-box">
  <div class="input-wrapper">
    <input
      type="text"
      name="Wiki Search input"
      autocomplete="off"
      placeholder="search wikipedia..."
      bind:value={query}
      on:click={getSuggestions}
      on:keyup={onKeyup}
      on:keydown={handleArrows}
      on:blur={() => setTimeout(dropSuggest, 100)}
    />
    <LanguageSelect />
  </div>

  <Suggestions {suggestions} {selected} on:select={onSelect} />
</div>

<style lang="postcss">
  .search-box {
    position: absolute;
    top: 1em;
    left: 1em;
    z-index: 200;
    display: flex;
    flex-direction: column;
    width: fit-content;
  }

  .input-wrapper {
    position: relative;
    width: 100%;
    display: grid;
    grid-template-columns: auto min-content;
    align-items: center;
    background-color: #f5f7fa;
    border: 1px solid #dbeafe;
    border-radius: 6px;
    box-shadow: 0 1px 4px rgba(35, 85, 216, 0.08);
    transition: border-color 0.2s, box-shadow 0.2s;

    &:focus-within {
      border-color: #4f8cff;
      box-shadow: 0 2px 8px rgba(79, 140, 255, 0.15);
      background: #fff;
    }
  }

  input {
    font-size: 0.9rem;
    min-width: 200px;
    padding: 8px 12px;
    outline: none;
    border: none;
    background: transparent;
    color: #333;
  }

  input::placeholder {
    color: #888;
  }
</style>
