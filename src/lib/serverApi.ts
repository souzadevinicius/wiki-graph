/**
 * API client for the book-entities FastAPI server.
 * Handles file upload, SSE streaming, and graph data conversion.
 */

import { GraphologyAdapter } from './graphologyAdapter';

export interface Chapter {
  id: number;
  label: string;
  preview: string;
}

export interface ExtractChaptersResponse {
  upload_id: string;
  filename: string;
  chapters: Chapter[];
}

/**
 * Phase 1: Upload a book and get chapter list.
 *
 * @returns Promise that resolves with upload_id and chapter list.
 */
export async function extractChapters(
  file: File,
  lang: string,
): Promise<ExtractChaptersResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("lang", lang);

  const response = await fetch("/api/extract-chapters", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || `Extract failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Phase 2: Process selected chapters and receive graph via SSE.
 *
 * @returns Promise that resolves to a GraphologyAdapter ready for rendering.
 */
export async function processWithChapters(
  uploadId: string,
  chapterIds: number[],
  lang: string,
  resolveWiki: boolean,
  onProgress: (stage: string, detail: string, count: number) => void,
) {
  const response = await fetch("/api/process-chapters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      upload_id: uploadId,
      chapter_ids: chapterIds,
      lang,
      wiki_lang: lang,
      resolve_wiki: resolveWiki,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || `Process failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("ReadableStream not supported");

  const decoder = new TextDecoder();
  let buffer = "";
  let graphData: any = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      const data = JSON.parse(line.slice(6));

      if (data.status === "graph") {
        graphData = data;
      } else if (data.stage) {
        onProgress(data.stage, data.detail, data.count);
      }
    }
  }

  if (!graphData) throw new Error("No graph data received");

  return graphToGraphology(graphData);
}

/**
 * Upload a book and receive progress + graph via SSE.
 * @deprecated Use extractChapters() + processWithChapters() for chapter selection.
 * This function processes the entire book without chapter filtering.
 */
export async function uploadBook(
  file: File,
  lang: string,
  onProgress: (stage: string, detail: string, count: number) => void,
) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("lang", lang);
  formData.append("wiki_lang", lang);
  formData.append("resolve_wiki", "true");

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || `Upload failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("ReadableStream not supported");

  const decoder = new TextDecoder();
  let buffer = "";
  let graphData: any = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      const data = JSON.parse(line.slice(6));

      if (data.status === "graph") {
        graphData = data;
      } else if (data.stage) {
        onProgress(data.stage, data.detail, data.count);
      }
    }
  }

  if (!graphData) throw new Error("No graph data received");

  return graphToGraphology(graphData);
}

/**
 * Convert server graph JSON to GraphologyAdapter format.
 */
export function graphToGraphology(graphData: any) {
  const graph = new GraphologyAdapter();

  // Add nodes
  for (const entity of graphData.entities) {
    const id = entity.label;
    const mass = Array.isArray(entity.mentions) ? entity.mentions.length : (typeof entity.mentions === 'number' ? entity.mentions : 1);
    const data = {
      depth: 0,
      entity_type: entity.entity_type,
      mentions: entity.mentions,
      mass,
      wikipedia_title: entity.wikipedia_title,
      wikipedia_lang: entity.wikipedia_lang,
      page_url: entity.wikipedia_title
        ? `https://${entity.wikipedia_lang}.wikipedia.org/wiki/${encodeURIComponent(entity.wikipedia_title)}`
        : null,
      thumbnail: null,
      extract_html: null,
      chapter_ids: entity.chapter_ids || [],
      // Community data from backend
      community: entity.community,
      community_color: entity.community_color,
    };
    graph.addNode(id, data);
  }

  // Add edges
  for (const edge of graphData.edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      const pmi = edge.pmi ?? (edge.type === 'wikipedia' ? 5.0 : 0);
      const weight = edge.weight ?? 0;
      const contextSentences = edge.context_sentences || [];
      graph.addLink(edge.source, edge.target, pmi, weight, contextSentences);
    }
  }

  return graph;
}

/**
 * Generate an LLM explanation for why two entities are connected.
 * Uses context sentences to ground the explanation.
 */
export async function explainEdge(
  source: string,
  target: string,
  contextSentences: string[],
): Promise<{ explanation: string; error?: string }> {
  const response = await fetch("/api/explain-edge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, target, context_sentences: contextSentences }),
  });

  if (!response.ok) {
    const err = await response.json();
    return { explanation: "", error: err.error || `Request failed: ${response.status}` };
  }

  const data = await response.json();
  if (data.error) return { explanation: "", error: data.error };
  return { explanation: data.explanation };
}

/**
 * Generate a cache key for edge explanations (stored in localStorage).
 */
export function edgeExplanationKey(source: string, target: string): string {
  // Deterministic key regardless of edge direction
  const [a, b] = [source, target].sort();
  return `edge-explain:${a}|||${b}`;
}

/**
 * Generate an LLM explanation for why a community of nodes is related.
 * Returns a short label (1-4 words) and a brief explanation.
 */
export async function explainCommunity(
  nodeNames: string[],
  totalNodes: number,
  contextSentences: string[],
): Promise<{ label: string; explanation: string; error?: string }> {
  const response = await fetch("/api/explain-community", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      node_names: nodeNames,
      total_nodes: totalNodes,
      context_sentences: contextSentences,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    return { label: "", explanation: "", error: err.error || `Request failed: ${response.status}` };
  }

  const data = await response.json();
  if (data.error) return { label: "", explanation: "", error: data.error };
  return { label: data.label, explanation: data.explanation };
}

/**
 * Generate a cache key for community explanations (stored in localStorage).
 * Uses SHA-256 hash of sorted node names for a short, deterministic key.
 */
export async function communityExplanationKey(nodeIds: string[]): Promise<string> {
  const sorted = [...nodeIds].sort();
  const encoder = new TextEncoder();
  const data = encoder.encode(sorted.join(","));
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `community-explain:${hashHex.slice(0, 16)}`;
}
