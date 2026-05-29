import Sigma from 'sigma';
import type Graph from 'graphology';
import { GraphologyAdapter } from './graphologyAdapter';

export interface SigmaRendererOptions {
  container: HTMLElement;
  labelThreshold: number;
  sizeThreshold: number;
  lang?: string;
  pruningIntensity?: number;
}

type CommunityId = number | string;

export class SigmaRenderer {
  private sigma: Sigma | null = null;
  private adapter: GraphologyAdapter;
  private container: HTMLElement;
  private labelThreshold: number;
  private sizeThreshold: number;
  private lang: string;
  private hoveredNode: string | null = null;
  private searchQuery: string = '';
  private pruningIntensity: number = 0;
  private selectedCommunity: CommunityId | null = null;

  constructor(adapter: GraphologyAdapter, options: SigmaRendererOptions) {
    this.adapter = adapter;
    this.container = options.container;
    this.labelThreshold = options.labelThreshold ?? 30;
    this.sizeThreshold = options.sizeThreshold ?? 0;
    this.lang = options.lang ?? 'en';
    this.pruningIntensity = options.pruningIntensity ?? 0;
  }

  render(): void {
    if (this.sigma) {
      this.sigma.kill();
    }

    const graphologyGraph = this.adapter.getGraphology();
    this.applyStyles(graphologyGraph);

    this.sigma = new Sigma(
      graphologyGraph,
      this.container,
      {
        labelRenderedSizeThreshold: this.labelThreshold,
        renderEdgeLabels: false,
        labelColor: { attribute: 'labelColor', color: '#000' },
      }
    );

    this.setupEvents(graphologyGraph);
  }

  updateGraph(): void {
    if (!this.sigma) return;
    this.applyStyles(this.adapter.getGraphology());
    this.sigma.refresh();
  }

  setLabelThreshold(value: number): void {
    this.labelThreshold = value;
    if (this.sigma) {
      this.sigma.setSetting('labelRenderedSizeThreshold', value);
    }
  }

  setSizeThreshold(value: number): void {
    this.sizeThreshold = value;
    this.updateGraph();
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query.trim().toLowerCase();
    this.applyStyles(this.adapter.getGraphology());
    if (this.sigma) this.sigma.refresh();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.applyStyles(this.adapter.getGraphology());
    if (this.sigma) this.sigma.refresh();
  }

  setHoveredNode(nodeId: string | null): void {
    this.hoveredNode = nodeId;
    this.applyStyles(this.adapter.getGraphology());
    if (this.sigma) this.sigma.refresh();
  }

  setPruningIntensity(value: number): void {
    this.pruningIntensity = value;
    this.applyStyles(this.adapter.getGraphology());
    if (this.sigma) this.sigma.refresh();
  }

  setSelectedCommunity(communityId: CommunityId | null): void {
    this.selectedCommunity = communityId;
    this.applyStyles(this.adapter.getGraphology());
    if (this.sigma) this.sigma.refresh();
  }

