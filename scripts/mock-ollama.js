const http = require('http');

const PORT = Number(process.env.MOCK_OLLAMA_PORT || 11434);

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/tags') {
    return json(res, 200, { models: [{ name: 'qwen3:4b' }] });
  }
  if (req.method !== 'POST' || !['/api/chat', '/api/generate'].includes(req.url)) {
    return json(res, 404, { error: 'not found' });
  }

  let raw = '';
  req.setEncoding('utf8');
  req.on('data', chunk => { raw += chunk; });
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch {}

    if (req.url === '/api/generate') {
      return json(res, 200, { model: body.model || 'qwen3:4b', response: '', done: true });
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const last = messages[messages.length - 1] || {};
    const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';

    if (last.role === 'tool') {
      return json(res, 200, { model: body.model || 'qwen3:4b', message: { role: 'assistant', content: 'Done, sir.' }, done: true });
    }

    if (/tool leak test/i.test(lastUser)) {
      return json(res, 200, {
        model: body.model || 'qwen3:4b',
        message: { role: 'assistant', content: '{"name":"hud","arguments":{"action":"resize","target":"map","position":"full"}}' },
        done: true,
      });
    }

    if (/reasoning leak test/i.test(lastUser)) {
      return json(res, 200, {
        model: body.model || 'qwen3:4b',
        message: { role: 'assistant', content: 'Okay, the user is asking me to reason internally.\n\nThe safe direct answer is ready.' },
        done: true,
      });
    }

    return json(res, 200, {
      model: body.model || 'qwen3:4b',
      message: { role: 'assistant', content: 'Certainly, sir. The local conversation path is working.' },
      done: true,
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock Ollama online at http://127.0.0.1:${PORT}`);
});
