import Sigma from 'sigma';
import type Graph from 'graphology';
import { GraphologyAdapter } from './graphologyAdapter';

export interface SigmaRendererOptions {
  container: HTMLElement;
  labelThreshold: number;
  sizeThreshold: number;
  lang?: string;
}

export class SigmaRenderer {
  private sigma: Sigma | null = null;
  private adapter: GraphologyAdapter;
  private container: HTMLElement;
  private labelThreshold: number;
  private sizeThreshold: number;
  private lang: string;
  private hoveredNode: string | null = null;
  private searchQuery: string = '';

  constructor(adapter: GraphologyAdapter, options: SigmaRendererOptions) {
    this.adapter = adapter;
    this.container = options.container;
    this.labelThreshold = options.labelThreshold ?? 30;
    this.sizeThreshold = options.sizeThreshold ?? 0;
    this.lang = options.lang ?? 'en';
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

    graph.forEachNode((nodeId: string, attributes: Record<string, any>) => {
      const degree = graph.degree(nodeId);
      const isHovered = nodeId === this.hoveredNode;
      const matchesSearch = searchMatches.has(nodeId);
      const isSearchNeighbor = searchNeighbors.has(nodeId);
      const isSearchRelevant = !this.searchQuery || matchesSearch || isSearchNeighbor;
      const isNeighbor = this.hoveredNode && graph.neighbors(this.hoveredNode).includes(nodeId);
      const isHighlighted = (this.hoveredNode && (isHovered || isNeighbor)) ||
        (this.searchQuery && (matchesSearch || isSearchNeighbor));

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
      if (isHighlighted) {
        graph.setNodeAttribute(nodeId, 'label', nodeId);
        graph.setNodeAttribute(nodeId, 'forceLabel', true);
        graph.setNodeAttribute(nodeId, 'highlighted', true);
        graph.setNodeAttribute(nodeId, 'color', matchesSearch ? '#f59e0b' : attributes.community_color || '#4a9eff');
      } else if (this.hoveredNode || this.searchQuery) {
        graph.setNodeAttribute(nodeId, 'color', dimColor);
        graph.setNodeAttribute(nodeId, 'label', '');
        graph.setNodeAttribute(nodeId, 'forceLabel', false);
        graph.setNodeAttribute(nodeId, 'highlighted', false);
      } else {
        graph.setNodeAttribute(nodeId, 'label', nodeId);
        graph.setNodeAttribute(nodeId, 'forceLabel', false);
        graph.setNodeAttribute(nodeId, 'highlighted', false);
        graph.setNodeAttribute(nodeId, 'color', attributes.community_color || '#4a9eff');
      }

      // Apply size
      graph.setNodeAttribute(nodeId, 'size', size);
    });

    // Style edges
    graph.forEachEdge((_edgeId: string, _attrs: Record<string, any>, source: string, target: string) => {
      const sourceAttrs = graph.getNodeAttributes(source) as Record<string, any>;
      const sourceHidden = graph.getNodeAttribute(source, 'hidden');
      const targetHidden = graph.getNodeAttribute(target, 'hidden');

      // Edge color matches source node's community
      const sourceColor = sourceAttrs.community_color || '#4a9eff';

      if (sourceHidden || targetHidden) {
        graph.setEdgeAttribute(_edgeId, 'hidden', true);
        return;
      }

      graph.setEdgeAttribute(_edgeId, 'hidden', false);

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

      graph.setEdgeAttribute(_edgeId, 'size', 0.3);
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

    // Hover handlers
    this.sigma.on('enterNode', (event: any) => {
      this.setHoveredNode(this.getNodeId(event));
    });

    this.sigma.on('leaveNode', () => {
      this.setHoveredNode(null);
    });

    // Click on background - clear hover
    this.sigma.on('clickStage', () => {
      this.setHoveredNode(null);
    });
  }
}
