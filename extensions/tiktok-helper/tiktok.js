// Runs on TikTok's upload page (and its frames). The frame that shows the file picker asks the background
// script for its job; only a tab opened by "Post to TikTok" has one, so normal visits are left alone.
(async () => {
  const input = await reachFill.waitFor(reachFill.videoInput, 60_000);
  if (!input) return;
  const { job } = await chrome.runtime.sendMessage({ type: 'claim-job' }).catch(() => ({ job: null }));
  if (!job) return;
  const saveVideo = (j, filename) => chrome.runtime.sendMessage({ type: 'save-video', url: j.videoUrl, filename });
  try {
    await reachFill.fill(job, input, { saveVideo });
  } catch (e) {
    reachFill.note(`${e.message}. Click "Copy details for Claude" and send it.`, 'bad');
  }
})();
