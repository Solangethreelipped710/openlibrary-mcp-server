# openlibrary-mcp-server — Design

## MCP Surface

### Tools

| Name | Description | Key Inputs | Annotations |
|:-----|:------------|:-----------|:------------|
| `openlibrary_search_books` | Full-text book search across works. Supports field filters (title, author, subject, publisher, ISBN, language). Returns work-level records with edition counts, cover IDs, and reading availability. | `query`, `title`, `author`, `subject`, `publisher`, `isbn`, `language`, `sort`, `limit`, `offset`, `include_availability` | `readOnlyHint: true` |
| `openlibrary_get_work` | Fetch a work by Open Library Work ID (OL…W). Returns title, description, subjects, cover IDs, and linked author IDs for follow-up lookups. | `work_id` | `readOnlyHint: true` |
| `openlibrary_get_editions` | List editions of a work — different publishers, languages, and formats. Returns ISBNs, publisher, language, page count, and edition OLIDs. | `work_id`, `limit`, `offset` | `readOnlyHint: true` |
| `openlibrary_get_edition` | Fetch a single edition by identifier: ISBN-10, ISBN-13, OCLC, LCCN, or OLID (OL…M). Returns full edition metadata including identifiers, publisher, language, and the parent work. | `identifier`, `id_type` | `readOnlyHint: true, idempotentHint: true` |
| `openlibrary_search_authors` | Search authors by name. Returns Open Library Author IDs, names, birth/death dates, and top works. | `query`, `limit`, `offset` | `readOnlyHint: true` |
| `openlibrary_get_author` | Fetch author detail by Open Library Author ID (OL…A). Returns bio, birth/death dates, photo ID, remote IDs (Wikidata, VIAF, ISNI), and works count. | `author_id` | `readOnlyHint: true, idempotentHint: true` |
| `openlibrary_get_author_works` | List works by an author. Returns titles, cover IDs, and work OLIDs for drilling into editions or details. | `author_id`, `limit`, `offset` | `readOnlyHint: true` |
| `openlibrary_get_subject` | Browse works by subject (e.g., "science fiction", "history"). Returns matching works with edition counts and cover IDs, plus total work count for the subject. | `subject`, `limit`, `offset`, `ebooks_only` | `readOnlyHint: true` |
| `openlibrary_get_cover_url` | Resolve a cover image URL for a book or author. Returns direct HTTPS URLs in three sizes (S/M/L). Supports lookup by cover ID, ISBN, OLID, or author OLID. | `identifier`, `id_type`, `target`, `size` | `readOnlyHint: true, idempotentHint: true` |

### Resources

| URI Template | Description | Pagination |
|:-------------|:------------|:-----------|
| `openlibrary://works/{work_id}` | Work detail by OL Work ID. Injectable context for chat about a specific book. | No |
| `openlibrary://authors/{author_id}` | Author detail by OL Author ID. Injectable context. | No |

### Prompts

None. The server is data/lookup-oriented; no recurring interaction patterns warrant a template.

---

## Overview

Read-only access to Open Library (Internet Archive) — a catalog of 20M+ book editions covering metadata, author info, subject browsing, and reading availability. Designed for educators, researchers, librarians, and agents that need book lookups, bibliography construction, reading list generation, or identifier resolution (ISBN, OCLC, LCCN, OLID).

The server wraps six Open Library API surfaces: Search, Works, Editions (Books), Authors, Subjects, and Covers. No authentication required. Rate limits are not officially published; the service layer always includes a `User-Agent` header (community convention to signal a well-behaved client).

---

## Requirements

- Read-only; no write, list, or user-account operations
- Full-text book search with field filters (title, author, subject, publisher, ISBN, language, sort)
- Work and edition lookup by OL Work ID
- Edition lookup by any of: ISBN-10, ISBN-13, OCLC, LCCN, OLID — using the `/isbn/`, `/books/` and `/api/books?bibkeys=` endpoints
- Author search and detail retrieval, with author→works traversal
- Subject browsing with work counts and edition data
- Cover image URL construction for books and authors (S/M/L sizes)
- Reading availability status surfaced from search results where requested (only for works with an Internet Archive item in the `ia` field)
- Work → Edition relationship clearly represented; agents can drill from a work to specific printings
- Identifier passthrough: work OLIDs, edition OLIDs, author OLIDs, cover IDs surfaced in outputs for chaining

