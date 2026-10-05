// Reads and updates the repo's .env without ever printing values.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const ENV_PATH = fileURLToPath(new URL('../../.env', import.meta.url));
export const ENV_EXAMPLE_PATH = fileURLToPath(new URL('../../.env.example', import.meta.url));

export function readEnv(path = ENV_PATH) {
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
}

// Replaces the value on an existing KEY= line. Use it only for non-secret values such as IDs.
export function setEnvValue(key, value) {
  const text = readFileSync(ENV_PATH, 'utf8');
  const line = new RegExp(`^${key}=.*$`, 'm');
  if (!line.test(text)) throw new Error(`${key} is not in .env. Copy that line from .env.example first.`);
  writeFileSync(ENV_PATH, text.replace(line, () => `${key}=${value}`));
}
