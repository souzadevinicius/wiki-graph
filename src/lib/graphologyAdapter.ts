import Graph from 'graphology';
import { EventEmitter } from 'events';

export interface NodeData {
  depth?: number;
  wikipedia_title?: string;
  entity_type?: string;
  mentions?: string[];
  community?: number;
  color?: string;
  x?: number;
  y?: number;
  size?: number;
  label?: string;
  // From Wikipedia API
  description?: string;
  pageid?: number;
  extract_html?: string;
  thumbnail?: string | null;
  page_url?: string;
}

export class GraphologyAdapter extends EventEmitter {
  public inner: Graph;
  public maxDepth: number = 0;
  private nextFallbackPosition = 0;

  constructor() {
    super();
    this.inner = new Graph();
  }

  addNode(id: string, data: NodeData = {}): void {
    this.inner.addNode(id, this.withPosition(data));
    this.emit('changed', [{ changeType: 'add', node: this.getNode(id) }]);
  }

  addLink(source: string, target: string): void {
    if (!this.inner.hasDirectedEdge(source, target)) {
      this.inner.addDirectedEdge(source, target);
    }
  }

  hasNode(id: string): boolean {
    return this.inner.hasNode(id);
  }

  hasLink(source: string, target: string): boolean {
    return this.inner.hasEdge(source, target);
  }

  getNode(id: string) {
    const data = this.inner.getNodeAttributes(id) as NodeData;
    return { id, data };
  }

  forEachNode(callback: (node: { id: string; data: NodeData }) => void): void {
    this.inner.forEachNode((id, data) => callback({ id, data: data as NodeData }));
  }

  forEachLink(callback: (link: { id: string; fromId: string; toId: string }) => void): void {
    this.inner.forEachEdge((id, attributes, source, target) => {
      callback({ id, fromId: source, toId: target });
    });
  }

  getNodes(): string[] {
    return this.inner.nodes();
  }

  getNodeCount(): number {
    return this.inner.order;
  }

  getEdgeCount(): number {
    return this.inner.size;
  }

  getDegree(nodeId: string): number {
    return this.inner.degree(nodeId);
  }

  getNeighbors(nodeId: string): string[] {
    return this.inner.neighbors(nodeId);
  }

  clear(): void {
    this.inner.clear();
    this.maxDepth = 0;
    this.nextFallbackPosition = 0;
  }

  getGraphology(): Graph {
    return this.inner;
  }

  private withPosition(data: NodeData): NodeData {
    if (Number.isFinite(data.x) && Number.isFinite(data.y)) {
      return data;
    }

    const angle = this.nextFallbackPosition * 2.399963229728653;
    const radius = 20 + Math.sqrt(this.nextFallbackPosition) * 12;
    this.nextFallbackPosition += 1;

    return {
      ...data,
      x: Number.isFinite(data.x) ? data.x : Math.cos(angle) * radius,
      y: Number.isFinite(data.y) ? data.y : Math.sin(angle) * radius,
    };
  }
}
