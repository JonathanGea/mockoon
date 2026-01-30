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

let merged = null;
const names = new Set();

for (const file of files) {
  const data = readJson(file);
  if (!Array.isArray(data.environments)) {
    throw new Error(`Missing environments[] in ${file}`);
  }

  if (!merged) {
    merged = { ...data, environments: [] };
  }

  for (const env of data.environments) {
    const name = env && env.name ? env.name : null;
    if (name && names.has(name)) {
      throw new Error(`Duplicate environment name: ${name} (from ${file})`);
    }
    if (name) names.add(name);
    merged.environments.push(env);
  }
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(merged, null, 2));
console.log(`Merged ${files.length} file(s) into ${outFile}`);
