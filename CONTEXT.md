# Wiki Graph

Visual exploration of knowledge graphs -- Wikipedia article networks and book entity graphs.

## Glossary

### Interactions

**filter**:
Typing in the search bar to highlight matching nodes within the current graph without replacing it. Non-matching nodes are dimmed.
_Avoid_: search, find, query

**search from Wikipedia**:
Fetching a Wikipedia article and its backlinks, adding them to the existing graph without replacing it. Additive, not navigational.
_Avoid_: expand, add nodes

**expand**:
Right-clicking a node to add its Wikipedia backlinks to the existing graph without replacing it. The clicked node is called the expansion anchor.
_Avoid_: drill down, zoom in, follow

**navigate**:
Double-clicking a node to replace the entire graph with a new one rooted at that node.
_Avoid_: go to, jump to, change root

### Graph concepts

**backlink**:
A Wikipedia page that links to the expansion anchor's Wikipedia article. Fetched via the `linkshere` API.
_Avoid_: parent, upstream, reference

**backlink depth**:
The radius of expansion from an expansion anchor. Current value: 1 (immediate backlinks only).

**community**:
A group of topologically related nodes discovered via a community detection algorithm (Louvain). Used for node coloring and hierarchical layouts (CirclePack). Book entity graphs compute communities on the backend; Wikipedia graphs compute them on the frontend.
_Avoid_: cluster, group, partition

### Layout

**ForceAtlas2**:
Force-directed layout algorithm that arranges nodes based on graph topology. Tunable parameters are hidden from the user; it runs on/off via a toggle button.

**CirclePack**:
Hierarchical layout that packs **community** groups into nested circles. Available only for book entity graphs (where communities are computed).

### Visual

**degree-based sizing**:
Node visual size is proportional to its degree (number of connections). Hubs appear larger than leaves.

**community color**:
Each **community** is assigned a distinct color. Nodes and edges use this color for visual grouping.
_Avoid_: cluster color, group color

**size threshold**:
User-adjustable slider that hides nodes below a certain degree, decluttering dense graphs.

**label threshold**:
User-adjustable slider that controls the minimum rendered size at which node labels are shown.

## Relationships

- A **filter** highlights matching nodes within the current graph; it does not replace it.
- A **search from Wikipedia** adds new nodes to the existing graph; it does not replace it.
- An **expand** adds **backlinks** to the existing graph; it does not replace it.
- A **navigate** replaces the entire graph with a new one.
- A backlink has a **backlink depth** of 1 from its expansion anchor.
- Book entity nodes use their `wikipedia_title` as the expansion anchor for fetching backlinks.
- **Community** coloring replaces the former **expansion color** concept — nodes are colored by topology, not by which expansion added them.

## Example dialogue

> **Dev:** "When the user types in the search bar, do we fetch a new graph?"
> **Domain expert:** "No — a **filter** only highlights nodes already in the graph. To add new content, they use **search from Wikipedia**."

> **Dev:** "Can a **navigate** and a **search from Wikipedia** do the same thing?"
> **Domain expert:** "No — **navigate** replaces the entire graph. **Search from Wikipedia** adds to it."

> **Dev:** "Should the CirclePack layout be available for Wikipedia graphs?"
> **Domain expert:** "Only for book entity graphs — those have **community** data from the backend. Wikipedia graphs don't have communities, so CirclePack stays disabled."

## Flagged ambiguities

- "search" was used to mean both **filter** (highlight) and **navigate** (replace graph). Resolved: these are distinct. Filter is the default search bar behavior; navigate is triggered by double-click.
- "year layout" was considered but dropped — neither Wikipedia graphs nor book entity graphs have temporal attributes that would make a timeline layout meaningful.
- "springLength" and "gravity" from the old boid layout are replaced by ForceAtlas2's internal parameters, which are hidden from the user.
