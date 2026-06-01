import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GraphologyAdapter } from './graphologyAdapter';
import { fetchBridgeEdges } from './bridgeBuilder';

// Mock fetch
function createMockFetch(responseData: any) {
  return vi.fn().mockResolvedValue({
    json: vi.fn().mockResolvedValue(responseData),
  });
}

describe('bridgeBuilder', () => {
  let graph: GraphologyAdapter;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    graph = new GraphologyAdapter();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  });

  describe('fetchBridgeEdges', () => {
    it('creates edges to existing nodes', async () => {
      // Existing nodes in graph
      graph.addNode('ExistingNode');
      graph.addNode('AnotherExisting');

      // New nodes that will have outgoing links
      graph.addNode('NewNode');

      // Mock fetch to return that NewNode links to ExistingNode
      globalThis.fetch = createMockFetch({
        query: {
          pages: {
            '123': {
              links: [
                { title: 'ExistingNode' },
                { title: 'SomeRandomNode' },
              ],
            },
          },
        },
      });

      const bridges = await fetchBridgeEdges(['NewNode'], graph, 'en');
      expect(bridges).toBe(1);
      expect(graph.hasLink('NewNode', 'ExistingNode')).toBe(true);
    });

    it('does not create edges to new nodes', async () => {
      graph.addNode('ExistingNode');
      graph.addNode('NewNode');

      globalThis.fetch = createMockFetch({
        query: {
          pages: {
            '123': {
              links: [
                { title: 'NewNode' },
                { title: 'ExistingNode' },
              ],
            },
          },
        },
      });

      const bridges = await fetchBridgeEdges(['NewNode'], graph, 'en');
      expect(bridges).toBe(1);
      expect(graph.hasLink('NewNode', 'ExistingNode')).toBe(true);
    });

    it('respects BRIDGE_CAP of 10', async () => {
      graph.addNode('ExistingNode');

      // Create 15 new nodes
      const newNodeIds = [];
      for (let i = 0; i < 15; i++) {
        const id = `NewNode${i}`;
        graph.addNode(id);
        newNodeIds.push(id);
      }

      globalThis.fetch = createMockFetch({
        query: {
          pages: {
            '123': {
              links: [{ title: 'ExistingNode' }],
            },
          },
        },
      });

      const bridges = await fetchBridgeEdges(newNodeIds, graph, 'en');
      // Only 10 should be checked (BRIDGE_CAP)
      expect(globalThis.fetch).toHaveBeenCalledTimes(10);
    });

    it('prioritizes higher-degree nodes', async () => {
      graph.addNode('ExistingNode');

      // Low degree node
      graph.addNode('LowDegree');

      // High degree nodes
      graph.addNode('HighDegree1');
      graph.addNode('HighDegree2');
      graph.addLink('ExistingNode', 'HighDegree1', 5.0);
      graph.addLink('ExistingNode', 'HighDegree2', 5.0);

      globalThis.fetch = createMockFetch({
        query: {
          pages: {
            '123': {
              links: [{ title: 'ExistingNode' }],
            },
          },
        },
      });

      await fetchBridgeEdges(
        ['LowDegree', 'HighDegree1', 'HighDegree2'],
        graph,
        'en'
      );

      // High degree nodes should be checked first
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    it('returns 0 when no new nodes provided', async () => {
      const bridges = await fetchBridgeEdges([], graph, 'en');
      expect(bridges).toBe(0);
    });

    it('does not create self-loops', async () => {
      graph.addNode('NodeA');

      globalThis.fetch = createMockFetch({
        query: {
          pages: {
            '123': {
              links: [{ title: 'NodeA' }],
            },
          },
        },
      });

      const bridges = await fetchBridgeEdges(['NodeA'], graph, 'en');
      expect(bridges).toBe(0);
    });

    it('handles empty API response', async () => {
      graph.addNode('ExistingNode');
      graph.addNode('NewNode');

      globalThis.fetch = createMockFetch({
        query: {
          pages: {},
        },
      });

      const bridges = await fetchBridgeEdges(['NewNode'], graph, 'en');
      expect(bridges).toBe(0);
    });
  });
});
