/**
 * API client for the book-entities FastAPI server.
 * Handles file upload, SSE streaming, and graph data conversion.
 */

import createGraph from "ngraph.graph";

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
 * @returns Promise that resolves to an ngraph.graph ready for rendering.
 */
export async function processWithChapters(
  uploadId: string,
  chapterIds: number[],
  lang: string,
  onProgress: (stage: string, detail: string, count: number) => void,
) {
  const formData = new FormData();
  formData.append("upload_id", uploadId);
  for (const cid of chapterIds) {
    formData.append("chapter_ids", String(cid));
  }
  formData.append("lang", lang);
  formData.append("wiki_lang", lang);
  formData.append("resolve_wiki", "true");

  const response = await fetch("/api/process-chapters", {
    method: "POST",
    body: formData,
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

  return graphToNgraph(graphData);
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

  return graphToNgraph(graphData);
}

/**
 * Convert server graph JSON to ngraph.graph format.
 */
export function graphToNgraph(graphData: any) {
  const graph = createGraph();

  // Add nodes
  for (const entity of graphData.entities) {
    const id = entity.label;
    const mass = Array.isArray(entity.mentions) ? entity.mentions.length : (typeof entity.mentions === 'number' ? entity.mentions : 1);
    const data = {
      depth: 0,
      type: entity.type,
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
    };
    graph.addNode(id, data);
  }

  // Add edges
  for (const edge of graphData.edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      if (!graph.getLink(edge.source, edge.target)) {
        graph.addLink(edge.source, edge.target);
      }
    }
  }

  return graph;
}