---

## Services

| Service | Wraps | Used By |
|:--------|:------|:--------|
| `OpenLibraryService` | Open Library REST APIs (search.json, /works/, /books/, /isbn/, /authors/, /subjects/) | All tools |

Single service — all Open Library endpoints share the same base URL, rate limit regime, and response-parsing conventions. No benefit to splitting.

---

## Config

| Env Var | Required | Description |
|:--------|:---------|:------------|
| `OPENLIBRARY_USER_AGENT` | No | Custom `User-Agent` string. Default: `openlibrary-mcp-server/1.0 (openlibrary@archive.org)`. Including a contact email is community convention for well-behaved bots. |

No API key required. The `User-Agent` header is the only runtime knob, and it has a sensible default.

---

## Implementation Order

1. `src/config/server-config.ts` — `OPENLIBRARY_USER_AGENT` env var
2. `OpenLibraryService` — HTTP client with `User-Agent`, retry, timeout, response parsing
3. `openlibrary_search_books` — the entry point for most workflows
4. `openlibrary_get_work` and `openlibrary_get_editions` — drill-down from search
5. `openlibrary_get_edition` — identifier resolution (ISBN/OCLC/LCCN/OLID)
6. `openlibrary_search_authors` and `openlibrary_get_author` + `openlibrary_get_author_works`
7. `openlibrary_get_subject`
8. `openlibrary_get_cover_url`
9. Resources

Each step is independently testable via real API responses.

---

## Domain Mapping

The Open Library data model has two key entity types agents need to navigate:

| Entity | ID Pattern | Description |
|:-------|:-----------|:------------|
| **Work** | `OL…W` | The abstract "book" — one record regardless of how many editions/translations exist |
| **Edition** | `OL…M` | A specific printing — tied to ISBN(s), publisher, language, format |
| **Author** | `OL…A` | Author record with bio, dates, linked remote IDs |

A Work has N Editions; an Edition belongs to exactly one Work.

### Identifier systems for editions

| ID type | Example | Notes |
|:--------|:--------|:------|
| ISBN-13 | `9780743273565` | Most common; `/isbn/<id>.json` resolves directly |
| ISBN-10 | `0743273567` | Legacy; same endpoint handles both |
| OCLC | `36863723` | WorldCat number; `/api/books?bibkeys=OCLC:…` |
| LCCN | `00027665` | Library of Congress; `/api/books?bibkeys=LCCN:…` |
| OLID | `OL7353617M` | Native Open Library edition ID; `/books/<id>.json` |

The `/isbn/<id>.json` endpoint redirects to the canonical edition record and returns full edition JSON. For OCLC/LCCN, the `/api/books?bibkeys=…&format=json&jscmd=data` endpoint handles multi-identifier batch lookups in one call.

### Covers API

Cover images are separate from the main API:

```
https://covers.openlibrary.org/b/{key_type}/{value}-{size}.jpg
https://covers.openlibrary.org/a/{key_type}/{value}-{size}.jpg   (author photos)
```

`key_type`: `id`, `isbn`, `olid`, `lccn`, `oclc`  
`size`: `S` (small), `M` (medium), `L` (large)

The API returns the image directly as HTTP 200 (no redirect). For missing or nonexistent covers, it returns HTTP 200 with a 1×1 placeholder GIF — not a 404. The `openlibrary_get_cover_url` tool constructs and returns the URL; the presence of a real image cannot be confirmed without fetching it.

### Reading availability

The search endpoint supports an `availability` field selector that returns live status from archive.org:

```json
{
  "status": "borrow_available",
  "available_to_browse": true,
  "available_to_borrow": false,
  "available_to_waitlist": false,
  "is_readable": false,
  "is_lendable": true,
  "is_previewable": true,
  "is_restricted": true,
  "openlibrary_work": "OL82563W",
  "openlibrary_edition": "OL61057835M"
}
```

This is requested by adding `availability` to the `fields` query parameter. It resolves against the first IA identifier in the work's `ia` array — works without any IA items return no `availability` key. This adds latency (~200ms extra per request), so it's opt-in via `include_availability: true` on `openlibrary_search_books`.

---

## Workflow Analysis

### Common agent workflow: "find and describe a book"

