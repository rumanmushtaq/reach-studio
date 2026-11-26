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
const FB_CAPTION = 'Ghulo ka remote kahan gaya?\n\nAmmi ki chappal aur ek naughty bacha.\n\n#urducartoon #ghulo';
const SLOT = new Date(Date.now() + Number(process.env.SLOT_DAYS ?? 2) * 24 * 3600_000); SLOT.setHours(8, 45, 0, 0); // SLOT_DAYS=8 checks the calendar moving to another month
const SLOT_AT = SLOT.getTime();
const pad = (n) => String(n).padStart(2, '0');
const SLOT_DATE = `${SLOT.getFullYear()}-${pad(SLOT.getMonth() + 1)}-${pad(SLOT.getDate())}`;

const dir = await mkdtemp(path.join(os.tmpdir(), 'reach-tiktok-'));
const clip = path.join(dir, 'clip.mp4');
spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=10', clip]);
const bytes = await readFile(clip);

// A stand-in for TikTok's upload page: a file picker, then TikTok's kind of caption editor (Draft.js, loaded
// from a CDN, so this test needs internet) holding the file name, inside an error screen like TikTok's.
const CDN = 'https://cdn.jsdelivr.net/npm';
const tiktokPage = `<!doctype html><html><head><meta charset="utf-8"></head><body><input type="file" accept="video/*" id="f"><div id="root"></div>
<div><div>When to post</div>
  <label class="x9a"><input type="radio" name="when" checked><span>Now</span></label>
  <label class="x9a"><input type="radio" name="when" id="sch"><span>Schedule</span></label>
  <div id="pickers" style="display:none">
    <div class="q1z" id="timeField"><svg width="12" height="12"></svg><span id="timeText"></span><svg width="12" height="12"></svg></div>
    <div class="q1z" id="dateField"><svg width="12" height="12"></svg><span id="dateText"></span><svg width="12" height="12"></svg></div>
  </div>
  <div id="timePop" class="p7k" style="display:none"><div class="c3r" id="hours"></div><div class="c3r" id="mins"></div></div>
  <div id="cal" class="p7k" style="display:none">
    <div class="h2b"><span class="b8n" id="prev"><svg width="10" height="10"></svg></span><span class="t5m" id="mt"></span><span class="b8n" id="next"><svg width="10" height="10"></svg></span></div>
    <div class="w4d"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>
    <div class="g6y" id="days"></div>
  </div>
</div>
<script>
  // Stand-in for TikTok's schedule picker, laid out like the real one: time then date fields showing their
  // values, an hour and a 5-minute column, and a calendar (15 minutes to 10 days ahead) with arrow buttons.
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const M = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let view = new Date(); view.setDate(1);
  const T = () => document.getElementById('timeText'), D = () => document.getElementById('dateText');
  function drawCal() {
    document.getElementById('mt').textContent = M[view.getMonth()] + ' ' + view.getFullYear();
    const days = document.getElementById('days'); days.innerHTML = '';
    const lead = view.getDay(), prevLast = new Date(view.getFullYear(), view.getMonth(), 0).getDate();
    for (let i = lead - 1; i >= 0; i--) { const el = document.createElement('span'); el.className = 'k0 k0-disabled'; el.textContent = prevLast - i; days.append(el); }
    const last = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 1; i <= last; i++) {
      const d = new Date(view.getFullYear(), view.getMonth(), i);
      const ok = d >= today && d - today <= 10 * 864e5;
      const el = document.createElement('span'); el.className = ok ? 'k0' : 'k0 k0-disabled'; el.textContent = i;
      if (ok) el.onclick = () => { D().textContent = ymd(d); document.getElementById('cal').style.display = 'none'; };
      days.append(el);
    }
  }
  document.getElementById('sch').addEventListener('change', () => {
    document.getElementById('pickers').style.display = 'flex';
    const soon = new Date(Date.now() + 20 * 60e3);
    T().textContent = pad(soon.getHours()) + ':' + pad(Math.ceil(soon.getMinutes() / 5) * 5 % 60);
    D().textContent = ymd(new Date());
  });
  document.getElementById('dateField').onclick = () => { document.getElementById('cal').style.display = 'block'; drawCal(); };
  document.getElementById('prev').onclick = () => { view.setMonth(view.getMonth() - 1); drawCal(); };
  document.getElementById('next').onclick = () => { view.setMonth(view.getMonth() + 1); drawCal(); };
  document.getElementById('timeField').onclick = () => {
    document.getElementById('timePop').style.display = 'flex';
    const hours = document.getElementById('hours'), mins = document.getElementById('mins');
    hours.innerHTML = ''; mins.innerHTML = '';
    for (let h = 0; h < 24; h++) { const el = document.createElement('div'); el.className = 'o5'; el.textContent = pad(h); el.onclick = () => { T().textContent = pad(h) + ':' + T().textContent.split(':')[1]; }; hours.append(el); }
    for (let m = 0; m < 60; m += 5) { const el = document.createElement('div'); el.className = 'o5'; el.textContent = pad(m); el.onclick = () => { T().textContent = T().textContent.split(':')[0] + ':' + pad(m); document.getElementById('timePop').style.display = 'none'; }; mins.append(el); }
  };
</script>
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
// A stand-in for Facebook's Create reel page: a file picker, a Next button, then Facebook's kind of description
// editor (Lexical, from a CDN), empty.
const facebookPage = `<!doctype html><html><head><meta charset="utf-8"></head><body><input type="file" accept="video/*" id="f">
<button id="next" style="display:none">Next</button><div id="desc" style="display:none;min-height:40px;border:1px solid #999"></div>
<script type="module">
  import { createEditor, $getRoot } from '${CDN}/lexical@0.17.1/+esm';
  import { registerPlainText } from '${CDN}/@lexical/plain-text@0.17.1/+esm';
  document.getElementById('f').addEventListener('change', () => { setTimeout(() => { document.getElementById('next').style.display = 'inline'; }, 300); });
  document.getElementById('next').onclick = () => {
    const box = document.getElementById('desc');
    box.style.display = 'block';
    box.contentEditable = 'true';
    const editor = createEditor({ namespace: 'reel', onError: (e) => { throw e; } });
    editor.setRootElement(box);
    registerPlainText(editor);
    window.lexText = () => editor.getEditorState().read(() => $getRoot().getTextContent());
  };
