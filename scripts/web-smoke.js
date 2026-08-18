const assert = require('assert');
const fs = require('fs');
const JSZip = require('jszip');

const base = process.env.JARVIS_TEST_WEB || 'http://127.0.0.1:3100';
const dataDir = process.env.JARVIS_DATA_DIR || '/tmp/jarvis-web-store';

async function request(path, body) {
  const r = await fetch(base + path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  assert.ok(r.ok, `${path} HTTP ${r.status}: ${JSON.stringify(d)}`);
  return d;
}

async function validateZipFile(kind, content, requiredEntries) {
  const d = await request('/api/tools/generate-file', { fileType: kind, prompt: `CI ${kind}`, content });
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

  await request('/api/tools/memory', { action: 'clear' });
  const saved = await request('/api/tools/memory', { action: 'save', content: 'CI remembers local persistence' });
  assert.equal(saved.data.content, 'CI remembers local persistence');
  const found = await request('/api/tools/memory', { action: 'search', query: 'local persistence' });
  assert.ok(found.data.some(x => x.content.includes('local persistence')));

  const project = await request('/api/tools/project', { action: 'create', name: 'CI Project', description: 'runtime test' });
  assert.equal(project.data.name, 'CI Project');
  const noted = await request('/api/tools/project', { action: 'note', name: 'CI Project', note: 'project note works' });
  assert.ok(noted.data.notes.some(x => x.content === 'project note works'));
  const projectFetch = await fetch(base + '/api/tools/project?name=' + encodeURIComponent('CI Project'));
  assert.ok(projectFetch.ok);
  assert.equal((await projectFetch.json()).data.name, 'CI Project');

  const reminder = await request('/api/tools/reminder', { action: 'create', task: 'CI reminder', type: 'relative', seconds: 60 });
  assert.equal(reminder.data.task, 'CI reminder');
  const reminders = await request('/api/tools/reminder', { action: 'list' });
  assert.ok(reminders.data.some(x => x.task === 'CI reminder'));

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

  console.log('JARVIS web feature smoke tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
