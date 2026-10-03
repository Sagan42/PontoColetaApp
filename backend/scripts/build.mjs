#!/usr/bin/env node
import { build } from 'esbuild';
import { rm, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, 'dist', 'lambdas');

const FUNCTIONS = [
  { name: 'public-api', entry: 'src/handlers/public-api.ts' },
  { name: 'admin-api', entry: 'src/handlers/admin-api.ts' },
];

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const fn of FUNCTIONS) {
    const functionDir = path.join(outDir, fn.name);
    await mkdir(functionDir, { recursive: true });

    const result = await build({
      entryPoints: [path.join(rootDir, fn.entry)],
      outfile: path.join(functionDir, 'index.mjs'),
      bundle: true,
      minify: true,
      sourcemap: false,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      external: ['@aws-sdk/*'],
      legalComments: 'none',
      metafile: true,
      logLevel: 'warning',
      banner: {
        js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
      },
    });

    const [outputPath] = Object.keys(result.metafile.outputs);
    const bytes = result.metafile.outputs[outputPath].bytes;
    console.log(`built ${fn.name}: ${(bytes / 1024).toFixed(1)} kB`);

    await writeFile(
      path.join(functionDir, 'build-info.json'),
      `${JSON.stringify({ name: fn.name, builtAt: new Date().toISOString(), bytes }, null, 2)}\n`,
      'utf8',
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
