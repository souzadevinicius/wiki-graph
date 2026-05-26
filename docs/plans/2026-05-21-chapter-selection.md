# Chapter Selection Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add chapter detection and selection to the book upload flow so users can choose which chapters to process, avoiding noise from irrelevant sections.

**Architecture:** Two-phase upload flow. Phase 1: `POST /api/extract-chapters` extracts text, detects chapters, returns chapter list + upload_id. Phase 2: `POST /api/process` accepts upload_id + selected chapter IDs, runs NER/graph/Wikipedia pipeline on selected chapters only, streams graph via SSE. Entities retain `chapter_ids` metadata. EPUB chapters come from spine structure; PDF/TXT use language-aware regex.

**Tech Stack:** ebooklib (EPUB parsing), PyMuPDF (PDF), spaCy (NER), FastAPI (server), Svelte (frontend)

---

## Backend: book-entities

### Task 1: Add `ebooklib` dependency

**Objective:** Add EPUB parsing library to project dependencies.

**Files:**
- Modify: `/Users/viniciusdesouza/workspace/book-entities/pyproject.toml`

**Step 1: Add dependency**

In `pyproject.toml`, add `ebooklib>=0.18` to the `dependencies` list:

```python
dependencies = [
    "numpy<2",
    "spacy>=3.7",
    "pymupdf>=1.24",
    "pydantic>=2.0",
    "typer>=0.9",
    "httpx>=0.27",
    "fastapi>=0.115",
    "uvicorn>=0.30",
    "python-multipart>=0.0.18",
    "logger>=1.4",
    "ebooklib>=0.18",
]
```

**Step 2: Sync dependencies**

Run: `cd /Users/viniciusdesouza/workspace/book-entities && uv sync`
Expected: ebooklib installed, lock file updated

**Step 3: Commit**

```bash
cd /Users/viniciusdesouza/workspace/book-entities
git add pyproject.toml uv.lock
git commit -m "deps: add ebooklib for EPUB parsing"
```

---

### Task 2: Add `Chapter` model and `chapter_ids` to `Entity`

**Objective:** Add domain models for Chapter and chapter tracking on entities.

**Files:**
- Modify: `/Users/viniciusdesouza/workspace/book-entities/src/book_entities/models.py`

**Step 1: Add `Chapter` dataclass and `UploadResult`**

After the `BookLanguage` type in `models.py`, add:

```python
@dataclass
class Chapter:
    """A chapter segment of a Book."""

    id: int          # 1-based sequential ID
    label: str       # Display label (EPUB title or "Chapter N")
    text: str        # Full text of this chapter
    preview: str = ""  # First ~100 chars for UI preview


@dataclass
class UploadResult:
    """Result of phase 1: text extraction + chapter detection."""

    upload_id: str
    filename: str
    chapters: list[Chapter]


@dataclass
class Entity:
    """A named entity extracted from book text."""

    label: str
    entity_type: str  # e.g. PERSON, LOC, ORG
    mentions: list[str] = field(default_factory=list)
    start_char: int | None = None
    end_char: int | None = None

    # Set during Wikipedia resolution
    wikipedia_title: str | None = None
    wikipedia_lang: str | None = None

    # Track which chapters this entity appeared in
    chapter_ids: list[int] = field(default_factory=list)
```

**Step 2: Update `PipelineProgress` stages**

Add `"extracting_chapters"` to the Literal:

```python
    stage: Literal[
        "extracting_text",
        "extracting_chapters",
        "extracting_entities",
        "building_graph",
        "resolving_wikipedia",
        "complete",
    ]
```

**Step 3: Verify import works**

Run: `cd /Users/viniciusdesouza/workspace/book-entities && python -c "from book_entities.models import Chapter, UploadResult, Entity; e = Entity(label='Test', entity_type='PERSON', chapter_ids=[1]); print(e)"`
Expected: `Entity(label='Test', entity_type='PERSON', mentions=[], start_char=None, end_char=None, wikipedia_title=None, wikipedia_lang=None, chapter_ids=[1])`

**Step 4: Commit**

```bash
cd /Users/viniciusdesouza/workspace/book-entities
git add src/book_entities/models.py
git commit -m "feat: add Chapter model and chapter_ids to Entity"
```

---

### Task 3: Add EPUB text extraction and chapter detection

**Objective:** Support EPUB files and detect chapters structurally (EPUB spine) or via regex (PDF/TXT).

**Files:**
- Modify: `/Users/viniciusdesouza/workspace/book-entities/src/book_entities/text_extractor.py`

**Step 1: Add EPUB extraction and chapter detection functions**

Add to the end of `text_extractor.py`:

