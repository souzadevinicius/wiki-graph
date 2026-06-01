import type Graph from 'graphology';

/**
 * Chronological layout: top-down temporal arrangement of entities by sentence
 * order. Y-axis maps to sentence index (first appearance), X-axis is
 * force-directed within each row (Y locked).
 *
 * - Row height: dynamic, scales to fill viewport
 * - Repulsion: row-local only
 * - Attraction: temporal-weighted (exponential decay by row distance)
 * - Wikipedia nodes: snap to nearest row
 * - Same-sentence edges: flat
 * - Cross-sentence edges: curved (alternating curvature), dimmed
 * - Empty sentences are skipped (Y is compressed to unique values)
 */
export interface ChronologicalOptions {
  /** Minimum vertical spacing between rows. */
  minRowHeight?: number;
  /** Maximum vertical spacing between rows. */
  maxRowHeight?: number;
  /** Horizontal spacing between nodes in the same row. */
  nodeSpacing?: number;
  /** Number of force iterations for X-axis only. */
  iterations?: number;
  /** Exponential decay factor for temporal attraction. */
  decayFactor?: number;
  /** Viewport height for dynamic row sizing. */
  viewportHeight?: number;
}

const DEFAULTS = {
  minRowHeight: 800,    // was 30
  maxRowHeight: 1600,   // was 80
  nodeSpacing: 1600,    // was 80
  iterations: 0,     // was 200
  decayFactor: 8,
  viewportHeight: 600,
};
export function runChronological(
  graph: Graph,
  options: ChronologicalOptions = {}
): void {
  const cfg = { ...DEFAULTS, ...options };
  const { minRowHeight, maxRowHeight, nodeSpacing, iterations, decayFactor, viewportHeight } = cfg;

  // Collect nodes with valid first_sentence_idx
  const nodesWithIdx: Array<{ id: string; idx: number }> = [];
  const nodesWithoutIdx: string[] = [];

  graph.forEachNode((nodeId) => {
    const attrs = graph.getNodeAttributes(nodeId) as Record<string, any>;
    const idx = attrs.first_sentence_idx;
    if (idx !== undefined && idx !== null && Number.isFinite(idx)) {
      nodesWithIdx.push({ id: nodeId, idx });
    } else {
      nodesWithoutIdx.push(nodeId);
    }
  });

  if (nodesWithIdx.length === 0) {
    return; // No temporal data — caller checks hasTemporalData before calling
  }

  /* ── Build row mapping ── */

  const uniqueIndices = Array.from(new Set(nodesWithIdx.map(n => n.idx))).sort((a, b) => a - b);
  const idxToRow = new Map<number, number>();
  uniqueIndices.forEach((idx, row) => idxToRow.set(idx, row));
  const totalRows = uniqueIndices.length;

  // Dynamic row height: clamp between min and max
  const rowHeight = Math.min(maxRowHeight, Math.max(minRowHeight, viewportHeight / totalRows));

  // Group nodes by row
  const rows = new Map<number, string[]>();
  nodesWithIdx.forEach(({ id, idx }) => {
    const row = idxToRow.get(idx)!;
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push(id);
  });

  /* ── Assign initial positions ── */

  const centerX = 0;

  // Nodes with sentence index: distribute evenly within each row
  rows.forEach((nodeIds, row) => {
    const y = row * rowHeight;
    nodeIds.forEach((nodeId, i) => {
      const x = centerX + (i - (nodeIds.length - 1) / 2) * nodeSpacing;
      graph.setNodeAttribute(nodeId, 'x', x);
      graph.setNodeAttribute(nodeId, 'y', y);
    });
  });

  // Wikipedia nodes: snap to nearest row
  nodesWithoutIdx.forEach((nodeId) => {
    const neighbors = graph.neighbors(nodeId);
    if (neighbors.length === 0) {
      // Truly isolated — place at bottom
      const maxRow = Math.max(...Array.from(rows.keys()));
      graph.setNodeAttribute(nodeId, 'x', centerX);
      graph.setNodeAttribute(nodeId, 'y', (maxRow + 1) * rowHeight);
      return;
    }

    // Find nearest row among neighbors that have Y positions
    let bestRow: number | null = null;
    let bestDist = Infinity;
    neighbors.forEach((nId) => {
      const ny = graph.getNodeAttribute(nId, 'y') as number | undefined;
      if (ny !== undefined && Number.isFinite(ny)) {
        const neighborRow = Math.round(ny / rowHeight);
        const dist = Math.abs(ny); // Distance from origin as proxy
        if (dist < bestDist) {
          bestDist = dist;
          bestRow = neighborRow;
        }
      }
    });

    if (bestRow !== null) {
      graph.setNodeAttribute(nodeId, 'x', centerX + nodeSpacing); // Slight offset from center
      graph.setNodeAttribute(nodeId, 'y', bestRow * rowHeight);
    } else {
      const maxRow = Math.max(...Array.from(rows.keys()));
      graph.setNodeAttribute(nodeId, 'x', centerX);
      graph.setNodeAttribute(nodeId, 'y', (maxRow + 1) * rowHeight);
    }
  });

  /* ── Build helper: node -> row mapping ── */

  const nodeToRow = new Map<string, number>();
  graph.forEachNode((nodeId) => {
    const y = graph.getNodeAttribute(nodeId, 'y') as number;
    nodeToRow.set(nodeId, Math.round(y / rowHeight));
  });

  /* ── Force-directed X (Y locked) ── */

  const repulsionStrength = 8000;
  const attractionStrength = 0.5;

  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / iterations;
    const displacements = new Map<string, number>();

    graph.forEachNode((nodeId) => displacements.set(nodeId, 0));

    // Repulsion: same-row nodes only
    rows.forEach((nodeIds) => {
      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
          const x1 = graph.getNodeAttribute(nodeIds[i], 'x') as number;
          const x2 = graph.getNodeAttribute(nodeIds[j], 'x') as number;
          const dx = x2 - x1;
          const dist = Math.abs(dx) || 0.1;
          const force = repulsionStrength / (dist * dist);
          const dir = dx > 0 ? -1 : 1;
          displacements.set(nodeIds[i], (displacements.get(nodeIds[i]) || 0) + dir * force);
          displacements.set(nodeIds[j], (displacements.get(nodeIds[j]) || 0) - dir * force);
        }
      }
    });

    // Attraction: connected nodes, weighted by temporal proximity
    graph.forEachEdge((_edgeId, _attrs, source, target) => {
      const x1 = graph.getNodeAttribute(source, 'x') as number;
      const x2 = graph.getNodeAttribute(target, 'x') as number;
      const dx = x2 - x1;

      const rowA = nodeToRow.get(source)!;
      const rowB = nodeToRow.get(target)!;
      const rowDistance = Math.abs(rowA - rowB);

      // Exponential decay: same row = 1.0, rowDistance/decayFactor = ~0.37
      const temporalWeight = Math.exp(-rowDistance / decayFactor);

      const force = attractionStrength * dx * temporalWeight;
      displacements.set(source, (displacements.get(source) || 0) + force);
      displacements.set(target, (displacements.get(target) || 0) - force);
    });

    // Apply displacements with cooling
    graph.forEachNode((nodeId) => {
      const disp = (displacements.get(nodeId) || 0) * cooling;
      // Clamp displacement to prevent explosions
      const clamped = Math.max(-nodeSpacing, Math.min(nodeSpacing, disp));
      const currentX = graph.getNodeAttribute(nodeId, 'x') as number;
      graph.setNodeAttribute(nodeId, 'x', currentX + clamped);
    });
  }

  /* ── Center rows horizontally ── */

  const allNodeIds = graph.nodes();
  let globalMinX = Infinity;
  let globalMaxX = -Infinity;

  graph.forEachNode((nodeId) => {
    const x = graph.getNodeAttribute(nodeId, 'x') as number;
    globalMinX = Math.min(globalMinX, x);
    globalMaxX = Math.max(globalMaxX, x);
  });

  const globalOffset = centerX - (globalMinX + globalMaxX) / 2;
  graph.forEachNode((nodeId) => {
    const x = graph.getNodeAttribute(nodeId, 'x') as number;
    graph.setNodeAttribute(nodeId, 'x', x + globalOffset);
  });

  /* ── Edge styling ── */

  let edgeCounter = 0;
  graph.forEachEdge((edgeId, _attrs, source, target) => {
    const sourceIdx = graph.getNodeAttribute(source, 'first_sentence_idx') as number | undefined;
    const targetIdx = graph.getNodeAttribute(target, 'first_sentence_idx') as number | undefined;

    if (sourceIdx !== undefined && targetIdx !== undefined && sourceIdx === targetIdx) {
      // Same sentence — flat edge
      graph.setEdgeAttribute(edgeId, 'curvature', 0);
      graph.setEdgeAttribute(edgeId, '_chronoSameRow', true);
    } else {
      // Cross-sentence — alternating curvature for visual clarity
      const curvature = (edgeCounter % 2 === 0 ? 0.3 : -0.3);
      graph.setEdgeAttribute(edgeId, 'curvature', curvature);
      graph.setEdgeAttribute(edgeId, '_chronoSameRow', false);
      edgeCounter++;
    }
  });
}

/** Check if this graph has temporal data (any node with first_sentence_idx). */
export function hasTemporalData(graph: Graph): boolean {
  let hasData = false;
  graph.forEachNode((_id, attributes) => {
    const attrs = attributes as Record<string, any>;
    if (
      attrs.first_sentence_idx !== undefined &&
      attrs.first_sentence_idx !== null &&
      Number.isFinite(attrs.first_sentence_idx)
    ) {
      hasData = true;
    }
  });
  return hasData;
}
