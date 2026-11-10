import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import path from 'node:path';
import { readFileSync } from 'node:fs';

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    test: {
      setupFiles: ['./test/apply-migrations.js'],
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.toml' },
          miniflare: { bindings: {
              TEST_MIGRATIONS: migrations,
              // Text of repo files for doc/CI checks (workers runtime has no fs).
              README_TEXT: readFileSync(path.join(import.meta.dirname, 'README.md'), 'utf8'),
            } },
        },
      },
    },
  };
});
