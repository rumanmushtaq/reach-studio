import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// .env.example is committed to git: it lists the settings, never their values.
// Only settings with a safe public default may have one.
const ALLOWED_VALUES = new Set(['META_GRAPH_VERSION']);

describe('.env.example', () => {
  it('has no real values in it', () => {
    const text = readFileSync(path.resolve(import.meta.dirname, '../../.env.example'), 'utf8');
    const filled = text.split('\n')
      .map((line) => line.match(/^([A-Z0-9_]+)=([^#\s]*)/))
      .filter((m): m is RegExpMatchArray => !!m && m[2] !== '' && !ALLOWED_VALUES.has(m[1]))
      .map((m) => m[1]);
    expect(filled).toEqual([]);
  });
});
