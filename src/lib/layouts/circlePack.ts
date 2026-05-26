import type Graph from 'graphology';
import * as d3Hierarchy from 'd3-hierarchy';

/**
 * CirclePack layout: clusters nodes by community into nested circles.
 * Uses d3-hierarchy to compute the layout, then applies positions to graph nodes.
 *
 * Requirements:
 * - Nodes must have 'community' attribute (from Louvain detection)
 * - Nodes should have 'mass' or 'degree' for sizing
 */
export interface CirclePackOptions {
  padding?: number;
  radius?: number;
}

/**
 * Run CirclePack layout on a graphology graph.
 * Nodes are clustered by community and arranged in circular clusters.
 */
export function runCirclePack(
  graph: Graph,
  options: CirclePackOptions = {}
): void {
  const { padding = 5, radius = 500 } = options;

  // Group nodes by community
  const communityGroups = new Map<number, string[]>();
  const nodeMasses = new Map<string, number>();

  graph.forEachNode((nodeId, attributes) => {
    const community = attributes.community as number;
    if (community === undefined) return;

    if (!communityGroups.has(community)) {
      communityGroups.set(community, []);
    }
    communityGroups.get(community)!.push(nodeId);

    // Use mass, mentions, or degree as weight
    const mass = attributes.mass
      || attributes.mentions?.length
      || graph.degree(nodeId)
      || 1;
    nodeMasses.set(nodeId, mass as number);
  });

  // Build hierarchy data
  const children: any[] = [];
  let totalValue = 0;

  communityGroups.forEach((nodeIds, community) => {
    const communityValue = nodeIds.reduce(
      (sum, id) => sum + (nodeMasses.get(id) || 1),
      0
    );
    totalValue += communityValue;

    children.push({
      name: `community_${community}`,
      value: communityValue,
      nodeIds,
    });
  });

  const rootData: any = {
    name: 'root',
    value: totalValue,
    children,
  };

  // Compute layout using d3-hierarchy
  const root: any = d3Hierarchy
    .hierarchy(rootData)
    .sum((d: any) => d.value)
    .sort((a: any, b: any) => b.value - a.value);

  const pack: any = (d3Hierarchy as any)
    .pack()
    .radius(radius)
    .padding(padding);

  const packed: any = pack(root);

  // Calculate center of each community
  const communityCenters = new Map<number, { x: number; y: number; r: number }>();

  packed.each((d: any) => {
    if (d.data.nodeIds && d.data.nodeIds.length > 0) {
      const community = parseInt(d.data.name.split('_')[1]);
      communityCenters.set(community, {
        x: d.x || 0,
        y: d.y || 0,
        r: d.r || 100,
      });
    }
  });

  // Apply positions to nodes
  communityGroups.forEach((nodeIds, community) => {
    const center = communityCenters.get(community);
    if (!center) return;

    // Distribute nodes within community circle
    const count = nodeIds.length;
    const nodeRadius = Math.sqrt(center.r * center.r / count);

    nodeIds.forEach((nodeId, i) => {
      // Spiral distribution within circle
      const angle = (i * 2.4) % (2 * Math.PI);
      const dist = Math.min(
        Math.sqrt((i + 1) / count) * (center.r - nodeRadius),
        center.r - nodeRadius
      );

      const x = center.x + Math.cos(angle) * dist;
      const y = center.y + Math.sin(angle) * dist;

      graph.setNodeAttribute(nodeId, 'x', x);
      graph.setNodeAttribute(nodeId, 'y', y);
    });
  });
}
