<script lang="ts">
  // https://www.wikipedia.org

  import {appState, watchState} from "./state";
  import { queryStore } from './store';

  let query: string = appState.query;

  let suggestions: SuggestionsCustom = [];
  let selected = 0

  import { apiClient, type SuggestionsCustom } from "./apiClient";
  import Suggestions from "./Suggestions.svelte";
  import LanguageSelect from "./LanguageSelect.svelte";
  
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher()

  async function search(query) {
    console.log("[search] query:", query);
    dispatch('search', query)
    // await apiClient.page(query);
  }

  $: query = $queryStore;

  async function onKeyup(e: KeyboardEvent) {
    // input catches keydown
    // so this function should be `keyup` to get the current query

    console.log("keyup:", e);

    const q = query.trim();

    if (!q) {
      console.log("[onKeyup] empty query given!");
      query = ""
      dropSuggest()
      return;
    }

    if (e.key === "Escape") {
      dropSuggest()
      return;
    }

    if (e.key === "Enter") {
      query = suggestions[selected]?.title || q

      search(query);
      dropSuggest()
      return;
    }

    getSuggestions()
  }

  function handleArrows(e: KeyboardEvent) {
    // this is `keydown` to support arrow long press

    if (e.key === 'ArrowUp') {
      e.preventDefault()

      selected = selected ? selected-1 : suggestions.length-1
      return;
    }
    
    if (e.key === 'ArrowDown') {
      e.preventDefault()

      selected = selected === suggestions.length-1 ? 0 : selected+1
      return;
    }
  }

  async function getSuggestions() {
    // TODO: add suggestionsCache
    
    const q = query.trim()
    if (!q) return

    // suggestions = await apiClient.suggest(q);
    suggestions = await apiClient.suggestCustom(q);
  }

  function onSelect(e: CustomEvent<number>) {
    query = suggestions[e.detail]?.title;
    search(query);
    dropSuggest()
  }

  function dropSuggest() {
    suggestions = [];
    selected = 0
  }

  $: isLoading = appState.progress.working
  $: message = appState.progress.message

  type AppState = typeof appState
  watchState((target: typeof appState, prop: keyof AppState, val: any) => {
    // console.log('[onChange] prop|val:', prop, val);
    switch(prop) {
      case 'message':
        message = val
        return
      case 'working':
        isLoading = val
        return
      case 'query':
        query = val
        return
      default:
        return
    }
  })
</script>

<div class="layout-container input-box">
  <div class="input-wrapper">
    <input
      type="text"
      name="Wiki Search input"
      autocomplete="off"
      placeholder="start wiki search..."
      bind:value={query}
      on:input={() => queryStore.set(query)}
      on:click={getSuggestions}
      on:keyup={onKeyup}
      on:keydown={handleArrows}
      on:blur={() => setTimeout(dropSuggest, 100)}
    />
    <LanguageSelect/>
  </div>

  <Suggestions {suggestions} {selected} on:select={onSelect} />
  <div class="progress-info muted">{
    isLoading
      ? message
      : query
      ? 'This graph was made from Wikipedia.'
      : 'Explore human knowledge..'
  }</div>
</div>

<style lang="postcss">
  .input-box {
    position: relative;

    display: flex;
    flex-direction: column;
    width: 100%;

    color: var(--textColor);
    align-items: center;
  }

  .input-wrapper {
    position: relative;
    width: min(720px, 100%);

    display: grid;
    grid-template-columns: 1fr min-content;
    align-items: center;
    gap: 0.5rem;

    background-color: #fff;

    border: 1px solid var(--borderColor);
    border-radius: 10px;
    padding: 0.25rem;
    box-shadow: 0 6px 18px rgba(37, 73, 115, 0.04);

    &:focus-within {
      border-color: var(--c-accent);
      box-shadow: 0 8px 22px rgba(43,108,176,0.08);
    }
  }

  input {
    font-size: 1.15rem;
    min-width: 220px;
    padding: 0.6em 0.75em;

    margin: 0;

    outline: none;
    border: none;
    color: inherit;
    background: transparent;
  }

  input::placeholder {
    color: var(--textColorMuted);
    opacity: 1;
  }

  .progress-info {
    position: absolute;
    top: 100%;

    font-size: small;
    padding: 0.2em 0.4em;

    width: max-content;
    color: var(--textColorMuted);
  }
  
</style>
