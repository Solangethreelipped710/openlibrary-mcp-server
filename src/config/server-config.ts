/**
 * @fileoverview Server-specific configuration for openlibrary-mcp-server.
 * @module config/server-config
 */

import { z } from '@cyanheads/mcp-ts-core';
import { parseEnvConfig } from '@cyanheads/mcp-ts-core/config';

const ServerConfigSchema = z.object({
  userAgent: z
    .string()
    .default('openlibrary-mcp-server/1.0 (openlibrary@archive.org)')
    .describe(
      'User-Agent header sent with all Open Library API requests. Include a contact email per community convention for well-behaved bots.',
    ),
});

let _config: z.infer<typeof ServerConfigSchema> | undefined;

export function getServerConfig(): z.infer<typeof ServerConfigSchema> {
  _config ??= parseEnvConfig(ServerConfigSchema, {
    userAgent: 'OPENLIBRARY_USER_AGENT',
  });
  return _config;
}