```python
def extract_text_from_epub(path: Path) -> list[str]:
    """Extract text from each chapter of an EPUB file.

    Uses ebooklib to read the EPUB spine, extracting text from each
    item in reading order. Returns one text segment per chapter.

    Args:
        path: Path to an .epub file.

    Returns:
        List of text strings, one per chapter in spine order.
    """
    from ebooklib import epub

    book = epub.read_epub(str(path))
    chapters: list[str] = []

    for item in book.get_items_of_type(epub.ELEMENT_NAV):
        # NAV items contain the table of contents
        pass

    # Get items in spine order (reading order)
    for item in book.get_items():
        if item.get_type() == epub.ITEM_DOCUMENT:
            content = item.get_content().decode("utf-8", errors="replace")
            # Strip HTML tags for plain text
            import re
            text = re.sub(r"<[^>]+>", " ", content)
            text = re.sub(r"\s+", " ", text).strip()
            if text:
                chapters.append(text)

    return chapters if chapters else [""]


def get_epub_chapter_titles(path: Path) -> list[str]:
    """Extract chapter titles from EPUB NCX/nav.

    Falls back to generic 'Chapter N' if no NCX/nav titles found.

    Args:
        path: Path to an .epub file.

    Returns:
        List of chapter titles aligned with spine order.
    """
    from ebooklib import epub

    book = epub.read_epub(str(path))
    titles: list[str] = []

    # Try NCX (TOC)
    for item in book.get_items_of_type(epub.ITEM_NAV):
        import re
        from ebooklib epub import NavElement
        # Parse nav points
        try:
            nav_doc = epub.read_epub(str(path), options={"ignore_ncx": True})
        except Exception:
            pass

    # Try TOC from book.toc
    for toc_item in book.toc:
        if hasattr(toc_item, "name"):
            titles.append(toc_item.name)
        elif hasattr(toc_item, "__iter__"):
            # Nested TOC item
            for sub in toc_item:
                if hasattr(sub, "name"):
                    titles.append(sub.name)

    # Get total document items for fallback
    doc_count = sum(1 for item in book.get_items() if item.get_type() == epub.ITEM_DOCUMENT)

    if not titles:
        titles = [f"Chapter {i + 1}" for i in range(doc_count)]

    return titles


def detect_chapters_regex(text: str, lang: str = "en") -> list[tuple[str, str]]:
    """Detect chapters in text using language-aware regex.

    Args:
        text: Full text of the book.
        lang: Language code for pattern selection.

    Returns:
        List of (chapter_label, chapter_text) tuples.
    """
    import re

    if lang == "pt":
        patterns = [
            r"^Capítulo\s+\d+",
            r"^Capítulo\s+[IVXLCDM]+",
            r"^CAPÍTULO\s+\d+",
        ]
    else:
        patterns = [
            r"^Chapter\s+\d+",
            r"^Chapter\s+[IVXLCDM]+",
            r"^CHAPTER\s+\d+",
            r"^\d+\.\s+",  # "1. Some title"
        ]

    # Join patterns
    combined = "|".join(f"(?mi)^({p})" for p in patterns)
    matches = list(re.finditer(combined, text))

    if not matches:
        # No chapters found — entire text is one chapter
        preview = text[:100].replace("\n", " ")
        return [("Full text", text)]

    chapters: list[tuple[str, str]] = []
    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        label_line = text[match.start():match.start() + 200].split("\n")[0].strip()
        chapter_text = text[start:end]
        chapters.append((label_line, chapter_text))

    return chapters if chapters else [("Full text", text)]


def split_into_chapters(file_path: str | Path, lang: str = "en") -> list["Chapter"]:
    """Split a book file into chapters.

    For EPUB: uses structural spine items.
    For PDF/TXT: uses regex-based chapter detection.

    Args:
        file_path: Path to the book file.
        lang: Language for regex patterns.

    Returns:
        List of Chapter objects, 1-indexed.
    """
    path = Path(file_path)
    ext = path.suffix.lower()

    if ext == ".epub":
        texts = extract_text_from_epub(path)
        titles = get_epub_chapter_titles(path)

        chapters: list[Chapter] = []
        for i, (text, title) in enumerate(zip(texts, titles)):
            preview = text[:100].replace("\n", " ")
            chapters.append(Chapter(
                id=i + 1,
                label=title,
                text=text,
                preview=preview,
            ))

        # If titles ran out but there are more chapters
        while len(chapters) < len(texts):
            i = len(chapters)
            preview = texts[i][:100].replace("\n", " ")
            chapters.append(Chapter(
                id=i + 1,
                label=f"Chapter {i + 1}",
                text=texts[i],
                preview=preview,
            ))

        return chapters if chapters else [Chapter(id=1, label="Full text", text="", preview="")]

    else:
        # PDF or TXT — extract full text, then detect chapters
        full_text = extract_text(path)
        parts = detect_chapters_regex(full_text, lang)

        chapters: list[Chapter] = []
        for i, (label, text) in enumerate(parts):
            preview = text[:100].replace("\n", " ")
            chapters.append(Chapter(
                id=i + 1,
                label=label,
                text=text,
                preview=preview,
            ))

        return chapters
```

Wait — the `get_epub_chapter_titles` function has messy epublib usage. Let me simplify:

Replace the entire EPUB section with this cleaner version:

