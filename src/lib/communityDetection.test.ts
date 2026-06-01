import { describe, it, expect, beforeEach } from 'vitest';
import Graph from 'graphology';
import { hasCommunityData, getCommunitySummaries, detectCommunities } from './communityDetection';

describe('communityDetection', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph();
  });

  describe('hasCommunityData', () => {
    it('returns true when nodes have community attribute', () => {
      graph.addNode('A', { community: 1 });
      graph.addNode('B', { community: 1 });
      graph.addNode('C', { community: 2 });
      expect(hasCommunityData(graph)).toBe(true);
    });

    it('returns false when nodes lack community attribute', () => {
      graph.addNode('A', { label: 'Alice' });
      graph.addNode('B', { label: 'Bob' });
      expect(hasCommunityData(graph)).toBe(false);
    });

    it('returns false for empty graph', () => {
      expect(hasCommunityData(graph)).toBe(false);
    });
  });

  describe('getCommunitySummaries', () => {
    it('groups nodes by community', () => {
      graph.addNode('A', { community: 1, community_color: '#4a9eff' });
      graph.addNode('B', { community: 1, community_color: '#4a9eff' });
      graph.addNode('C', { community: 2, community_color: '#ff6b6b' });
      const summaries = getCommunitySummaries(graph);
      expect(summaries.length).toBe(2);
    });

    it('includes node count per community', () => {
      graph.addNode('A', { community: 1, community_color: '#4a9eff' });
      graph.addNode('B', { community: 1, community_color: '#4a9eff' });
      graph.addNode('C', { community: 1, community_color: '#4a9eff' });
      graph.addNode('D', { community: 2, community_color: '#ff6b6b' });
      const summaries = getCommunitySummaries(graph);
      const comm1 = summaries.find((s) => s.id === 1)!;
      expect(comm1.nodeCount).toBe(3);
    });

    it('includes node IDs per community', () => {
      graph.addNode('A', { community: 1, community_color: '#4a9eff' });
      graph.addNode('B', { community: 1, community_color: '#4a9eff' });
      const summaries = getCommunitySummaries(graph);
      const comm1 = summaries.find((s) => s.id === 1)!;
      expect(comm1.nodeIds).toContain('A');
      expect(comm1.nodeIds).toContain('B');
    });

    it('uses community_color from node attributes', () => {
      graph.addNode('A', { community: 1, community_color: '#4a9eff' });
      const summaries = getCommunitySummaries(graph);
      expect(summaries[0].color).toBe('#4a9eff');
    });

    it('assigns default color when community_color is missing', () => {
      graph.addNode('A', { community: 1 });
      const summaries = getCommunitySummaries(graph);
      expect(summaries[0].color).toBe('#4a9eff'); // Default fallback
    });

    it('sorts communities by node count descending', () => {
      graph.addNode('A', { community: 1, community_color: '#4a9eff' });
      graph.addNode('B', { community: 1, community_color: '#4a9eff' });
      graph.addNode('C', { community: 2, community_color: '#ff6b6b' });
      const summaries = getCommunitySummaries(graph);
      expect(summaries[0].id).toBe(1); // Larger community first
    });
  });

  describe('detectCommunities', () => {
    it('assigns community colors from palette', () => {
      const g = new Graph({ directed: false });
      g.addNode('A', { community: 0 });
      g.addNode('B', { community: 0 });
      g.addNode('C', { community: 1 });
      g.addNode('D', { community: 1 });
      g.addUndirectedEdge('A', 'B');
      g.addUndirectedEdge('C', 'D');
      const result = detectCommunities(g);
      // Colors should be assigned
      expect(result.nodeColors.has('A')).toBe(true);
      expect(result.nodeColors.has('C')).toBe(true);
      // Different communities should have different colors
      expect(result.nodeColors.get('A')).not.toBe(result.nodeColors.get('C'));
    });

    it('cycles through palette when exceeding community count', () => {
      const g = new Graph({ directed: false });
      g.addNode('A', { community: 0 });
      g.addNode('B', { community: 1 });
      g.addNode('C', { community: 2 });
      g.addNode('D', { community: 3 });
      g.addNode('E', { community: 4 });
      g.addNode('F', { community: 5 });
      g.addNode('G', { community: 6 });
      g.addNode('H', { community: 7 });
      g.addNode('I', { community: 8 });
      g.addNode('J', { community: 9 });
      g.addNode('K', { community: 10 });
      g.addNode('L', { community: 11 });
      g.addNode('M', { community: 12 });
      g.addNode('N', { community: 13 });
      g.addNode('O', { community: 14 });
      g.addNode('P', { community: 15 }); // This should wrap around
      g.addUndirectedEdge('A', 'B');
      g.addUndirectedEdge('C', 'D');
      g.addUndirectedEdge('E', 'F');
      g.addUndirectedEdge('G', 'H');
      g.addUndirectedEdge('I', 'J');
      g.addUndirectedEdge('K', 'L');
      g.addUndirectedEdge('M', 'N');
      g.addUndirectedEdge('O', 'P');
      const result = detectCommunities(g);
      // All nodes should have colors assigned
      expect(result.nodeColors.size).toBe(16);
    });

    it('sets community_color attribute on graph nodes', () => {
      const g = new Graph({ directed: false });
      g.addNode('A', { community: 1 });
      g.addNode('B', { community: 1 });
      g.addUndirectedEdge('A', 'B');
      detectCommunities(g);
      expect(g.getNodeAttribute('A', 'community_color')).toBeDefined();
      expect(g.getNodeAttribute('B', 'community_color')).toBeDefined();
    });

    it('returns communities map with node-to-community mapping', () => {
      const g = new Graph({ directed: false });
      g.addNode('A', { community: 1 });
      g.addNode('B', { community: 2 });
      g.addUndirectedEdge('A', 'B');
      const result = detectCommunities(g);
      // Louvain may reassign communities, but both nodes should have communities
      expect(result.communities.has('A')).toBe(true);
      expect(result.communities.has('B')).toBe(true);
    });
  });
});
