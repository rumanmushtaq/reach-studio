// Fills TikTok's upload page: puts the video in its file picker and the caption in its editor. It never
// presses Post: the owner checks and posts, so TikTok sees a person posting, not a bot.
// Shared by tiktok.js, and loaded on its own by the tests.

const reachFill = (() => {
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const captionEditor = () => [...document.querySelectorAll('[contenteditable="true"]')].find(visible) ?? null;

  /** Downloads the video and gives it to the page's file picker, as if the owner had chosen it. */
  async function putVideo(input, job) {
    const res = await fetch(job.videoUrl);
    if (!res.ok) throw new Error(`Could not download the video (${res.status})`);
    const blob = await res.blob();
    const name = /\.(mp4|mov|webm)$/i.test(job.fileName) ? job.fileName : `${job.fileName || 'video'}.mp4`;
    const file = new File([blob], name, { type: blob.type.startsWith('video/') ? blob.type.split(';')[0] : 'video/mp4' });
    const files = new DataTransfer();
    files.items.add(file);
    input.files = files.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return file;
  }

  /** Replaces the caption. Typing first; if the editor ignores it, pasting, which TikTok's editor accepts. */
  async function putCaption(editor, text) {
    editor.focus();
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);
    await pause(200);
    const start = text.slice(0, 20);
    if (editor.textContent.includes(start)) return true;
    editor.focus();
    document.execCommand('selectAll', false);
    const data = new DataTransfer();
    data.setData('text/plain', text);
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    await pause(200);
    return editor.textContent.includes(start);
  }

  /** A small note in the corner saying what the helper is doing. */
  function note(text, tone = 'info') {
    let box = document.getElementById('reach-tiktok-note');
    if (!box) {
      box = document.createElement('div');
      box.id = 'reach-tiktok-note';
      box.setAttribute('role', 'status');
      Object.assign(box.style, {
        position: 'fixed', right: '16px', bottom: '16px', zIndex: 2147483647, maxWidth: '320px',
        padding: '12px 14px', borderRadius: '12px', font: '600 14px/1.4 system-ui, sans-serif',
        boxShadow: '0 6px 24px rgba(0,0,0,.25)', color: '#fff',
      });
      document.body.append(box);
    }
    box.style.background = tone === 'done' ? '#0f7b4a' : tone === 'bad' ? '#b42318' : '#1d2433';
    box.textContent = `Reach Studio: ${text}`;
    return box;
  }

  /** The whole fill, step by step, with what is happening shown in the corner. */
  async function fill(job, input, { editorTimeoutMs = 120_000 } = {}) {
    note(`Adding "${job.name}"…`);
    await putVideo(input, job);
    note('Video added. Waiting for TikTok to show the caption box…');
    const editor = await waitFor(captionEditor, editorTimeoutMs);
    if (!editor) { note('TikTok did not show the caption box. Paste the caption yourself.', 'bad'); return false; }
    await pause(1500); // TikTok first writes the file name into the caption; replace it after that
    const ok = await putCaption(editor, job.caption);
    if (!ok) { note('Could not write the caption. Paste it yourself (it is copied).', 'bad'); await navigator.clipboard?.writeText(job.caption).catch(() => {}); return false; }
    note('Ready. Check the video and caption, then press Post.', 'done');
    return true;
  }

  return { waitFor, videoInput, captionEditor, putVideo, putCaption, note, fill };
})();
