chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FETCH') {
    fetch(msg.url)
      .then(r => r.text())
      .then(text => sendResponse({ ok: true, text }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'DEEPSEEK') {
    fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${msg.key}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: msg.prompt }],
        response_format: { type: 'json_object' },
      }),
    })
      .then(r => r.json())
      .then(json => {
        const text = json?.choices?.[0]?.message?.content || '[]';
        sendResponse({ ok: true, text });
      })
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});
