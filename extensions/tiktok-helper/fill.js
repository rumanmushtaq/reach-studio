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

  /**
   * Replaces the caption by pasting it, the one way TikTok's Draft.js editor really takes text in: typing
   * through the page changes only what is shown, and the editor crashes the page when it notices.
   */
  async function putCaption(editor, text) {
    editor.focus();
    // Select the editor's own text (not the box around it), and let the editor read that selection.
    const texts = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) texts.push(walker.currentNode);
    const sel = window.getSelection();
    sel.removeAllRanges();
    if (texts.length) {
      const range = document.createRange();
      range.setStart(texts[0], 0);
      range.setEnd(texts[texts.length - 1], texts[texts.length - 1].length);
      sel.addRange(range);
    }
    editor.dispatchEvent(new Event('select', { bubbles: true }));
    document.dispatchEvent(new Event('selectionchange'));
    await pause(100);
    const data = new DataTransfer();
    data.setData('text/plain', text);
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    await pause(400);
    const ok = flat(editor.innerText) === flat(text);
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

  /** The part of TikTok's page with "When to post", without styles, so its schedule boxes can be filled later. */
  function scheduleHtml() {
    const label = [...document.querySelectorAll('body *')].find((el) => el.children.length === 0 && /^\s*when to post\s*$/i.test(el.textContent ?? ''));
    let box = label;
    for (let i = 0; box && i < 4; i++) box = box.parentElement; // up to the settings group around it
    if (!box) return 'not found';
    const copy = box.cloneNode(true);
    copy.querySelectorAll('*').forEach((el) => { el.removeAttribute('style'); if (el.tagName === 'svg') el.innerHTML = ''; });
    return copy.outerHTML.replace(/\s+/g, ' ').slice(0, 6000);
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
      `when-to-post html: ${scheduleHtml()}`,
    ].join('\n');
  }

  /** What to choose under TikTok's "When to post": its schedule takes 15 minutes to 10 days ahead. */
  function whenToPost(job, now = Date.now()) {
    if (!job.slotAt || !job.slotLabel) return 'Then press Post.';
    const ahead = job.slotAt - now;
    if (ahead < 15 * 60_000) return `Its time (${job.slotLabel}) is now or past, so press Post.`;
    if (ahead > 10 * 24 * 3600_000) return `Its time (${job.slotLabel}) is over 10 days away, more than TikTok can schedule: post it nearer the day.`;
    return `Under "When to post" choose Schedule and set ${job.slotLabel} (Pakistan time), then press Schedule.`;
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
    note(`Caption added. ${whenToPost(job)}`, 'done');
    return true;
  }

  return { waitFor, videoInput, captionEditor, putCaption, note, details, whenToPost, fill };
})();
