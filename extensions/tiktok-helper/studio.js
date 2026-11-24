// Runs on Reach Studio. Tells the studio the helper is installed, and passes "Post to TikTok" to the
// background script, which opens TikTok's upload page.
document.documentElement.dataset.reachTiktok = '1';

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.type !== 'reach-studio:tiktok-post' || !data.job) return;
  const { name, fileName, videoUrl, caption } = data.job;
  if (typeof videoUrl !== 'string' || !videoUrl.startsWith('https://')) return;
  chrome.runtime.sendMessage({ type: 'open-tiktok', job: { name: String(name), fileName: String(fileName), videoUrl, caption: String(caption ?? '') } });
});
