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

// A stand-in for TikTok's upload page: a file picker, then TikTok's kind of caption editor (Draft.js, loaded
// from a CDN, so this test needs internet) holding the file name, inside an error screen like TikTok's.
const CDN = 'https://cdn.jsdelivr.net/npm';
const tiktokPage = `<!doctype html><html><head><meta charset="utf-8"></head><body><input type="file" accept="video/*" id="f"><div id="root"></div>
<script src="${CDN}/react@16.14.0/umd/react.production.min.js"></script>
<script src="${CDN}/react-dom@16.14.0/umd/react-dom.production.min.js"></script>
<script src="${CDN}/immutable@3.8.2/dist/immutable.min.js"></script>
<script src="${CDN}/draft-js@0.11.7/dist/Draft.min.js"></script>
<script>
  window.errors = [];
  const { Editor, EditorState, ContentState } = Draft;
  class Boundary extends React.Component {
    constructor(p) { super(p); this.state = { crashed: false }; }
    static getDerivedStateFromError() { return { crashed: true }; }
    componentDidCatch(e) { errors.push(e.message); }
    render() { return this.state.crashed ? React.createElement('h1', { id: 'crash' }, 'Something went wrong') : this.props.children; }
  }
  function Caption({ name }) {
    const [state, setState] = React.useState(() => EditorState.createWithContent(ContentState.createFromText(name)));
    window.draftText = () => state.getCurrentContent().getPlainText('\\n');
    return React.createElement(Editor, { editorState: state, onChange: setState });
  }
  document.getElementById('f').addEventListener('change', (e) => {
    const name = e.target.files[0].name.replace(/\\.mp4$/, '');
    setTimeout(() => ReactDOM.render(React.createElement(Boundary, null, React.createElement(Caption, { name })), document.getElementById('root')), 500);
  });
</script></body></html>`;
const studioPage = `<!doctype html><body><button id="go">Post to TikTok</button><script>
  addEventListener('message', (e) => { if (e.data?.type === 'reach-studio:tiktok-answer') window.answer = e.data; });
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
  await tiktok.waitForLoadState().catch(() => {});
  await tiktok.goto('https://www.tiktok.com/tiktokstudio/upload?from=reach-studio');
  if (!tiktok.url().startsWith('https://www.tiktok.com/tiktokstudio/upload')) await fail(`opened ${tiktok.url()}`);
  const answer = await studio.waitForFunction(() => window.answer, null, { timeout: 5000 }).then((h) => h.jsonValue()).catch(() => null);
  if (!answer?.ok) await fail(`the studio got no "opened" answer: ${JSON.stringify(answer)}`);
  console.log('ok  the studio hears back that TikTok opened');
  await tiktok.waitForSelector('#reach-tiktok-note:has-text("Saved in your Downloads")', { timeout: 20_000 })
    .catch(async () => fail(`no Downloads note: ${await tiktok.locator('#reach-tiktok-note').textContent().catch(() => 'none')}`));
  if (await tiktok.evaluate(() => document.getElementById('f').files.length)) await fail('touched TikTok\'s file picker');
  console.log('ok  leaves TikTok\'s file picker to the person');
  const [worker] = context.serviceWorkers();
  // Playwright keeps downloads under its own names, so check the link that was saved.
  const saved = await worker.evaluate(() => new Promise((r) => chrome.downloads.search({}, (items) => r(items.map((d) => d.url)))));
  if (!saved.some((u) => u.startsWith(VIDEO))) await fail(`video not saved: ${JSON.stringify(saved)}`);
  console.log('ok  video saved to Downloads');

  await tiktok.setInputFiles('#f', { name: 'Ghulo_Ep01.mp4', mimeType: 'video/mp4', buffer: bytes });
  await tiktok.waitForSelector('#reach-tiktok-note:has-text("Ready")', { timeout: 20_000 })
    .catch(async () => fail(`no "Ready" after picking: ${await tiktok.locator('#reach-tiktok-note').textContent().catch(() => 'none')}`));
  // The editor's own text, not just what it shows: TikTok crashes when the two differ.
  const caption = await tiktok.evaluate(() => window.draftText());
  if (caption !== CAPTION) await fail(`the editor holds ${JSON.stringify(caption)}`);
  console.log('ok  the editor took the caption in place of the file name');
  await tiktok.click('.public-DraftEditor-content');
  await tiktok.keyboard.press('Control+End');
  await tiktok.keyboard.type(' 🎉');
  await tiktok.waitForTimeout(300);
  if (await tiktok.$('#crash')) await fail(`the page crashed: ${await tiktok.evaluate(() => errors.join('; '))}`);
  if (await tiktok.evaluate(() => window.draftText()) !== `${CAPTION} 🎉`) await fail('typing after the caption went wrong');
  console.log('ok  the person can keep typing; no crash');
  console.log('PASS');
} finally {
  await context.close();
}
