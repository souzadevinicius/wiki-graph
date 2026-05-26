import forceAtlas2 from 'graphology-layout-forceatlas2';
import type Graph from 'graphology';

export interface ForceAtlas2Options {
  iterations?: number;
  settings?: Record<string, any>;
}

/**
 * Run ForceAtlas2 layout on a graphology graph.
 * Sets initial random positions if nodes don't have x/y attributes.
 * Applies final positions to node attributes.
 */
export function runForceAtlas2(
  graph: Graph,
  options: ForceAtlas2Options = {}
): void {
  const { iterations = 200 } = options;

  // Set initial random positions if not present
  graph.forEachNode((nodeId, attributes) => {
    if (attributes.x === undefined || attributes.y === undefined) {
      graph.setNodeAttribute(nodeId, 'x', Math.random() * 100 - 50);
      graph.setNodeAttribute(nodeId, 'y', Math.random() * 100 - 50);
    }
  });

  // Run layout
  const result = forceAtlas2(graph, {
    iterations,
    settings: {
      adjustSizes: true,
      scalingRatio: 10,
      gravity: 0.5,
      barnesHutOptimize: true,
    },
  });

  // Apply positions
  Object.entries(result).forEach(([nodeId, pos]) => {
    if (pos.x !== null && pos.y !== null) {
      graph.setNodeAttribute(nodeId, 'x', pos.x);
      graph.setNodeAttribute(nodeId, 'y', pos.y);
    }
  });
}
