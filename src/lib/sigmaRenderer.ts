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
    this.labelThreshold = options.labelThreshold || 30;
    this.sizeThreshold = options.sizeThreshold || 0;
    this.lang = options.lang || 'en';
  }

  render(): void {
    if (this.sigma) {
      this.sigma.kill();
    }

    const graphologyGraph = this.adapter.getGraphology();

    this.sigma = new Sigma(
      graphologyGraph,
      this.container,
      {
        labelRenderedSizeThreshold: this.labelThreshold,
        renderEdgeLabels: false,
      }
    );

    this.setupEvents(graphologyGraph);
    this.applyStyles(graphologyGraph);
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
    this.searchQuery = query.toLowerCase();
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

    graph.forEachNode((nodeId: string, attributes: Record<string, any>) => {
      const degree = graph.degree(nodeId);
      const isHovered = nodeId === this.hoveredNode;
      const matchesSearch = this.searchQuery &&
        nodeId.toLowerCase().includes(this.searchQuery);
      const isNeighbor = this.hoveredNode && graph.neighbors(this.hoveredNode).includes(nodeId);

      // Size based on degree
      const size = Math.max(4, Math.sqrt(degree) * 8);

      // Check size threshold
      if (degree < this.sizeThreshold) {
        graph.setNodeAttribute(nodeId, 'hidden', true);
        return;
      }
      graph.setNodeAttribute(nodeId, 'hidden', false);

      // Label
      graph.setNodeAttribute(nodeId, 'label', nodeId);

      // Color
      if (this.hoveredNode) {
        if (isHovered || isNeighbor) {
          graph.setNodeAttribute(nodeId, 'color', attributes.community_color || '#4a9eff');
        } else {
          graph.setNodeAttribute(nodeId, 'color', dimColor);
          graph.setNodeAttribute(nodeId, 'label', '');
        }
      } else if (this.searchQuery) {
        if (matchesSearch) {
          graph.setNodeAttribute(nodeId, 'color', attributes.community_color || '#4a9eff');
        } else {
          graph.setNodeAttribute(nodeId, 'color', dimColor);
          graph.setNodeAttribute(nodeId, 'label', '');
        }
      } else {
        graph.setNodeAttribute(nodeId, 'color', attributes.community_color || '#4a9eff');
      }

      // Apply size
      graph.setNodeAttribute(nodeId, 'size', size);
    });

    // Style edges
    graph.forEachEdge((_edgeId: string, _attrs: Record<string, any>, source: string, target: string) => {
      const sourceAttrs = graph.getNodeAttributes(source) as Record<string, any>;

      // Edge color matches source node's community
      const sourceColor = sourceAttrs.community_color || '#4a9eff';

      if (this.hoveredNode) {
        const isNeighborSource = source === this.hoveredNode;
        const isNeighborTarget = target === this.hoveredNode;
        const isNeighbor = graph.neighbors(this.hoveredNode).includes(source) ||
          graph.neighbors(this.hoveredNode).includes(target);

        if (isNeighborSource || isNeighborTarget || isNeighbor) {
          graph.setEdgeAttribute(_edgeId, 'color', sourceColor);
          graph.setEdgeAttribute(_edgeId, 'hidden', false);
        } else {
          graph.setEdgeAttribute(_edgeId, 'color', dimColor);
          graph.setEdgeAttribute(_edgeId, 'hidden', false);
        }
      } else if (this.searchQuery) {
        const sourceMatches = source.toLowerCase().includes(this.searchQuery);
        const targetMatches = target.toLowerCase().includes(this.searchQuery);

        if (sourceMatches || targetMatches) {
          graph.setEdgeAttribute(_edgeId, 'color', sourceColor);
        } else {
          graph.setEdgeAttribute(_edgeId, 'color', dimColor);
        }
      } else {
        graph.setEdgeAttribute(_edgeId, 'color', sourceColor);
      }

      graph.setEdgeAttribute(_edgeId, 'size', 0.5);
    });
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
