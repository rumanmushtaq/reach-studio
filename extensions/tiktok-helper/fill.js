// Helps post a Reach Studio video on TikTok's upload page. TikTok breaks when an extension slips a file into
// its picker, so the helper saves the video to Downloads, the owner picks it with TikTok's own button, and
// the helper then writes Claude's caption. It never presses Post: the owner checks and posts, so TikTok
// sees a person posting, not a bot. Shared by tiktok.js, and used by the tests.

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

  const fileName = (job) => (/\.(mp4|mov|webm)$/i.test(job.fileName) ? job.fileName : `${job.fileName || 'video'}.mp4`);
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

  /** A small note in the corner saying what to do next, with a button to copy what happened. */
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
      document.documentElement.append(box); // outside TikTok's own page tree, so its app never sees it
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
      ...log,
      `page text: ${page.slice(0, 1500)}`,
    ].join('\n');
  }

  /** Resolves when the owner picks a file in any of TikTok's file pickers. */
  const ownerPicks = () => new Promise((resolve) => {
    document.addEventListener('change', function picked(e) {
      if (e.target instanceof HTMLInputElement && e.target.type === 'file' && e.target.files?.length) {
        document.removeEventListener('change', picked, true);
        step(`owner picked ${e.target.files[0].name}`);
        resolve();
      }
    }, true);
  });

  /** The whole job: save the video, wait for the owner to pick it, then write the caption. */
  async function fill(job, { editorTimeoutMs = 120_000, saveVideo = async () => {} } = {}) {
    const picked = ownerPicks(); // listen first, in case the owner is quick
    note(`Saving "${job.name}" to your Downloads…`);
    await saveVideo(job, fileName(job));
    note(`Saved in your Downloads as "${fileName(job)}". Click "Select video" and choose it. The caption fills by itself after.`);
    await picked;
    note('Got it. Waiting for TikTok to show the caption box…');
    const editor = await waitFor(captionEditor, editorTimeoutMs);
    if (!editor) {
      await navigator.clipboard?.writeText(job.caption).catch(() => {});
      note('TikTok did not show the caption box. The caption is copied: paste it yourself.', 'bad');
      return false;
    }
    await pause(1500); // TikTok first writes the file name into the caption; replace it after that
    if (!(await putCaption(captionEditor() ?? editor, job.caption))) {
      await navigator.clipboard?.writeText(job.caption).catch(() => {});
      note('Could not write the caption. It is copied: paste it yourself.', 'bad');
      return false;
    }
    note('Ready. Check the video and caption, then press Post.', 'done');
    return true;
  }

  return { waitFor, videoInput, captionEditor, putCaption, note, details, fill };
})();
