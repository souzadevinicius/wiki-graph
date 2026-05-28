import type Graph from 'graphology';
import type { NodeData } from './graphologyAdapter';

/**
 * Result of computing which nodes/edges are visible after applying filters.
 */
export interface VisibleSet {
  /** Node IDs that pass all filters */
  visibleNodes: Set<string>;
  /** Edge IDs that pass all filters (both endpoints visible + PMI not pruned) */
  visibleEdges: Set<string>;
}

export interface NodeStat {
  id: string;
  inDegree: number;
  outDegree: number;
  community: number | undefined;
}

export interface EdgeStat {
  id: string;
  from: string;
  to: string;
  pmi: number;
  chapters?: string;
}

export interface Filters {
  searchQuery: string;
  sizeThreshold: number;
  pruningIntensity: number;
}

export interface Chapter {
  id: number;
  label: string;
}

/**
 * Check if a node matches the search query (same logic as SigmaRenderer).
 */
function nodeMatchesSearch(
  nodeId: string,
  attributes: NodeData,
  searchQuery: string,
): boolean {
  const searchableValues = [
    nodeId,
    attributes.wikipedia_title,
    attributes.description,
    attributes.entity_type,
    ...(Array.isArray(attributes.mentions) ? attributes.mentions : []),
  ];

  return searchableValues.some(
    (value) =>
      typeof value === 'string' && value.toLowerCase().includes(searchQuery),
  );
}

/**
 * Compute which nodes and edges are visible given the current filters.
 * Mirrors the logic in SigmaRenderer.applyStyles so the table stays in sync.
 */
export function computeVisibleSet(
  graph: Graph,
  filters: Filters,
): VisibleSet {
  const { searchQuery, sizeThreshold, pruningIntensity } = filters;
  const searchLower = searchQuery.trim().toLowerCase();

  // 1. PMI-based edge pruning (same algorithm as applyStyles)
  let hiddenEdgeIds = new Set<string>();
  if (pruningIntensity > 0) {
    const edges: Array<{ id: string; pmi: number }> = [];
    graph.forEachEdge((edgeId, attrs) => {
      edges.push({
        id: edgeId,
        pmi: (attrs.pmi as number) ?? 0,
      });
    });

    edges.sort((a, b) => a.pmi - b.pmi);
    const negativeEdges = edges.filter((e) => e.pmi < 0);
    const positiveEdges = edges.filter((e) => e.pmi >= 0);
    const totalEdges = edges.length;

    const intensity = pruningIntensity / 100;

    if (intensity <= 0.2) {
      const removeFraction = intensity / 0.2;
      const toRemove = Math.floor(removeFraction * negativeEdges.length);
      for (let i = 0; i < toRemove; i++) {
        hiddenEdgeIds.add(negativeEdges[i].id);
      }
    } else {
      hiddenEdgeIds = new Set(negativeEdges.map((e) => e.id));
      const remainingFraction = (intensity - 0.2) / 0.8;
      const toRemove = Math.floor(remainingFraction * positiveEdges.length);
      for (let i = 0; i < toRemove; i++) {
        hiddenEdgeIds.add(positiveEdges[i].id);
      }
    }
  }

  // 2. Determine visible nodes
  const visibleNodes = new Set<string>();

  // Search matching
  const searchMatches = new Set<string>();
  const searchNeighbors = new Set<string>();

  if (searchLower) {
    graph.forEachNode((nodeId, attrs) => {
      if (nodeMatchesSearch(nodeId, attrs as NodeData, searchLower)) {
        searchMatches.add(nodeId);
        graph.neighbors(nodeId).forEach((n) => searchNeighbors.add(n));
      }
    });
  }

  // Size + search filter
  graph.forEachNode((nodeId, attrs) => {
    const degree = graph.degree(nodeId);
    const data = attrs as NodeData;

    // Size threshold
    if (degree < sizeThreshold) return;

    // Search filter: node must match or be neighbor of a match
    if (searchLower) {
      const matches = searchMatches.has(nodeId);
      const isNeighbor = searchNeighbors.has(nodeId);
      if (!matches && !isNeighbor) return;
    }

    visibleNodes.add(nodeId);
  });

  // 3. Determine visible edges (both endpoints visible + not pruned)
  const visibleEdges = new Set<string>();
  graph.forEachEdge((edgeId, _attrs, source, target) => {
    if (hiddenEdgeIds.has(edgeId)) return;
    if (!visibleNodes.has(source) || !visibleNodes.has(target)) return;
    visibleEdges.add(edgeId);
  });

  return { visibleNodes, visibleEdges };
}

/**
 * Build node stats from the visible set.
 */
export function buildNodeStats(
  graph: Graph,
  visibleSet: VisibleSet,
): NodeStat[] {
  const stats: NodeStat[] = [];

  visibleSet.visibleNodes.forEach((nodeId) => {
    const attrs = graph.getNodeAttributes(nodeId) as NodeData;

    // Compute in/out degree within the visible subgraph
    const inNeighbors = graph.inNeighbors(nodeId);
    const outNeighbors = graph.outNeighbors(nodeId);
    const inDeg = inNeighbors.filter((n) => visibleSet.visibleNodes.has(n)).length;
    const outDeg = outNeighbors.filter((n) => visibleSet.visibleNodes.has(n)).length;

    stats.push({
      id: nodeId,
      inDegree: inDeg,
      outDegree: outDeg,
      community: attrs.community,
    });
  });

  return stats;
}

/**
 * Build edge stats from the visible set.
 */
export function buildEdgeStats(
  graph: Graph,
  visibleSet: VisibleSet,
  chapters: Chapter[] | null,
): EdgeStat[] {
  const stats: EdgeStat[] = [];

  graph.forEachEdge((edgeId, attrs, source, target) => {
    if (!visibleSet.visibleEdges.has(edgeId)) return;

    const pmi = (attrs.pmi as number) ?? 0;

    // For book graphs, find chapters where both nodes co-occur
    let chapterLabels: string | undefined;
    if (chapters) {
      const sourceAttrs = graph.getNodeAttributes(source) as NodeData;
      const targetAttrs = graph.getNodeAttributes(target) as NodeData;
      const sourceChapters = sourceAttrs.chapter_ids || [];
      const targetChapters = targetAttrs.chapter_ids || [];

      // Intersection of chapter IDs
      const commonIds = sourceChapters.filter((id: number) =>
        targetChapters.includes(id),
      );

      if (commonIds.length > 0) {
        const labels = commonIds
          .map(
            (id: number) => chapters.find((c) => c.id === id)?.label ?? String(id),
          )
          .join(', ');
        chapterLabels = labels;
      }
    }

    stats.push({
      id: edgeId,
      from: source,
      to: target,
      pmi,
      chapters: chapterLabels,
    });
  });

  return stats;
}