  /** Zoom the camera to the bounding box of a community's nodes. */
  zoomToCommunity(communityId: CommunityId): void {
    if (!this.sigma) return;
    const graph = this.adapter.getGraphology();
    const nodes = graph.nodes().filter((n) =>
      String(graph.getNodeAttribute(n, 'community')) === String(communityId)
    );
    if (nodes.length === 0) return;

    const positions = nodes
      .map((n) => ({
        x: graph.getNodeAttribute(n, 'x') as number,
        y: graph.getNodeAttribute(n, 'y') as number,
      }))
      .filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));

    if (positions.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    positions.forEach(({ x, y }) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    const nextX = (minX + maxX) / 2;
    const nextY = (minY + maxY) / 2;
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;

    const camera = this.sigma.getCamera();
    const state = camera.getState();
    camera.animate(
      { x: nextX, y: nextY, ratio: state.ratio },
      { duration: 400 }
    );
  }

  kill(): void {
    if (this.sigma) {
      this.sigma.kill();
      this.sigma = null;
    }
  }

  getSigma(): Sigma | null {
    return this.sigma;
  }

  private applyStyles(graph: Graph): void {
    const dimColor = '#e3e3e3';
    const communityDimNodeColor = '#d8dee8';
    const communityDimEdgeColor = '#edf1f7';
    const searchMatches = new Set<string>();
    const searchNeighbors = new Set<string>();

    if (this.searchQuery) {
      graph.forEachNode((nodeId: string, attributes: Record<string, any>) => {
        if (this.nodeMatchesSearch(nodeId, attributes)) {
          searchMatches.add(nodeId);
          graph.neighbors(nodeId).forEach((neighborId) => searchNeighbors.add(neighborId));
        }
      });
    }

    // PMI-aware edge filtering
    let hiddenEdgeIds = new Set<string>();
    if (this.pruningIntensity > 0) {
      // Collect all edges with PMI
      const edges: Array<{ id: string; pmi: number; source: string; target: string }> = [];
      graph.forEachEdge((edgeId, attrs, source, target) => {
        edges.push({
          id: edgeId,
          pmi: (attrs.pmi as number) ?? 0,
          source,
          target,
        });
      });

      // Sort by PMI ascending (weakest first)
      edges.sort((a, b) => a.pmi - b.pmi);

      // PMI-aware: first remove negative PMI edges (0-20% range),
      // then remove positive PMI edges from weakest to strongest (20-100%)
      const negativeEdges = edges.filter(e => e.pmi < 0);
      const positiveEdges = edges.filter(e => e.pmi >= 0);
      const totalEdges = edges.length;

      // At 20% intensity, all negative edges are gone
      const negativeFraction = totalEdges > 0 ? negativeEdges.length / totalEdges : 0;
      const intensity = this.pruningIntensity / 100;

      if (intensity <= 0.2) {
        // Proportionally remove negative edges
        const removeFraction = intensity / 0.2;
        const toRemove = Math.floor(removeFraction * negativeEdges.length);
        for (let i = 0; i < toRemove; i++) {
          hiddenEdgeIds.add(negativeEdges[i].id);
        }
      } else {
        // All negative edges gone, now remove positive edges
        hiddenEdgeIds = new Set(negativeEdges.map(e => e.id));
        const remainingFraction = (intensity - 0.2) / 0.8;
        const toRemove = Math.floor(remainingFraction * positiveEdges.length);
        for (let i = 0; i < toRemove; i++) {
          hiddenEdgeIds.add(positiveEdges[i].id);
        }
      }
    }

    // Compute visible degree per node (degree excluding hidden edges)
    const visibleDegree: Map<string, number> = new Map();
    graph.forEachNode((nodeId: string) => {
      let count = 0;
      graph.forEachEdge((_edgeId, _attrs, source, target) => {
        if (hiddenEdgeIds.has(_edgeId)) return;
        if (source === nodeId || target === nodeId) count++;
      });
      visibleDegree.set(nodeId, count);
    });

    graph.forEachNode((nodeId: string, attributes: Record<string, any>) => {
      const degree = graph.degree(nodeId);
      const vDegree = visibleDegree.get(nodeId) ?? 0;
      const isOrphan = this.pruningIntensity > 0 && vDegree === 0;
      const isHovered = nodeId === this.hoveredNode;
      const matchesSearch = searchMatches.has(nodeId);
      const isSearchNeighbor = searchNeighbors.has(nodeId);
      const isSearchRelevant = !this.searchQuery || matchesSearch || isSearchNeighbor;
      const isNeighbor = this.hoveredNode && graph.neighbors(this.hoveredNode).includes(nodeId);
      const isHighlighted = (this.hoveredNode && (isHovered || isNeighbor)) ||
        (this.searchQuery && (matchesSearch || isSearchNeighbor));

      const isCommunitySelected = this.selectedCommunity !== null;
      const isInSelectedCommunity = isCommunitySelected &&
        String(attributes.community) === String(this.selectedCommunity);

      // Size based on degree, capped so hubs stay readable without dominating.
      const size = Math.min(18, Math.max(2.5, 3 + Math.log1p(degree) * 3));

      // Check size threshold
      if (degree < this.sizeThreshold || !isSearchRelevant) {
        graph.setNodeAttribute(nodeId, 'hidden', true);
        graph.setNodeAttribute(nodeId, 'forceLabel', false);
        graph.setNodeAttribute(nodeId, 'highlighted', false);
        return;
      }
      graph.setNodeAttribute(nodeId, 'hidden', false);

      // Label and color
      if (isOrphan) {
        // Dim orphan nodes (low opacity, greyed out)
        graph.setNodeAttribute(nodeId, 'label', nodeId);
        graph.setNodeAttribute(nodeId, 'forceLabel', false);
        graph.setNodeAttribute(nodeId, 'highlighted', false);
        graph.setNodeAttribute(nodeId, 'color', dimColor);
        graph.setNodeAttribute(nodeId, 'labelColor', dimColor);
        graph.setNodeAttribute(nodeId, 'size', size * 0.6);
      } else if (isHighlighted) {
        graph.setNodeAttribute(nodeId, 'label', nodeId);
        graph.setNodeAttribute(nodeId, 'forceLabel', true);
        graph.setNodeAttribute(nodeId, 'highlighted', true);
        graph.setNodeAttribute(nodeId, 'color', matchesSearch ? '#f59e0b' : attributes.community_color || '#4a9eff');
        graph.setNodeAttribute(nodeId, 'labelColor', '#333');
        graph.setNodeAttribute(nodeId, 'size', size);
      } else if (isCommunitySelected) {
        if (isInSelectedCommunity) {
          // Selected community: full color, label visible
          graph.setNodeAttribute(nodeId, 'label', nodeId);
          graph.setNodeAttribute(nodeId, 'forceLabel', true);
          graph.setNodeAttribute(nodeId, 'highlighted', true);
          graph.setNodeAttribute(nodeId, 'color', attributes.community_color || '#4a9eff');
          graph.setNodeAttribute(nodeId, 'labelColor', '#333');
          graph.setNodeAttribute(nodeId, 'size', size * 1.12);
        } else {
          // Not in selected community: dimmed so the explained group stays in focus.
          graph.setNodeAttribute(nodeId, 'color', communityDimNodeColor);
          graph.setNodeAttribute(nodeId, 'label', '');
          graph.setNodeAttribute(nodeId, 'forceLabel', false);
          graph.setNodeAttribute(nodeId, 'highlighted', false);
          graph.setNodeAttribute(nodeId, 'size', size * 0.65);
        }
      } else if (this.hoveredNode || this.searchQuery) {
        graph.setNodeAttribute(nodeId, 'color', dimColor);
        graph.setNodeAttribute(nodeId, 'label', '');
        graph.setNodeAttribute(nodeId, 'forceLabel', false);
        graph.setNodeAttribute(nodeId, 'highlighted', false);
        graph.setNodeAttribute(nodeId, 'size', size);
      } else {
        graph.setNodeAttribute(nodeId, 'label', nodeId);
        graph.setNodeAttribute(nodeId, 'forceLabel', false);
        graph.setNodeAttribute(nodeId, 'highlighted', false);
        graph.setNodeAttribute(nodeId, 'color', attributes.community_color || '#4a9eff');
        graph.setNodeAttribute(nodeId, 'labelColor', '#333');
        graph.setNodeAttribute(nodeId, 'size', size);
      }
    });

    // Style edges
    graph.forEachEdge((_edgeId: string, _attrs: Record<string, any>, source: string, target: string) => {
      const sourceAttrs = graph.getNodeAttributes(source) as Record<string, any>;
      const sourceHidden = graph.getNodeAttribute(source, 'hidden');
      const targetHidden = graph.getNodeAttribute(target, 'hidden');

      // Edge color matches source node's community
      const sourceColor = sourceAttrs.community_color || '#4a9eff';

      if (sourceHidden || targetHidden || hiddenEdgeIds.has(_edgeId)) {
        graph.setEdgeAttribute(_edgeId, 'hidden', true);
        return;
      }

      graph.setEdgeAttribute(_edgeId, 'hidden', false);

      // Community selection: dim edges not fully within selected community
      if (this.selectedCommunity !== null) {
        const targetAttrs = graph.getNodeAttributes(target) as Record<string, any>;
        const sourceIn = String(sourceAttrs.community) === String(this.selectedCommunity);
        const targetIn = String(targetAttrs.community) === String(this.selectedCommunity);
        if (sourceIn && targetIn) {
          graph.setEdgeAttribute(_edgeId, 'color', sourceColor);
        } else {
          graph.setEdgeAttribute(_edgeId, 'color', communityDimEdgeColor);
        }
        graph.setEdgeAttribute(_edgeId, 'size', 0.8);
        return;
      }

      if (this.hoveredNode) {
        const isNeighborSource = source === this.hoveredNode;
        const isNeighborTarget = target === this.hoveredNode;
        const isNeighbor = graph.neighbors(this.hoveredNode).includes(source) ||
          graph.neighbors(this.hoveredNode).includes(target);

        if (isNeighborSource || isNeighborTarget || isNeighbor) {
          graph.setEdgeAttribute(_edgeId, 'color', sourceColor);
        } else {
          graph.setEdgeAttribute(_edgeId, 'color', dimColor);
        }
      } else if (this.searchQuery) {
        const sourceMatches = searchMatches.has(source);
        const targetMatches = searchMatches.has(target);
        const connectsSearchContext =
          (sourceMatches && searchNeighbors.has(target)) ||
          (targetMatches && searchNeighbors.has(source)) ||
          (sourceMatches && targetMatches);

        if (connectsSearchContext) {
          graph.setEdgeAttribute(_edgeId, 'color', sourceColor);
        } else {
          graph.setEdgeAttribute(_edgeId, 'color', dimColor);
        }
      } else {
        graph.setEdgeAttribute(_edgeId, 'color', sourceColor);
      }

      graph.setEdgeAttribute(_edgeId, 'size', 0.8);
    });
  }

  private nodeMatchesSearch(nodeId: string, attributes: Record<string, any>): boolean {
    const searchableValues = [
      nodeId,
      attributes.wikipedia_title,
      attributes.description,
      attributes.entity_type,
      ...(Array.isArray(attributes.mentions) ? attributes.mentions : []),
    ];

    return searchableValues.some((value) =>
      typeof value === 'string' && value.toLowerCase().includes(this.searchQuery)
    );
  }

  /** Extract string node ID from Sigma.js event, handling both v2 and v3 formats */
  private getNodeId(event: any): string {
    // Sigma.js v3: event.node is the node ID string
    // In some cases it may be the full node object, so extract .id if needed
    const node = event.node;
    if (typeof node === 'string') return node;
    if (node && typeof node === 'object' && typeof node.id === 'string') return node.id;
    // Fallback: coerce to string (should not happen with proper graphology graphs)
    return String(node);
  }

  private getMouseButton(event: any): number | null {
    const mouseEvent = event?.event?.original || event?.event;
    return typeof mouseEvent?.button === 'number' ? mouseEvent.button : null;
  }

  private preventBrowserDefault(event: any): void {
    event.preventSigmaDefault?.();
    event.event?.original?.preventDefault?.();
    event.event?.original?.stopPropagation?.();
  }

  private setupEvents(graph: Graph): void {
    if (!this.sigma) return;

    // Middle-click handler - append connected neighbors
    this.sigma.on('downNode', (event: any) => {
      if (this.getMouseButton(event) !== 1) return;

      const nodeId = this.getNodeId(event);
      this.container.dispatchEvent(new CustomEvent('expand', { detail: nodeId }));
      this.preventBrowserDefault(event);
    });

    // Click handler - opens Wikipedia in new tab
    this.sigma.on('clickNode', (event: any) => {
      const nodeId = this.getNodeId(event);

      // Left-click: open Wikipedia
      try {
        const nodeData = graph.getNodeAttributes(nodeId) as Record<string, any>;
        const wikiTitle = nodeData.wikipedia_title || nodeId;
        const wikiUrl = nodeData.page_url ||
          `https://${this.lang}.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`;
        window.open(wikiUrl, '_blank');
      } catch (err) {
        console.error('[sigmaRenderer] clickNode: failed to get node data for', nodeId, err);
      }

      this.preventBrowserDefault(event);
    });

    // Double-click handler - fire custom event
    this.sigma.on('doubleClickNode', (event: any) => {
      const nodeId = this.getNodeId(event);
      this.container.dispatchEvent(new CustomEvent('navigate', { detail: nodeId }));
      event.preventSigmaDefault();
    });

    // Edge click handler - fire custom event with edge data
    this.sigma.on('clickEdge', (event: any) => {
      const edgeId = event.edge;
      const edgeData = graph.getEdgeAttributes(edgeId) as Record<string, any>;
      const source = graph.source(edgeId);
      const target = graph.target(edgeId);
      this.container.dispatchEvent(new CustomEvent('clickEdge', {
        detail: {
          edgeId,
          source,
          target,
          pmi: edgeData.pmi ?? 0,
          weight: edgeData.weight ?? 0,
          contextSentences: edgeData.context_sentences || [],
        },
      }));
      this.preventBrowserDefault(event);
    });

    // Hover handlers
    this.sigma.on('enterNode', (event: any) => {
      this.setHoveredNode(this.getNodeId(event));
    });

    this.sigma.on('leaveNode', () => {
      this.setHoveredNode(null);
    });

    // Click on background - clear hover and community selection
    this.sigma.on('clickStage', () => {
      this.setHoveredNode(null);
      this.setSelectedCommunity(null);
    });
  }
}
