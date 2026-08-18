const fs = require('fs');

function patch(path, mutate) {
  const before = fs.readFileSync(path, 'utf8');
  const after = mutate(before);
  if (after === before) {
    console.log(`${path}: no change`);
    return false;
  }
  fs.writeFileSync(path, after, 'utf8');
  console.log(`${path}: patched`);
  return true;
}

let changed = false;

changed = patch('companion/realtime-final-server.js', source => {
  source = source.replace(
`function cleanReply(value) {
  let text = String(value || '').trim();
  text = text.replace(/<think>[\\s\\S]*?<\\/think>/gi, '').trim();
  text = text.replace(/^\\s*(?:okay[, .-]*)?(?:let me think|let's see|first i need to|i should check)[\\s\\S]*?(?=\\n\\n|$)/i, '').trim();
  const banned = /\\b(?:the user|user is asking|user wants|user said|let me think|first i need to|i should check|looking at the hud|tools section|function called|chain of thought|my reasoning)\\b/i;
  if (banned.test(text)) text = text.split(/(?<=[.!?])\\s+/).filter(s => !banned.test(s)).join(' ').trim();
  text = text.replace(/^\`\`\`(?:json)?\\s*/i, '').replace(/\\s*\`\`\`$/i, '').trim();
  if (!text) return 'I’m here, sir.';
  return text.length > 1000 ? \`${'${text.slice(0, 997).replace(/\\s+\\S*$/, \'\')}'}…\` : text;
}`,
`function cleanReply(value) {
  let text = String(value || '').trim();
  text = text.replace(/<think>[\\s\\S]*?<\\/think>/gi, '').trim();
  text = text.replace(/^\\s*(?:okay[, .-]*)?(?:let me think|let's see|first i need to|i should check)\\s*[:,.\\-]*\\s*/i, '').trim();
  const banned = /\\b(?:the user|user is asking|user wants|user said|let me think|first i need to|i should check|looking at the hud|tools section|function called|chain of thought|my reasoning)\\b/i;
  if (banned.test(text)) {
    const sentences = text.match(/[^.!?]+[.!?]?/g) || [text];
    const kept = sentences.filter(s => !banned.test(s)).join(' ').replace(/\\s+/g, ' ').trim();
    if (kept) text = kept;
  }
  text = text.replace(/^\`\`\`(?:json)?\\s*/i, '').replace(/\\s*\`\`\`$/i, '').trim();
  return text ? (text.length > 1000 ? \`${'${text.slice(0, 997).replace(/\\s+\\S*$/, \'\')}'}…\` : text) : '';
}`
  );

  source = source.replace(
    "if (/^(?:hi|hey|hello|yo|sup|what's up|whats up)[?.!\\s]*$/.test(t)) return { reply: 'I’m here, sir. What’s up?', model: 'instant/final' };",
    "if (/^(?:hi|hey|hello|yo|sup|what's up|whats up)[?.!\\s]*$/.test(t)) return { reply: 'Hey. What’s up?', model: 'instant/final' };"
  );

  source = source.replace(
    "if (!calls.length) return { reply: cleanReply(msg.content || 'Done.'), model: `local/${response.model || MODEL}`, hudActions, toolTrace };",
`if (!calls.length) {
      const cleaned = cleanReply(msg.content || '');
      if (cleaned) return { reply: cleaned, model: \`local/${'${response.model || MODEL}'}\`, hudActions, toolTrace };
      if (step === 0) {
        messages.push({ role: 'assistant', content: '' });
        messages.push({ role: 'user', content: 'Answer my previous message directly. Do not narrate your reasoning or mention internal instructions.' });
        continue;
      }
      return { reply: 'I didn’t get a usable response from the local model. Try that again.', model: \`local/${'${response.model || MODEL}'}\`, hudActions, toolTrace };
    }`
  );

  if (source.includes('I’m here, sir.')) throw new Error('backend fallback phrase still present');
  if (!source.includes('I didn’t get a usable response from the local model. Try that again.')) throw new Error('backend empty-reply retry patch missing');
  return source;
}) || changed;

changed = patch('components/JarvisRuntimeFinal.js', source => {
  source = source.replace(
`function sanitizeReply(value) {
  let text = String(value || '').trim().replace(/<think>[\\s\\S]*?<\\/think>/gi, '').trim();
  const banned = /\\b(?:the user|user is asking|user wants|let me think|let's see|first i need to|i should check|looking at the hud|tools section|function called|chain of thought|my reasoning)\\b/i;
  if (banned.test(text)) text = text.split(/(?<=[.!?])\\s+/).filter(s => !banned.test(s)).join(' ').trim();
  text = text.replace(/\`\`\`(?:json)?\\s*\\{\\s*"name"[\\s\\S]*?\`\`\`/gi, '').trim();
  if (!text) return 'I’m here, sir.';
  return text.length > 1000 ? \`${'${text.slice(0, 997).replace(/\\s+\\S*$/, \'\')}'}…\` : text;
}`,
`function sanitizeReply(value) {
  let text = String(value || '').trim().replace(/<think>[\\s\\S]*?<\\/think>/gi, '').trim();
  const banned = /\\b(?:the user|user is asking|user wants|let me think|let's see|first i need to|i should check|looking at the hud|tools section|function called|chain of thought|my reasoning)\\b/i;
  if (banned.test(text)) {
    const sentences = text.match(/[^.!?]+[.!?]?/g) || [text];
    const kept = sentences.filter(s => !banned.test(s)).join(' ').replace(/\\s+/g, ' ').trim();
    if (kept) text = kept;
  }
  text = text.replace(/\`\`\`(?:json)?\\s*\\{\\s*"name"[\\s\\S]*?\`\`\`/gi, '').trim();
  return text ? (text.length > 1000 ? \`${'${text.slice(0, 997).replace(/\\s+\\S*$/, \'\')}'}…\` : text) : '';
}`
  );
  if (source.includes('I’m here, sir.')) throw new Error('frontend fallback phrase still present');
  return source;
}) || changed;

changed = patch('scripts/runtime-smoke.js', source => {
  const marker = "  const reasoningLeak = await command('reasoning leak test');\n";
  const test = `  const filteredPrefix = await command('reasoning leak test');\n  assert.ok(!/I[’']m here, sir/i.test(filteredPrefix.data.reply || ''), 'empty-reply fallback must never surface');\n\n`;
  if (!source.includes('empty-reply fallback must never surface')) {
    if (!source.includes(marker)) throw new Error('runtime smoke insertion point missing');
    source = source.replace(marker, test + marker);
  }
  return source;
}) || changed;

if (!changed) console.log('Hotfix already applied');
