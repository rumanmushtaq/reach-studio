import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('TikTok helper download', () => {
  it('is a zip of the extension Chrome can load, without the test', async () => {
    const res = await GET();
    expect(res.headers.get('content-disposition')).toContain('reach-tiktok-helper.zip');
    const dir = await mkdtemp(path.join(os.tmpdir(), 'reach-helper-'));
    await writeFile(path.join(dir, 'h.zip'), Buffer.from(await res.arrayBuffer()));
    execFileSync('python3', ['-c', 'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', path.join(dir, 'h.zip'), dir]);
    const folder = path.join(dir, 'reach-tiktok-helper');
    expect((await readdir(folder)).sort()).toEqual(['background.js', 'fill.js', 'manifest.json', 'page.js', 'site.js', 'studio.js']);
    const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8'));
    const scripts = manifest.content_scripts.flatMap((c: { js: string[] }) => c.js).concat(manifest.background.service_worker);
    expect(scripts.every((f: string) => existsSync(path.join(folder, f)))).toBe(true);
  });
});
