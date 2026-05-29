<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import type { GraphologyAdapter } from "./graphologyAdapter";

  const dispatch = createEventDispatcher();

  export let graph: GraphologyAdapter | null = null;

  let edges: Array<{
    source: string;
    target: string;
    pmi: number;
    weight: number;
    contextSentences: string[];
  }> = [];

  let sortBy: "pmi" | "weight" = "pmi";
  let sortAsc = false;
  let filterQuery = "";

  // Rebuild edge list when graph changes
  $: if (graph) {
    const edgeList: typeof edges = [];
    const g = graph.getGraphology();
    g.forEachEdge((_id: string, attrs: any, source: string, target: string) => {
      edgeList.push({
        source,
        target,
        pmi: attrs.pmi ?? 0,
        weight: attrs.weight ?? 0,
        contextSentences: attrs.context_sentences || [],
      });
    });

    // Sort by PMI descending by default
    edgeList.sort((a, b) => b.pmi - a.pmi);
    edges = edgeList;
  }

  function handleSort(column: "pmi" | "weight") {
    if (sortBy === column) {
      sortAsc = !sortAsc;
    } else {
      sortBy = column;
      sortAsc = false;
    }

    edges.sort((a, b) => {
      const diff = a[column] - b[column];
      return sortAsc ? diff : -diff;
    });
  }

  $: filteredEdges = filterQuery
    ? edges.filter(
        (e) =>
          e.source.toLowerCase().includes(filterQuery.toLowerCase()) ||
          e.target.toLowerCase().includes(filterQuery.toLowerCase()),
      )
    : edges;

  function handleFilterInput(e: Event) {
    filterQuery = (e.target as HTMLInputElement).value;
  }

  function truncate(text: string, max: number = 80): string {
    return text.length > max ? text.slice(0, max) + "..." : text;
  }

  function handleEdgeClick(edge: typeof edges[0]) {
    dispatch("edge-select", edge);
  }
</script>

<div class="edge-table-panel">
  <div class="table-header">
    <h3>Edges</h3>
    <span class="edge-count">{filteredEdges.length} / {edges.length}</span>
  </div>

  <input
    type="search"
    class="table-filter"
    placeholder="Filter edges..."
    value={filterQuery}
    on:input={handleFilterInput}
  />

  <table>
    <thead>
      <tr>
        <th>Source</th>
        <th>Target</th>
        <th class="num" on:click={() => handleSort("pmi")}>
          PMI {sortBy === "pmi" ? (sortAsc ? "↑" : "↓") : ""}
        </th>
        <th class="num" on:click={() => handleSort("weight")}>
          Weight {sortBy === "weight" ? (sortAsc ? "↑" : "↓") : ""}
        </th>
        <th>Context</th>
      </tr>
    </thead>
    <tbody>
      {#each filteredEdges as edge (edge.source + edge.target)}
        <tr class="edge-row" on:click={() => handleEdgeClick(edge)}>
          <td class="source">{edge.source}</td>
          <td class="target">{edge.target}</td>
          <td class="num">{edge.pmi.toFixed(2)}</td>
          <td class="num">{edge.weight}</td>
          <td class="context">
            {#if edge.contextSentences.length > 0}
              {truncate(edge.contextSentences[0])}
            {:else}
              <span class="no-context">—</span>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .edge-table-panel {
    background: #fff;
    border: 1px solid #dbeafe;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    overflow: hidden;
  }

  .table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid #e5e7eb;
  }

  .table-header h3 {
    margin: 0;
    font-size: 14px;
    color: #333;
  }

  .edge-count {
    font-size: 12px;
    color: #888;
  }

  .table-filter {
    width: calc(100% - 32px);
    margin: 8px 16px 0;
    padding: 6px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
  }

  .table-filter:focus {
    border-color: #4f8cff;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  thead th {
    position: sticky;
    top: 0;
    background: #f8fafc;
    padding: 8px 10px;
    text-align: left;
    font-weight: 600;
    color: #555;
    border-bottom: 2px solid #e5e7eb;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  thead th.num {
    text-align: right;
    cursor: pointer;
    user-select: none;
  }

  thead th.num:hover {
    color: #4f8cff;
  }

  tbody td {
    padding: 6px 10px;
    border-bottom: 1px solid #f0f0f0;
    vertical-align: middle;
  }

  tbody td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .source {
    color: #4f8cff;
    font-weight: 500;
  }

  .target {
    color: #333;
  }

  .context {
    color: #666;
    font-size: 12px;
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .no-context {
    color: #ccc;
  }

  .edge-row {
    cursor: pointer;
    transition: background 0.1s;
  }

  .edge-row:hover {
    background: #f0f7ff;
  }

  tbody {
    max-height: 50vh;
    overflow-y: auto;
    display: block;
  }

  thead {
    display: table;
    width: 100%;
  }

  table {
    display: block;
    max-height: 60vh;
    overflow: hidden;
  }
</style>
