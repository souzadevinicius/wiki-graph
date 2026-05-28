<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { Chapter } from "./serverApi";
  import { appState } from './state';

  const dispatch = createEventDispatcher();

  export let bookLang: "en" | "pt" = "en";
  let resolveWiki: boolean = true;

  // Phases: 'select' | 'chapters' | 'processing'
  let phase: "select" | "chapters" | "processing" = "select";
  let uploadId: string | null = null;
  let chapters: Chapter[] = [];
  let selectedChapterIds: Set<number> = new Set();
  let extracting = false;

  let fileInput: HTMLInputElement;
  let file: File | null = null;
  let uploading = false;
  let progressStage = "";
  let progressDetail = "";
  let progressCount = 0;
  let error: string | null = null;

  function onFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    file = target.files?.[0] || null;
    error = null;
    phase = "select";
    resolveWiki = true;
  }

  async function extractAndShowChapters() {
    if (!file) return;
    extracting = true;
    error = null;

    try {
      const { extractChapters } = await import("./serverApi");
      const result = await extractChapters(file, bookLang);
      uploadId = result.upload_id;
      chapters = result.chapters;
      // Default: all selected
      selectedChapterIds = new Set(chapters.map(c => c.id));
      phase = "chapters";
    } catch (e) {
      error = e instanceof Error ? e.message : "Extraction failed";
    } finally {
      extracting = false;
    }
  }

  function toggleChapter(id: number) {
    if (selectedChapterIds.has(id)) {
      selectedChapterIds = new Set([...selectedChapterIds].filter(x => x !== id));
    } else {
      selectedChapterIds = new Set([...selectedChapterIds, id]);
    }
  }

  function toggleAll() {
    if (selectedChapterIds.size === chapters.length) {
      selectedChapterIds = new Set();
    } else {
      selectedChapterIds = new Set(chapters.map(c => c.id));
    }
  }

  async function processSelected() {
    if (!uploadId || selectedChapterIds.size < 1) return;
    uploading = true;
    error = null;
    phase = "processing";

    try {
      const { processWithChapters } = await import("./serverApi");
      const graph = await processWithChapters(
        uploadId,
        Array.from(selectedChapterIds),
        bookLang,
        resolveWiki,
        (stage, detail, count) => {
          progressStage = stage;
          progressDetail = detail;
          progressCount = count;
        },
      );
      // Store chapters globally for stats panel
      appState.chapters = chapters;
      dispatch("book-graph", graph);
    } catch (e) {
      error = e instanceof Error ? e.message : "Processing failed";
      phase = "chapters";
    } finally {
      uploading = false;
    }
  }

  function goBack() {
    phase = "select";
    file = null;
    uploadId = null;
    chapters = [];
    selectedChapterIds = new Set();
    resolveWiki = true;
  }

  $: count = selectedChapterIds.size;
</script>

