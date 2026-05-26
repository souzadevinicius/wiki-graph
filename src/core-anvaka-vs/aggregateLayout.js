/**
 * This is the core of the layout. The layout here is kind of "cheating"
 * layout. The real layout happens in the background and is never shown on
 * the screen until either certain amount of iterations has finished
 * or time quota allowed for the layout exceeded.
 * 
 * While background layout does the work, on the front end nodes are 
 * flying according to "Boids" algorithm (flocking behavior).
 * 
 * When background algorithm is finished, the boids are flying to the
 * final positions with simple interpolation animation.
 */
import createFakeLayout from './layout/boidLayout';
import createInterpolateLayout from './createInterpolateLayout';
import removeOverlaps from './layout/removeOverlaps';
import Rect from './layout/Rect';

import eventify from 'ngraph.events';

import createLayout from 'ngraph.forcelayout';

const USE_FAKE = 1;
const USE_INTERPOLATE = 2;
const REMOVE_OVERLAPS = 3;
const USE_REAL = 4;

// FIX: Node padding added to stop rect edges from touching each other.
// Inflate each node's bounding box by this many pixels on all sides
// during overlap removal so nodes have breathing room.
const NODE_PADDING = 6;

// FIX: More overlap-removal passes gives the algorithm more chances to
// push dense clusters apart. 3 passes was often not enough for graphs
// with large variance in node sizes.
const OVERLAP_PASSES = 7;

/**
 * Orchestrates layout of algorithm between phases.
 */
export default function createAggregateLayout(graph, progress, physicsConfig = {}) {
  const MAX_DEPTH = graph.maxDepth;

  // FIX: declare rectangles first — createPhysicsLayout's nodeMass
  // callback closes over it, and calling createPhysicsLayout before
  // this declaration causes a TDZ error in minified builds.
  let rectangles = new Map();

  let physicsLayout = createPhysicsLayout(graph);
  let fakeLayout = createFakeLayout(graph);
  let interpolateLayout = createInterpolateLayout(fakeLayout, physicsLayout);

  let isGraphReady = false;
  let layoutIterations = 0;
  let layoutTime = 0;
  let maxLayoutIterations = 2000;
  let maxLayoutTime = 2000;
  let phase = USE_FAKE;

  var api = eventify({
    step,
    pinNode,
    unpinNode,
    setNodePosition,
    getNodePosition,
    addNode,
    setGraphReady,
    getGraphReady,
    setLayout,
    reLayout
  })

  return api;

  function setGraphReady() {
    layoutIterations = 0;
    layoutTime = 0;
    isGraphReady = true;
  }

  function getGraphReady() {
    return isGraphReady;
  }

  function addNode(nodeId, rect) {
    fakeLayout.addNode(nodeId, rect);
    rectangles.set(nodeId, rect);
  }

  function getNodePosition(nodeId) {
    if (phase === USE_FAKE || phase === REMOVE_OVERLAPS) return fakeLayout.getNodePosition(nodeId);
    if (phase === USE_REAL) return physicsLayout.getNodePosition(nodeId);
    if (phase === USE_INTERPOLATE) return interpolateLayout.getNodePosition(nodeId);
  }

  function step() {
    if (!isGraphReady || layoutIterations < maxLayoutIterations) {
      phase = USE_FAKE;
      let start = window.performance.now();
      fakeLayout.step();

      do {
        physicsLayout.step();
        layoutIterations += 1;
      } while (window.performance.now() - start < 10)
      layoutTime += window.performance.now() - start;

      if (layoutTime > maxLayoutTime) layoutIterations = maxLayoutIterations;
      const finished = Math.min(1, Math.max(layoutTime / maxLayoutTime, layoutIterations / maxLayoutIterations));
      syncLayouts();

      progress.setLayoutCompletion(Math.round(finished * 100));

      if (layoutIterations >= maxLayoutIterations) phase = REMOVE_OVERLAPS;

      return true;
    } else if (phase === REMOVE_OVERLAPS) {
      runOverlapsRemoval();
      phase = USE_INTERPOLATE;

      return true;
    } else if (phase === USE_INTERPOLATE) {
      interpolateLayout.step();
      if (interpolateLayout.done()) {
        phase = USE_REAL;
        api.fire('ready', api);
      }
      return true;
    }

    return false;
  }

  function syncLayouts() {
    graph.forEachNode(function (node) {
      var pos = physicsLayout.getNodePosition(node.id);
      fakeLayout.setDesiredNodePosition(node.id, pos);
    })
  }

  function runOverlapsRemoval() {
    let rectangles = getRectangles();
    // FIX: Run more passes so densely packed areas fully separate.
    for (let i = 0; i < OVERLAP_PASSES; i++) {
      removeOverlaps(rectangles);
    }
    rectangles.forEach((rect, nodeId) => {
      physicsLayout.setNodePosition(nodeId, rect.left - rect.dx, rect.top - rect.dy);
    });
  }

function getRectangles() {
    let rects = new Map();
    rectangles.forEach((rect, id) => {
      let pos = physicsLayout.getNodePosition(id);
      
      // FIX: Use a uniform circle radius derived from the text measurement 
      // instead of raw rectangular boundaries. This keeps padding consistent.
      const radius = Math.min(rect.width, rect.height) + NODE_PADDING;
      
      const inflatedRect = new Rect({
        id,
        // Center the overlap rectangle bounds directly around the layout position
        left: pos.x - radius,
        top:  pos.y - radius,
        dx:   -radius,
        dy:   -radius,
        width:  radius * 2,
        height: radius * 2,
      });
      rects.set(id, inflatedRect);
    });
    return rects;
  }

  function setLayout(config) {
    let sim = physicsLayout.simulator;
    if (config.springLength !== undefined) {
      sim.springLength(config.springLength);
    }
    if (config.gravity !== undefined) {
      sim.gravity(config.gravity);
    }
  }

  function reLayout(config) {
    setLayout(config);
    layoutIterations = 0;
    layoutTime = 0;
    phase = USE_FAKE;
    isGraphReady = true;
  }

  function pinNode(node) {
    physicsLayout.pinNode(node, true);
  }

  function unpinNode(node) {
    physicsLayout.pinNode(node, false);
  }

  function setNodePosition(nodeId, x, y) {
    physicsLayout.setNodePosition(nodeId, x, y);
    fakeLayout.setNodePosition(nodeId, x, y);
  }

function createPhysicsLayout() {
    return createLayout(graph, {
      timeStep: 10,
      dimensions: 2,
      // INCREASED REPULSION: Pull dense clusters apart more forcefully
      gravity: physicsConfig.gravity || -35, 
      theta: 0.8,
      // LONGER REST LENGTH: Gives connected nodes plenty of room to branch out
      springLength: physicsConfig.springLength || 140,
      springCoeff: 0.005,
      dragCoeff: 0.9,
      nodeMass(nodeId) {
        let links = graph.getLinks(nodeId);
        let mul = links ? links.length : 1;
        let node = graph.getNode(nodeId);
        mul *= (MAX_DEPTH - node.data.depth) + 1;

        // FIX: Base mass dynamically on the node's radius so larger text circles
        // push away neighboring nodes much more aggressively.
        const rect = rectangles.get(nodeId);
        const radius = rect ? Math.min(rect.width, rect.height) : 10;
        const sizeFactor = radius / 5; 

        let result = nodeId.length * mul * Math.max(1, sizeFactor);
        if (typeof result !== 'number' || !isFinite(result)) {
          console.error('BAD MASS:', nodeId, { MAX_DEPTH, depth: node.data.depth, mul, result });
          return 1;
        }
        return result;
      }
    });
  }
}