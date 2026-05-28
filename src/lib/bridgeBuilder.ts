import { GraphologyAdapter } from './graphologyAdapter';

const BRIDGE_CAP = 10;

/**
 * Fetch outgoing Wikipedia links for a page using the action API.
 * Returns an array of title strings.
 */
async function fetchOutgoingLinks(title: string, lang: string): Promise<string[]> {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=links&pllimit=500&plnamespace=0&format=json&origin=*`;
  const response = await fetch(url);
  const data = await response.json();
  if (!data.query?.pages) return [];
  const page = Object.values(data.query.pages)[0] as any;
  return page?.links?.map((l: any) => l.title) || [];
}

/**
 * Fetch outgoing links for newly added nodes and create bridge edges
 * to nodes that already exist in the graph.
 *
 * Strategy:
 * - Prioritize new nodes with higher degree in the graph (they're likely bridges)
 * - Cap at BRIDGE_CAP to avoid hammering the API
 */
export async function fetchBridgeEdges(
  newNodeIds: string[],
  graph: GraphologyAdapter,
  lang: string,
): Promise<number> {
  if (newNodeIds.length === 0) return 0;

  const existingIds = new Set(graph.getNodes());

  // Prioritize: new nodes with higher degree in graph (more connected = more likely to bridge)
  const prioritized = newNodeIds
    .map((id) => ({ id, degree: graph.getDegree(id) }))
    .sort((a, b) => b.degree - a.degree)
    .map((x) => x.id);

  const toCheck = prioritized.slice(0, BRIDGE_CAP);
  let bridges = 0;

  const results = await Promise.all(
    toCheck.map(async (title) => {
      const outgoing = await fetchOutgoingLinks(title, lang);
      const bridgeTargets = outgoing.filter((t) => existingIds.has(t) && t !== title);
      return { title, bridges: bridgeTargets };
    })
  );

  for (const { title, bridges: bridgeTargets } of results) {
    for (const target of bridgeTargets) {
      if (!graph.hasLink(title, target)) {
        graph.addLink(title, target);
        bridges++;
      }
    }
  }

  return bridges;
}