<div class="book-upload" class:active={file !== null || uploading || extracting}>
  {#if phase === "select"}
    <div class="upload-controls">
      <label class="file-btn">
        <input
          type="file"
          accept=".pdf,.txt,.epub"
          bind:this={fileInput}
          on:change={onFileSelect}
        />
        <span>{file ? file.name : "Choose book"}</span>
      </label>

      <div class="lang-select">
        <select bind:value={bookLang}>
          <option value="en">English</option>
          <option value="pt">Português</option>
        </select>
      </div>

      <label class="wiki-toggle">
        <input type="checkbox" bind:checked={resolveWiki} />
        Resolve entities to Wikipedia
      </label>

      <button
        class="upload-btn"
        on:click={extractAndShowChapters}
        disabled={!file || extracting}
      >
        {extracting ? "Extracting..." : "Extract chapters"}
      </button>
    </div>

    {#if error}
      <div class="error">{error}</div>
    {/if}

  {:else if phase === "chapters"}
    <div class="chapter-selection">
      <div class="chapter-header">
        <span class="file-name">{file?.name}</span>
        <button class="back-btn" on:click={goBack}>Change</button>
      </div>

      <div class="chapter-controls">
        <button class="toggle-all-btn" on:click={toggleAll}>
          {selectedChapterIds.size === chapters.length ? "Deselect all" : "Select all"}
        </button>
        <button
          class="upload-btn"
          on:click={processSelected}
          disabled={selectedChapterIds.size < 1}
        >
          Build graph ({count}/{chapters.length})
        </button>
      </div>

      <div class="chapter-list">
        {#each chapters as chapter (chapter.id)}
          <label class="chapter-item">
            <input
              type="checkbox"
              checked={selectedChapterIds.has(chapter.id)}
              on:change={() => toggleChapter(chapter.id)}
            />
            <div class="chapter-info">
              <span class="chapter-label">{chapter.label}</span>
              {#if chapter.preview}
                <span class="chapter-preview">{chapter.preview}</span>
              {/if}
            </div>
          </label>
        {/each}
      </div>

      {#if error}
        <div class="error">{error}</div>
      {/if}
    </div>

  {:else}
    <!-- Processing phase -->
    <div class="progress-overlay">
      <div class="progress-spinner"></div>
      <div class="progress-text">
        <span class="stage">{progressStage}</span>
        {#if progressDetail}
          <span class="detail">{progressDetail}</span>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .book-upload {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 100;
    background: #ffffff;
    border: 1px solid #dbeafe;
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 14px;
    min-width: 280px;
    max-width: 400px;
    box-shadow: 0 2px 8px rgba(79, 140, 255, 0.12);
  }

  .upload-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .file-btn {
    display: block;
    padding: 8px 12px;
    background: #4f8cff;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-btn input {
    display: none;
  }

  .lang-select select {
    width: 100%;
    padding: 6px 8px;
    border-radius: 4px;
    border: 1px solid #dbeafe;
    background: #f5f7fa;
    color: #333;
    outline: none;
  }

  .wiki-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #888;
    cursor: pointer;
    user-select: none;
  }

  .wiki-toggle input[type="checkbox"] {
    width: 14px;
    height: 14px;
    accent-color: #4f8cff;
    cursor: pointer;
  }

  .upload-btn {
    padding: 8px 12px;
    background: #4f8cff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
  }

  .upload-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .progress-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
  }

  .progress-spinner {
    width: 24px;
    height: 24px;
    border: 3px solid #dbeafe;
    border-top-color: #4f8cff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .progress-text {
    text-align: center;
    font-size: 12px;
    color: #888;
  }

  .progress-text .stage {
    display: block;
    font-weight: 600;
    color: #333;
    text-transform: capitalize;
  }

  .progress-text .detail {
    display: block;
    margin-top: 2px;
  }

  .error {
    color: #ff6b6b;
    font-size: 12px;
    margin-top: 8px;
    padding: 8px;
    background: rgba(255, 107, 107, 0.1);
    border-radius: 4px;
  }

  .chapter-selection {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 60vh;
  }

  .chapter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .file-name {
    font-size: 12px;
    color: #888;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }

  .back-btn {
    background: none;
    border: none;
    color: #4f8cff;
    cursor: pointer;
    font-size: 12px;
  }

  .chapter-controls {
    display: flex;
    gap: 8px;
  }

  .toggle-all-btn {
    padding: 6px 8px;
    background: #f5f7fa;
    color: #333;
    border: 1px solid #dbeafe;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .toggle-all-btn:hover {
    background: #e0e7ff;
  }

  .chapter-list {
    max-height: 40vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .chapter-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 4px;
    border-radius: 4px;
    cursor: pointer;
  }

  .chapter-item:hover {
    background: #f5f7fa;
  }

  .chapter-item input[type="checkbox"] {
    margin-top: 2px;
    accent-color: #4f8cff;
  }

  .chapter-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .chapter-label {
    font-size: 13px;
    font-weight: 500;
    color: #333;
  }

  .chapter-preview {
    font-size: 11px;
    color: #888;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