```python
def _extract_epub_chapters(path: Path) -> list[Chapter]:
    """Extract chapters from EPUB using spine order.

    Uses ebooklib. Each ITEM_DOCUMENT in spine order becomes a chapter.
    Titles are read from the TOC where available; otherwise fallback to
    'Chapter N'.
    """
    from ebooklib import epub
    import re

    book = epub.read_epub(str(path))

    # Collect titles from TOC
    toc_titles: list[str] = []
    for item in book.toc:
        if hasattr(item, "name") and item.name:
            toc_titles.append(item.name)
        elif hasattr(item, "__iter__"):
            for sub in item:
                if hasattr(sub, "name") and sub.name:
                    toc_titles.append(sub.name)

    # Collect document items in spine order
    doc_items = [item for item in book.get_items() if item.get_type() == epub.ITEM_DOCUMENT]

    chapters: list[Chapter] = []
    for i, item in enumerate(doc_items):
        content = item.get_content().decode("utf-8", errors="replace")
        text = re.sub(r"<[^>]+>", " ", content)
        text = re.sub(r"\s+", " ", text).strip()

        if i < len(toc_titles):
            label = toc_titles[i]
        else:
            label = f"Chapter {i + 1}"

        preview = text[:100].replace("\n", " ") if text else ""
        chapters.append(Chapter(
            id=i + 1,
            label=label,
            text=text,
            preview=preview,
        ))

    if not chapters:
        chapters.append(Chapter(id=1, label="Full text", text="", preview=""))

    return chapters
```

And `split_into_chapters` becomes:

```python
def split_into_chapters(file_path: str | Path, lang: str = "en") -> list[Chapter]:
    """Split a book file into chapters.

    For EPUB: uses structural spine items.
    For PDF/TXT: uses regex-based chapter detection.

    Args:
        file_path: Path to the book file.
        lang: Language for regex patterns.

    Returns:
        List of Chapter objects, 1-indexed.
    """
    path = Path(file_path)
    ext = path.suffix.lower()

    if ext == ".epub":
        return _extract_epub_chapters(path)
    else:
        full_text = extract_text(path)
        parts = detect_chapters_regex(full_text, lang)

        chapters: list[Chapter] = []
        for i, (label, text) in enumerate(parts):
            preview = text[:100].replace("\n", " ")
            chapters.append(Chapter(
                id=i + 1,
                label=label,
                text=text,
                preview=preview,
            ))

        return chapters if chapters else [Chapter(id=1, label="Full text", text=full_text, preview=full_text[:100].replace("\n", " "))]
```

**Step 2: Add test for chapter detection**

Create `/Users/viniciusdesouza/workspace/book-entities/tests/test_chapter_detection.py`:

```python
"""Tests for chapter detection."""

import tempfile
from pathlib import Path

from book_entities.text_extractor import detect_chapters_regex, split_into_chapters


def test_detect_chapters_en():
    text = """Chapter 1: The Beginning
    This is the first chapter content.
    
    Chapter 2: The Middle
    This is the second chapter content.
    
    Chapter 3: The End
    This is the final chapter."""

    parts = detect_chapters_regex(text, "en")
    assert len(parts) == 3
    assert "Chapter 1" in parts[0][0]
    assert "first chapter" in parts[0][1]


def test_detect_chapters_pt():
    text = """Capítulo 1: O Início
    Conteúdo do primeiro capítulo.
    
    Capítulo 2: O Fim
    Conteúdo do segundo capítulo."""

    parts = detect_chapters_regex(text, "pt")
    assert len(parts) == 2
    assert "Capítulo 1" in parts[0][0]


def test_detect_no_chapters():
    text = "This is just plain text with no chapter markers at all."
    parts = detect_chapters_regex(text, "en")
    assert len(parts) == 1
    assert parts[0][0] == "Full text"


def test_split_txt_into_chapters():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write("Chapter 1: Start\nSome content here.\n\nChapter 2: End\nMore content.")
        f.flush()
        chapters = split_into_chapters(f.name, "en")
    assert len(chapters) == 2
    assert chapters[0].id == 1
    assert chapters[1].id == 2
    assert "Chapter 1" in chapters[0].label
```

**Step 3: Run tests**

Run: `cd /Users/viniciusdesouza/workspace/book-entities && python -m pytest tests/test_chapter_detection.py -v`
Expected: 4 tests pass

**Step 4: Commit**

```bash
cd /Users/viniciusdesouza/workspace/book-entities
git add src/book_entities/text_extractor.py tests/test_chapter_detection.py
git commit -m "feat: add EPUB support and chapter detection"
```

---

### Task 4: Update NER to track chapter IDs

**Objective:** Modify entity extraction to accept chapter-scoped text and tag entities with their source chapter IDs.

**Files:**
- Modify: `/Users/viniciusdesouza/workspace/book-entities/src/book_entities/ner.py`

**Step 1: Update `extract_entities_with_positions` to accept chapter IDs**

Modify the function signature and implementation:

