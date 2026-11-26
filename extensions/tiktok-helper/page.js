// Runs in the page's own world, not the helper's: a key press made from the helper's world reaches the page
// without its key code, so editors like TikTok's ignore it. fill.js asks for presses with window.postMessage.
window.addEventListener('message', async (e) => {
  if (e.source !== window || e.data?.type !== 'reach:press') return;
  const { key, code, times, id } = e.data;
  const target = document.activeElement;
  for (let i = 0; target && i < times && (target.innerText ?? '').trim(); i++) {
    const press = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true });
    Object.defineProperty(press, 'keyCode', { get: () => code });
    Object.defineProperty(press, 'which', { get: () => code });
    target.dispatchEvent(press);
    await new Promise((r) => setTimeout(r, 20)); // the editor applies each press before it reads the next
  }
  window.postMessage({ type: 'reach:pressed', id }, window.location.origin);
});
