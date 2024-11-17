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
export default function createRenderer(progress, isMobile, getText, afterAddNodeHook) {
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

    layout = createAggregateLayout(graph, progress);

    layout.on("ready", drawLinks);

    nodes = new Map();

    graph.forEachNode(addNode);
    graph.on("changed", onGraphStructureChanged);

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
    });
  }

  function drawLinks() {
    progress.done();
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
    clear(nodeContainer);
    clear(edgeContainer);

    // document.removeEventListener("mousemove", onMouseMove);
    // svgEl.removeEventListener("click", onSceneClick);
    svgEl.removeEventListener("pointerup", onSceneClick);

    if (layout) layout.off("ready", drawLinks);
    if (graph) graph.off("changed", onGraphStructureChanged);
    if (linkAnimator) linkAnimator.dispose();
  }

  function clear(el) {
    while (el.lastChild) {
      el.removeChild(el.lastChild);
    }
  }

  function addNode(node) {
    const dRatio = (graph.maxDepth - node.data.depth) / (graph.maxDepth);
    let pos = getNodePosition(node.id);
    if (node.data.depth === 0) {
      layout.pinNode(node);
    }

    const uiAttributes = getNodeUIAttributes(node.id, dRatio);
    layout.addNode(node.id, uiAttributes);

    const rectAttributes = {
      // x: uiAttributes.x,
      // y: uiAttributes.y,
      // width: uiAttributes.width,
      // height: uiAttributes.height,
      // rx: uiAttributes.rx,
      // ry: uiAttributes.ry,
      // fill: "white",
      // "stroke-width": uiAttributes.strokeWidth,
      // stroke: "#58585A",
      cx: uiAttributes.x + uiAttributes.width / 2, // Center x-coordinate
      cy: uiAttributes.y + uiAttributes.height / 2, // Center y-coordinate
      r: Math.min(uiAttributes.width, uiAttributes.height), // Radius
      fill: "white",
      stroke: "#58585A",
      strokeWidth: uiAttributes.strokeWidth,
    };
    const textAttributes = {
      "font-size": uiAttributes.fontSize,
      x: uiAttributes.px,
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
    let moveListener = (e) => {
      moved = true;
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
      // console.log("🚀 | downListener | e", e);

      moved = false;
      // onLeaveNode(e, node);

      // long tap timer
      if (e.pointerType === "touch") {
        clearTimeout(longTap.timer);

        longTap.expect = false;
        longTap.timer = setTimeout(
          () => (longTap.expect = true),
          longTap.timeout
        );
      }

      // ui.addEventListener("mousemove", moveListener);
      // ui.addEventListener("touchmove", moveListener);
      ui.addEventListener("pointermove", moveListener);

      // relates to this?
      // https://github.com/anvaka/panzoom/blob/main/lib/makeTextSelectionInterceptor.js
    };
    let upListener = (e) => {
      if (moved) {
        // console.log("moved");
      } else {
        // on desktop: fire click to open a new tab
        if (e.pointerType === "mouse" && e.button === 0) onNodeClick(e, node, ui, text);

        // on touch screens: fire onEnterNode to show tooltip
        if (e.pointerType === "touch") {
          // start a timer to handle double tap
          if (wasTap.flag) {
            // console.log("🚀 | upListener: double tap!");
            onNodeClick(e, node, ui, text);

            // to prevent tripple tap
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
            // console.log("🚀 | upListener: long tap!");

            // fire leave node event
            onLeaveNode(e, null);

            // fire right click
            bus.fire("node-click-right", { node });
          } else {
            // open tooltip
            // onEnterNode(e, node, true);
          }

          // to prevent onSceneClick from hiding the tooltip
          // e.preventDefault();
          e.stopPropagation();
        }

        // console.log("not moved");
      }

      moved = false;
      // ui.removeEventListener("mousemove", moveListener);
      // ui.removeEventListener("touchmove", moveListener);
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
    const fontSize = 45 * dRatio + 14;
    const size = textMeasure(nodeId, fontSize);
    const width = size.totalWidth + size.spaceWidth * 6;
    const height = fontSize * 1.6;

    return {
      fontSize,
      width,
      height,
      x: -width / 2,
      y: -height / 2,
      rx: 15 * dRatio + 2,
      ry: 15 * dRatio + 2,
      px: -width / 2 + size.spaceWidth * 3,
      py: -height / 2 + fontSize * 1.1,
      strokeWidth: 4 * dRatio + 1,
    };
  }

  function updatePositions() {
    nodes.forEach((ui, nodeId) => {
      let pos = getNodePosition(nodeId);
      ui.attr("transform", `translate(${pos.x}, ${pos.y})`);
    });
  }

  function getNodePosition(nodeId) {
    return layout.getNodePosition(nodeId);
  }
}
