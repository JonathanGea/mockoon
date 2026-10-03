import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import commons from '@mockoon/commons';

const { EnvironmentSchema, HighestMigrationId, Migrations, CORSHeaders } = commons;

// Mockoon handles OPTIONS before project routes, so preflight and actual
// responses must use the same policy across the combined mock server.
const corsHeaders = [
  { key: 'Access-Control-Allow-Origin', value: "{{#if (header 'Origin')}}{{header 'Origin'}}{{else}}*{{/if}}" },
  { key: 'Access-Control-Allow-Credentials', value: 'true' },
  CORSHeaders.find((header) => header.key === 'Access-Control-Allow-Methods'),
  { key: 'Access-Control-Allow-Headers', value: `{{#if (header 'Access-Control-Request-Headers')}}{{header 'Access-Control-Request-Headers'}}{{else}}${CORSHeaders.find((header) => header.key === 'Access-Control-Allow-Headers').value}{{/if}}` },
];
const corsKeys = new Set(corsHeaders.map((header) => header.key.toLowerCase()));

function normalize(environment, source) {
  if (!Number.isInteger(environment.lastMigration) || environment.lastMigration > HighestMigrationId) {
    throw new Error(`${source}: unsupported Mockoon schema version`);
  }
  for (const migration of Migrations) {
    if (migration.id > environment.lastMigration) migration.migrationFunction(environment);
  }
  const result = EnvironmentSchema.validate(environment);
  if (result.error) throw new Error(`${source}: ${result.error.message}`);
  return result.value;
}

// Keep response headers authoritative, with case-insensitive environment defaults.
function mergeHeaders(defaults, overrides) {
  const headers = new Map();
  for (const header of [...defaults, ...overrides]) {
    if (header.key) headers.set(header.key.toLowerCase(), header);
  }
  return [...headers.values()];
}

function validateReferences(environment, source) {
  const routeIds = new Set(environment.routes.map((route) => route.uuid));
  const folders = new Map(environment.folders.map((folder) => [folder.uuid, folder]));
  const visited = new Set();
  function walk(children) {
    for (const child of children) {
      const exists = child.type === 'route' ? routeIds.has(child.uuid) : folders.has(child.uuid);
      if (!exists || visited.has(child.uuid)) throw new Error(`${source}: missing, repeated, or cyclic reference ${child.uuid}`);
      visited.add(child.uuid);
      if (child.type === 'folder') walk(folders.get(child.uuid).children);
    }
  }
  walk(environment.rootChildren);
  if (visited.size !== routeIds.size + folders.size) throw new Error(`${source}: routes/folders missing from rootChildren`);
  const buckets = new Set(environment.data.map((bucket) => bucket.uuid));
  const callbacks = new Set(environment.callbacks.map((callback) => callback.uuid));
  for (const route of environment.routes) {
    for (const response of route.responses) {
      if (response.databucketID && !buckets.has(response.databucketID)) throw new Error(`${source}: missing data bucket ${response.databucketID}`);
      for (const callback of response.callbacks) {
        if (!callbacks.has(callback.uuid)) throw new Error(`${source}: missing callback ${callback.uuid}`);
      }
    }
  }
}

