chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FETCH') {
    fetch(msg.url)
      .then(r => r.text())
      .then(text => sendResponse({ ok: true, text }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'GEMINI') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${msg.key}`;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: msg.prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      }),
    })
      .then(r => r.json())
      .then(json => {
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        sendResponse({ ok: true, text });
      })
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});
