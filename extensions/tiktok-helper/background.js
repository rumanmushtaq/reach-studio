// Opens TikTok's upload page for a video from Reach Studio, and hands that tab its job (the video link and
// caption) once the page is ready. Jobs live in session storage, so they survive the worker going to sleep.
const UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload?from=reach-studio';
const key = (tabId) => `job:${tabId}`;

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'open-tiktok' && msg.job) {
    chrome.tabs.create({ url: UPLOAD_URL }, (tab) => {
      if (tab?.id !== undefined) chrome.storage.session.set({ [key(tab.id)]: msg.job });
      reply({ ok: true });
    });
    return true; // answers once the tab is open
  }
  if (msg?.type === 'save-video' && typeof msg.url === 'string' && msg.url.startsWith('https://')) {
    // Plan B when TikTok refuses the added video: save it, so the owner can pick it with TikTok's button.
    const filename = String(msg.filename || 'reach-video.mp4').replace(/[\\/:*?"<>|]+/g, '-');
    chrome.downloads.download({ url: msg.url, filename, conflictAction: 'uniquify' }, (id) => reply({ id: id ?? null }));
    return true;
  }
  if (msg?.type === 'claim-job' && sender.tab?.id !== undefined) {
    // The first frame of the tab that finds the upload form takes the job; nobody else gets it.
    // A fast page can ask before the job is saved, so look again for a few seconds.
    const k = key(sender.tab.id);
    (async () => {
      for (let i = 0; i < 15; i++) {
        const job = (await chrome.storage.session.get(k))[k];
        if (job) { await chrome.storage.session.remove(k); return reply({ job }); }
        await new Promise((r) => setTimeout(r, 200));
      }
      reply({ job: null });
    })();
    return true; // answers later
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => { chrome.storage.session.remove(key(tabId)); });
