const assert = require('assert');

const base = 'http://127.0.0.1';

async function json(url, options) {
  const r = await fetch(url, options);
  const d = await r.json().catch(() => ({}));
  assert.ok(r.ok, `${url} HTTP ${r.status}: ${JSON.stringify(d)}`);
  return d;
}

async function command(message, scene = { panels: [], selectedId: null }) {
  const started = Date.now();
  const data = await json(`${base}:3007/v1/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, messages: [], scene }),
  });
  return { data, elapsed: Date.now() - started };
}

async function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

(async () => {
  const realtime = await json(`${base}:3007/health`);
  assert.equal(realtime.version, '6.1.0');
  assert.equal(realtime.ollama, true, 'mock Ollama should be visible to realtime health');

  const browser1 = await json(`${base}:3006/health`);
  const browser2 = await json(`${base}:3006/health`);
  assert.equal(browser1.state, 'idle');
  assert.equal(browser2.state, 'idle');
  assert.equal(browser1.pages, 0);
  assert.equal(browser2.pages, 0);

  const time = await command('what time is it');
  assert.match(time.data.reply, /It's /);
  assert.ok(time.elapsed < 1200, `instant time command took ${time.elapsed}ms`);

  const map = await command('pull up a map of Richmond Virginia');
  assert.equal(map.data.hudActions?.[0]?.action, 'show');
  assert.equal(map.data.hudActions?.[0]?.panelType, 'map');
  assert.equal(map.data.hudActions?.[0]?.query, 'Richmond Virginia');

  const full = await command('make the map take the whole screen');
  assert.equal(full.data.hudActions?.[0]?.action, 'resize');
  assert.equal(full.data.hudActions?.[0]?.target, 'map');
  assert.equal(full.data.hudActions?.[0]?.position, 'full');

  const weatherMove = await command('move the weather panel to the top right');
  assert.equal(weatherMove.data.hudActions?.[0]?.target, 'weather');
  assert.equal(weatherMove.data.hudActions?.[0]?.position, 'top-right');

  const stop = await command('stop talking');
  assert.equal(stop.data.clientAction, 'stop-speaking');

  const natural = await command('Explain what a checksum is in one sentence.');
  assert.match(natural.data.reply, /local conversation path is working/i);
  assert.ok(natural.elapsed < 4000, `mocked natural conversation took ${natural.elapsed}ms`);
  assert.ok(!/the user|let me think|first i need to|tool_call/i.test(natural.data.reply));

  const leakedTool = await command('tool leak test', {
    selectedId: 'map_1',
    panels: [{ id: 'map_1', panelType: 'map', query: 'London', title: 'Map' }],
  });
  assert.ok(!/"name"\s*:|arguments|tool_call/i.test(leakedTool.data.reply || ''));
  assert.ok(leakedTool.data.hudActions?.some(a => a.action === 'resize' && a.target === 'map' && a.position === 'full'));

  const reasoningLeak = await command('reasoning leak test');
  assert.ok(!/the user|let me think|first i need to|i should check/i.test(reasoningLeak.data.reply || ''));
  assert.match(reasoningLeak.data.reply, /safe direct answer|i’m here/i);

  const agentResponse = await fetch(`${base}:3007/v1/agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Verify local agent mode', messages: [], scene: { panels: [], selectedId: null } }),
  });
  assert.ok(agentResponse.ok);
  const agentText = await agentResponse.text();
  assert.match(agentText, /"type":"plan"/);
  assert.match(agentText, /"type":"reply"/);
  assert.match(agentText, /"type":"done"/);
  assert.ok(!/the user|let me think|first i need to/i.test(agentText));

  const delegateStart = Date.now();
  const delegated = await json(`${base}:3003/v1/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'delegate', args: { agent: 'tom', task: 'Verify delegated local path' } }),
  });
  assert.equal(delegated.ok, true);
  assert.match(delegated.result || '', /local conversation path is working/i);
  assert.ok(Date.now() - delegateStart < 5000, 'delegated path should not use the old 90-second wait');

  const taskCreate = await json(`${base}:3003/v1/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ objective: 'Background CI task', agent: 'argus' }),
  });
  assert.ok(taskCreate.task?.id);
  let completed = null;
  for (let i = 0; i < 6; i++) {
    await wait(1200);
    const taskList = await json(`${base}:3003/v1/tasks`);
    completed = taskList.tasks.find(t => t.id === taskCreate.task.id);
    if (completed?.status === 'complete') break;
  }
  assert.equal(completed?.status, 'complete', `background task status was ${completed?.status}`);

  const core = await json(`${base}:3003/health`);
  assert.equal(core.status, 'online');
  assert.equal(core.services.browser, true, 'idle browser service should still report available');

  console.log('JARVIS final realtime, agent, delegation, and background smoke tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
