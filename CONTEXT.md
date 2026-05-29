# Wiki Graph

Visual exploration of knowledge graphs -- Wikipedia article networks and book entity graphs.

## Glossary

### Interactions

**filter**:
Typing in the search bar to highlight matching nodes within the current graph without replacing it. Non-matching nodes are dimmed.
_Avoid_: search, find, query

**search from Wikipedia**:
Fetching a Wikipedia article and its backlinks, adding them to the existing graph without replacing it. After adding, outgoing links from the new backlinks are fetched (capped at 10) to create **bridge edges** with nodes already in the graph, enabling meaningful **community** detection across expansions. Additive, not navigational.
_Avoid_: expand, add nodes

**expand**:
Middle-clicking a node to add its Wikipedia backlinks to the existing graph without replacing it. The clicked node is called the expansion anchor.
_Avoid_: drill down, zoom in, follow

**navigate**:
Double-clicking a node to replace the entire graph with a new one rooted at that node.
_Avoid_: go to, jump to, change root

### Graph concepts

**community explanation**:
A short LLM-generated label (one word or phrase) with a brief explanation of why the nodes in a **community** are topically related. Grounded in the node names and **context sentences** from the community's top 5 edges by weight (falls back to node names only for Wikipedia graphs). Generated on-demand; cached in localStorage.
_Avoid_: community label, community summary, community description, cluster name

**edge explanation**:
A one-sentence LLM-generated summary of why two entities are connected, grounded in their **context sentences**. Generated on-demand when the user clicks an edge; cached in localStorage.
_Avoid_: edge description, relationship reason, edge summary

**context sentences**:
Up to 2 representative sentences where two connected entities co-occur, stored alongside each edge. The first is the strongest co-occurrence (same sentence, highest weight); the second comes from a different chapter if available.
_Avoid_: co-occurrence text, sentence evidence, edge context

**edge table**:
A tabular view listing all edges with columns: source, target, PMI, weight, truncated context sentence, and an **edge explanation** button.
_Avoid_: edge list, connection table

**backlink**:
A Wikipedia page that links to the expansion anchor's Wikipedia article. Fetched via the `linkshere` API.
_Avoid_: parent, upstream, reference

**backlink depth**:
The radius of expansion from an expansion anchor. Current value: 1 (immediate backlinks only).

**bridge edge**:
An edge added between a newly fetched backlink and an existing node in the graph, discovered by fetching the backlink's outgoing Wikipedia links. Created during **search from Wikipedia** and **expand** to connect separate expansion batches, enabling meaningful **community** detection.
_Avoid_: cross-edge, inter-link

**community**:
A group of topologically related nodes discovered via a community detection algorithm (Louvain). Used for node coloring and hierarchical layouts (CirclePack). Book entity graphs compute communities on the backend; Wikipedia graphs compute them on the frontend.
_Avoid_: cluster, group, partition

### Layout

**ForceAtlas2**:
Force-directed layout algorithm that arranges nodes based on graph topology. Tunable parameters are hidden from the user; it runs on/off via a toggle button.

**CirclePack**:
Hierarchical layout that packs **community** groups into nested circles. Available for any graph with **community** data (both book entity and Wikipedia graphs).

### Visual

**degree-based sizing**:
Node visual size is proportional to its degree (number of connections). Hubs appear larger than leaves.

**community color**:
Each **community** is assigned a distinct color. Nodes and edges use this color for visual grouping.
_Avoid_: cluster color, group color

**size threshold**:
User-adjustable slider that hides nodes below a certain degree, decluttering dense graphs.

**PMI pruning**:
Edge-based decluttering using Pointwise Mutual Information. A slider from 0% to 100% progressively removes edges ranked by PMI score. 0-20% removes negative PMI edges (coincidental co-occurrence), 20-100% removes positive PMI edges from weakest to strongest. Communities and layout are not recalculated — only edge visibility and node opacity change. Nodes that lose all edges become **orphans** and are rendered dimmed.

**PMI**:
Pointwise Mutual Information score measuring whether two entities co-occur more than chance would predict. Higher PMI = stronger semantic association. Computed from the raw co-occurrence weight and individual entity frequencies.

**orphan**:
A node that has no visible edges after PMI pruning. Rendered at low opacity to remain visible but non-distracting: node dot is shrunk to 60% and colored `#e3e3e3`, label text is also dimmed to `#e3e3e3`. Wikipedia edges receive a default PMI of 5.0.

_Avoid_: isolated node, disconnected node

**label threshold**:
User-adjustable slider that controls the minimum zoom level at which node labels appear. Labels use a fixed font size (10px) independent of node degree — zooming in reveals labels for all nodes, not just hubs.