</script></body></html>`;
const studioPage = `<!doctype html><body><button id="go">Post to TikTok</button><button id="fb">Post to Facebook</button><script>
  addEventListener('message', (e) => { if (e.data?.type === 'reach-studio:tiktok-answer') window.answer = e.data; });
  document.getElementById('fb').onclick = () => window.postMessage({ type: 'reach-studio:tiktok-post',
    job: { site: 'facebook', name: 'Ghulo Ep01', fileName: 'Ghulo_Ep01.mp4', videoUrl: '${VIDEO}', caption: ${JSON.stringify(FB_CAPTION)}, slotAt: ${SLOT_AT}, slotLabel: 'Sat 29 Nov 8:45 AM' } }, location.origin);
  document.getElementById('go').onclick = () => window.postMessage({ type: 'reach-studio:tiktok-post',
    job: { name: 'Ghulo Ep01', fileName: 'Ghulo_Ep01.mp4', videoUrl: '${VIDEO}', caption: ${JSON.stringify(CAPTION)}, slotAt: ${SLOT_AT}, slotLabel: 'Sat 29 Nov 8:45 AM' } }, location.origin);
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
  await context.route('https://www.facebook.com/**', (r) => r.fulfill({ contentType: 'text/html', body: facebookPage }));
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
  await tiktok.waitForSelector('#reach-tiktok-note:has-text("scheduled for")', { timeout: 30_000 })
    .catch(async () => fail(`not scheduled: ${await tiktok.locator('#reach-tiktok-note').getAttribute('data-steps').catch(() => 'none')}`));
  const when = await tiktok.evaluate(() => ({ schedule: document.getElementById('sch').checked, date: document.getElementById('dateText').textContent, time: document.getElementById('timeText').textContent }));
  if (!when.schedule || when.date !== SLOT_DATE || when.time !== '08:45') await fail(`schedule boxes show ${JSON.stringify(when)}, wanted ${SLOT_DATE} 08:45`);
  console.log(`ok  scheduled itself for the studio slot: ${when.date} ${when.time}`);
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
  await tiktok.close();

  // Facebook profile reel: same hand-off, then the description after Next, and no schedule.
  const [fb] = await Promise.all([context.waitForEvent('page'), studio.click('#fb')]);
  await fb.waitForLoadState().catch(() => {});
  await fb.goto('https://www.facebook.com/reels/create/?from=reach-studio');
  await fb.waitForSelector('#reach-tiktok-note:has-text("Add video")', { timeout: 20_000 })
    .catch(async () => fail(`no Facebook pick note: ${await fb.locator('#reach-tiktok-note').textContent().catch(() => 'none')}`));
  console.log('ok  Facebook: opens Create reel and saves the video');
  await fb.setInputFiles('#f', { name: 'Ghulo_Ep01.mp4', mimeType: 'video/mp4', buffer: bytes });
  await fb.waitForSelector('#reach-tiktok-note:has-text("Press Next")', { timeout: 10_000 });
  await fb.click('#next');
  await fb.waitForSelector('#reach-tiktok-note:has-text("Caption added")', { timeout: 20_000 })
    .catch(async () => fail(`Facebook caption not added: ${await fb.locator('#reach-tiktok-note').getAttribute('data-steps').catch(() => 'none')}`));
  const fbText = await fb.evaluate(() => window.lexText());
  if (fbText.replace(/\s+/g, ' ').trim() !== FB_CAPTION.replace(/\s+/g, ' ').trim()) await fail(`Facebook's editor holds ${JSON.stringify(fbText)}`);
  await fb.click('#desc');
  await fb.keyboard.press('Control+End');
  await fb.keyboard.type(' 🎉');
  if (!(await fb.evaluate(() => window.lexText())).endsWith(' 🎉')) await fail('typing after the Facebook caption went wrong');
  console.log('ok  Facebook: the editor took the caption after Next; no schedule asked');
  console.log('PASS');
} finally {
  await context.close();
}
