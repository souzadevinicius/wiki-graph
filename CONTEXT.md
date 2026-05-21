# Wiki Graph — Glossary

> This file is a glossary of domain terms. It is not a spec, not a design doc, not implementation notes.

## Terms

- **Book** — A PDF, TXT, or EPUB document uploaded by the user as a source of text for entity extraction.

- **Chapter** — A contiguous segment of a Book's text, delineated by structural markers in the source document (e.g., "Chapter 1", "Capítulo 2", EPUB spine items, or PDF page breaks in structured books). Chapters are a first-class concept that the user can filter on before the Processing Pipeline runs. Chapter labels use source-native titles when available (e.g., EPUB NCX/nav titles), falling back to sequential numbering ("Chapter 1", "Chapter 2") for heuristic detection. Chapters are identified by a 1-based sequential integer within the scope of a single upload.

- **Entity** — A named concept extracted from Book text via NLP (e.g., person, location, organization). Entities are resolved to a canonical form by querying the Wikipedia search API against each unique mention, using the user's selected frontend language to determine which Wikipedia edition to query. The Wikipedia article title (plus edition code) becomes the canonical key. Each entity tracks which Chapters it appeared in via `chapter_ids`.

- **Book Language** — Books are processed in either English or Portuguese. The user specifies the language at upload time, which determines which NER model is used for entity extraction and which chapter-detection regex patterns are applied (e.g., "Chapter N" for English, "Capítulo N" for Portuguese).

- **Processing Pipeline** — A streaming workflow where the Server processes a Book in stages: (1) extract text and detect chapters, (2) present chapter list to the user for selection, (3) extract entities via NER from selected chapters only, (4) build edges, (5) resolve Wikipedia. Progress is streamed to the Frontend via Server-Sent Events (SSE). The user sees real-time progress: entity count, edge count, Wikipedia resolution status.

- **Server** — A FastAPI application that serves both the REST API (under `/api/`) and the built Svelte frontend as static files. Single deployment unit.

- **Entity Graph** — A graph whose nodes are Entities and whose edges come in two types: **Book Edges** (window-based proximity between entities in the Book text, weighted by closeness) and **Wikipedia Edges** (added when the Wikipedia Layer is enabled, representing related-page relationships between Wikipedia-resolved entities). The two edge types are visually distinguishable (e.g., different colors or weights).

- **Wikipedia Layer** — An optional enrichment where Entities are resolved to corresponding Wikipedia articles. When enabled, Entity Graph nodes gain Wikipedia metadata (summary, thumbnail, related pages). When disabled, the core Entity Graph remains intact — nodes fall back to raw entity labels and book-derived edges only.

- **Fusion Mode** — The default operating mode where the Entity Graph is built from Books, and the Wikipedia Layer is available as a toggleable enrichment.
