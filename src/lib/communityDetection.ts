import louvain from 'graphology-communities-louvain';
import type Graph from 'graphology';

// Fixed color palette (d3 category10 style)
const COMMUNITY_COLORS = [
  '#4a9eff', // blue
  '#ff6b6b', // red
  '#51cf66', // green
  '#fcc419', // yellow
  '#cc5de8', // purple
  '#ff922b', // orange
  '#20c997', // teal
  '#f06595', // pink
  '#748ffc', // indigo
  '#12b886', // emerald
  '#e599f7', // lavender
  '#ff8787', // coral
  '#74c0fc', // sky
  '#63e6be', // mint
  '#ffa94d', // amber
];

export interface CommunityResult {
  communities: Map<string, number>;
  nodeColors: Map<string, string>;
}

/**
 * Detect communities using Louvain algorithm and assign colors.
 * Sets 'community' and 'community_color' attributes on each node.
 */
export function detectCommunities(graph: Graph): CommunityResult {
  // Assign community attribute
  louvain.assign(graph);

  const nodeColors = new Map<string, string>();
  const communityToColor = new Map<number, string>();
  const communities = new Map<string, number>();

  graph.forEachNode((nodeId, attributes) => {
    const community = attributes.community as number;
    if (community === undefined) return;

    communities.set(nodeId, community);

    if (!communityToColor.has(community)) {
      const colorIndex = communityToColor.size % COMMUNITY_COLORS.length;
      communityToColor.set(community, COMMUNITY_COLORS[colorIndex]);
    }

    const color = communityToColor.get(community)!;
    graph.setNodeAttribute(nodeId, 'community_color', color);
    nodeColors.set(nodeId, color);
  });

  return {
    communities,
    nodeColors,
  };
}

/**
 * Check if graph has community data (from backend or previous detection).
 */
export function hasCommunityData(graph: Graph): boolean {
  let hasCommunity = false;
  graph.forEachNode((_nodeId, attributes) => {
    if (attributes.community !== undefined) {
      hasCommunity = true;
    }
  });
  return hasCommunity;
}
