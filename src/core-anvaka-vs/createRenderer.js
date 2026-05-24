/**
 * The core of the rendering process
 */
import createPanZoom from "panzoom";
import createTextMeasure from "./measureText";
import createAggregateLayout from "./aggregateLayout";
import bus from "./bus";
import createLinkAnimator from "./renderer/linkAnimator";
import buildLinkIndex from "./buildLinkIndex";

import svg from "simplesvg";

/**
 * Creates a new renderer. The rendering is done with SVG.
 */
export default function createRenderer(progress, isMobile, getText, afterAddNodeHook, physicsConfig = {}) {
  const scene = document.querySelector("#scene");
  const nodeContainer = scene.querySelector("#nodes");
  const edgeContainer = scene.querySelector("#edges");
  const hideTooltipArgs = { isVisible: false };
  const svgEl = document.querySelector("svg");
  const pt = svgEl.createSVGPoint();

  const panzoom = createPanZoom(scene, {
    // https://github.com/anvaka/panzoom/issues/12#issuecomment-373251144
    onTouch(e) {
      // console.log("🚀 | onTouch | e", e);
      // tells the library to not preventDefault
      return false;
    },
  });
  const defaultRectangle = { left: -1750, right: 1750, top: -1750, bottom: 1750 };
  panzoom.showRectangle(defaultRectangle);

  // maps node id to node ui
  let nodes = new Map();

  // Track all pending click timers for cleanup on graph replacement
  let allClickTimers = new Set();

  let linkIndex;
  let layout,
    graph,
    currentLayoutFrame = 0,
    linkAnimator;
  let textMeasure = createTextMeasure(scene);
  bus.on("graph-ready", onGraphReady);

  return {
    render,
    dispose,
    setLayout,
    reLayout
  };

  function dispose() {
    clearLastScene();
    bus.off("graph-ready", onGraphReady);
  }

  function onMouseMove(e) {
    let link = findLinkInfoFromEvent(e);
    if (link) {
      showTooltip(link, e.clientX, e.clientY);
    } else {
      hideTooltip();
    }
  }

  function getNearestLink(x, y) {
    if (!linkIndex) return;

    pt.x = x;
    pt.y = y;
    let svgP = pt.matrixTransform(scene.getScreenCTM().inverse());
    let link = linkIndex.findNearestLink(svgP.x, svgP.y, 30);
    if (link) return link.id;
  }

  function onSceneClick(e) {
    console.log("🚀 | onSceneClick | e", e);

    // removeHighlight()

    // // hiding the suggestion dropdown
    // svgEl.focus();

    // // hiding the tooltip
    // onLeaveNode(e);

    // let info = findLinkInfoFromEvent(e);
    // if (info) {
    //   bus.fire("show-details", info.link);
    // }
  }

  function findLinkInfoFromEvent(e) {
    const id = e.target && e.target.id;
    let linkInfo = linkAnimator.getLinkInfo(id);
    if (!linkInfo) {
      let linkId = getNearestLink(e.clientX, e.clientY);
      linkInfo = linkAnimator.getLinkInfo(linkId);
    }
    return linkInfo;
  }

  function showTooltip(minLink, clientX, clientY) {
    const { fromId, toId } = minLink.link;
    bus.fire("show-tooltip", {
      isVisible: true,
      from: fromId,
      to: toId,
      x: clientX,
      y: clientY,
    });

    removeHighlight();

    nodes.get(fromId).classList.add("hovered");
    nodes.get(toId).classList.add("hovered");
    minLink.ui.classList.add("hovered");
  }

  function hideTooltip() {
    bus.fire("show-tooltip", hideTooltipArgs);
    removeHighlight();
  }

  function removeHighlight() {
    scene.querySelectorAll(".hovered").forEach(removeHoverClass);
  }

  function removeHoverClass(el) {
    el.classList.remove("hovered");
  }

  function render(newGraph) {
    clearLastScene();
    graph = newGraph;

    layout = createAggregateLayout(graph, progress, physicsConfig);

    nodes = new Map();

    graph.forEachNode(addNode);
    graph.on("changed", onGraphStructureChanged);

    // Draw edges immediately — don't wait for layout "ready"
    drawLinks();

    cancelAnimationFrame(currentLayoutFrame);
    currentLayoutFrame = requestAnimationFrame(frame);
  }

  function onGraphReady(readyGraph) {
    if (readyGraph === graph) {
      layout.setGraphReady();
      progress.startLayout();
    }
  }

  function frame() {
    if (layout.step()) {
      currentLayoutFrame = requestAnimationFrame(frame);
    }
    updatePositions();
  }

  function onGraphStructureChanged(changes) {
    changes.forEach((change) => {
      if (change.changeType === "add" && change.node) {
        addNode(change.node);
      }
      if (change.changeType === "add" && change.link) {
        addLink(change.link);
      }
    });
  }

  function drawLinks() {
    if (linkAnimator) return; // already drawn
    linkAnimator = createLinkAnimator(graph, layout, edgeContainer);

    // document.addEventListener('mousemove', onMouseMove);
    // svgEl.addEventListener("click", onSceneClick);
    svgEl.addEventListener("pointerup", onSceneClick);

    // let radius = 42;
    // linkIndex = buildLinkIndex(graph, layout, radius);
    // let points = linkIndex.getPoints();
    // points.forEach(point => {
    //   scene.appendChild(svg('circle', {
    //     cx: point.x,
    //     cy: point.y,
    //     r: radius,
    //     fill: 'transparent',
    //   }))
    // })
  }

  function clearLastScene() {
    // Clear all pending click timers
    allClickTimers.forEach(timer => clearTimeout(timer));
    allClickTimers.clear();

    clear(nodeContainer);
    clear(edgeContainer);

    // document.removeEventListener("mousemove", onMouseMove);
    // svgEl.removeEventListener("click", onSceneClick);
    svgEl.removeEventListener("pointerup", onSceneClick);

    if (layout) layout.off("ready", drawLinks);
    if (graph) graph.off("changed", onGraphStructureChanged);
    if (linkAnimator) linkAnimator.dispose();
  }

  function setLayout(config) {
    if (layout) layout.setLayout(config);
  }

  function reLayout(config) {
    if (layout) {
      layout.reLayout(config);
      progress.startLayout();
      cancelAnimationFrame(currentLayoutFrame);
      currentLayoutFrame = requestAnimationFrame(frame);
    }
  }

  function clear(el) {
    while (el.lastChild) {
      el.removeChild(el.lastChild);
    }
  }

  function addLink(link) {
    if (linkAnimator) {
      linkAnimator.addLink(link);
    }
  }

  function addNode(node) {
    const maxDepth = graph.maxDepth || 0;
    const dRatio = maxDepth > 0 ? (maxDepth - node.data.depth) / maxDepth : 1;
    const expansionColor = node.data.expansionColor || null;
    let pos = getNodePosition(node.id);
    if (node.data.depth === 0 && maxDepth > 0) {
      layout.pinNode(node);
    }

    const uiAttributes = getNodeUIAttributes(node.id, dRatio);
    layout.addNode(node.id, uiAttributes);

const rectAttributes = {
      cx: 0,
      cy: 0,
      r: uiAttributes.width / 2,
      fill: "white",
      stroke: expansionColor || "#58585A",
      strokeWidth: uiAttributes.strokeWidth,
    };

    const textAttributes = {
      "font-size": uiAttributes.fontSize,
      "text-anchor": "middle", // Built-in SVG alignment
      x: 0,
      y: uiAttributes.py,
    };

    const rect = svg("circle", rectAttributes);
    const text = svg("text", textAttributes);
    // text.text(' ' || node.id);
    text.text(getText(node));

    const ui = svg("g", {
      transform: `translate(${pos.x}, ${pos.y})`,
    });
    ui.appendChild(rect);
    ui.appendChild(text);

    nodeContainer.appendChild(ui);
    nodes.set(node.id, ui);

    if (afterAddNodeHook instanceof Function) {
      afterAddNodeHook(node, ui, text)
    }

    // --------------------- listeners ----------------------
    let moved;
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    let moveListener = (e) => {
      if (isDragging) {
        // Convert screen coords to scene space
        pt.x = e.clientX;
        pt.y = e.clientY;
        let sceneP = pt.matrixTransform(scene.getScreenCTM().inverse());
        let newX = sceneP.x - dragOffset.x;
        let newY = sceneP.y - dragOffset.y;
        layout.setNodePosition(node.id, newX, newY);

        // Update edges connected to this node in real-time
        if (linkAnimator && node.links) {
          node.links.forEach((link) => {
            let linkInfo = linkAnimator.getLinkInfo(link.id);
            if (linkInfo) {
              let fromPos = layout.getNodePosition(link.fromId);
              let toPos = layout.getNodePosition(link.toId);
              linkInfo.ui.attr('d', `M${fromPos.x},${fromPos.y} L${toPos.x},${toPos.y}`);
            }
          });
        }
      } else if (moved) {
        // First move sets moved=true; second move starts actual dragging
        isDragging = true;
      } else {
        moved = true;
      }
    };

    /** Tracks clicks for double-click detection. */
    let clickTracker = {
      count: 0,
      timer: null,
      pendingAction: null,
    };

    /** The `flag` shows if there was a tap within `timeout` ms. */
    let wasTap = {
      flag: false,
      timeout: 500,
      timer: null,
    };

    let longTap = {
      expect: false,
      timeout: 300,
      timer: null,
    };

    let downListener = (e) => {
      moved = false;
      isDragging = false;

      // long tap timer
      if (e.pointerType === "touch") {
        clearTimeout(longTap.timer);
        longTap.expect = false;
        longTap.timer = setTimeout(
          () => (longTap.expect = true),
          longTap.timeout
        );
      }

      // Capture pointer for drag (tracks movement outside the node)
      ui.setPointerCapture(e.pointerId);

      // Prevent panzoom from panning while we drag a node
      e.stopPropagation();

      // Record initial offset so the node doesn't jump to cursor center
      pt.x = e.clientX;
      pt.y = e.clientY;
      let sceneP = pt.matrixTransform(scene.getScreenCTM().inverse());
      let nodePos = getNodePosition(node.id);
      dragOffset.x = sceneP.x - nodePos.x;
      dragOffset.y = sceneP.y - nodePos.y;

      // Pin the node (remove from simulation) so we can drag it freely
      layout.pinNode(node);
      ui.style.cursor = 'grabbing';

      ui.addEventListener("pointermove", moveListener);
    };
    let upListener = (e) => {
      // Release pointer capture
      try { ui.releasePointerCapture(e.pointerId); } catch(_) {}

      // If we actually dragged or moved, unpin and skip click handling
      if (isDragging || moved) {
        layout.unpinNode(node);
        ui.style.cursor = 'pointer';
        isDragging = false;
        moved = false;
        ui.removeEventListener("pointermove", moveListener);
        return;
      }

      // No movement — treat as click
      clickTracker.count += 1;
      if (clickTracker.count === 1) {
        const timer = setTimeout(() => {
          allClickTimers.delete(timer);
          if (clickTracker.pendingAction) clickTracker.pendingAction();
          clickTracker.count = 0;
          clickTracker.pendingAction = null;
        }, 300);
        allClickTimers.add(timer);
        clickTracker.timer = timer;
        clickTracker.pendingAction = () => onNodeClick(e, node, ui, text);
      } else if (clickTracker.count === 2) {
        clearTimeout(clickTracker.timer);
        allClickTimers.delete(clickTracker.timer);
        clickTracker.count = 0;
        clickTracker.pendingAction = null;
        onNodeDoubleClick(e, node, ui, text);
      }

      // on touch screens: fire onEnterNode to show tooltip
      if (e.pointerType === "touch") {
        if (wasTap.flag) {
          onNodeClick(e, node, ui, text);
          wasTap.flag = false;
          clearTimeout(wasTap.timer);
        } else {
          wasTap.flag = true;
          wasTap.timer = setTimeout(
            () => (wasTap.flag = false),
            wasTap.timeout
          );
        }

        // long tap => right-click
        if (longTap.expect) {
          onLeaveNode(e, null);
          bus.fire("node-click-right", { node });
        }

        if (longTap.expect) {
          clearTimeout(clickTracker.timer);
          allClickTimers.delete(clickTracker.timer);
          clickTracker.count = 0;
          clickTracker.pendingAction = null;
        }

        e.stopPropagation();
      }

      ui.removeEventListener("pointermove", moveListener);
    };

    // click
    // ui.addEventListener("mousedown", downListener);
    // ui.addEventListener("mouseup", upListener);

    // ui.addEventListener("touchstart", downListener);
    // ui.addEventListener("touchend", upListener);

    ui.addEventListener("pointerdown", downListener);
    ui.addEventListener("pointerup", upListener);

    // right click
    if (!isMobile) {
      ui.addEventListener("contextmenu", (e) => {
        // console.log("[RightClick] event:", e);

        if (e.button == 2) {
          e.preventDefault();
          bus.fire("node-click-right", { node });
        }
      });
    }

    // enter, leave
    ui.addEventListener("mouseenter", (e) => {
      // cancel on drag
      if (moved) return;

      onEnterNode(e, node, isMobile);
    });
    ui.addEventListener("mouseleave", (e) => onLeaveNode(e, node));
  }

  function onNodeClick(e, node, ui, text) {
    // console.log("🚀 ~ onNodeClick ~ e, node", e, node);
    bus.fire("show-details-node", { node, ui, text });
  }


  function onNodeDoubleClick(e, node, ui, text) {
    // console.log("🚀 ~ onNodeClick ~ e, node", e, node);
    bus.fire("show-iframe-node", { node, ui, text });
    bus.fire("node-double-click", { node });
  }

  function onLeaveNode(e, node) {
    // console.log("🚀 ~ onLeaveNode ~ node", node);
    removeHighlight();

    // tooltip
    bus.fire("show-tooltip-node", { node: null });
  }

  function onEnterNode(e, node, isTouch = false) {
    // console.log("🚀 ~ onHoverNode ~ e", e.target);
    // console.log("🚀 ~ onHoverNode ~ node", node);
    removeHighlight();

    const el = e.target;
    addHoveredClass(el);

    if (node.links?.length) {
      node.links.forEach((link) => {
        // console.log("🚀 ~ onHoverNode ~ link", link);
        const linkObj = linkAnimator?.getLinkInfo(link.id);
        addHoveredClass(linkObj?.ui);

        const linkedId = link.fromId !== node.id ? link.fromId : link.toId;
        const linkedNode = nodes.get(linkedId);
        addHoveredClass(linkedNode);
      });
    }

    function addHoveredClass(htmlEl) {
      htmlEl?.classList?.add("hovered");
    }

    // tooltip
    bus.fire("show-tooltip-node", {
      node,
      x: !isTouch ? e.clientX : undefined,
      y: !isTouch ? e.clientY : undefined,
    });
  }

function getNodeUIAttributes(nodeId, dRatio) {
    const fontSize = 10 * dRatio + 10;
    const size = textMeasure(nodeId, fontSize);
    
    const padding = 6;
    const diameter = size.totalWidth + padding * 2;

    return {
      fontSize,
      width: diameter,
      height: diameter, // Form a true square boundary box for the circle
      x: -diameter / 2,
      y: -diameter / 2,
      rx: diameter / 2,
      ry: diameter / 2,
      px: -size.totalWidth / 2, // Center the text beautifully
      py: fontSize * 0.35,      // Adjust vertically to center alignment baseline
      strokeWidth: 2 * dRatio + 1,
    };
  }

  function updatePositions() {
    nodes.forEach((ui, nodeId) => {
      let pos = getNodePosition(nodeId);
      ui.attr("transform", `translate(${pos.x}, ${pos.y})`);
    });
    if (linkAnimator) linkAnimator.updatePositions();
  }

  function getNodePosition(nodeId) {
    return layout.getNodePosition(nodeId);
  }
}
