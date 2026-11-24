import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, zip } from './zip';

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });

  it('makes a zip that unzip opens, with every file intact', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'reach-zip-'));
    const file = path.join(dir, 'x.zip');
    await writeFile(file, zip([
      { path: 'helper/manifest.json', data: new TextEncoder().encode('{"a":1}') },
      { path: 'helper/fill.js', data: new TextEncoder().encode('// ŵ ünïcode\n') },
    ]));
    execFileSync('python3', ['-c', `import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])`, file, dir]);
    expect(await readFile(path.join(dir, 'helper/manifest.json'), 'utf8')).toBe('{"a":1}');
    expect(await readFile(path.join(dir, 'helper/fill.js'), 'utf8')).toBe('// ŵ ünïcode\n');
  });
});
