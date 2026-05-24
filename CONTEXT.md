# Wiki Graph

Visual exploration of knowledge graphs -- Wikipedia article networks and book entity graphs.

## Glossary

### Interactions

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

### Layout

**physics config**:
User-adjustable parameters that control how the force-directed layout arranges nodes.

**springLength**:
Ideal distance between connected nodes (default: 50, range: 10-100).

**gravity**:
How hard nodes are pulled toward the center; negative values attract, zero means no centering (default: -3, range: -20 to 0).

**warm restart**:
Re-running the force layout simulation from current node positions rather than resetting to random positions.

**node spacing**:
User-facing label for springLength; controls how cramped or spacious the graph feels.

**spread**:
User-facing label for gravity; controls how much of the viewport the graph utilizes.

### Visual

**expansion color**:
A per-expansion stroke color applied to newly added nodes and edges during an expand operation. Each expansion gets a distinct color so the user can tell which bloom belongs to which click.

## Relationships

- An **expand** adds **backlinks** to the existing graph; it does not replace it.
- A **navigate** replaces the entire graph with a new one.
- A backlink has a **backlink depth** of 1 from its expansion anchor.
- Book entity nodes use their `wikipedia_title` as the expansion anchor for fetching backlinks.
