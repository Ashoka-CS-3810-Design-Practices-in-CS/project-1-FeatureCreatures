import { log } from 'node:console';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const BASE_MONDAY_ISO = '2026-11-02T00:00:00Z';
const OUTPUT_DIRECTORY = fileURLToPath(new URL('../docs/samples/', import.meta.url));
const JSON_INDENT = 2;

// PRE:  invoked from the repository root with TZ=UTC and dependencies installed
// POST: writes a validated JSON export of each registered sample for TEST_PLAN's base week;
//       closes the Vite module loader even if generation or validation fails
async function exportSamples() {
  // Vite resolves the source aliases and TypeScript using the app's own configuration.
  const loader = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
  });
  try {
    const { SAMPLES } = await loader.ssrLoadModule('/src/data/samples/index.ts');
    const { parseExportFile } = await loader.ssrLoadModule('/src/shared/schemas.ts');
    const { MS_PER_MINUTE } = await loader.ssrLoadModule('/src/shared/constants.ts');
    const monday = Date.parse(BASE_MONDAY_ISO) / MS_PER_MINUTE;
    await mkdir(OUTPUT_DIRECTORY, { recursive: true });

    // INVARIANT: each visited registry entry has a schema-validated export in OUTPUT_DIRECTORY
    for (const [id, sample] of Object.entries(SAMPLES)) {
      const file = sample.build(monday);
      const json = `${JSON.stringify(file, null, JSON_INDENT)}\n`;
      const validated = parseExportFile(json);
      if (!validated.ok) {
        throw new Error(`Invalid generated sample: ${id}`);
      }
      await writeFile(join(OUTPUT_DIRECTORY, `${id}.json`), json, 'utf8');
      log(`${id}: ${file.events.length} events, ${file.tasks.length} tasks`);
    }
    // POST: every registered sample has a validated JSON export dated to the base week
  } finally {
    await loader.close();
  }
}

await exportSamples();
