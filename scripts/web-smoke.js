const assert = require('assert');
const fs = require('fs');
const JSZip = require('jszip');

const base = process.env.JARVIS_TEST_WEB || 'http://127.0.0.1:3100';
const dataDir = process.env.JARVIS_DATA_DIR || '/tmp/jarvis-web-store';

async function request(path, body, expectOk = true) {
  const r = await fetch(base + path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (expectOk) assert.ok(r.ok, `${path} HTTP ${r.status}: ${JSON.stringify(d)}`);
  else assert.ok(!r.ok, `${path} unexpectedly succeeded`);
  return { response: r, data: d };
}

async function ok(path, body) { return (await request(path, body, true)).data; }

async function validateZipFile(kind, content, requiredEntries) {
  const d = await ok('/api/tools/generate-file', { fileType: kind, prompt: `CI ${kind}`, content });
  assert.equal(d.type, 'file_download');
  assert.ok(d.data?.base64?.length > 100, `${kind} output too small`);
  const zip = await JSZip.loadAsync(Buffer.from(d.data.base64, 'base64'));
  for (const entry of requiredEntries) assert.ok(zip.file(entry), `${kind} missing ${entry}`);
}

(async () => {
  const home = await fetch(base + '/');
  assert.ok(home.ok, `home HTTP ${home.status}`);
  const html = await home.text();
  assert.match(html, /J\.A\.R\.V\.I\.S\.|JARVIS/i);

  await ok('/api/tools/memory', { action: 'clear' });
  const saved = await ok('/api/tools/memory', { action: 'save', content: 'CI remembers local persistence' });
  assert.equal(saved.data.content, 'CI remembers local persistence');
  const found = await ok('/api/tools/memory', { action: 'search', query: 'local persistence' });
  assert.ok(found.data.some(x => x.content.includes('local persistence')));

  const project = await ok('/api/tools/project', { action: 'create', name: 'CI Project', description: 'runtime test' });
  assert.equal(project.data.name, 'CI Project');
  const noted = await ok('/api/tools/project', { action: 'note', name: 'CI Project', note: 'project note works' });
  assert.ok(noted.data.notes.some(x => x.content === 'project note works'));
  const projectFetch = await fetch(base + '/api/tools/project?name=' + encodeURIComponent('CI Project'));
  assert.ok(projectFetch.ok);
  assert.equal((await projectFetch.json()).data.name, 'CI Project');

  const reminder = await ok('/api/tools/reminder', { action: 'create', task: 'CI reminder', type: 'relative', seconds: 60 });
  assert.equal(reminder.data.task, 'CI reminder');
  const reminders = await ok('/api/tools/reminder', { action: 'list' });
  assert.ok(reminders.data.some(x => x.task === 'CI reminder'));

  const sessionId = 'ci-session';
  await ok('/api/sessions', {
    userId: 'ci-user', sessionId,
    messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }],
    title: 'CI Session',
  });
  const sessionFetch = await fetch(base + `/api/sessions?sessionId=${encodeURIComponent(sessionId)}`);
  assert.ok(sessionFetch.ok);
  const session = await sessionFetch.json();
  assert.equal(session.title, 'CI Session');
  assert.equal(session.messages.length, 2);
  const sessionList = await fetch(base + '/api/sessions?userId=ci-user');
  assert.ok(sessionList.ok);
  assert.ok((await sessionList.json()).sessions.some(x => x.sessionId === sessionId));

  await ok('/api/history', { userId: 'ci-user', messages: [{ role: 'user', content: 'history survives' }] });
  const historyFetch = await fetch(base + '/api/history?userId=ci-user');
  assert.ok(historyFetch.ok);
  assert.equal((await historyFetch.json()).messages[0].content, 'history survives');

  const execute = await ok('/api/tools/execute', { language: 'javascript', code: 'console.log(process.env)' });
  assert.equal(execute.data.serverExecuted, false);
  assert.match(execute.data.output, /server-side arbitrary code execution is disabled/i);

  const privateBrowse = await request('/api/tools/browse', { url: 'http://127.0.0.1:3100/' }, false);
  assert.match(privateBrowse.data.error || '', /private|local/i);
  const privateScreen = await request('/api/tools/screenshot', { url: 'http://127.0.0.1:3100/' }, false);
  assert.match(privateScreen.data.error || '', /private|local/i);

  const calc = await ok('/api/tools/calculate', { expression: '(12 + 8) * 3' });
  assert.equal(calc.data.result, 60);

  await validateZipFile('xlsx', '[["Name","Value"],["Alpha",1],["Beta",2]]', [
    'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml',
  ]);
  await validateZipFile('pptx', '# First Slide\n- Point one\n---\n# Second Slide\n- Point two', [
    'ppt/presentation.xml', 'ppt/slides/slide1.xml', 'ppt/slides/slide2.xml',
  ]);
  await validateZipFile('docx', '# CI Document\nThis document validates DOCX generation.', [
    'word/document.xml', '[Content_Types].xml',
  ]);

  const storeFile = `${dataDir}/web-store.json`;
  assert.ok(fs.existsSync(storeFile), 'local persistent store file missing');
  const persisted = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  assert.ok(persisted.memories?.some(x => x.content.includes('local persistence')));
  assert.ok(persisted.projects?.some(x => x.name === 'CI Project'));
  assert.ok(persisted.reminders?.some(x => x.task === 'CI reminder'));
  assert.ok(persisted.sessions?.some(x => x.sessionId === sessionId));
  assert.ok(persisted.history?.some(x => x.userId === 'ci-user'));

  console.log('JARVIS web feature, persistence, and safety smoke tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
