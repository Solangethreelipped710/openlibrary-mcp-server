/**
 * @fileoverview Server-specific configuration for openlibrary-mcp-server.
 * @module config/server-config
 */

import { z } from '@cyanheads/mcp-ts-core';
import { parseEnvConfig } from '@cyanheads/mcp-ts-core/config';

const ServerConfigSchema = z.object({
  userAgent: z
    .string()
    .default('openlibrary-mcp-server casey@caseyjhand.com')
    .describe(
      'User-Agent header sent with all Open Library API requests. Open Library blocks bot-style name/version UA strings — use a plain descriptive string with a contact email.',
    ),
});

let _config: z.infer<typeof ServerConfigSchema> | undefined;

export function getServerConfig(): z.infer<typeof ServerConfigSchema> {
  _config ??= parseEnvConfig(ServerConfigSchema, {
    userAgent: 'OPENLIBRARY_USER_AGENT',
  });
  return _config;
}
