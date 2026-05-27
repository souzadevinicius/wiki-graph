import queryState from 'query-state';
import { GraphologyAdapter } from './graphologyAdapter';
import { apiClient } from './apiClient';

export interface AppState {
  query: string;
  lang: string;
  hasGraph: boolean;
  graph: GraphologyAdapter | null;
  progress: ProgressState;
}

export class ProgressState {
  working: boolean = false;
  message: string = '';

  reset() {
    this.working = false;
    this.message = '';
  }

  startDownload() {
    this.working = true;
    this.message = 'Downloading...';
  }

  startLayout() {
    this.working = true;
    this.message = 'Layout...';
  }

  downloadError(err: string) {
    this.working = false;
    this.message = err;
  }

  updateLayout(remaining: number, current: string) {
    this.message = `Processing ${current}...`;
  }
}


let watchers: Set<(target: AppState, prop: keyof AppState, val: any) => void> = new Set();

export function watchState(f: (target: AppState, prop: keyof AppState, val: any) => void) {
  watchers.add(f);
  return () => watchers.delete(f);
}

export function unwatchState() {
  watchers.clear();
}

function notifyWatchers(target: AppState, prop: keyof AppState, val: any) {
  watchers.forEach(f => f(target, prop, val));
}

const qs = queryState(
  {
    query: '',
    lang: 'en',
  },
  {
    useSearch: true,
  }
);

const appStateFromQuery = qs.get();

export const appState: AppState = new Proxy({
  query: appStateFromQuery.query || '',
  lang: appStateFromQuery.lang || 'en',
  hasGraph: false,
  graph: null,
  progress: new ProgressState(),
} as AppState, {
  set(target, prop, val, receiver) {
    const result = Reflect.set(target, prop, val, receiver);
    if (['query', 'lang'].includes(prop as string)) {
      qs.set(prop, val);
    }
    notifyWatchers(target, prop as keyof AppState, val);
    return result;
  },
});

qs.onChange((newState) => {
  if (newState.query !== appState.query) {
    appState.query = newState.query;
  }
});

export { qs };

export async function performSearch(entryItem: { id: string; data: any }, fetchSummaries: boolean = false) {
  console.log('[performSearch] entryItem:', entryItem);

  appState.hasGraph = true;
  appState.progress.reset();

  qs.set('query', entryItem.id);

  // Build graph using graphology adapter
  const graph = new GraphologyAdapter();

  appState.graph = graph;
  appState.progress.startDownload();

  // Add root node
  graph.addNode(entryItem.id, { depth: 0, ...entryItem.data });

// Fetch backlinks (depth 1 only — immediate backlinks per glossary)
  try {
    const backlinks = await apiClient.getResponse(entryItem.id);

    // Fetch summaries for rich data (optional — skipped when disabled)
    const summaries = await Promise.all(
      backlinks.map(async (bl) => {
        if (fetchSummaries) {
          const summary = await apiClient.getSummary(bl.title);
          return apiClient.getItem(summary);
        }
        return { id: bl.title, data: { description: '', extract_html: bl.extract || '', thumbnail: bl.thumbnail?.source || null } };
      })
    );

    const newNodes = summaries.filter(Boolean);
    newNodes.forEach((node) => {
      if (node && !graph.hasNode(node.id)) {
        graph.addNode(node.id, { depth: 1, ...node.data });
        graph.addLink(entryItem.id, node.id);
      } else if (node) {
        graph.addLink(entryItem.id, node.id);
      }
    });
  } catch (err) {
    console.error('[performSearch] Failed to fetch:', entryItem.id, err);
    appState.progress.downloadError(`Failed: ${entryItem.id}`);
  }

  appState.progress.working = false;
  appState.progress.message = '';

  return graph;
}
