import { describe, it, expect, beforeEach } from 'vitest';
import Graph from 'graphology';
import { computeVisibleSet, buildNodeStats, buildEdgeStats } from './graphStats';

describe('graphStats', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph();
    // Create a simple graph: A -- B -- C -- D
    graph.addNode('A', { description: 'Alice' });
    graph.addNode('B', { description: 'Bob' });
    graph.addNode('C', { description: 'Charlie' });
    graph.addNode('D', { description: 'Diana' });
    graph.addDirectedEdge('A', 'B', { pmi: 5.0, weight: 3 });
    graph.addDirectedEdge('B', 'C', { pmi: -1.0, weight: 1 });
    graph.addDirectedEdge('C', 'D', { pmi: 3.0, weight: 2 });
  });

  describe('computeVisibleSet', () => {
    it('shows all nodes and edges with no filters', () => {
      const filters = { searchQuery: '', sizeThreshold: 0, pruningIntensity: 0 };
      const result = computeVisibleSet(graph, filters);
      expect(result.visibleNodes.size).toBe(4);
      expect(result.visibleEdges.size).toBe(3);
    });

    it('hides negative PMI edges at pruning intensity', () => {
      const filters = { searchQuery: '', sizeThreshold: 0, pruningIntensity: 20 };
      const result = computeVisibleSet(graph, filters);
      // B->C has PMI -1.0 (negative), should be pruned at 20%+
      // Find the edge with PMI -1.0
      let negativeEdgeId: string | undefined;
      graph.forEachEdge((edgeId, attrs) => {
        if ((attrs.pmi as number) === -1.0) {
          negativeEdgeId = edgeId;
        }
      });
      if (negativeEdgeId) {
        const edgeIds = Array.from(result.visibleEdges);
        expect(edgeIds).not.toContain(negativeEdgeId);
      }
    });

    it('hides all edges at 100% pruning', () => {
      const filters = { searchQuery: '', sizeThreshold: 0, pruningIntensity: 100 };
      const result = computeVisibleSet(graph, filters);
      expect(result.visibleEdges.size).toBe(0);
      // Nodes should still be visible (orphans are dimmed, not hidden)
      expect(result.visibleNodes.size).toBe(4);
    });

    it('filters nodes by search query (node ID match)', () => {
      const filters = { searchQuery: 'Alice', sizeThreshold: 0, pruningIntensity: 0 };
      const result = computeVisibleSet(graph, filters);
      // Node ID 'A' doesn't match 'Alice', but description does
      expect(result.visibleNodes.has('A')).toBe(true);
      expect(result.visibleNodes.has('B')).toBe(true);
      // Charlie and Diana are not neighbors of matches
      expect(result.visibleNodes.has('C')).toBe(false);
      expect(result.visibleNodes.has('D')).toBe(false);
    });

    it('search query also matches wikipedia_title and description', () => {
      const g = new Graph();
      g.addNode('A', { label: 'Alice', wikipedia_title: 'Alice in Wonderland' });
      g.addNode('B', { label: 'Bob' });
      g.addDirectedEdge('A', 'B', { pmi: 1.0 });
      const filters = { searchQuery: 'wonderland', sizeThreshold: 0, pruningIntensity: 0 };
      const result = computeVisibleSet(g, filters);
      expect(result.visibleNodes.has('A')).toBe(true);
    });

    it('size threshold hides low-degree nodes', () => {
      const filters = { searchQuery: '', sizeThreshold: 2, pruningIntensity: 0 };
      const result = computeVisibleSet(graph, filters);
      // A has degree 1, B has degree 2, C has degree 2, D has degree 1
      expect(result.visibleNodes.has('A')).toBe(false);
      expect(result.visibleNodes.has('B')).toBe(true);
      expect(result.visibleNodes.has('C')).toBe(true);
      expect(result.visibleNodes.has('D')).toBe(false);
    });

    it('combined filters work together', () => {
      const filters = { searchQuery: 'bob', sizeThreshold: 1, pruningIntensity: 0 };
      const result = computeVisibleSet(graph, filters);
      // Bob matches (description 'Bob'), Alice is neighbor, Charlie is neighbor
      expect(result.visibleNodes.has('A')).toBe(true);
      expect(result.visibleNodes.has('B')).toBe(true);
      expect(result.visibleNodes.has('C')).toBe(true);
      // Diana is not a neighbor of Bob
      expect(result.visibleNodes.has('D')).toBe(false);
    });

    it('edges only visible if both endpoints are visible', () => {
      const filters = { searchQuery: 'alice', sizeThreshold: 0, pruningIntensity: 0 };
      const result = computeVisibleSet(graph, filters);
      // Alice and Bob are visible, but Charlie and Diana are not
      // So edges A->B should be visible, but B->C and C->D should not
      expect(result.visibleEdges.size).toBe(1);
    });
  });

  describe('buildNodeStats', () => {
    it('computes in/out degree within visible subgraph', () => {
      const filters = { searchQuery: '', sizeThreshold: 0, pruningIntensity: 0 };
      const visibleSet = computeVisibleSet(graph, filters);
      const stats = buildNodeStats(graph, visibleSet);
      const aStat = stats.find((s) => s.id === 'A')!;
      // A has 1 out-degree (A->B), 0 in-degree
      expect(aStat.outDegree).toBe(1);
      expect(aStat.inDegree).toBe(0);
    });

    it('excludes non-visible nodes from stats', () => {
      const filters = { searchQuery: 'alice', sizeThreshold: 0, pruningIntensity: 0 };
      const visibleSet = computeVisibleSet(graph, filters);
      const stats = buildNodeStats(graph, visibleSet);
      expect(stats.find((s) => s.id === 'C')).toBeUndefined();
    });

    it('includes community when present', () => {
      graph.setNodeAttribute('A', 'community', 1);
      graph.setNodeAttribute('B', 'community', 1);
      graph.setNodeAttribute('C', 'community', 2);
      graph.setNodeAttribute('D', 'community', 2);
      const filters = { searchQuery: '', sizeThreshold: 0, pruningIntensity: 0 };
      const visibleSet = computeVisibleSet(graph, filters);
      const stats = buildNodeStats(graph, visibleSet);
      expect(stats.find((s) => s.id === 'A')!.community).toBe(1);
      expect(stats.find((s) => s.id === 'C')!.community).toBe(2);
    });
  });

  describe('buildEdgeStats', () => {
    it('returns edge stats with PMI values', () => {
      const filters = { searchQuery: '', sizeThreshold: 0, pruningIntensity: 0 };
      const visibleSet = computeVisibleSet(graph, filters);
      const stats = buildEdgeStats(graph, visibleSet, null);
      expect(stats.length).toBe(3);
      const pmiValues = stats.map((s) => s.pmi);
      expect(pmiValues).toContain(5.0);
      expect(pmiValues).toContain(-1.0);
      expect(pmiValues).toContain(3.0);
    });

    it('includes chapter labels for book graphs', () => {
      const g = new Graph();
      g.addNode('A', { chapter_ids: [1, 2] });
      g.addNode('B', { chapter_ids: [2, 3] });
      g.addDirectedEdge('A', 'B', { pmi: 5.0 });
      const filters = { searchQuery: '', sizeThreshold: 0, pruningIntensity: 0 };
      const visibleSet = computeVisibleSet(g, filters);
      const chapters = [{ id: 1, label: 'Chapter 1' }, { id: 2, label: 'Chapter 2' }];
      const stats = buildEdgeStats(g, visibleSet, chapters);
      const edgeStat = stats.find((s) => s.from === 'A' && s.to === 'B')!;
      expect(edgeStat.chapters).toBe('Chapter 2');
    });
  });
});