```python
def extract_entities_with_positions(
    text: str, lang: BookLanguage = "en", chapter_id: int = 1
) -> list[tuple[Entity, int]]:
    """Extract entities with their sentence positions.

    Returns entities paired with the sentence index where they appear,
    enabling window-based proximity edge building.

    Args:
        text: Input text.
        lang: Language for the spaCy model.
        chapter_id: Chapter this text belongs to (for tracking).

    Returns:
        List of (Entity, sentence_index) tuples.
    """
    nlp = load_nlp(lang)

    docs = []
    CHUNK_SIZE = 10_000
    words = text.split()

    for i in range(0, len(words), CHUNK_SIZE):
        chunk = " ".join(words[i : i + CHUNK_SIZE])
        doc = nlp(chunk)
        docs.append(doc)

    results: list[tuple[Entity, int]] = []
    sentence_idx = 0

    for doc in docs:
        for sent in doc.sents:
            entities_in_sent: dict[str, Entity] = {}
            for ent in sent.ents:
                if ent.label_ not in RELEVANT_ENTITY_TYPES:
                    continue
                key = ent.text.upper().strip()
                if not key:
                    continue

                if key not in entities_in_sent:
                    entities_in_sent[key] = Entity(
                        label=ent.text,
                        entity_type=ent.label_,
                        mentions=[ent.text],
                        chapter_ids=[chapter_id],
                    )

            for entity in entities_in_sent.values():
                results.append((entity, sentence_idx))

            sentence_idx += 1

    return results
```

**Step 2: Update existing tests**

In `/Users/viniciusdesouza/workspace/book-entities/tests/test_server.py`, check if `extract_entities_with_positions` is called and update to pass `chapter_id`.

Run: `cd /Users/viniciusdesouza/workspace/book-entities && python -m pytest tests/test_server.py -v`
Expected: Tests pass (chapter_id defaults to 1 for backward compat)

**Step 3: Commit**

```bash
cd /Users/viniciusdesouza/workspace/book-entities
git add src/book_entities/ner.py
git commit -m "feat: track chapter_ids on extracted entities"
```

---

### Task 5: Update graph builder to preserve chapter_ids

**Objective:** When merging entities during graph building, merge their `chapter_ids` lists.

**Files:**
- Modify: `/Users/viniciusdesouza/workspace/book-entities/src/book_entities/graph_builder.py`

**Step 1: Merge chapter_ids in entity deduplication**

In `build_proximity_graph`, update the entity_map merging:

```python
    # Deduplicate entities by normalized label
    entity_map: dict[str, Entity] = {}
    for entity, _ in entity_positions:
        key = entity.label.upper()
        if key not in entity_map:
            entity_map[key] = Entity(
                label=entity.label,
                entity_type=entity.entity_type,
                mentions=list(set(entity.mentions)),
                chapter_ids=list(entity.chapter_ids),
            )
        else:
            entity_map[key].mentions.extend(
                m for m in entity.mentions if m not in entity_map[key].mentions
            )
            # Merge chapter_ids
            for cid in entity.chapter_ids:
                if cid not in entity_map[key].chapter_ids:
                    entity_map[key].chapter_ids.append(cid)
```

**Step 2: Run existing tests**

Run: `cd /Users/viniciusdesouza/workspace/book-entities && python -m pytest tests/test_graph_builder.py -v`
Expected: Tests pass

**Step 3: Commit**

```bash
cd /Users/viniciusdesouza/workspace/book-entities
git add src/book_entities/graph_builder.py
git commit -m "feat: preserve chapter_ids through graph building"
```

---

### Task 6: Add upload storage and two-phase pipeline endpoints

**Objective:** Implement the two-phase server flow: extract-chapters (phase 1) and process (phase 2 with chapter selection).

**Files:**
- Modify: `/Users/viniciusdesouza/workspace/book-entities/src/book_entities/server.py`
- Create: `/Users/viniciusdesouza/workspace/book-entities/src/book_entities/upload_store.py`

**Step 1: Create upload store**

Create `upload_store.py`:

```python
"""Temporary storage for uploaded files between pipeline phases."""

from __future__ import annotations

import uuid
import shutil
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict

UPLOAD_DIR = Path(tempfile.gettempdir()) / "book-entities-uploads"

@dataclass
class StoredUpload:
    """Metadata for a stored upload."""
    upload_id: str
    file_path: Path
    filename: str
    chapters: list  # Chapter objects

# Global store
_store: Dict[str, StoredUpload] = {}


def save_upload(file_path: Path, filename: str, chapters: list) -> str:
    """Save an uploaded file for later processing.

    Args:
        file_path: Path to the uploaded temp file.
        filename: Original filename.
        chapters: Detected chapters.

    Returns:
        upload_id to reference this upload later.
    """
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    upload_id = uuid.uuid4().hex[:12]
    dest = UPLOAD_DIR / f"{upload_id}{Path(filename).suffix}"
    shutil.copy2(file_path, dest)

    _store[upload_id] = StoredUpload(
        upload_id=upload_id,
        file_path=dest,
        filename=filename,
        chapters=chapters,
    )
    return upload_id


def get_upload(upload_id: str) -> StoredUpload | None:
    """Retrieve a stored upload by ID."""
    return _store.get(upload_id)


def remove_upload(upload_id: str) -> None:
    """Remove a stored upload and its file."""
    stored = _store.pop(upload_id, None)
    if stored and stored.file_path.exists():
        stored.file_path.unlink(missing_ok=True)


def cleanup_all() -> None:
    """Remove all stored uploads. Useful for testing."""
    for upload_id in list(_store.keys()):
        remove_upload(upload_id)
    if UPLOAD_DIR.exists():
        shutil.rmtree(UPLOAD_DIR, ignore_errors=True)
```

