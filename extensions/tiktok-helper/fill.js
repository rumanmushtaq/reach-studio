// Fills TikTok's upload page: puts the video in its file picker and the caption in its editor. It never
// presses Post: the owner checks and posts, so TikTok sees a person posting, not a bot.
// When TikTok refuses the video added this way, the helper saves it to Downloads, the owner picks it with
// TikTok's own button, and the helper fills the caption again. Shared by tiktok.js, and used by the tests.

const reachFill = (() => {
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = []; // what happened, for "Copy details"
  const step = (text) => { log.push(`${new Date().toISOString().slice(11, 19)} ${text}`); };

  /** Waits for find() to return something, checking every 300 ms. Null after timeoutMs. */
  async function waitFor(find, timeoutMs = 60_000) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const found = find();
      if (found) return found;
      if (Date.now() > until) return null;
      await pause(300);
    }
  }

  const videoInput = () => document.querySelector('input[type="file"][accept*="video"]') ?? document.querySelector('input[type="file"]');

  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  /** TikTok's caption box: its Draft.js editor, else the first visible editable box. */
  const captionEditor = () =>
    [...document.querySelectorAll('.public-DraftEditor-content[contenteditable="true"]')].find(visible)
    ?? [...document.querySelectorAll('[contenteditable="true"]')].find(visible) ?? null;

  /** TikTok's own message when an upload fails. */
  const uploadFailed = () => /something went wrong|re-upload this file|couldn.t upload|upload failed/i.test(document.body?.innerText ?? '');

  const fileName = (job) => (/\.(mp4|mov|webm)$/i.test(job.fileName) ? job.fileName : `${job.fileName || 'video'}.mp4`);

  /** Downloads the video and gives it to the page's file picker, as if the owner had chosen it. */
  async function putVideo(input, job) {
    const res = await fetch(job.videoUrl);
    if (!res.ok) throw new Error(`Could not download the video (${res.status})`);
    const blob = await res.blob();
    const file = new File([blob], fileName(job), { type: blob.type.startsWith('video/') ? blob.type.split(';')[0] : 'video/mp4', lastModified: Date.now() });
    const files = new DataTransfer();
    files.items.add(file);
    input.files = files.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    step(`video added: ${file.name}, ${file.size} bytes, ${file.type}`);
    return file;
  }

  const flat = (s) => s.replace(/\s+/g, ' ').trim();

  /** Replaces the caption. Typing first; if the editor ignores it, pasting, which TikTok's editor accepts. */
  async function putCaption(editor, text) {
    const start = flat(text).slice(0, 24);
    const selectAllIn = () => {
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };
    selectAllIn();
    document.execCommand('insertText', false, text);
    await pause(300);
    if (flat(editor.innerText).includes(start)) { step('caption typed'); return true; }
    selectAllIn();
    const data = new DataTransfer();
    data.setData('text/plain', text);
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    await pause(300);
    const ok = flat(editor.innerText).includes(start);
    step(ok ? 'caption pasted' : `caption not taken; box shows "${flat(editor.innerText).slice(0, 60)}"`);
    return ok;
  }

  /** A small note in the corner saying what the helper is doing, with a button to copy what happened. */
  function note(text, tone = 'info') {
    step(`note: ${text}`);
    let box = document.getElementById('reach-tiktok-note');
    if (!box) {
      box = document.createElement('div');
      box.id = 'reach-tiktok-note';
      box.setAttribute('role', 'status');
      Object.assign(box.style, {
        position: 'fixed', right: '16px', bottom: '16px', zIndex: 2147483647, maxWidth: '340px',
        padding: '12px 14px', borderRadius: '12px', font: '600 14px/1.4 system-ui, sans-serif',
        boxShadow: '0 6px 24px rgba(0,0,0,.25)', color: '#fff', display: 'flex', flexDirection: 'column', gap: '8px',
      });
      const msg = document.createElement('span');
      msg.id = 'reach-tiktok-msg';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copy details for Claude';
      Object.assign(copy.style, { alignSelf: 'flex-start', font: '600 12px system-ui, sans-serif', padding: '4px 8px', borderRadius: '8px', border: '0', cursor: 'pointer' });
      copy.onclick = async () => {
        await navigator.clipboard.writeText(details()).catch(() => {});
        copy.textContent = 'Copied';
      };
      box.append(msg, copy);
      document.body.append(box);
    }
    box.style.background = tone === 'done' ? '#0f7b4a' : tone === 'bad' ? '#b42318' : '#1d2433';
    box.querySelector('#reach-tiktok-msg').textContent = `Reach Studio: ${text}`;
    return box;
  }

  /** What happened, plus what TikTok shows, to paste to Claude when something goes wrong. */
  function details() {
    const editor = captionEditor();
    const page = (document.body?.innerText ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 40).join(' | ');
    return [
      'Reach Studio TikTok helper report',
      `page: ${location.href}`,
      `browser: ${navigator.userAgent}`,
      `file picker: ${videoInput() ? `yes (accept=${videoInput().accept})` : 'no'}`,
      `caption box: ${editor ? `${editor.className || editor.tagName} "${flat(editor.innerText).slice(0, 60)}"` : 'none'}`,
      `TikTok error shown: ${uploadFailed() ? 'yes' : 'no'}`,
      ...log,
      `page text: ${page.slice(0, 1500)}`,
    ].join('\n');
  }

  /** After a video goes in: TikTok's error, or its caption box (null when neither shows in time). */
  async function outcome(timeoutMs) {
    return waitFor(() => (uploadFailed() ? 'failed' : captionEditor() ? 'editor' : null), timeoutMs);
  }

  /** Fills the caption once TikTok shows its box and has written the file name into it. */
  async function captionWhenReady(job, editorTimeoutMs) {
    const editor = await waitFor(captionEditor, editorTimeoutMs);
    if (!editor) { note('TikTok did not show the caption box. Paste the caption yourself (it is copied).', 'bad'); await navigator.clipboard?.writeText(job.caption).catch(() => {}); return false; }
    await pause(1500); // TikTok first writes the file name into the caption; replace it after that
    if (uploadFailed()) return 'failed';
    const ok = await putCaption(captionEditor() ?? editor, job.caption);
    if (!ok) { note('Could not write the caption. Paste it yourself (it is copied).', 'bad'); await navigator.clipboard?.writeText(job.caption).catch(() => {}); return false; }
    note('Ready. Check the video and caption, then press Post.', 'done');
    return true;
  }

  /** Plan B: save the video to Downloads; when the owner picks it with TikTok's button, fill the caption. */
  async function handOver(job, editorTimeoutMs, saveVideo) {
    step('TikTok refused the added video; saving it for the owner');
    await saveVideo(job, fileName(job));
    note(`TikTok did not take the video automatically. It is saved in your Downloads as "${fileName(job)}". Click "Re-upload this file" (or "Select video") and choose it. The caption fills by itself after.`, 'bad');
    // The helper's own add happened before this listens, so the next file picked is the owner's.
    await new Promise((resolve) => {
      document.addEventListener('change', function picked(e) {
        if (e.target instanceof HTMLInputElement && e.target.type === 'file' && e.target.files?.length) {
          document.removeEventListener('change', picked, true);
          step(`owner picked ${e.target.files[0].name}`);
          resolve();
        }
      }, true);
    });
    note('Got it. Waiting for TikTok to show the caption box…');
    await pause(3000); // the old error goes away while TikTok takes the new file
    return captionWhenReady(job, editorTimeoutMs);
  }

  /** The whole fill, step by step, with what is happening shown in the corner. */
  async function fill(job, input, { editorTimeoutMs = 120_000, saveVideo = async () => {} } = {}) {
    note(`Adding "${job.name}"…`);
    await putVideo(input, job);
    note('Video added. Waiting for TikTok to take it…');
    const first = await outcome(editorTimeoutMs);
    if (first === 'failed') return handOver(job, editorTimeoutMs, saveVideo);
    if (!first) { note('TikTok did not react to the video. Click "Copy details for Claude" and send it.', 'bad'); return false; }
    const result = await captionWhenReady(job, editorTimeoutMs);
    return result === 'failed' ? handOver(job, editorTimeoutMs, saveVideo) : result;
  }

  return { waitFor, videoInput, captionEditor, uploadFailed, putVideo, putCaption, note, details, fill };
})();
