import queryState from 'query-state';
import { GraphologyAdapter } from './graphologyAdapter';
import { apiClient } from './apiClient';

export interface AppState {
  query: string;
  lang: string;
  hasGraph: boolean;
  graph: GraphologyAdapter | null;
  maxDepth: number;
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

let lastBuilder: any = null;
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
  maxDepth: 2,
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

export async function performSearch(entryItem: { id: string; data: any }) {
  console.log('[performSearch] entryItem:', entryItem);

  appState.hasGraph = true;
  appState.progress.reset();

  qs.set('query', entryItem.id);

  if (lastBuilder) {
    lastBuilder.dispose();
  }

  // Build graph using graphology adapter
  const graph = new GraphologyAdapter();
  graph.maxDepth = appState.maxDepth;

  appState.graph = graph;
  appState.progress.startDownload();

  // Add root node
  graph.addNode(entryItem.id, { depth: 0, ...entryItem.data });

  // Fetch backlinks
  let queue = [entryItem.id];
  let cancelled = false;

  async function processQueue() {
    while (queue.length > 0 && !cancelled) {
      const nextId = queue.shift()!;
      appState.progress.updateLayout(queue.length, nextId);

      try {
        const backlinks = await apiClient.getResponse(nextId);

        // Fetch summaries for rich data
        const summaries = await Promise.all(
          backlinks.map(async (bl) => {
            const summary = await apiClient.getSummary(bl.title);
            return apiClient.getItem(summary);
          })
        );

        const newNodes = summaries.filter(Boolean);
        const parentNode = graph.getNode(nextId);
        const parentDepth = parentNode.data.depth || 0;

        newNodes.forEach((node) => {
          if (node && !graph.hasNode(node.id)) {
            const depth = parentDepth + 1;
            graph.addNode(node.id, { depth, ...node.data });
            graph.addLink(nextId, node.id);
            if (depth < appState.maxDepth) {
              queue.push(node.id);
            }
          } else if (node) {
            // Node exists, just add link if missing
            graph.addLink(nextId, node.id);
          }
        });
      } catch (err) {
        console.error('[performSearch] Failed to fetch:', nextId, err);
        appState.progress.downloadError(`Failed: ${nextId}`);
      }
    }

    appState.progress.working = false;
    appState.progress.message = '';
  }

  processQueue();

  function dispose() {
    cancelled = true;
  }

  lastBuilder = { dispose };

  return graph;
}