Wait — this imports `tempfile` which needs importing. Let me fix:

```python
"""Temporary storage for uploaded files between pipeline phases."""

from __future__ import annotations

import shutil
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Dict

UPLOAD_DIR = Path(tempfile.gettempdir()) / "book-entities-uploads"


@dataclass
class StoredUpload:
    """Metadata for a stored upload."""
    upload_id: str
    file_path: Path
    filename: str
    chapters: list


# In-memory store: upload_id -> StoredUpload
_store: Dict[str, StoredUpload] = {}


def save_upload(file_path: Path, filename: str, chapters: list) -> str:
    """Save an uploaded file for later processing.

    Args:
        file_path: Path to the uploaded temp file.
        filename: Original filename.
        chapters: Detected Chapter objects.

    Returns:
        upload_id to reference this upload later.
    """
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    upload_id = uuid.uuid4().hex[:12]
    dest = UPLOAD_DIR / f"{upload_id}{Path(filename).suffix}"
    shutil.copy2(str(file_path), str(dest))

    _store[upload_id] = StoredUpload(
        upload_id=upload_id,
        file_path=dest,
        filename=filename,
        chapters=chapters,
    )
    return upload_id


def get_upload(upload_id: str) -> StoredUpload | None:
    """Retrieve a stored upload by ID."""
    return _store.get(upload_id)


def remove_upload(upload_id: str) -> None:
    """Remove a stored upload and its file."""
    stored = _store.pop(upload_id, None)
    if stored and stored.file_path.exists():
        stored.file_path.unlink(missing_ok=True)


def cleanup_all() -> None:
    """Remove all stored uploads. Useful for testing."""
    for upload_id in list(_store.keys()):
        remove_upload(upload_id)
    if UPLOAD_DIR.exists():
        shutil.rmtree(str(UPLOAD_DIR), ignore_errors=True)
```

**Step 2: Update server with two-phase endpoints**

Modify `server.py`. Add imports:

```python
from .text_extractor import split_into_chapters
from .upload_store import save_upload, get_upload, remove_upload
```

Add the phase 1 endpoint after the existing `/api/upload`:

```python
@app.post("/api/extract-chapters")
async def extract_chapters(
    file: UploadFile = File(...),
    lang: BookLanguage = "en",
):
    """Phase 1: Upload a book, extract text, detect chapters.

    Returns chapter list and upload_id for phase 2.
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in (".pdf", ".txt", ".epub"):
        return {"error": f"Unsupported file type: {ext}. Use .pdf, .txt, or .epub"}

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        content = await file.read()
        tmp.write(content)
        tmp.close()

        # Detect chapters
        chapters = split_into_chapters(tmp.name, lang)

        # Save for phase 2
        upload_id = save_upload(Path(tmp.name), file.filename or "unknown", chapters)

        return {
            "upload_id": upload_id,
            "filename": file.filename,
            "chapters": [
                {"id": c.id, "label": c.label, "preview": c.preview}
                for c in chapters
            ],
        }
    except Exception:
        try:
            Path(tmp.name).unlink(missing_ok=True)
        except OSError:
            pass
        raise


@app.post("/api/process")
async def process_with_chapters(
    upload_id: str,
    chapter_ids: list[int],
    lang: BookLanguage = "en",
    wiki_lang: str = "en",
    resolve_wiki: bool = True,
    window: int = 3,
):
    """Phase 2: Process selected chapters and stream graph via SSE.

    Args:
        upload_id: From phase 1 response.
        chapter_ids: List of chapter IDs to process (1-based).
        lang: Book language for NER.
        wiki_lang: Wikipedia language edition.
        resolve_wiki: Resolve entities to Wikipedia.
        window: Sentence window for proximity edges.
    """
    if len(chapter_ids) < 1:
        return {"error": "At least one chapter must be selected"}

    stored = get_upload(upload_id)
    if stored is None:
        return {"error": f"Upload not found: {upload_id}"}

    async def _stream():
        try:
            # Build combined text from selected chapters
            chapter_map = {c.id: c for c in stored.chapters}
            selected = [chapter_map[cid] for cid in chapter_ids if cid in chapter_map]

            if not selected:
                yield sse_event({"status": "error", "message": "No valid chapters selected"})
                return

            yield sse_event({"status": "upload_complete", "filename": stored.filename})

            # Stream progress and run pipeline
            async for progress in stream_pipeline_chapters(
                chapters=selected,
                lang=lang,
                wiki_lang=wiki_lang,
                resolve_wiki=resolve_wiki,
                window=window,
            ):
                yield sse_event({
                    "stage": progress.stage,
                    "detail": progress.detail,
                    "count": progress.count,
                })

            # Run pipeline to get graph
            graph = await run_pipeline_chapters(
                chapters=selected,
                lang=lang,
                wiki_lang=wiki_lang,
                resolve_wiki=resolve_wiki,
                window=window,
            )

            yield sse_event({"status": "graph", **_graph_to_dict(graph)})
            yield sse_event({"status": "done"})
        finally:
            remove_upload(upload_id)

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
```

**Step 3: Add chapter-aware pipeline functions**

In `pipeline.py`, add:

