import { describe, it, expect, beforeEach } from 'vitest';
import { GraphologyAdapter } from './graphologyAdapter';

describe('GraphologyAdapter', () => {
  let graph: GraphologyAdapter;

  beforeEach(() => {
    graph = new GraphologyAdapter();
  });

  describe('addNode / getNode', () => {
    it('adds a node and retrieves it', () => {
      graph.addNode('A', { label: 'Test' });
      const node = graph.getNode('A');
      expect(node.id).toBe('A');
      expect(node.data.label).toBe('Test');
    });

    it('hasNode returns true for existing node', () => {
      graph.addNode('A');
      expect(graph.hasNode('A')).toBe(true);
    });

    it('hasNode returns false for non-existing node', () => {
      expect(graph.hasNode('A')).toBe(false);
    });

    it('getNodes returns all node IDs', () => {
      graph.addNode('A');
      graph.addNode('B');
      expect(graph.getNodes()).toContain('A');
      expect(graph.getNodes()).toContain('B');
    });

    it('getNodeCount returns correct count', () => {
      expect(graph.getNodeCount()).toBe(0);
      graph.addNode('A');
      expect(graph.getNodeCount()).toBe(1);
      graph.addNode('B');
      expect(graph.getNodeCount()).toBe(2);
    });

    it('forEachNode iterates over all nodes', () => {
      graph.addNode('A', { label: 'First' });
      graph.addNode('B', { label: 'Second' });

      const ids: string[] = [];
      graph.forEachNode((node) => ids.push(node.id));
      expect(ids).toHaveLength(2);
      expect(ids).toContain('A');
      expect(ids).toContain('B');
    });

    it('getDegree returns node degree', () => {
      graph.addNode('A');
      graph.addNode('B');
      graph.addLink('A', 'B', 1.0);
      expect(graph.getDegree('A')).toBe(1);
      expect(graph.getDegree('B')).toBe(1);
    });

    it('getNeighbors returns connected nodes', () => {
      graph.addNode('A');
      graph.addNode('B');
      graph.addLink('A', 'B', 1.0);
      expect(graph.getNeighbors('A')).toContain('B');
    });
  });

  describe('addLink', () => {
    it('adds a directed edge', () => {
      graph.addNode('A');
      graph.addNode('B');
      graph.addLink('A', 'B', 2.0, 5);
      expect(graph.getEdgeCount()).toBe(1);
    });

    it('prevents duplicate directed edges', () => {
      graph.addNode('A');
      graph.addNode('B');
      graph.addLink('A', 'B', 2.0);
      graph.addLink('A', 'B', 3.0);
      expect(graph.getEdgeCount()).toBe(1);
    });

    it('allows reverse direction', () => {
      graph.addNode('A');
      graph.addNode('B');
      graph.addLink('A', 'B', 2.0);
      graph.addLink('B', 'A', 3.0);
      expect(graph.getEdgeCount()).toBe(2);
    });

    it('hasLink returns true for existing edge', () => {
      graph.addNode('A');
      graph.addNode('B');
      graph.addLink('A', 'B', 1.0);
      expect(graph.hasLink('A', 'B')).toBe(true);
    });

    it('hasLink returns false for non-existing edge', () => {
      graph.addNode('A');
      graph.addNode('B');
      expect(graph.hasLink('A', 'B')).toBe(false);
    });

    it('stores PMI, weight, and context sentences', () => {
      graph.addNode('A');
      graph.addNode('B');
      graph.addLink('A', 'B', 2.5, 10, ['context sentence']);
      const inner = graph.getGraphology();
      const edgeAttrs = inner.getEdgeAttributes('A', 'B');
      expect(edgeAttrs.pmi).toBe(2.5);
      expect(edgeAttrs.weight).toBe(10);
      expect(edgeAttrs.context_sentences).toEqual(['context sentence']);
    });
  });

  describe('forEachLink', () => {
    it('iterates over all edges', () => {
      graph.addNode('A');
      graph.addNode('B');
      graph.addNode('C');
      graph.addLink('A', 'B', 1.0);
      graph.addLink('B', 'C', 2.0);

      const edges: Array<{ fromId: string; toId: string }> = [];
      graph.forEachLink((link) => edges.push({ fromId: link.fromId, toId: link.toId }));
      expect(edges).toHaveLength(2);
      expect(edges.some((e) => e.fromId === 'A' && e.toId === 'B')).toBe(true);
    });
  });

  describe('clear', () => {
    it('removes all nodes and edges', () => {
      graph.addNode('A');
      graph.addNode('B');
      graph.addLink('A', 'B', 1.0);
      graph.clear();
      expect(graph.getNodeCount()).toBe(0);
      expect(graph.getEdgeCount()).toBe(0);
    });

    it('resets fallback position counter', () => {
      graph.addNode('A');
      const firstX = graph.getNode('A').data.x;
      graph.clear();
      graph.addNode('B');
      const secondX = graph.getNode('B').data.x;
      // After clear, fallback position resets, so B gets the same position A would have
      expect(secondX).toBe(firstX);
    });
  });

  describe('fallback positions', () => {
    it('assigns deterministic spiral positions to nodes without x/y', () => {
      graph.addNode('A');
      graph.addNode('B');
      graph.addNode('C');

      const a = graph.getNode('A').data;
      const b = graph.getNode('B').data;
      const c = graph.getNode('C').data;

      expect(a.x).toBeDefined();
      expect(a.y).toBeDefined();
      // Each node should have a unique position
      expect(a.x).not.toBe(b.x);
    });

    it('preserves existing x/y positions', () => {
      graph.addNode('A', { x: 100, y: 200 });
      const node = graph.getNode('A');
      expect(node.data.x).toBe(100);
      expect(node.data.y).toBe(200);
    });
  });
});
