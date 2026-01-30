#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const dataDir = process.env.MOCKOON_DATA_DIR || path.join(process.cwd(), 'data');
const outFile = process.env.MOCKOON_MERGED_FILE || path.join(process.cwd(), 'dist', 'mockoon.json');

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON: ${filePath}`);
  }
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .map((f) => path.join(dir, f))
    .sort();
}

const files = listJsonFiles(dataDir);
if (files.length === 0) {
  console.error(`No .json files found in ${dataDir}`);
  process.exit(1);
}

function extractEnvironments(data) {
  if (Array.isArray(data.environments)) return data.environments;
  return [data];
}

function normalizePrefix(prefix) {
  if (!prefix) return '';
  return String(prefix).replace(/^\/+|\/+$/g, '');
}

let mergedEnv = null;
let routeIndex = 0;

for (const file of files) {
  const data = readJson(file);
  const envs = extractEnvironments(data);
  if (!Array.isArray(envs) || envs.length === 0) {
    throw new Error(`No environment found in ${file}`);
  }

  for (const env of envs) {
    if (!mergedEnv) {
      mergedEnv = { ...env, routes: [], folders: [], rootChildren: [] };
      mergedEnv.name = process.env.MOCKOON_MERGED_NAME || 'Merged Mockoon';
      mergedEnv.endpointPrefix = '';
    }

    const prefix = normalizePrefix(env.endpointPrefix);
    const routes = Array.isArray(env.routes) ? env.routes : [];
    for (const route of routes) {
      const endpoint = String(route.endpoint || '').replace(/^\/+/, '');
      const fullEndpoint = prefix ? `${prefix}/${endpoint}` : endpoint;
      mergedEnv.routes.push({ ...route, endpoint: fullEndpoint });
      mergedEnv.rootChildren.push({ type: 'route', uuid: route.uuid || `route-${routeIndex++}` });
    }
  }
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(mergedEnv, null, 2));
console.log(`Merged ${files.length} file(s) into ${outFile}`);
