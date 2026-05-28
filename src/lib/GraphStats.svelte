<script lang="ts">
  import type Graph from 'graphology';
  import type {
    NodeStat,
    EdgeStat,
    Chapter,
    VisibleSet,
  } from './graphStats';
  import { computeVisibleSet, buildNodeStats, buildEdgeStats } from './graphStats';

  export let graph: Graph;
  export let graphVersion: number;
  export let searchQuery: string;
  export let sizeThreshold: number;
  export let pruningIntensity: number;
  export let chapters: Chapter[] | null;

  // Detect whether this is a book graph (has chapter_ids on any node)
  $: isBookGraph = (() => {
    let found = false;
    graph.forEachNode((_id, attrs: any) => {
      if (attrs.chapter_ids && attrs.chapter_ids.length > 0) {
        found = true;
      }
    });
    return found;
  })();

  let activeTab: 'nodes' | 'edges' = 'nodes';

  // Sort state
  let nodeSortKey: keyof NodeStat = 'inDegree';
  let nodeSortAsc = false;
  let edgeSortKey: 'from' | 'to' | 'pmi' | 'chapters' = 'pmi';
  let edgeSortAsc = false;

  // Computed stats — re-run when graph content changes (graphVersion) or filters change
  $: graphVersion; // reactive dependency: forces re-compute on graph mutations
  $: visibleSet = computeVisibleSet(graph, {
    searchQuery,
    sizeThreshold,
    pruningIntensity,
  });

  $: nodeStats = buildNodeStats(graph, visibleSet);
  $: edgeStats = buildEdgeStats(graph, visibleSet, chapters);

  // Sorted node stats
  $: sortedNodes = [...nodeStats].sort((a, b) => {
    let cmp = 0;
    if (nodeSortKey === 'id') {
      cmp = a.id.localeCompare(b.id);
    } else if (nodeSortKey === 'community') {
      const aC = a.community ?? Infinity;
      const bC = b.community ?? Infinity;
      cmp = aC - bC;
    } else {
      cmp = (a[nodeSortKey] as number) - (b[nodeSortKey] as number);
    }
    return nodeSortAsc ? cmp : -cmp;
  });

  // Sorted edge stats
  $: sortedEdges = [...edgeStats].sort((a, b) => {
    let cmp = 0;
    if (edgeSortKey === 'from') cmp = a.from.localeCompare(b.from);
    else if (edgeSortKey === 'to') cmp = a.to.localeCompare(b.to);
    else if (edgeSortKey === 'pmi') cmp = a.pmi - b.pmi;
    else if (edgeSortKey === 'chapters') {
      const aC = a.chapters ?? '';
      const bC = b.chapters ?? '';
      cmp = aC.localeCompare(bC);
    }
    return edgeSortAsc ? cmp : -cmp;
  });

  function handleNodeSort(key: keyof NodeStat) {
    if (nodeSortKey === key) {
      nodeSortAsc = !nodeSortAsc;
    } else {
      nodeSortKey = key;
      nodeSortAsc = false; // descending by default for numeric columns
    }
  }

  function handleEdgeSort(key: 'from' | 'to' | 'pmi' | 'chapters') {
    if (edgeSortKey === key) {
      edgeSortAsc = !edgeSortAsc;
    } else {
      edgeSortKey = key;
      edgeSortAsc = false;
    }
  }

  function sortArrow(key: string, asc: boolean): string {
    if (key !== nodeSortKey && key !== edgeSortKey) return '';
    return asc ? ' ▲' : ' ▼';
  }
</script>

<div class="stats-panel">
  <!-- Tabs -->
  <div class="stats-tabs">
    <button class:active={activeTab === 'nodes'} on:click={() => (activeTab = 'nodes')}>
      Nodes ({sortedNodes.length})
    </button>
    <button class:active={activeTab === 'edges'} on:click={() => (activeTab = 'edges')}>
      Edges ({sortedEdges.length})
    </button>
  </div>

  <!-- Node table -->
  {#if activeTab === 'nodes'}
    <div class="stats-table-wrap">
      <table class="stats-table">
        <thead>
          <tr>
            <th on:click={() => handleNodeSort('id')}>
              Node{sortArrow('id', nodeSortAsc)}
            </th>
            <th class="num" on:click={() => handleNodeSort('inDegree')}>
              In{sortArrow('inDegree', nodeSortAsc)}
            </th>
            <th class="num" on:click={() => handleNodeSort('outDegree')}>
              Out{sortArrow('outDegree', nodeSortAsc)}
            </th>
            <th class="num" on:click={() => handleNodeSort('community')}>
              Community{sortArrow('community', nodeSortAsc)}
            </th>
          </tr>
        </thead>
        <tbody>
          {#each sortedNodes as node}
            <tr>
              <td class="node-id" title={node.id}>{node.id}</td>
              <td class="num">{node.inDegree}</td>
              <td class="num">{node.outDegree}</td>
              <td class="num">{node.community ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- Edge table -->
  {#if activeTab === 'edges'}
    <div class="stats-table-wrap">
      <table class="stats-table">
        <thead>
          <tr>
            <th on:click={() => handleEdgeSort('from')}>
              From{sortArrow('from', edgeSortAsc)}
            </th>
            <th on:click={() => handleEdgeSort('to')}>
              To{sortArrow('to', edgeSortAsc)}
            </th>
            {#if isBookGraph}
              <th on:click={() => handleEdgeSort('chapters')}>
                Chapter{sortArrow('chapters', edgeSortAsc)}
              </th>
            {/if}
            <th class="num" on:click={() => handleEdgeSort('pmi')}>
              PMI{sortArrow('pmi', edgeSortAsc)}
            </th>
          </tr>
        </thead>
        <tbody>
          {#each sortedEdges as edge}
            <tr>
              <td class="node-id" title={edge.from}>{edge.from}</td>
              <td class="node-id" title={edge.to}>{edge.to}</td>
              {#if isBookGraph}
                <td class="chapters" title={edge.chapters}>{edge.chapters ?? '—'}</td>
              {/if}
              <td class="num">{edge.pmi.toFixed(2)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .stats-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #ffffff;
  }

  .stats-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid hsl(220, 10%, 88%);
    flex-shrink: 0;
  }

  .stats-tabs button {
    flex: 1;
    padding: 8px 12px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 0.8rem;
    cursor: pointer;
    color: hsl(220, 5%, 50%);
    transition: all 0.15s;
  }

  .stats-tabs button:hover {
    color: hsl(220, 10%, 45%);
  }

  .stats-tabs button.active {
    color: #4f8cff;
    border-bottom-color: #4f8cff;
    font-weight: 600;
  }

  .stats-table-wrap {
    flex: 1;
    overflow: auto;
  }

  .stats-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }

  .stats-table th {
    position: sticky;
    top: 0;
    background: #f5f7fa;
    padding: 6px 10px;
    text-align: left;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    border-bottom: 1px solid hsl(220, 10%, 88%);
    font-weight: 600;
    color: hsl(220, 10%, 45%);
  }

  .stats-table th:hover {
    background: #e0e7ff;
  }

  .stats-table th.num {
    text-align: right;
  }

  .stats-table td {
    padding: 4px 10px;
    border-bottom: 1px solid hsl(220, 10%, 94%);
    color: hsl(220, 10%, 45%);
  }

  .stats-table td.num {
    text-align: right;
  }

  .stats-table tbody tr:hover {
    background: hsl(220, 50%, 96%);
  }

  .node-id {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chapters {
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
