// End-to-end check of the helper in a real Chromium with the extension loaded. TikTok, the studio and the
// video host are stand-in pages served by Playwright, so nothing is posted and no account is needed.
// Run: node extensions/tiktok-helper/test.mjs
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// TIKTOK_HELPER_DIR: test another copy, e.g. the folder unzipped from the studio's download.
const EXT = process.env.TIKTOK_HELPER_DIR || path.dirname(fileURLToPath(import.meta.url));
const STUDIO = 'https://reach-studio-five.vercel.app/videos/test';
const VIDEO = 'https://res.cloudinary.com/test/video/upload/videos/v1/video';
const CAPTION = 'Ghulo ki shararat! Remote kahan hai?\n\n#urducartoon #ghulo #kidscartoon';

const dir = await mkdtemp(path.join(os.tmpdir(), 'reach-tiktok-'));
const clip = path.join(dir, 'clip.mp4');
spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=10', clip]);
const bytes = await readFile(clip);

// A stand-in for TikTok's upload page: a file picker, then a caption editor that starts with the file name.
const tiktokPage = `<!doctype html><body><input type="file" accept="video/*" id="f">
<div id="cap" contenteditable="true" style="display:none;min-height:40px;border:1px solid #999"></div>
<script>
  document.getElementById('f').addEventListener('change', (e) => {
    const cap = document.getElementById('cap');
    setTimeout(() => { cap.style.display = 'block'; cap.textContent = e.target.files[0].name.replace(/\\.mp4$/, ''); }, 500);
  });
</script></body>`;
const studioPage = `<!doctype html><body><button id="go">Post to TikTok</button><script>
  document.getElementById('go').onclick = () => window.postMessage({ type: 'reach-studio:tiktok-post',
    job: { name: 'Ghulo Ep01', fileName: 'Ghulo_Ep01.mp4', videoUrl: '${VIDEO}', caption: ${JSON.stringify(CAPTION)} } }, location.origin);
</script></body>`;

const context = await chromium.launchPersistentContext(await mkdtemp(path.join(os.tmpdir(), 'reach-profile-')), {
  // PW_CHROME: a full Chromium when Playwright's own download is missing (headless shells cannot load extensions).
  ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : { channel: 'chromium' }),
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const fail = async (msg) => { console.error(`FAIL: ${msg}`); await context.close(); process.exit(1); };
try {
  await context.route('https://www.tiktok.com/**', (r) => r.fulfill({ contentType: 'text/html', body: tiktokPage }));
  await context.route('https://reach-studio-five.vercel.app/**', (r) => r.fulfill({ contentType: 'text/html', body: studioPage }));
  await context.route(`${VIDEO}*`, (r) => r.fulfill({ contentType: 'video/mp4', body: bytes, headers: { 'access-control-allow-origin': '*' } }));

  const studio = await context.newPage();
  await studio.goto(STUDIO);
  await studio.waitForFunction(() => document.documentElement.dataset.reachTiktok === '1', null, { timeout: 10_000 })
    .catch(() => fail('the studio page was not marked as having the helper'));
  console.log('ok  studio sees the helper');

  // A normal visit to TikTok's upload page is left alone.
  const plain = await context.newPage();
  await plain.goto('https://www.tiktok.com/tiktokstudio/upload');
  await plain.waitForTimeout(1500);
  if (await plain.evaluate(() => document.getElementById('f').files.length)) await fail('filled a page it did not open');
  await plain.close();
  console.log('ok  leaves a normal TikTok visit alone');

  const [tiktok] = await Promise.all([context.waitForEvent('page'), studio.click('#go')]);
  // Playwright cannot stand in for the first load of a tab an extension opens, so load it again under the stand-in.
  await tiktok.reload();
  await tiktok.waitForSelector('#reach-tiktok-note:has-text("Ready")', { timeout: 20_000 })
    .catch(async () => fail(`no "Ready" note: ${await tiktok.locator('#reach-tiktok-note').textContent().catch(() => 'none')}`));
  if (!tiktok.url().startsWith('https://www.tiktok.com/tiktokstudio/upload')) await fail(`opened ${tiktok.url()}`);
  const file = await tiktok.evaluate(() => { const f = document.getElementById('f').files[0]; return { name: f.name, size: f.size, type: f.type }; });
  if (file.name !== 'Ghulo_Ep01.mp4' || file.size !== bytes.length || file.type !== 'video/mp4') await fail(`file is ${JSON.stringify(file)}`);
  console.log(`ok  video added: ${file.name}, ${file.size} bytes`);
  const caption = await tiktok.evaluate(() => document.getElementById('cap').innerText);
  if (caption.replace(/\s+/g, ' ').trim() !== CAPTION.replace(/\s+/g, ' ').trim()) await fail(`caption is ${JSON.stringify(caption)}`);
  console.log('ok  caption replaced the file name');
  console.log('PASS');
} finally {
  await context.close();
}
