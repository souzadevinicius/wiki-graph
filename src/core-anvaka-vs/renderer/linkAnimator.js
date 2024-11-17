/**
 * This file is responsible for animating edges when nodes positions are known.
 */
import ngRandom from 'ngraph.random'
import svg from 'simplesvg';
let random = ngRandom(42);

export default function createLinkAnimator(graph, layout, edgeContainer) {
  const links = new Map();
  let beingAnimated = new Map();
  const scheduled = [];
  let maxAnimations = 20;
  let maxDepth = graph.maxDepth;
  graph.forEachLink(scheduleLink);
  scheduled.sort((a, b) => {
    return getLinkScore(a) - getLinkScore(b)
  })
  let processor = requestAnimationFrame(processNext);

  return {
    getLinkInfo,
    dispose
  }

  function dispose() {
    if (processor) {
      cancelAnimationFrame(processor);
      processor = null;
    }
  }

  function processNext() {
    while (beingAnimated.size < maxAnimations && scheduled.length > 0) {
      let link = scheduled.pop()
      let speed = Math.round(Math.abs(random.gaussian() * 10)) + 1
      beingAnimated.set(link.id, animateLink(link, speed));
    }

    beingAnimated.forEach(function (el, key) {
      el.step();
      if (el.isDone) beingAnimated.delete(key);
    });
    if (scheduled.length > 0 || beingAnimated.size > 0) {
      processor = requestAnimationFrame(processNext);
    }
  }

  function getLinkInfo(linkId) {
    return links.get(linkId);
  }

  function getLinkScore(link) {
    let fromNode = graph.getNode(link.fromId).data;
    let toNode = graph.getNode(link.toId).data;
    const depth = (fromNode.depth + toNode.depth) / 2;
    return (maxDepth - depth) / maxDepth;
  }

  function scheduleLink(link) {
    scheduled.push(link);
  }

  function animateLink(link, maxT) {
    var frame = 0;
    let from = layout.getNodePosition(link.fromId);
    let to = layout.getNodePosition(link.toId);

    const dRatio = getLinkScore(link)
    const strokeWidth = 8 * dRatio + 2;
    const color = Math.round((200 - 75) * (1 - dRatio) + 75);

    let api = {
      step,
      isDone: false
    }
    return api;

    
    function step() {
      const defs = svg('defs');
      const marker = svg('marker', {
        id: 'arrowhead',
        markerWidth: 8,    // Reduced from 15 to 8
        markerHeight: 6,   // Reduced from 7 to 6
        refX: 10,           // Adjusted to match the new markerWidth
        refY: 3,           // Adjusted to half of the new markerHeight
        orient: 'auto'
      });
      const polygon = svg('polygon', {
        points: '0 0, 8 3, 0 6',  // Adjusted to match new dimensions
        fill: 'inherit'  // This allows the arrowhead to match the path color
      });
      let t = ease(frame / maxT);
      let x = from.x * (1 - t) + to.x * t;
      let y = from.y * (1 - t) + to.y * t;
      let linkInfo = links.get(link.id);
      let pathData = `M${from.x},${from.y} L${x},${y}`;
      if (!linkInfo) {
        const ui = svg('path', {
          class: 'link-ui',
          id: link.id,
          'stroke-width': strokeWidth,
          fill: 'black',
          stroke: `rgb(${color}, ${color}, ${color})`,
          "marker-end":"url(#arrowhead)",
          d: pathData
        });
        
        marker.appendChild(polygon);
        defs.appendChild(marker);
        edgeContainer.appendChild(defs);
        edgeContainer.appendChild(ui);

        links.set(link.id, { ui, link });
      } else {
        linkInfo.ui.attr('d', pathData);
      }
      frame += 1;
      if (frame > maxT) {
        api.isDone = true;
      }
    }
  }
}

function ease(t) {
  return t * (2 - t);
}