| Step | Tool | Purpose |
|:-----|:-----|:--------|
| 1 | `openlibrary_search_books` | Locate the work by title/author/subject |
| 2 | `openlibrary_get_work` | Get full description, subjects, cover IDs |
| 3 | `openlibrary_get_editions` | Find a specific printing (language, publisher, year) |
| 4 | `openlibrary_get_cover_url` | Resolve cover image URL from cover ID |

### Common agent workflow: "look up by ISBN"

| Step | Tool | Purpose |
|:-----|:-----|:--------|
| 1 | `openlibrary_get_edition` (id_type: isbn) | Resolve ISBN → edition + parent work key |
| 2 | `openlibrary_get_work` | Get work-level metadata if needed |

### Common agent workflow: "explore an author's catalog"

| Step | Tool | Purpose |
|:-----|:-----|:--------|
| 1 | `openlibrary_search_authors` | Find the author by name |
| 2 | `openlibrary_get_author` | Get bio, dates, remote IDs |
| 3 | `openlibrary_get_author_works` | List works |
| 4 | `openlibrary_get_editions` (per work) | Drill into specific editions |

### Common agent workflow: "subject discovery"

| Step | Tool | Purpose |
|:-----|:-----|:--------|
| 1 | `openlibrary_get_subject` | Browse works by subject with work counts |
| 2 | `openlibrary_get_work` | Get detail on a specific work |

---

## Tool Design Details

### `openlibrary_search_books`

**Input schema:**

```ts
z.object({
  query:    z.string().optional()
    .describe('Full-text search query. Supports Solr field prefixes: title:, author:, subject:, publisher:, isbn:, language:. Omit to use the filter parameters instead.'),
  title:    z.string().optional()
    .describe('Filter by title. Matched against work title and alternative titles.'),
  author:   z.string().optional()
    .describe('Filter by author name. Partial names work.'),
  subject:  z.string().optional()
    .describe('Filter by subject tag (e.g., "science fiction", "history").'),
  publisher: z.string().optional()
    .describe('Filter by publisher name. Partial names work (e.g., "Penguin").'),
  isbn:     z.string().optional()
    .describe('Find works that have editions with this ISBN (10 or 13 digits, hyphens ignored).'),
  language: z.string().optional()
    .describe('Two-letter ISO 639-1 language code (e.g., "en", "fr"). Influences but does not exclude results; use language:fr in query to hard-filter.'),
  sort:     z.enum(['relevance', 'new', 'old', 'rating', 'editions'])
    .default('relevance')
    .describe('Sort order. "relevance" uses Solr scoring. "new"/"old" sort by first publish year. "rating" by average community rating. "editions" by edition count.'),
  limit:    z.number().int().min(1).max(100).default(10)
    .describe('Max results to return. Higher values increase response size; prefer 10–20 for exploration.'),
  offset:   z.number().int().min(0).default(0)
    .describe('Zero-based offset for pagination.'),
  include_availability: z.boolean().default(false)
    .describe('Include live reading availability from Internet Archive (borrow/read status). Adds ~200ms latency. Use when the user needs to know if they can read the book online.'),
})
```

**Output schema includes:** `total`, `offset`, `works[]` where each work has: `work_id`, `title`, `author_names`, `author_ids`, `first_publish_year`, `edition_count`, `cover_id` (optional), `subjects` (optional), `ebook_access` (enum: `no_ebook | printdisabled | borrowable | public`), `has_fulltext`, `ratings_average` (optional), `availability` (optional, present when `include_availability: true` AND the work has an IA item), `ia_identifiers`.

The `availability` object shape (when present): `status`, `available_to_browse`, `available_to_borrow`, `available_to_waitlist`, `is_readable`, `is_lendable`, `is_previewable`, `is_restricted`, `openlibrary_edition`. The design doc's earlier availability snippet is a subset — the full shape includes `available_to_waitlist` and `is_restricted`.

**Implementation note:** `availability` is requested by including it in the `fields` query parameter (e.g., `fields=key,title,availability`). It reads from the first IA identifier in the work's `ia` array. Works without any `ia` items return no `availability` key even with `include_availability: true` — surface this in the output as `availability: null`.

**Errors:**
- `no_results` — `NotFound`: Query matched no works. Broaden the query or try different terms.
- `invalid_query` — `InvalidParams`: Query syntax error. Check Solr field prefix syntax.

### `openlibrary_get_work`

**Input:** `work_id: string` — `OL…W` format, e.g., `OL45804W`. Leading `/works/` prefix is stripped if provided.

