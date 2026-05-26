import Sigma from 'sigma';
import { Graph as GraphologyGraph } from 'graphology';
import { GraphologyAdapter } from './graphologyAdapter';

export interface SigmaRendererOptions {
  container: HTMLElement;
  labelThreshold: number;
  sizeThreshold: number;
}

export class SigmaRenderer {
  private sigma: Sigma | null = null;
  private adapter: GraphologyAdapter;
  private container: HTMLElement;
  private labelThreshold: number;
  private sizeThreshold: number;
  private hoveredNode: string | null = null;
  private searchQuery: string = '';

  constructor(adapter: GraphologyAdapter, options: SigmaRendererOptions) {
    this.adapter = adapter;
    this.container = options.container;
    this.labelThreshold = options.labelThreshold || 30;
    this.sizeThreshold = options.sizeThreshold || 0;
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
    this.applyStyles(this.sigma.graph as unknown as GraphologyGraph);
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
    this.applyStyles(this.sigma?.graph as unknown as GraphologyGraph);
    if (this.sigma) this.sigma.refresh();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.applyStyles(this.sigma?.graph as unknown as GraphologyGraph);
    if (this.sigma) this.sigma.refresh();
  }

  setHoveredNode(nodeId: string | null): void {
    this.hoveredNode = nodeId;
    this.applyStyles(this.sigma?.graph as unknown as GraphologyGraph);
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

  private applyStyles(graph: GraphologyGraph): void {
    const dimColor = '#e3e3e3';
    const highlightColor = null; // Use community color

    graph.forEachNode((nodeId, attributes) => {
      const degree = graph.degree(nodeId);
      const isHovered = nodeId === this.hoveredNode;
      const matchesSearch = this.searchQuery &&
        (nodeId as string).toLowerCase().includes(this.searchQuery);
      const isNeighbor = this.hoveredNode && graph.neighbors(this.hoveredNode).includes(nodeId);

      // Size based on degree
      const size = Math.max(4, Math.sqrt(degree) * 8);

      // Check size threshold
      if (degree < this.sizeThreshold) {
        attributes.hidden = true;
        return;
      }
      attributes.hidden = false;

      // Label
      attributes.label = nodeId;

      // Color
      if (this.hoveredNode) {
        if (isHovered || isNeighbor) {
          attributes.color = attributes.community_color || '#4a9eff';
        } else {
          attributes.color = dimColor;
          attributes.label = ''; // Hide labels for dimmed nodes
        }
      } else if (this.searchQuery) {
        if (matchesSearch) {
          attributes.color = attributes.community_color || '#4a9eff';
        } else {
          attributes.color = dimColor;
          attributes.label = '';
        }
      } else {
        attributes.color = attributes.community_color || '#4a9eff';
      }

      // Apply size
      attributes.size = size;
    });

    // Style edges
    graph.forEachEdge((edgeId, attributes, source, target) => {
      const sourceAttrs = graph.getNodeAttributes(source);
      const targetAttrs = graph.getNodeAttributes(target);

      // Edge color matches source node's community
      const sourceColor = sourceAttrs.community_color || '#4a9eff';
      const targetColor = targetAttrs.community_color || '#4a9eff';

      if (this.hoveredNode) {
        const isNeighborSource = source === this.hoveredNode;
        const isNeighborTarget = target === this.hoveredNode;
        const isNeighbor = graph.neighbors(this.hoveredNode).includes(source) ||
          graph.neighbors(this.hoveredNode).includes(target);

        if (isNeighborSource || isNeighborTarget || isNeighbor) {
          graph.setEdgeAttribute(edgeId, 'color', sourceColor);
          graph.setEdgeAttribute(edgeId, 'hidden', false);
        } else {
          graph.setEdgeAttribute(edgeId, 'color', dimColor);
          graph.setEdgeAttribute(edgeId, 'hidden', false);
        }
      } else if (this.searchQuery) {
        const sourceMatches = (source as string).toLowerCase().includes(this.searchQuery);
        const targetMatches = (target as string).toLowerCase().includes(this.searchQuery);

        if (sourceMatches || targetMatches) {
          graph.setEdgeAttribute(edgeId, 'color', sourceColor);
        } else {
          graph.setEdgeAttribute(edgeId, 'color', dimColor);
        }
      } else {
        graph.setEdgeAttribute(edgeId, 'color', sourceColor);
      }

      graph.setEdgeAttribute(edgeId, 'size', 0.5);
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

  private setupEvents(graph: GraphologyGraph): void {
    if (!this.sigma) return;

    // Click handler - opens Wikipedia in new tab
    this.sigma.on('clickNode', (event) => {
      const nodeId = this.getNodeId(event);

      // Right-click: fire expand event
      if (event.event && event.event.button === 2) {
        this.container.dispatchEvent(new CustomEvent('expand', { detail: nodeId }));
        event.preventSigmaDefault();
        return;
      }

      // Left-click: open Wikipedia
      try {
        const nodeData = graph.getNodeAttributes(nodeId);
        const wikiTitle = (nodeData as any).wikipedia_title || nodeId;
        const wikiUrl = (nodeData as any).page_url ||
          `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`;
        window.open(wikiUrl, '_blank');
      } catch (err) {
        console.error('[sigmaRenderer] clickNode: failed to get node data for', nodeId, err);
      }

      event.preventSigmaDefault();
    });

    // Double-click handler - fire custom event
    this.sigma.on('doubleClickNode', (event) => {
      const nodeId = this.getNodeId(event);
      this.container.dispatchEvent(new CustomEvent('navigate', { detail: nodeId }));
      event.preventSigmaDefault();
    });

    // Hover handlers
    this.sigma.on('enterNode', (event) => {
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