```python
async def run_pipeline_chapters(
    chapters: list[Chapter],
    lang: BookLanguage = "en",
    wiki_lang: str = "en",
    resolve_wiki: bool = True,
    window: int = 3,
) -> EntityGraph:
    """Run the pipeline on selected chapters.

    Concatenates chapter texts, runs NER per chapter (tracking chapter_ids),
    then builds a unified graph across all selected chapters.
    """
    all_entity_positions: list[tuple[Entity, int]] = []
    sentence_offset = 0

    for chapter in chapters:
        positions = extract_entities_with_positions(chapter.text, lang, chapter_id=chapter.id)
        # Adjust sentence indices so they're globally unique
        adjusted = [(ent, idx + sentence_offset) for ent, idx in positions]
        all_entity_positions.extend(adjusted)
        # Count sentences in this chapter for offset
        nlp = load_nlp(lang)
        doc = nlp(chapter.text[:1000])  # Approximate — just need sentence count
        sentence_offset += sum(1 for _ in doc.sents)

    graph = build_proximity_graph(all_entity_positions, window=window)

    if resolve_wiki and graph.entities:
        graph.entities = await resolve_entities_to_wikipedia(
            graph.entities, lang=wiki_lang
        )

    return graph


async def stream_pipeline_chapters(
    chapters: list[Chapter],
    lang: BookLanguage = "en",
    wiki_lang: str = "en",
    resolve_wiki: bool = True,
    window: int = 3,
):
    """Stream progress while processing selected chapters."""
    total_text = sum(len(c.text) for c in chapters)

    yield PipelineProgress(
        stage="extracting_entities",
        detail=f"Running NER on {len(chapters)} chapters ({total_text:,} chars)",
    )

    all_entity_positions: list[tuple[Entity, int]] = []
    sentence_offset = 0

    for chapter in chapters:
        positions = extract_entities_with_positions(chapter.text, lang, chapter_id=chapter.id)
        adjusted = [(ent, idx + sentence_offset) for ent, idx in positions]
        all_entity_positions.extend(adjusted)
        nlp = load_nlp(lang)
        doc = nlp(chapter.text[:1000])
        sentence_offset += sum(1 for _ in doc.sents)

    unique = {e.label.upper() for e, _ in all_entity_positions}
    yield PipelineProgress(
        stage="extracting_entities",
        detail=f"Found {len(unique)} unique entities from {len(all_entity_positions)} mentions",
        count=len(unique),
    )

    yield PipelineProgress(
        stage="building_graph",
        detail=f"Building proximity graph (window={window})",
    )
    graph = build_proximity_graph(all_entity_positions, window=window)
    yield PipelineProgress(
        stage="building_graph",
        detail=f"Graph: {graph.entity_count} nodes, {graph.edge_count} edges",
        count=graph.edge_count,
    )

    if resolve_wiki and graph.entities:
        total = len(graph.entities)
        yield PipelineProgress(
            stage="resolving_wikipedia",
            detail=f"Resolving {total} entities to Wikipedia (lang={wiki_lang})",
        )
        resolved = await resolve_entities_to_wikipedia(graph.entities, lang=wiki_lang)
        matched = sum(1 for e in resolved if e.wikipedia_title)
        yield PipelineProgress(
            stage="resolving_wikipedia",
            detail=f"Resolved {matched}/{total} entities to Wikipedia",
            count=matched,
        )
        graph.entities = resolved

    yield PipelineProgress(
        stage="complete",
        detail=f"Done: {graph.entity_count} entities, {graph.edge_count} edges",
        count=graph.entity_count + graph.edge_count,
    )
```

Also add the import at top of pipeline.py:
```python
from .ner import load_nlp
```

**Step 4: Update `_graph_to_dict` to include `chapter_ids`**

In `server.py`:

```python
def _graph_to_dict(graph) -> dict:
    """Serialize an EntityGraph to a plain dict."""
    return {
        "entities": [
            {
                "label": e.label,
                "type": e.entity_type,
                "mentions": e.mentions,
                "wikipedia_title": e.wikipedia_title,
                "wikipedia_lang": e.wikipedia_lang,
                "chapter_ids": e.chapter_ids,
            }
            for e in graph.entities
        ],
        "edges": [
            {
                "source": e.source,
                "target": e.target,
                "weight": e.weight,
                "type": e.edge_type,
            }
            for e in graph.edges
        ],
        "stats": {
            "entity_count": graph.entity_count,
            "edge_count": graph.edge_count,
        },
    }
```

**Step 5: Update existing `/api/upload` to accept `.epub`**

In the existing `upload_book` endpoint, change the file type check:

```python
    if ext not in (".pdf", ".txt", ".epub"):
        return {"error": f"Unsupported file type: {ext}. Use .pdf, .txt, or .epub"}
```

Same for `/api/process_book`.

**Step 6: Run tests**

Run: `cd /Users/viniciusdesouza/workspace/book-entities && python -m pytest tests/ -v`
Expected: All existing tests pass

**Step 7: Commit**

```bash
cd /Users/viniciusdesouza/workspace/book-entities
git add src/book_entities/
git commit -m "feat: two-phase upload flow with chapter selection"
```

