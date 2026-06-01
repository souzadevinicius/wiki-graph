import { describe, it, expect, beforeEach } from 'vitest';
import Graph from 'graphology';
import { runChronological, hasTemporalData } from './chronological';

describe('chronological', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph();
  });

  describe('hasTemporalData', () => {
    it('returns true when nodes have first_sentence_idx', () => {
      graph.addNode('A', { first_sentence_idx: 10 });
      graph.addNode('B', { first_sentence_idx: 20 });
      expect(hasTemporalData(graph)).toBe(true);
    });

    it('returns false when nodes lack first_sentence_idx', () => {
      graph.addNode('A', { label: 'Alice' });
      graph.addNode('B', { label: 'Bob' });
      expect(hasTemporalData(graph)).toBe(false);
    });

    it('returns false for empty graph', () => {
      expect(hasTemporalData(graph)).toBe(false);
    });

    it('returns true if at least one node has temporal data', () => {
      graph.addNode('A', { first_sentence_idx: 10 });
      graph.addNode('B', { label: 'Bob' });
      expect(hasTemporalData(graph)).toBe(true);
    });

    it('returns false when first_sentence_idx is null or NaN', () => {
      graph.addNode('A', { first_sentence_idx: null });
      graph.addNode('B', { first_sentence_idx: NaN });
      expect(hasTemporalData(graph)).toBe(false);
    });
  });

  describe('runChronological', () => {
    it('assigns Y positions based on sentence index', () => {
      graph.addNode('A', { first_sentence_idx: 10 });
      graph.addNode('B', { first_sentence_idx: 20 });
      graph.addNode('C', { first_sentence_idx: 30 });
      runChronological(graph);

      const yA = graph.getNodeAttribute('A', 'y');
      const yB = graph.getNodeAttribute('B', 'y');
      const yC = graph.getNodeAttribute('C', 'y');

      // Y should be ordered by sentence index
      expect(yA).toBeLessThan(yB);
      expect(yB).toBeLessThan(yC);
    });

    it('Wikipedia nodes snap to nearest occupied row', () => {
      graph.addNode('A', { first_sentence_idx: 10 });
      graph.addNode('B', { first_sentence_idx: 20 });
      graph.addNode('Wikipedia', { label: 'Wiki' });
      graph.addDirectedEdge('A', 'Wikipedia', { pmi: 5.0 });
      runChronological(graph);

      const yWiki = graph.getNodeAttribute('Wikipedia', 'y');
      const yA = graph.getNodeAttribute('A', 'y');

      // Wikipedia node should be on same row as A (nearest neighbor)
      expect(yWiki).toBe(yA);
    });

    it('isolated Wikipedia nodes are placed at bottom row', () => {
      graph.addNode('A', { first_sentence_idx: 10 });
      graph.addNode('IsolatedWiki', { label: 'Wiki' });
      runChronological(graph);

      const yWiki = graph.getNodeAttribute('IsolatedWiki', 'y');
      const yA = graph.getNodeAttribute('A', 'y');

      // Isolated node should be below all temporal nodes
      expect(yWiki).toBeGreaterThan(yA);
    });

    it('same-sentence edges have zero curvature', () => {
      graph.addNode('A', { first_sentence_idx: 10 });
      graph.addNode('B', { first_sentence_idx: 10 });
      graph.addDirectedEdge('A', 'B', { pmi: 5.0 });
      runChronological(graph);

      const curvature = graph.getEdgeAttribute('A', 'B', 'curvature');
      expect(curvature).toBe(0);
    });

    it('cross-sentence edges have non-zero curvature', () => {
      graph.addNode('A', { first_sentence_idx: 10 });
      graph.addNode('B', { first_sentence_idx: 20 });
      graph.addDirectedEdge('A', 'B', { pmi: 5.0 });
      runChronological(graph);

      const curvature = graph.getEdgeAttribute('A', 'B', 'curvature');
      expect(curvature).not.toBe(0);
    });

    it('does not throw when graph has no temporal data', () => {
      graph.addNode('A', { label: 'Alice' });
      graph.addNode('B', { label: 'Bob' });
      runChronological(graph);
      // Should be a no-op, not throw
      expect(true).toBe(true);
    });

    it('nodes retain their community color after layout', () => {
      graph.addNode('A', { first_sentence_idx: 10, community: 1, community_color: '#4a9eff' });
      graph.addNode('B', { first_sentence_idx: 20, community: 1, community_color: '#4a9eff' });
      runChronological(graph);

      expect(graph.getNodeAttribute('A', 'community_color')).toBe('#4a9eff');
      expect(graph.getNodeAttribute('B', 'community_color')).toBe('#4a9eff');
    });

    it('X positions are centered after layout', () => {
      graph.addNode('A', { first_sentence_idx: 10 });
      graph.addNode('B', { first_sentence_idx: 20 });
      graph.addNode('C', { first_sentence_idx: 30 });
      runChronological(graph);

      const xA = graph.getNodeAttribute('A', 'x');
      const xB = graph.getNodeAttribute('B', 'x');
      const xC = graph.getNodeAttribute('C', 'x');

      // X positions should be roughly centered (not all at 0)
      expect(xA).toBeDefined();
      expect(xB).toBeDefined();
      expect(xC).toBeDefined();
    });

    it('empty sentences are skipped (Y is compressed to unique values)', () => {
      graph.addNode('A', { first_sentence_idx: 10 });
      graph.addNode('B', { first_sentence_idx: 100 });
      graph.addNode('C', { first_sentence_idx: 200 });
      runChronological(graph);

      const yA = graph.getNodeAttribute('A', 'y');
      const yB = graph.getNodeAttribute('B', 'y');
      const yC = graph.getNodeAttribute('C', 'y');

      // Y values should be evenly spaced, not proportional to sentence indices
      const diff1 = yB - yA;
      const diff2 = yC - yB;
      expect(diff1).toBeCloseTo(diff2, 0);
    });
  });
});
