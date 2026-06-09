import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load the server's .env so PORT is available when running locally.
const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(serverDir, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

const port = process.env.PORT || '8080';
const baseUrl = (process.env.SIGNALING_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${path} failed: ${body.error || response.status}`);
  }
  return body;
}

async function requestExpectStatus(path, expectedStatus, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  if (response.status !== expectedStatus) {
    throw new Error(`${path} expected ${expectedStatus}, got ${response.status}: ${body.error || 'unknown error'}`);
  }
  return body;
}

async function run() {
  const roomName = `smoke-${Math.random().toString(36).slice(2, 8)}`;

  console.log('Checking /health...');
  await request('/health');

  console.log('Creating room...');
  await request('/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: roomName, displayName: 'Smoke Test Room' })
  });

  console.log('Reading room...');
  await request(`/rooms/${roomName}`);

  console.log('Updating room metadata...');
  await request(`/rooms/${roomName}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ metadata: { smoke: true } })
  });

  console.log('Checking participants endpoint...');
  await request(`/rooms/${roomName}/participants`);

  console.log('Verifying join fails for missing room...');
  await requestExpectStatus(`/rooms/${roomName}-missing/join`, 404, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'smoke-user' })
  });

  console.log('Deleting room...');
  await request(`/rooms/${roomName}`, { method: 'DELETE' });

  console.log('Smoke test completed successfully.');
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});



