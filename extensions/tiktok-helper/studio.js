// Runs on Reach Studio. Tells the studio the helper is installed, passes its Post to TikTok / Facebook button to
// the background script (which opens the site's upload page), and answers the studio so it can say what happened.
document.documentElement.dataset.reachTiktok = '1';

const answer = (ok, error) => window.postMessage({ type: 'reach-studio:tiktok-answer', ok, error }, window.location.origin);

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.type !== 'reach-studio:tiktok-post' || !data.job) return;
  const { site, name, fileName, videoUrl, caption, slotAt, slotLabel } = data.job;
  if (typeof videoUrl !== 'string' || !videoUrl.startsWith('https://')) return answer(false, 'The video link is not valid.');
  // After the helper is updated or reloaded, pages that were already open lose their link to it.
  if (!globalThis.chrome?.runtime?.id) return answer(false, 'The posting helper was updated. Reload this page, then press the button again.');
  chrome.runtime.sendMessage({ type: 'open-tiktok', job: { site: site === 'facebook' ? 'facebook' : 'tiktok', name: String(name), fileName: String(fileName), videoUrl, caption: String(caption ?? ''), slotAt: Number(slotAt) || null, slotLabel: slotLabel ? String(slotLabel) : null } })
    .then(() => answer(true))
    .catch(() => answer(false, 'The posting helper did not answer. Reload this page, then try again.'));
});