---

## Frontend: wiki-graph

### Task 7: Update `serverApi.ts` with two-phase API calls

**Objective:** Add `extractChapters` and `processWithChapters` functions.

**Files:**
- Modify: `/Users/viniciusdesouza/workspace/wiki-graph/src/lib/serverApi.ts`

**Step 1: Add new API functions**

```typescript
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

export async function processWithChapters(
  uploadId: string,
  chapterIds: number[],
  lang: string,
  onProgress: (stage: string, detail: string, count: number) => void,
) {
  const params = new URLSearchParams({
    upload_id: uploadId,
    chapter_ids: chapterIds.join(","),
    lang,
    wiki_lang: lang,
    resolve_wiki: "true",
  });

  const response = await fetch(`/api/process?${params}`, {
    method: "POST",
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
```

**Step 2: Update `graphToNgraph` to store `chapter_ids`**

```typescript
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
```

**Step 3: Commit**

```bash
cd /Users/viniciusdesouza/workspace/wiki-graph
git add src/lib/serverApi.ts
git commit -m "feat: add two-phase API client with chapter support"
```

---

### Task 8: Add chapter selection UI to `BookUpload.svelte`

**Objective:** Implement the two-phase UI: file select -> chapter list -> process.

**Files:**
- Modify: `/Users/viniciusdesouza/workspace/wiki-graph/src/lib/BookUpload.svelte`

**Step 1: Add chapter selection state and phase management**

```typescript
  // Phases: 'select' | 'chapters' | 'processing'
  let phase: "select" | "chapters" | "processing" = "select";
  let uploadId: string | null = null;
  let chapters: Chapter[] = [];
  let selectedChapterIds: Set<number> = new Set();
  let extracting = false;

  function onFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    file = target.files?.[0] || null;
    error = null;
    phase = "select";
  }

  async function extractAndShowChapters() {
    if (!file) return;
    extracting = true;
    error = null;

    try {
      const { extractChapters } = await import("./serverApi");
      const result = await extractChapters(file, bookLang);
      uploadId = result.upload_id;
      chapters = result.chapters;
      // Default: all selected
      selectedChapterIds = new Set(chapters.map(c => c.id));
      phase = "chapters";
    } catch (e) {
      error = e instanceof Error ? e.message : "Extraction failed";
    } finally {
      extracting = false;
    }
  }

  function toggleChapter(id: number) {
    if (selectedChapterIds.has(id)) {
      selectedChapterIds.delete(id);
    } else {
      selectedChapterIds.add(id);
    }
  }

  function toggleAll() {
    if (selectedChapterIds.size === chapters.length) {
      selectedChapterIds.clear();
    } else {
      selectedChapterIds = new Set(chapters.map(c => c.id));
    }
  }

  async function processSelected() {
    if (!uploadId || selectedChapterIds.size < 1) return;
    uploading = true;
    error = null;
    phase = "processing";

    try {
      const { processWithChapters } = await import("./serverApi");
      const graph = await processWithChapters(
        uploadId,
        Array.from(selectedChapterIds),
        bookLang,
        (stage, detail, count) => {
          progressStage = stage;
          progressDetail = detail;
          progressCount = count;
        },
      );
      dispatch("book-graph", graph);
    } catch (e) {
      error = e instanceof Error ? e.message : "Processing failed";
      phase = "chapters";
    } finally {
      uploading = false;
    }
  }
```

**Step 2: Update template**

Replace the template section with:

```svelte
<div class="book-upload" class:active={file !== null || uploading || extracting}>
  {#if phase === "select"}
    <div class="upload-controls">
      <label class="file-btn">
        <input
          type="file"
          accept=".pdf,.txt,.epub"
          bind:this={fileInput}
          on:change={onFileSelect}
        />
        <span>{file ? file.name : "Choose book"}</span>
      </label>

      <div class="lang-select">
        <select bind:value={bookLang}>
          <option value="en">English</option>
          <option value="pt">Português</option>
        </select>
      </div>

      <button
        class="upload-btn"
        on:click={extractAndShowChapters}
        disabled={!file || extracting}
      >
        {extracting ? "Extracting..." : "Extract chapters"}
      </button>
    </div>

    {#if error}
      <div class="error">{error}</div>
    {/if}

  {:else if phase === "chapters"}
    <div class="chapter-selection">
      <div class="chapter-header">
        <span class="file-name">{file?.name}</span>
        <button class="back-btn" on:click={() => { phase = "select"; file = null; }}>Change</button>
      </div>

      <div class="chapter-controls">
        <button class="toggle-all-btn" on:click={toggleAll}>
          {selectedChapterIds.size === chapters.length ? "Deselect all" : "Select all"}
        </button>
        <button
          class="upload-btn"
          on:click={processSelected}
          disabled={selectedChapterIds.size < 1}
        >
          Build graph ({selectedChapterIds.size}/{chapters.length})
        </button>
      </div>

      <div class="chapter-list">
        {#each chapters as chapter}
          <label class="chapter-item">
            <input
              type="checkbox"
              checked={selectedChapterIds.has(chapter.id)}
              on:change={() => toggleChapter(chapter.id)}
            />
            <div class="chapter-info">
              <span class="chapter-label">{chapter.label}</span>
              {#if chapter.preview}
                <span class="chapter-preview">{chapter.preview}</span>
              {/if}
            </div>
          </label>
        {/each}
      </div>

      {#if error}
        <div class="error">{error}</div>
      {/if}
    </div>

  {:else}
    <!-- Processing phase — same as current progress overlay -->
    <div class="progress-overlay">
      <div class="progress-spinner"></div>
      <div class="progress-text">
        <span class="stage">{progressStage}</span>
        {#if progressDetail}
          <span class="detail">{progressDetail}</span>
        {/if}
      </div>
    </div>
  {/if}
</div>
```

