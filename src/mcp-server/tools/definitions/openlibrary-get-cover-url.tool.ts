/**
 * @fileoverview Resolve cover image URLs from Open Library's Covers API.
 * @module mcp-server/tools/definitions/openlibrary-get-cover-url.tool
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { getOpenLibraryService } from '@/services/open-library/open-library-service.js';

export const openlibraryGetCoverUrl = tool('openlibrary_get_cover_url', {
  title: 'Get Cover URL',
  description:
    'Resolve a cover image URL for a book or author photo. Returns a direct HTTPS URL in the requested size (S/M/L). The Covers API always returns HTTP 200 — missing covers return a 1×1 placeholder GIF, not a 404. URLs can be embedded in markdown as ![cover](url).',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({
    identifier: z
      .string()
      .describe(
        'The identifier value. For "id": numeric cover ID from work/edition data. For "isbn": 10 or 13 digits, hyphens stripped. For "olid": edition OLID (OL…M) or author OLID (OL…A) when target is "author".',
      ),
    id_type: z
      .enum(['id', 'isbn', 'olid'])
      .describe(
        '"id" is the numeric cover_i / cover ID from search or work results. "isbn" and "olid" look up the cover from those identifiers.',
      ),
    target: z
      .enum(['book', 'author'])
      .default('book')
      .describe(
        '"book" returns a book cover from covers.openlibrary.org/b/. "author" returns an author photo from covers.openlibrary.org/a/ — use with id_type "id" (photo_id) or "olid" (author OLID).',
      ),
    size: z
      .enum(['S', 'M', 'L'])
      .default('M')
      .describe(
        'Image size. S = small (~45px tall), M = medium (~150px tall), L = large (~400px tall).',
      ),
  }),
  output: z.object({
    url: z
      .string()
      .describe(
        'Direct HTTPS URL to the cover image. The Covers API returns HTTP 200 for all requests — a 1×1 placeholder GIF is returned when no cover exists for the identifier.',
      ),
    note: z
      .string()
      .describe(
        'Reminder that the URL always returns HTTP 200; a placeholder GIF is served when no cover exists.',
      ),
  }),

  handler(input, ctx) {
    ctx.log.info('Resolving cover URL', {
      identifier: input.identifier,
      id_type: input.id_type,
      target: input.target,
      size: input.size,
    });
    const svc = getOpenLibraryService();
    const url = svc.getCoverUrl(input.identifier, input.id_type, input.target, input.size);
    return {
      url,
      note: 'The Covers API returns HTTP 200 for all requests — a 1×1 placeholder GIF is served if no cover exists for this identifier.',
    };
  },

  format: (result) => {
    const lines: string[] = [];
    lines.push(`**Cover URL:** ${result.url}`);
    lines.push(`**Note:** ${result.note}`);
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
