/**
 * Draws edges when node positions are known.
 * All edges drawn at full length immediately — no progressive animation.
 */
import svg from 'simplesvg';

export default function createLinkAnimator(graph, layout, edgeContainer) {
  const links = new Map();
  let maxDepth = graph.maxDepth;

  // Create arrowhead marker once — shared across all edges
  const defs = svg('defs');
  const marker = svg('marker', {
    id: 'arrowhead',
    markerWidth: 8,
    markerHeight: 6,
    refX: 10,
    refY: 3,
    orient: 'auto'
  });
  const polygon = svg('polygon', {
    points: '0 0, 8 3, 0 6',
    fill: 'inherit'
  });
  marker.appendChild(polygon);
  defs.appendChild(marker);
  edgeContainer.appendChild(defs);

  graph.forEachLink(drawLink);

  return {
    getLinkInfo,
    updatePositions,
    addLink,
    dispose
  }

  function dispose() {
    // nothing to cancel — all edges drawn instantly
  }

  function getLinkInfo(linkId) {
    return links.get(linkId);
  }

  function addLink(link) {
    if (links.has(link.id)) return;
    drawLink(link);
  }

  function getLinkScore(link) {
    let fromNode = graph.getNode(link.fromId).data;
    let toNode = graph.getNode(link.toId).data;
    const depth = (fromNode.depth + toNode.depth) / 2;
    return (maxDepth - depth) / maxDepth;
  }

  function drawLink(link) {
    let from = layout.getNodePosition(link.fromId);
    let to = layout.getNodePosition(link.toId);

    const dRatio = getLinkScore(link);
    const strokeWidth = 8 * dRatio + 2;

    // Use expansion color if either endpoint has one
    let strokeColor;
    const fromNode = graph.getNode(link.fromId);
    const toNode = graph.getNode(link.toId);
    const expansionColor = fromNode?.data?.expansionColor || toNode?.data?.expansionColor;
    if (expansionColor) {
      strokeColor = expansionColor;
    } else {
      const color = Math.round((160 - 100) * (1 - dRatio) + 100);
      strokeColor = `rgb(${color}, ${color}, ${color})`;
    }

    const pathData = `M${from.x},${from.y} L${to.x},${to.y}`;
    const ui = svg('path', {
      class: 'link-ui',
      id: link.id,
      'stroke-width': strokeWidth,
      fill: 'none',
      stroke: strokeColor,
      'marker-end': 'url(#arrowhead)',
      d: pathData
    });

    edgeContainer.appendChild(ui);
    links.set(link.id, { ui, link });
  }

  function updatePositions() {
    links.forEach(({ ui, link }) => {
      let from = layout.getNodePosition(link.fromId);
      let to = layout.getNodePosition(link.toId);
      ui.attr('d', `M${from.x},${from.y} L${to.x},${to.y}`);
    });
  }
}
