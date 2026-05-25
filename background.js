chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'FETCH') return;
  fetch(msg.url)
    .then(r => r.text())
    .then(text => sendResponse({ ok: true, text }))
    .catch(e => sendResponse({ ok: false, error: e.message }));
  return true; // keep channel open for async response
});
