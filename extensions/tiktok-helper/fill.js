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
  /** The caption box: TikTok's Draft.js editor or Facebook's Lexical one, else the first visible editable box. */
  const captionEditor = () =>
    [...document.querySelectorAll('.public-DraftEditor-content[contenteditable="true"], [data-lexical-editor="true"][contenteditable="true"]')].find(visible)
    ?? [...document.querySelectorAll('[contenteditable="true"]')].find(visible) ?? null;

  const fileName = (job) => (/\.(mp4|mov|webm)$/i.test(job.fileName) ? job.fileName : `${job.fileName || 'video'}.mp4`);
  const flat = (s) => s.replace(/\s+/g, ' ').trim();

  /** Presses a key `times` times in the focused editor, from the page's own world (page.js), one at a time. */
  function pressInPage(key, code, times) {
    const id = `${Date.now()}-${Math.random()}`;
    return new Promise((resolve) => {
      const done = () => { window.removeEventListener('message', onDone); clearTimeout(timer); resolve(); };
      const onDone = (e) => { if (e.source === window && e.data?.type === 'reach:pressed' && e.data.id === id) done(); };
      const timer = setTimeout(done, 15_000);
      window.addEventListener('message', onDone);
      window.postMessage({ type: 'reach:press', key, code, times, id }, window.location.origin);
    });
  }

  /** Puts the cursor in the editor: over its text when `all`, else at the start of its first line. */
  function selectIn(editor, all) {
    const texts = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) texts.push(walker.currentNode);
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    if (all && texts.length) {
      range.setStart(texts[0], 0);
      range.setEnd(texts[texts.length - 1], texts[texts.length - 1].length);
    } else {
      // An empty box: put the cursor in its first line (Lexical keeps an empty paragraph there).
      let first = editor;
      while (first.firstElementChild && first.firstElementChild.tagName !== 'BR') first = first.firstElementChild;
      range.setStart(first, 0);
      range.collapse(true);
    }
    sel.addRange(range);
    editor.dispatchEvent(new Event('select', { bubbles: true }));
    document.dispatchEvent(new Event('selectionchange'));
  }

  function paste(editor, text) {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }

  /**
   * Replaces the caption by pasting it, the one way TikTok's Draft.js and Facebook's Lexical editors really
   * take text in: typing through the page changes only what is shown, and the editor breaks when it notices.
   * TikTok first writes the file name in and its editor may keep its cursor after it whatever the page selects,
   * so the box is emptied with Backspace and Delete presses, which the editor handles itself, before the paste.
   */
  async function putCaption(editor, text) {
    editor.focus();
    const had = flat(editor.innerText);
    if (had) {
      selectIn(editor, true);
      await pause(100);
      await pressInPage('Backspace', 8, had.length + 2);
      await pressInPage('Delete', 46, had.length + 2);
      await pause(200);
      step(flat(editor.innerText) ? `box not emptied; shows "${flat(editor.innerText).slice(0, 60)}"` : `emptied the ${had.length} letters already there`);
    }
    selectIn(editor, false);
    await pause(100);
    paste(editor, text);
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
    box.dataset.steps = log.slice(-12).join(' | '); // the latest steps, for tests and a look in DevTools
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

  const textOf = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const shown = (el) => el && visible(el);
  const two = (n) => String(n).padStart(2, '0');
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const TIME = /^\d{1,2}:\d{2}$/;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  /** Clicks like a person does: pointer and mouse events, then the click. */
  function press(el) {
    el.scrollIntoView({ block: 'center' });
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
    el.click();
  }

  /** "November 2026", "Nov 2026" or "2026-11" as a month count, to compare months. */
  function monthOf(text) {
    const t = text.toLowerCase();
    const year = Number(t.match(/\d{4}/)?.[0]);
    const named = MONTHS.findIndex((m) => t.includes(m.slice(0, 3)));
    const numbered = Number(t.match(/\d{4}[-/.](\d{1,2})/)?.[1]) - 1;
    const month = named >= 0 ? named : numbered;
    return year && month >= 0 ? year * 12 + month : null;
  }

  /** An element's own text: its direct text, not its children's. */
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();
  /** Visible elements that hold text themselves, like a label or a list item. */
  const leaves = (root = document) => [...(root.body ?? root).querySelectorAll('*')].filter((el) => shown(el) && ownText(el) && ownText(el) === textOf(el));

  /** The visible element whose own text is exactly `text`. */
  const byText = (text) => leaves().find((el) => textOf(el).toLowerCase() === text.toLowerCase());

  /** The biggest box around `el` that still shows only `el`'s text (TikTok's clickable field). */
  function fieldOf(el) {
    let box = el;
    while (box.parentElement && textOf(box.parentElement) === textOf(el)) box = box.parentElement;
    return box;
  }

  /** TikTok's time and date fields under "When to post", found by what they show: "03:10" and "2026-11-25". */
  function scheduleFields() {
    const all = leaves();
    const time = all.find((el) => TIME.test(textOf(el)) || TIME.test(el.querySelector?.('input')?.value ?? ''));
    const date = all.find((el) => DATE.test(textOf(el)) || DATE.test(el.querySelector?.('input')?.value ?? ''));
    const inputs = [...document.querySelectorAll('input')].filter(shown);
    return {
      time: time ? fieldOf(time) : inputs.find((i) => TIME.test(i.value)) ?? null,
      date: date ? fieldOf(date) : inputs.find((i) => DATE.test(i.value)) ?? null,
    };
  }
  const fieldValue = (el) => (el?.tagName === 'INPUT' ? el.value : el?.querySelector('input')?.value || textOf(el));

  /** A list whose items read exactly `values` in order, like TikTok's hour or minute column. */
  function listOf(values) {
    const items = leaves().filter((el) => values.includes(textOf(el)));
    for (const item of items) {
      const list = item.parentElement;
      const texts = [...list.children].map(textOf);
      if (values.every((v) => texts.includes(v))) return list;
      const outer = list.parentElement;
      if (outer && values.every((v) => [...outer.children].map(textOf).includes(v))) return outer;
    }
    return null;
  }
  const HOURS = Array.from({ length: 24 }, (_, h) => two(h));
  const MINUTES = Array.from({ length: 12 }, (_, i) => two(i * 5));

  /** The calendar around its month title: the smallest box that also holds day 1 and day 28. */
  function calendarOf(title) {
    for (let box = title; box; box = box.parentElement) {
      const texts = leaves(box).map(textOf);
      if (texts.includes('1') && texts.includes('28')) return box;
    }
    return document;
  }

  /** The calendar's day cells in page order, from the shown month's 1st (days before it belong to last month). */
  function monthDays(root) {
    const cells = leaves(root).filter((el) => /^\d{1,2}$/.test(textOf(el)) && Number(textOf(el)) >= 1 && Number(textOf(el)) <= 31);
    const first = cells.findIndex((el) => textOf(el) === '1');
    return first < 0 ? [] : cells.slice(first);
  }
  const disabled = (el) => el.matches('[aria-disabled="true"], [disabled]') || /disabled|invalid/i.test(`${el.className} ${el.parentElement?.className ?? ''}`);

  /**
   * Sets TikTok's "When to post" to Schedule at `at`: the Schedule option, then the time field's hour and
   * minute columns, then the day in the date field's calendar. Only clicks, like a person, and stops at anything
   * unexpected. True when the fields then show that time and date. TikTok's picker uses this browser's clock,
   * and so does `at`.
   */
  async function schedule(at) {
    const d = new Date(at);
    const want = { date: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, time: `${two(d.getHours())}:${two(d.getMinutes())}` };
    const option = byText('Schedule');
    if (!option) { step('schedule: no Schedule option'); return false; }
    press(option.closest('label')?.querySelector('input[type="radio"]') ?? option.closest('label') ?? option);
    const fields = await waitFor(() => { const f = scheduleFields(); return f.time && f.date ? f : null; }, 5000);
    if (!fields) { step('schedule: no time or date field after choosing Schedule'); return false; }
    step(`schedule fields show ${fieldValue(fields.time)} and ${fieldValue(fields.date)}`);

    // Time: open the field, then click the hour and the minute in their columns.
    if (fieldValue(fields.time) !== want.time) {
      press(fields.time);
      const hours = await waitFor(() => listOf(HOURS), 3000);
      if (!hours) { step('schedule: the time field opened no hour list'); return false; }
      const hour = [...hours.querySelectorAll('*')].find((el) => textOf(el) === two(d.getHours()) && [...el.children].every((c) => !textOf(c)));
      if (!hour) { step(`schedule: hour ${two(d.getHours())} not in the list`); return false; }
      press(hour);
      await pause(300);
      if (!listOf(MINUTES)) { press(scheduleFields().time ?? fields.time); await pause(400); } // the list closed after the hour
      const minutes = listOf(MINUTES);
      const minute = minutes && [...minutes.querySelectorAll('*')].find((el) => textOf(el) === two(d.getMinutes()) && [...el.children].every((c) => !textOf(c)));
      if (!minute) { step(`schedule: minute ${two(d.getMinutes())} not in the list (TikTok steps by 5)`); return false; }
      press(minute);
      await pause(400);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }

    // Date: open the field, move to the right month, then click the day.
    const dateField = scheduleFields().date ?? fields.date;
    if (fieldValue(dateField) !== want.date) {
      press(dateField);
      await pause(400);
      const target = d.getFullYear() * 12 + d.getMonth();
      const findTitle = () => leaves().find((el) => monthOf(textOf(el)) !== null && !DATE.test(textOf(el)));
      for (let i = 0; i < 14; i++) {
        const title = findTitle();
        const showing = title ? monthOf(textOf(title)) : target; // no title: assume the month that is open
        if (showing === target) break;
        // The arrows sit beside the title: textless clickable boxes in the same row.
        const row = [...title.parentElement.children].filter((el) => el !== title && shown(el));
        if (row.length < 2) { step('schedule: no month arrows beside the calendar title'); return false; }
        press(showing < target ? row[row.length - 1] : row[0]);
        await pause(300);
      }
      const title = findTitle();
      const day = monthDays(title ? calendarOf(title) : document).find((el) => textOf(el) === String(d.getDate()) && !disabled(el));
      if (!day) { step(`schedule: day ${d.getDate()} not offered in the calendar`); return false; }
      press(day);
      await pause(400);
    }

    const now = scheduleFields();
    const ok = fieldValue(now.time) === want.time && fieldValue(now.date) === want.date;
    step(ok ? `scheduled ${want.date} ${want.time}` : `schedule fields show ${fieldValue(now.time)} ${fieldValue(now.date)}, wanted ${want.time} ${want.date}`);
    return ok;
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
  async function fill(job, { editorTimeoutMs, saveVideo = async () => {} } = {}) {
    const facebook = job.site === 'facebook';
    const site = facebook ? 'Facebook' : 'TikTok';
    const picked = ownerPicks(); // listen first, in case the owner is quick
    note(`Saving "${job.name}" to your Downloads…`);
    await saveVideo(job, fileName(job));
    note(`Saved in your Downloads as "${fileName(job)}". Click "${facebook ? 'Add video' : 'Select video'}" and choose it. The caption fills by itself after.`);
    await picked;
    // Facebook shows its description box only after Next (sometimes twice); TikTok shows it at once.
    note(facebook ? 'Got it. Press Next until you see the description box; the helper writes the caption there.' : 'Got it. Waiting for TikTok to show the caption box…');
    const editor = await waitFor(captionEditor, editorTimeoutMs ?? (facebook ? 10 * 60_000 : 120_000));
    if (!editor) {
      await navigator.clipboard?.writeText(job.caption).catch(() => {});
      note(`${site} did not show the caption box. The caption is copied: paste it yourself.`, 'bad');
      return false;
    }
    await pause(1500); // TikTok first writes the file name into the caption; replace it after that
    const captioned = await putCaption(captionEditor() ?? editor, job.caption);
    if (!captioned) await navigator.clipboard?.writeText(job.caption).catch(() => {});
    const captionNote = captioned ? 'Caption added' : 'Could not write the caption: it is copied, so select the box, press Ctrl+A, then Ctrl+V';
    if (facebook) {
      // Facebook does not let a personal profile schedule a reel: it goes out when the owner presses Post.
      note(`${captionNote}. Check it, then press Post${job.slotLabel ? ` (its studio time is ${job.slotLabel})` : ''}.`, captioned ? 'done' : 'bad');
      return captioned;
    }
    const ahead = job.slotAt ? job.slotAt - Date.now() : 0;
    if (ahead >= 15 * 60_000 && ahead <= 10 * 24 * 3600_000) {
      note(`${captionNote}. Setting the schedule time…`, captioned ? 'info' : 'bad');
      if (await schedule(job.slotAt).catch((e) => { step(`schedule: ${e.message}`); return false; })) {
        note(`${captionNote}. Scheduled for ${job.slotLabel} (Pakistan time). Check them, then press Schedule.`, captioned ? 'done' : 'bad');
        return captioned;
      }
    }
    note(`${captionNote}. ${whenToPost(job)}`, captioned ? 'done' : 'bad');
    return captioned;
  }

  return { waitFor, videoInput, captionEditor, putCaption, note, details, whenToPost, schedule, fill };
})();