**Step 3: Add styles**

Add to the `<style>` block:

```css
  .chapter-selection {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 60vh;
  }

  .chapter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .file-name {
    font-size: 12px;
    color: var(--text-secondary, #888);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }

  .back-btn {
    background: none;
    border: none;
    color: var(--accent, #4a9eff);
    cursor: pointer;
    font-size: 12px;
  }

  .chapter-controls {
    display: flex;
    gap: 8px;
  }

  .toggle-all-btn {
    padding: 6px 8px;
    background: var(--bg-secondary, #1a1a2e);
    color: var(--text-primary, #e0e0e0);
    border: 1px solid var(--border-color, #333);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .chapter-list {
    max-height: 40vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .chapter-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 4px;
    border-radius: 4px;
    cursor: pointer;
  }

  .chapter-item:hover {
    background: var(--bg-secondary, #1a1a2e);
  }

  .chapter-item input[type="checkbox"] {
    margin-top: 2px;
  }

  .chapter-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .chapter-label {
    font-size: 13px;
    font-weight: 500;
  }

  .chapter-preview {
    font-size: 11px;
    color: var(--text-secondary, #888);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
```

**Step 4: Build and verify**

Run: `cd /Users/viniciusdesouza/workspace/wiki-graph && npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
cd /Users/viniciusdesouza/workspace/wiki-graph
git add src/lib/BookUpload.svelte src/lib/serverApi.ts
git commit -m "feat: chapter selection UI with two-phase upload"
```

---

### Task 9: Integration testing

**Objective:** End-to-end test the two-phase flow.

**Files:**
- Test via browser

**Step 1: Start the server**

Run: `cd /Users/viniciusdesouza/workspace/book-entities && book-server`

**Step 2: Test with a sample TXT file**

1. Open the frontend in browser
2. Upload a small TXT file with chapter markers
3. Verify chapter list appears with correct labels and previews
4. Deselect some chapters, click "Build graph"
5. Verify graph renders with entities from selected chapters only
6. Verify entity tooltips show chapter information

**Step 3: Test EPUB if available**

Same flow with an EPUB file. Verify chapter titles come from EPUB spine.

**Step 4: Test edge cases**

- Upload file with no chapter markers -> single "Full text" chapter
- Deselect all chapters -> process button disabled
- Single chapter selected -> works correctly

**Step 5: Commit any fixes**

---

### Task 10: Update serverApi process endpoint + clean up old `/api/upload` SSE usage

**Objective:** Ensure the old `uploadBook` function still works for backward compatibility, or deprecate it in favor of the new two-phase flow.

**Files:**
- Modify: `/Users/viniciusdesouza/workspace/wiki-graph/src/lib/serverApi.ts`

**Step 1: Keep `uploadBook` for backward compat but note it processes the entire file**

Add a comment at the top of `uploadBook`:

```typescript
/**
 * Upload a book and receive progress + graph via SSE.
 * @deprecated Use extractChapters() + processWithChapters() for chapter selection.
 * This function processes the entire book without chapter filtering.
 */
```

Also update the accept list in the old endpoint to include `.epub`:
```typescript
formData.append("resolve_wiki", "true");
```
(The server-side `/api/upload` already accepts epub after Task 6)

**Step 2: Commit**

```bash
cd /Users/viniciusdesouza/workspace/wiki-graph
git add src/lib/serverApi.ts
git commit -m "chore: deprecate legacy uploadBook in favor of two-phase flow"
```

---

## Summary of changes by repo

**book-entities (backend):**
- `pyproject.toml` — add `ebooklib`
- `src/book_entities/models.py` — add `Chapter`, `UploadResult`, `chapter_ids` on `Entity`
- `src/book_entities/text_extractor.py` — add EPUB extraction, chapter detection
- `src/book_entities/ner.py` — add `chapter_id` param to `extract_entities_with_positions`
- `src/book_entities/graph_builder.py` — merge `chapter_ids` during dedup
- `src/book_entities/pipeline.py` — add `run_pipeline_chapters` + `stream_pipeline_chapters`
- `src/book_entities/server.py` — add `/api/extract-chapters` + `/api/process` endpoints
- `src/book_entities/upload_store.py` — NEW: temp upload storage
- `tests/test_chapter_detection.py` — NEW: chapter detection tests

**wiki-graph (frontend):**
- `src/lib/serverApi.ts` — add `extractChapters`, `processWithChapters`, `chapter_ids` in node data
- `src/lib/BookUpload.svelte` — two-phase UI with chapter selection
