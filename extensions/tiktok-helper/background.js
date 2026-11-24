// Opens TikTok's upload page for a video from Reach Studio, and hands that tab its job (the video link and
// caption) once the page is ready. Jobs live in session storage, so they survive the worker going to sleep.
const UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload?from=reach-studio';
const key = (tabId) => `job:${tabId}`;

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'open-tiktok' && msg.job) {
    chrome.tabs.create({ url: UPLOAD_URL }, (tab) => {
      if (tab?.id !== undefined) chrome.storage.session.set({ [key(tab.id)]: msg.job });
    });
    return false;
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