**Output:** `work_id`, `title`, `description`, `subjects[]`, `subject_places[]`, `subject_times[]`, `subject_people[]`, `cover_ids[]`, `author_ids[]`, `created`, `last_modified`.

**Errors:**
- `not_found` — `NotFound`: Work ID not found. Verify the OLID format (e.g., `OL45804W`) or search for the title first.

### `openlibrary_get_editions`

**Input:** `work_id`, `limit` (1–100, default 10), `offset` (default 0).

**Output:** `total` (mapped from the API's `size` field), `work_id`, `editions[]` — each edition: `edition_id`, `title`, `publish_date`, `publishers[]`, `languages[]` (array of 3-letter codes parsed from `/languages/eng` key objects), `isbn_10[]`, `isbn_13[]`, `page_count` (from `number_of_pages`, optional), `cover_ids[]`, `work_id` (extracted from the `works[0].key` path).

**Implementation note:** The API response top-level fields are `size` (total count), `entries` (the edition array), and `links` (pagination). Map `size` → `total` and `entries` → `editions[]` in the service layer. The `language` field in raw edition records is `languages: [{"key": "/languages/eng"}]` — extract the 3-letter code from the key path.

Paginated via next/offset link in API response.

**Errors:**
- `not_found` — `NotFound`: Work ID not found.

### `openlibrary_get_edition`

**Input:**
```ts
z.object({
  identifier: z.string()
    .describe('The identifier value. For ISBN: 10 or 13 digits, hyphens stripped. For OCLC: numeric string. For LCCN: string as-is. For OLID: e.g., OL7353617M.'),
  id_type: z.enum(['isbn', 'oclc', 'lccn', 'olid'])
    .describe('Identifier type. "isbn" handles both ISBN-10 and ISBN-13. "olid" is the native Open Library edition ID (OL…M).'),
})
```

**Routing:** `isbn` → `/isbn/{id}.json` (HTTP 302 to `/books/{olid}.json`, follow redirect); `olid` → `/books/{id}.json`; `oclc`, `lccn` → `/api/books?bibkeys={TYPE}:{id}&format=json&jscmd=details`.

**Implementation note:** Use `jscmd=details` (not `jscmd=data`) for OCLC/LCCN. The `jscmd=data` response does not include a `works` key, so `work_id` cannot be extracted from it. `jscmd=details` wraps the edition record under a `details` key and does include `works[].key`. Author names are available in `jscmd=details` responses. For `isbn` and `olid` routes, the `/books/{id}.json` endpoint includes a `works` array directly.

**Output:** `edition_id`, `title`, `authors[]` (name + optional author_id), `publish_date`, `publishers[]`, `language`, `isbn_10[]`, `isbn_13[]`, `oclc[]`, `lccn[]`, `page_count`, `description`, `cover_ids[]`, `work_id` (the parent work OLID), `ebook_url` (if available via `ocaid`).

**Errors:**
- `not_found` — `NotFound`: Edition not found for this identifier. Verify the value or try searching by title/author.
- `invalid_identifier` — `InvalidParams`: Identifier format invalid for this id_type.

### `openlibrary_search_authors`

**Input:** `query: string`, `limit` (1–100, default 10), `offset` (default 0).

**Output:** `total`, `authors[]` — each: `author_id`, `name`, `alternate_names[]`, `birth_date`, `death_date`, `top_work`, `work_count`, `top_subjects[]`, `ratings_average`.

### `openlibrary_get_author`

**Input:** `author_id: string` — `OL…A` format. Leading `/authors/` prefix stripped if provided.

**Output:** `author_id`, `name`, `personal_name`, `fuller_name`, `bio`, `birth_date`, `death_date`, `photo_ids[]`, `remote_ids` (object with optional keys: `wikidata`, `viaf`, `isni`, `goodreads`, `librarything`).

**Errors:**
- `not_found` — `NotFound`: Author not found. Verify the OLID or search by name first.

### `openlibrary_get_author_works`

**Input:** `author_id: string`, `limit` (1–100, default 20), `offset` (default 0).

**Output:** `total` (mapped from the API's `size` field), `author_id`, `works[]` — each: `work_id`, `title`, `first_publish_date` (optional), `cover_ids[]`.

**Implementation note:** The API response top-level fields are `size` (total count) and `entries` (the work array). Map `size` → `total` and `entries` → `works[]`.

### `openlibrary_get_subject`

**Input:**
```ts
z.object({
  subject: z.string()
    .describe('Subject name. Spaces become underscores internally (e.g., "science fiction" → "science_fiction"). Use lowercase.'),
  limit: z.number().int().min(1).max(100).default(12)
    .describe('Max works to return. Subject pages typically show 12 at a time.'),
  offset: z.number().int().min(0).default(0),
  ebooks_only: z.boolean().default(false)
    .describe('Restrict to works with a readable or borrowable e-book on Internet Archive.'),
})
```

**Output:** `subject_name`, `subject_key`, `work_count`, `works[]` — each: `work_id`, `title`, `author_names[]`, `edition_count`, `cover_id`.

**Errors:**
- `not_found` — `NotFound`: Subject not found or no works. Try a broader subject term.

### `openlibrary_get_cover_url`

**Input:**
```ts
z.object({
  identifier: z.string()
    .describe('The identifier value. For "id": numeric cover ID from work/edition data. For "isbn": 10 or 13 digits. For "olid": edition OLID (OL…M) or author OLID (OL…A) when target is "author".'),
  id_type: z.enum(['id', 'isbn', 'olid'])
    .describe('"id" is the numeric cover_i / cover ID from search/work results. "isbn" and "olid" look up the cover from those identifiers.'),
  target: z.enum(['book', 'author']).default('book')
    .describe('"book" returns a cover image from covers.openlibrary.org/b/. "author" returns a photo from covers.openlibrary.org/a/ — use with id_type "id" (photo_id) or "olid" (author OLID).'),
  size: z.enum(['S', 'M', 'L']).default('M')
    .describe('Image size. S=small (~45px tall), M=medium (~150px tall), L=large (~400px tall).'),
})
```

**Output:** `url: string` — direct HTTPS URL to the cover image served from `covers.openlibrary.org`. The cover API returns the image directly (HTTP 200) — there is no client-side redirect to follow.

**Implementation note:** The covers API returns HTTP 200 for missing covers with a 1×1 placeholder GIF rather than a 404. The `not_found` error cannot be detected from the HTTP status alone. The tool should return the URL as-is and note in the output that the caller may receive a placeholder if no cover exists. Do not declare a `not_found` error contract for this tool — it cannot be reliably signaled.

---

## Known Limitations

- **Author names in edition records** — edition records from `/books/{id}.json` and `/isbn/{id}.json` return author references as `/authors/OL…A` key objects, not names. For OCLC/LCCN routes the service uses `jscmd=details`, which does include author names inline. For ISBN/OLID routes, a secondary author-name lookup is required per author key.
- **`availability` adds latency** — the `availability` field in search triggers a cross-request to archive.org. This is why it's opt-in.
- **Subjects are uncontrolled vocabulary** — Open Library subjects are user-contributed strings, highly inconsistent (`"Science fiction"`, `"science fiction"`, `"SF"` are separate subjects). `openlibrary_get_subject` normalizes to lowercase and underscores, but exact subject discovery may require trial-and-error.
- **Sparse edition data** — many older or community-contributed editions have missing fields (no page count, no language code, no cover). The service layer treats all edition fields except `title` and `edition_id` as optional.
- **No full-text search inside books** — the "Search Inside" API exists but is a separate surface with limited value for the design's target audience. Not included.
- **Rate limits are unpublished** — Open Library has not published official rate limits. The service layer always sends a `User-Agent` header (community convention for well-behaved bots). Tools that resolve secondary data for multiple items (e.g., author names for many editions) should sequence requests carefully rather than fan out in parallel.
- **Works API doesn't return author names** — `GET /works/{id}.json` returns author keys, not names. Agents that need names alongside work data should use `openlibrary_search_books` (which does return `author_name[]`) or follow up with `openlibrary_get_author`.

---

## API Reference

### Base URL
`https://openlibrary.org`

### Key endpoints

| Endpoint | Purpose |
|:---------|:--------|
| `GET /search.json?q=…&fields=…&limit=…&offset=…` | Book search |
| `GET /search/authors.json?q=…&limit=…&offset=…` | Author search |
| `GET /works/{work_id}.json` | Work detail |
| `GET /works/{work_id}/editions.json?limit=…&offset=…` | Work editions list |
| `GET /books/{olid}.json` | Edition by OLID |
| `GET /isbn/{isbn}.json` | Edition by ISBN (follows redirect) |
| `GET /api/books?bibkeys=OCLC:{id}&format=json&jscmd=details` | Edition by OCLC (use `jscmd=details` to get `works` reference and author names) |
| `GET /api/books?bibkeys=LCCN:{id}&format=json&jscmd=details` | Edition by LCCN (same — `jscmd=data` does not include `works` key) |
| `GET /authors/{author_id}.json` | Author detail |
| `GET /authors/{author_id}/works.json?limit=…&offset=…` | Author works |
| `GET /subjects/{subject_key}.json?limit=…&offset=…&ebooks=1` | Subject browsing |

### Covers
`https://covers.openlibrary.org/b/{key_type}/{value}-{size}.jpg` — books  
`https://covers.openlibrary.org/a/{key_type}/{value}-{size}.jpg` — authors  
Sizes: `S`, `M`, `L`. Returns the image directly as HTTP 200. Missing covers return a 1×1 placeholder GIF, not 404.

### Pagination
Search: `offset`+`limit` or `page`+`limit` (page is 1-indexed). Works/editions, author works: `offset`+`limit`, with `next` link in response. Subjects: `offset`+`limit`.

### Error responses
HTTP 404 returns `{"error": "notfound", "key": "…"}`. HTTP 200 with empty `docs[]` is a valid empty search result (not an error). The `/isbn/` endpoint may return an unrelated record for invalid ISBNs (the index is user-contributed) — treat any record where the returned ISBN doesn't match the requested one as not found.

---

## Decisions Log

| Decision | Rationale |
|:---------|:----------|
| **No `openlibrary_resolve_identifier` wrapper tool** — edition lookup goes directly through `openlibrary_get_edition` with `id_type` enum | The id_type enum on `get_edition` is self-documenting and avoids a redundant tool. Agents pass the identifier and its type together — there's no ambiguity to resolve. |
| **`openlibrary_search_books` returns work-level records, not editions** | The Open Library search API is work-oriented. Surfacing edition breakdown at search level would require N+1 calls. Agents that need a specific edition drill down via `get_editions` or `get_edition`. |
| **`include_availability` is opt-in boolean, not a separate tool** | Availability data comes from the same search endpoint via an extra field selector, but adds latency. Folding it into the search tool as an opt-in preserves the fast path for the common case. |
| **`openlibrary_get_cover_url` returns a URL string, not the image bytes** | MCP tools return text/structured data, not binary. Cover URLs can be embedded in markdown (`![cover](url)`) or passed to an image tool. Fetching and base64-encoding cover bytes would exceed reasonable context budgets. |
| **No `openlibrary_get_reading_list` or user account tools** | The "Your Books" and "Lists" APIs require OAuth and are write-capable. Out of scope for a read-only server targeting book discovery, not personal library management. |
| **Single `OpenLibraryService`** | All Open Library endpoints share base URL, `User-Agent`, retry config, and rate limit. No benefit to splitting by endpoint group. |
| **`sort` enum limits to 4 values** | Open Library supports ~15 sort facets (raw Solr field sorts). The four meaningful ones for agents: relevance, newest, oldest, most editions, rating. The rest (e.g., `title_sort`, `random`) are either exotic or better expressed by filtering. |
| **Author name resolution in `openlibrary_get_edition`** | Edition records from `/books/{id}.json` and `/isbn/{id}.json` return author `/authors/OL…A` keys, not names. For OCLC/LCCN, the service uses `jscmd=details` (not `jscmd=data` — `data` omits the `works` reference needed for `work_id`). `jscmd=details` wraps the edition record under a `details` key and includes author names. For ISBN/OLID routes, names require a secondary author lookup. |
| **No `openlibrary_search_books` `page` parameter — only `offset`** | The API supports both `page` and `offset`. `offset` is more composable for agents iterating through results programmatically. |
| **Resources for works and authors, not editions or subjects** | Resources are stable, addressable context — works and authors have stable OLIDs and are worth injecting as context. Editions are often intermediate results (an agent gets an edition OLID from a search or work lookup). Subjects are browsing paths, not stable addressable entities. |
| **No DataCanvas integration** | Search results are bounded (max 100 per request) and metadata-only. Not tabular analytical data. Canvas adds complexity without benefit here. |