export async function compose(dataDirectory, port) {
  const projects = (await readdir(dataDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!projects.length) throw new Error('No project environments found');

  const identifiers = new Set();
  const routes = new Set();
  let combined;
  function claim(uuid, source) {
    if (identifiers.has(uuid)) throw new Error(`${source}: duplicate identifier ${uuid}; generate new UUIDs when copying environments`);
    identifiers.add(uuid);
  }

  for (const project of projects) {
    const slug = project.name;
    if (!/^[a-z][a-z0-9-]*$/.test(slug) || ['health', 'mockoon-admin'].includes(slug)) {
      throw new Error(`Invalid or reserved project slug: ${slug}`);
    }
    const source = path.join(dataDirectory, slug, 'environment.json');
    const environment = normalize(JSON.parse(await readFile(source, 'utf8')), source);
    validateReferences(environment, source);
    if (environment.endpointPrefix !== slug) throw new Error(`${source}: endpointPrefix must be "${slug}"`);
    if (environment.proxyMode || environment.tlsOptions.enabled || !environment.cors) {
      throw new Error(`${source}: combined server requires proxy/TLS disabled and CORS enabled`);
    }
    if (!combined) {
      combined = { ...structuredClone(environment), uuid: randomUUID(), name: 'Centralized mock backend',
        endpointPrefix: '', hostname: '0.0.0.0', port, latency: 0,
        headers: [...structuredClone(corsHeaders), { key: 'Vary', value: 'Origin, Access-Control-Request-Headers' }],
        routes: [], folders: [], rootChildren: [], data: [], callbacks: [] };
    }
    claim(environment.uuid, source);
    for (const entity of [...environment.routes, ...environment.folders, ...environment.data, ...environment.callbacks]) {
      claim(entity.uuid, source);
    }
    for (const route of environment.routes) {
      if (route.type !== 'http' && route.type !== 'crud') throw new Error(`${source}: unsupported route type ${route.type}`);
      const endpoint = route.endpoint.replace(/^\/+|\/+$/g, '');
      if (endpoint.includes('..') || /[\r\n]/.test(endpoint)) throw new Error(`${source}: invalid endpoint ${endpoint}`);
      route.endpoint = `${slug}${endpoint ? `/${endpoint}` : ''}`;
      const key = `${route.method.toUpperCase()} /${route.endpoint}`;
      if (routes.has(key)) throw new Error(`${source}: duplicate route ${key}`);
      routes.add(key);
      for (const response of route.responses) {
        claim(response.uuid, source);
        response.headers = mergeHeaders(environment.headers, response.headers);
        // Project-level CORS headers cannot override the shared OPTIONS policy.
        response.headers = response.headers.filter((header) => !corsKeys.has(header.key.toLowerCase()));
        const vary = response.headers.find((header) => header.key.toLowerCase() === 'vary');
        if (vary && vary.value !== '*') {
          vary.value = [...new Set([...vary.value.split(',').map((value) => value.trim()), 'Origin', 'Access-Control-Request-Headers'])].join(', ');
        }
        response.latency += environment.latency;
        if (response.filePath && !path.isAbsolute(response.filePath)) {
          response.filePath = path.resolve(path.dirname(source), response.filePath);
        }
        if (response.filePath && !response.filePath.includes('{{')) await access(response.filePath);
      }
    }
    // Preserve the original route/folder order, grouped by project in the runtime file.
    const folderId = randomUUID();
    combined.rootChildren.push({ type: 'folder', uuid: folderId });
    combined.folders.push({ uuid: folderId, name: slug, children: environment.rootChildren });
    for (const key of ['routes', 'folders', 'data', 'callbacks']) combined[key].push(...environment[key]);
  }
  const healthRoute = structuredClone(combined.routes.find((route) => route.type === 'http'));
  if (!healthRoute) throw new Error('At least one HTTP route is required');
  healthRoute.uuid = randomUUID();
  healthRoute.method = 'get';
  healthRoute.endpoint = 'health';
  healthRoute.documentation = 'Deployment readiness';
  healthRoute.responseMode = null;
  healthRoute.streamingMode = null;
  healthRoute.streamingInterval = 0;
  healthRoute.responses = [{ ...healthRoute.responses[0], uuid: randomUUID(), statusCode: 200,
    body: '{"status":"ok"}', bodyType: 'INLINE', filePath: '', databucketID: '',
    headers: [{ key: 'Content-Type', value: 'application/json' }], latency: 0,
    rules: [], default: true, callbacks: [], disableTemplating: true }];
  combined.routes.unshift(healthRoute);
  combined.rootChildren.unshift({ type: 'route', uuid: healthRoute.uuid });
  return normalize(combined, 'combined environment');
}