## Relationships

- An **edge** stores up to 2 **context sentences** that ground its **edge explanation**.
- An **edge explanation** is generated on-demand from **context sentences** — not pre-computed. It is cached in localStorage but regenerated on page refresh.
- The **edge table** displays raw **context sentences** inline; the LLM-generated **edge explanation** is only created on explicit user action.
- A **filter** highlights matching nodes within the current graph; it does not replace it.
- A **search from Wikipedia** adds new nodes to the existing graph; it does not replace it. After adding, **bridge edges** are created by fetching outgoing links from up to 10 of the most connected new nodes.
- An **expand** adds **backlinks** to the existing graph; it does not replace it. **Bridge edges** are also created after expansion.
- A **navigate** replaces the entire graph with a new one.
- A backlink has a **backlink depth** of 1 from its expansion anchor.
- Book entity nodes use their `wikipedia_title` as the expansion anchor for fetching backlinks.
- **Community** coloring replaces the former **expansion color** concept — nodes are colored by topology, not by which expansion added them. Bridge edges connect separate expansion batches, allowing Louvain to discover topically meaningful communities.
- **PMI pruning** operates on edges, not nodes. Negative PMI edges (coincidental co-occurrence) are removed first (0-20% slider), then positive PMI edges from weakest to strongest (20-100%). Community detection and layout are not recalculated during pruning.
- **Orphan** nodes (no visible edges after pruning) are dimmed, not hidden — they remain visible at low opacity.
- A **community explanation** is generated on-demand from community node names and **context sentences** from the top-5 edges within the community. It is cached in localStorage using a hash of sorted node names. Wikipedia graphs (which lack **context sentences**) fall back to node names only.

## Example dialogue

> **Dev:** "When a user clicks an edge, do we pre-generate the **edge explanation** during graph building?"
> **Domain expert:** "No — it's generated on-demand. The **context sentences** are stored with the edge during graph building, but the LLM call only happens when the user clicks. We cache the result in localStorage."

> **Dev:** "How many **context sentences** do we store per edge?"
> **Domain expert:** "Up to 2 — the strongest co-occurrence first, then one from a different chapter if available. The **edge table** shows the first one truncated inline."

> **Dev:** "When the user types in the search bar, do we fetch a new graph?"
> **Domain expert:** "No — a **filter** only highlights nodes already in the graph. To add new content, they use **search from Wikipedia**."

> **Dev:** "Can a **navigate** and a **search from Wikipedia** do the same thing?"
> **Domain expert:** "No — **navigate** replaces the entire graph. **Search from Wikipedia** adds to it."

> **Dev:** "Should the CirclePack layout be available for Wikipedia graphs?"
> **Domain expert:** "Yes — both book entity graphs and Wikipedia graphs have **community** data now. CirclePack is available wherever communities exist."

> **Dev:** "After adding backlinks from an expansion, do we just run Louvain immediately?"
> **Domain expert:** "No — we first build **bridge edges** by fetching outgoing links from the new backlinks. This connects separate expansion batches so Louvain sees the real topic structure, not isolated stars."

> **Dev:** "How many outgoing links do we fetch for bridge-building?"
> **Domain expert:** "Capped at 10 — prioritizing new nodes with higher degree. We want meaningful bridges without hammering the Wikipedia API."

> **Dev:** "When the user adjusts the PMI pruning slider, do we recalculate communities and layout?"
> **Domain expert:** "No — we only change edge visibility and node opacity. The original topology stays intact. Orphans are dimmed, not hidden."

> **Dev:** "Do Wikipedia edges get pruned too?"
> **Domain expert:** "Yes — they're given a default PMI of 5.0, so they survive light pruning but can be removed at aggressive levels."

> **Dev:** "How does a **community explanation** work?"
> **Domain expert:** "When the user clicks a community in the floating panel, we highlight that community, zoom to its bounds, and generate a **community explanation** — a short label and one-sentence why. It's grounded in the node names and **context sentences** from the community's top-5 edges. For Wikipedia graphs without context sentences, we fall back to node names only."

## Flagged ambiguities

- "search" was used to mean both **filter** (highlight) and **navigate** (replace graph). Resolved: these are distinct. Filter is the default search bar behavior; navigate is triggered by double-click.
- "year layout" was considered but dropped — neither Wikipedia graphs nor book entity graphs have temporal attributes that would make a timeline layout meaningful.
- "springLength" and "gravity" from the old boid layout are replaced by ForceAtlas2's internal parameters, which are hidden from the user.
