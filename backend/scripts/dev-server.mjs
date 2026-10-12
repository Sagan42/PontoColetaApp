import { createServer } from 'node:http';
import { build } from 'esbuild';
import path from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = path.join(rootDir, 'dist', 'dev', 'test-api.mjs');
const PORT = Number(process.env.PORT ?? 3000);

const SEED = [
  {
    name: 'Ecoponto Centro',
    address: 'Rua Pará, 500, Londrina, PR',
    latitude: -23.3103,
    longitude: -51.1628,
    materials: ['Pilhas', 'Baterias', 'Eletrônicos', 'Lâmpadas'],
    openingHours: 'Seg a Sex, 8h às 18h',
    notes: 'Entrada pela lateral do prédio.',
  },
  {
    name: 'Supermercado Higienópolis',
    address: 'Avenida Higienópolis, 1200, Londrina, PR',
    latitude: -23.318,
    longitude: -51.158,
    materials: ['Óleo de cozinha', 'Pilhas', 'Plástico'],
    openingHours: 'Todos os dias, 8h às 22h',
    notes: null,
  },
  {
    name: 'Farmácia Central',
    address: 'Avenida Paraná, 300, Londrina, PR',
    latitude: -23.3095,
    longitude: -51.167,
    materials: ['Medicamentos'],
    openingHours: 'Seg a Sáb, 7h às 20h',
    notes: 'Apenas medicamentos vencidos, na embalagem original.',
  },
  {
    name: 'UEL Descarte Consciente',
    address: 'Rodovia Celso Garcia Cid, Londrina, PR',
    latitude: -23.3268,
    longitude: -51.2,
    materials: ['Eletrônicos', 'Papel', 'Vidro', 'Metal'],
    openingHours: 'Seg a Sex, 9h às 17h',
    notes: null,
  },
  {
    name: 'Ecoponto Zona Norte',
    address: 'Rua Goiás, 2000, Londrina, PR',
    latitude: -23.29,
    longitude: -51.175,
    materials: ['Óleo de cozinha', 'Lâmpadas', 'Vidro', 'Papel', 'Plástico'],
    openingHours: 'Ter a Dom, 8h às 17h',
    notes: 'Fechado às segundas.',
  },
];

async function bundleApi() {
  await build({
    stdin: {
      contents: [
        "export { buildTestApi } from './tests/support/test-api.ts';",
        "export { Coordinates } from './src/modules/collection-points/domain/value-objects/coordinates.ts';",
      ].join('\n'),
      resolveDir: rootDir,
      loader: 'ts',
    },
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    logLevel: 'warning',
  });

  const module = await import(`${pathToFileURL(bundlePath).href}?t=${Date.now()}`);
  return { api: module.buildTestApi(new Date()), Coordinates: module.Coordinates };
}

async function seed(api, Coordinates) {
  for (const point of SEED) {
    api.geocoding.respondWith([
      {
        formattedAddress: point.address,
        coordinates: Coordinates.create(point.latitude, point.longitude),
        confidence: 0.9,
      },
    ]);

    const response = await api.request('POST', '/v1/collection-points', {
      body: {
        name: point.name,
        address: point.address,
        materials: point.materials,
        openingHours: point.openingHours,
        notes: point.notes,
      },
    });

    if (response.statusCode !== 201) {
      console.error(`  falha ao semear ${point.name}:`, JSON.stringify(response.body));
    }
  }

  api.geocoding.respondWith([
    {
      formattedAddress: 'Centro, Londrina, PR, Brasil',
      coordinates: Coordinates.create(-23.3103, -51.1628),
      confidence: 0.8,
    },
  ]);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    request.setEncoding('utf8');
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('error', reject);
    request.on('end', () => {
      if (raw.trim().length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
  });
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, x-correlation-id',
};

async function main() {
  console.log('empacotando a API com esbuild...');
  const { api, Coordinates } = await bundleApi();

  console.log('semeando pontos de coleta em memoria...');
  await seed(api, Coordinates);
  console.log(`  ${api.repository.points.size} pontos prontos`);

  const server = createServer((request, response) => {
    void (async () => {
      const started = Date.now();
      const url = new URL(request.url ?? '/', 'http://localhost');

      if (request.method === 'OPTIONS') {
        response.writeHead(204, CORS);
        response.end();
        return;
      }

      const body = await readBody(request);
      const claims = request.headers.authorization
        ? { sub: 'dev-admin', email: 'admin@pontocoleta.local' }
        : null;

      const result = await api.request(request.method ?? 'GET', url.pathname, {
        query: Object.fromEntries(url.searchParams),
        body,
        claims,
      });

      const payload = JSON.stringify(result.body);
      response.writeHead(result.statusCode, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...CORS,
      });
      response.end(payload);

      const duration = Date.now() - started;
      console.log(
        `${request.method} ${url.pathname}${url.search} -> ${result.statusCode} (${duration}ms)`,
      );
    })();
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log(`PontoColeta dev API em http://localhost:${PORT}`);
    console.log(`  emulador Android:  http://10.0.2.2:${PORT}`);
    console.log(`  health:            http://localhost:${PORT}/v1/health`);
    console.log('');
    console.log('Dados em memoria: reiniciar o servidor restaura a semente.');
    console.log('');
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
