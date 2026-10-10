const { $, $$, h, esc, busy, toast, download, store } = Kit;

let lang = store.get('lens.lang', 'es');
let vocab, library, events, doc = null, selWord = null;
const key = (w) => wordKey(w, lang);
const stateOf = (w) => vocab[key(w)]?.state || 'new';
const saveV = () => store.set('lens.vocab.' + lang, vocab);
const saveLib = () => store.set('lens.lib.' + lang, library);
const logEvent = (type, word) => { events.push({ t: Date.now(), type, word }); events = events.slice(-3000); store.set('lens.events.' + lang, events); };
const uid = () => Math.random().toString(36).slice(2, 9);

function loadLanguage() {
  vocab = store.get('lens.vocab.' + lang, {});
  events = store.get('lens.events.' + lang, []);
  library = store.get('lens.lib.' + lang, null);
  if (!library) {
    const old = store.get('lens.doc.' + lang, null);
    library = [];
    if (old) library.push({ id: uid(), title: old.title || 'My text', text: old.text, added: Date.now() });
    else if (DEMO_STORY[lang]) library.push({ id: uid(), title: DEMO_STORY[lang].title, text: DEMO_STORY[lang].text, added: Date.now(), sample: true });
    saveLib();
  }
  const cur = library.find((x) => x.id === store.get('lens.cur.' + lang)) || library[0];
  if (cur) openText(cur, false); else { doc = null; render(); }
}

/* ================= reader ================= */
function openText(entry, go = true) {
  doc = { id: entry.id, title: entry.title, text: entry.text, paras: tokenize(entry.text, lang) };
  entry.lastRead = Date.now();
  store.set('lens.cur.' + lang, entry.id);
  saveLib();
  $('#quiz').innerHTML = '';
  render();
  if (go) Router.go('read');
}
function render() {
  $('#lang').value = lang;
  const box = $('#text');
  box.lang = lang;
  box.innerHTML = '';
  if (!doc) { box.innerHTML = '<div class="empty">Generate a story or paste a text.</div>'; $('#title').textContent = ''; stats(); return; }
  $('#title').textContent = doc.title || '';
  doc.paras.forEach((para) => {
    const p = h('p');
    para.forEach((s) => {
      s.tokens.forEach((tok) => {
        if (!tok.w) { p.append(tok.t); return; }
        const span = h('span', { class: 'w ' + stateOf(tok.t), 'data-w': key(tok.t), tabindex: 0, role: 'button' }, tok.t);
        span.onclick = () => lookup(tok.t, s.text);
        span.onkeydown = (e) => { if (e.key === 'Enter') lookup(tok.t, s.text); };
        p.append(span);
      });
      const tr = h('span', { class: 'sent-btn', title: 'Translate sentence', role: 'button', tabindex: 0 }, '¶');
      tr.onclick = () => translateSentence(s, tr);
      p.append(tr, ' ');
    });
    box.append(p);
  });
  const d = difficulty(doc.paras, lang);
  $('#level').textContent = `~${d.level}`;
  $('#level').title = `${d.avgSentence} words per sentence`;
  stats();
}
function refreshColors() {
  $$('#text .w').forEach((sp) => { sp.className = 'w ' + (vocab[sp.dataset.w]?.state || 'new') + (sp.dataset.w === selWord ? ' sel' : ''); });
  stats();
}
function stats() {
  const all = Object.values(vocab);
  if (doc) {
    const c = comprehension(docWords(doc.paras, lang), vocab);
    $('#comp').textContent = `${c.pct}% understood · ${c.unknownUnique} new`;
  } else $('#comp').textContent = '';
  $('#vstats').innerHTML = [['Known', all.filter((v) => v.state === 'known').length], ['Learning', all.filter((v) => v.state === 'learning').length], ['Due', dueWords(vocab, Date.now()).length]].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  const L = $('#learningList');
  L.innerHTML = '';
  Object.entries(vocab).filter(([, v]) => v.state === 'learning').sort((a, b) => (b[1].added || 0) - (a[1].added || 0)).slice(0, 40).forEach(([w, v]) => L.append(h('div', {}, h('b', {}, w), h('span', { class: 'muted' }, v.gloss?.translation || ''))));
}
async function lookup(word, sentence) {
  selWord = key(word);
  const g = $('#gloss');
  const entry = vocab[selWord] || (vocab[selWord] = { state: 'new', seen: 0, added: Date.now() });
  entry.seen = (entry.seen || 0) + 1;
  if (!entry.ctx) entry.ctx = sentence.trim();
  if (entry.state === 'new') entry.state = 'learning';
  logEvent('lookup', selWord);
  saveV(); refreshColors();
  if (!entry.gloss) {
    g.innerHTML = `<h2>${esc(word)}</h2><div class="row" style="margin-top:8px"><span class="spinner"></span> looking up…</div>`;
    try {
      entry.gloss = await AI.chat([
        { role: 'system', content: `You are a concise ${LANGS[lang]}→English dictionary for learners. Use the sentence to pick the right sense. Return JSON {"lemma":"dictionary form","pos":"part of speech","translation":"best English translation in this context","gender":"m/f/n or empty","example":"a short new example sentence in ${LANGS[lang]}","example_translation":"","note":"one short usage/grammar note (conjugation, false friend, etc.) or empty"}.` },
        { role: 'user', content: `Word: "${word}"\nSentence: "${sentence}"` },
      ], { json: true, temperature: 0, demo: () => demoGloss(word) });
      saveV();
    } catch (e) { g.innerHTML = `<h2>${esc(word)}</h2><p class="muted">${esc(e.message)}</p>`; return; }
  }
  showGloss(word, entry);
}
function setState(w, entry, s) {
  if (s === 'known' && entry.state !== 'known') logEvent('known', w);
  entry.state = s;
  saveV(); refreshColors();
}
function showGloss(word, entry) {
  const x = entry.gloss || {}, g = $('#gloss');
  g.innerHTML = '';
  [
    h('div', { class: 'row between' }, h('h2', {}, word), h('button', { class: 'btn sm ghost', title: 'Pronounce', onclick: () => speak(word) }, 'Listen')),
    h('div', { class: 'small muted' }, [x.lemma && x.lemma !== key(word) ? `from ${x.lemma}` : '', x.pos, x.gender].filter(Boolean).join(' · ')),
    h('div', { class: 'tr' }, x.translation || ''),
    x.example ? h('div', { class: 'ex' }, x.example, h('div', { style: 'font-style:normal' }, x.example_translation || '')) : null,
    x.note ? h('p', { class: 'small', style: 'margin-top:8px' }, x.note) : null,
    h('div', { class: 'state-btns' }, ['new', 'learning', 'known'].map((s) => h('button', { class: 'btn sm' + (entry.state === s ? ' on' : ''), onclick: () => { setState(key(word), entry, s); showGloss(word, entry); } }, s))),
    h('div', { class: 'small muted', style: 'margin-top:8px' }, `looked up ${entry.seen}×${entry.srs ? ` · next review in ${Math.max(0, Math.round((entry.srs.due - Date.now()) / DAY_MS))} d` : ''}`),
  ].filter(Boolean).forEach((el) => g.append(el));
}
async function translateSentence(s, btn) {
  if (btn.nextSibling?.classList?.contains('sent-tr')) { btn.nextSibling.remove(); return; }
  const tr = await AI.chat([
    { role: 'system', content: `Translate this ${LANGS[lang]} sentence into natural English. Output only the translation.` },
    { role: 'user', content: s.text },
  ], { temperature: 0, demo: DEMO_SENT[s.text.trim()] || '(Sentence translation needs a model provider; see Settings.)' });
  btn.after(h('span', { class: 'sent-tr' }, tr));
}
function speak(text) {
  if (!('speechSynthesis' in window)) return toast('Text-to-speech is not supported in this browser', 'err');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const v = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith(lang));
  if (v) u.voice = v;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}
$('#speakAll').onclick = () => { if (speechSynthesis.speaking) return speechSynthesis.cancel(); if (doc) speak(doc.paras.flat().map((s) => s.text).join(' ')); };

function addText(title, text, sample) {
  const entry = { id: uid(), title: title || 'Untitled', text, added: Date.now(), sample: !!sample };
  library.unshift(entry);
  saveLib();
  openText(entry, false);
  return entry;
}
async function genStory() {
  const out = await AI.chat([
    { role: 'system', content: `You write graded readers for language learners. Write an engaging ${LANGS[lang]} story at CEFR ${$('#cefr').value} (use vocabulary and grammar appropriate to that level; A1-A2: present tense, short sentences, high-frequency words). 150-220 words, 2-4 paragraphs separated by blank lines, with a little dialogue. Return JSON {"title":"","text":""}.` },
    { role: 'user', content: 'Topic: ' + ($('#topic').value || 'daily life') },
  ], { json: true, temperature: 0.9, demo: DEMO_STORY[lang] || DEMO_STORY.es });
  addText(out.title, out.text);
}
async function quiz() {
  if (!doc) return;
  const out = await AI.chat([
    { role: 'system', content: 'Create 4 multiple-choice comprehension questions about the text, written in simple English, testing gist, details and one inference. Return JSON {"questions":[{"q":"","options":["","","",""],"answer":0,"explain":"short"}]}.' },
    { role: 'user', content: doc.text },
  ], { json: true, temperature: 0.4, demo: DEMO_QUIZ });
  const box = $('#quiz');
  box.innerHTML = '';
  let score = 0, answered = 0;
  const total = (out.questions || []).length, sc = h('div', { class: 'small muted', style: 'margin-top:12px' });
  (out.questions || []).forEach((q, qi) => {
    const exp = h('div', { class: 'small muted', style: 'margin-top:4px' });
    const opts = h('div', { class: 'opts' }, q.options.map((o, i) => h('button', { class: 'btn', onclick: (e) => {
      const wrap = e.currentTarget.parentElement;
      if (wrap.dataset.done) return;
      wrap.dataset.done = 1;
      const ok = i === +q.answer;
      e.currentTarget.classList.add(ok ? 'right' : 'wrong');
      wrap.children[+q.answer].classList.add('right');
      exp.textContent = (ok ? 'Correct. ' : 'Not quite. ') + (q.explain || '');
      score += ok; answered++;
      sc.textContent = `Score: ${score}/${answered}${answered === total ? ' · finished' : ''}`;
    } }, o)));
    box.append(h('div', { class: 'q' }, h('b', {}, `${qi + 1}. ${q.q}`), opts, exp));
  });
  box.append(sc);
}
Object.entries(LANGS).forEach(([k, v]) => $('#lang').append(h('option', { value: k }, v)));
$('#lang').onchange = () => { lang = $('#lang').value; store.set('lens.lang', lang); loadLanguage(); $('#gloss').innerHTML = '<div class="empty">Tap any word.</div>'; };
$('#gen').onclick = (e) => busy(e.currentTarget, genStory);
$('#pasteBtn').onclick = () => { $('#paste').classList.toggle('hidden'); $('#pasteRow').classList.toggle('hidden'); };
$('#load').onclick = () => { const t = $('#paste').value.trim(); if (t) { addText(t.split('\n')[0].slice(0, 50), t); $('#paste').value = ''; $('#pasteBtn').click(); } };
$('#quizBtn').onclick = (e) => busy(e.currentTarget, quiz);
$('#markAll').onclick = () => {
  if (!doc) return;
  let n = 0;
  docWords(doc.paras, lang).forEach((k) => { if (!vocab[k] || vocab[k].state === 'new') { vocab[k] = Object.assign({}, vocab[k] || { seen: 0, added: Date.now() }, { state: 'known' }); logEvent('known', k); n++; } });
  saveV(); refreshColors(); toast(`Marked ${n} word${n === 1 ? '' : 's'} as known`);
};
$('#exportV').onclick = () => download(`vocab-${lang}.csv`, vocabToCSV(vocab), 'text/csv');

/* ================= review ================= */
let queue = [], qi = 0, sessionStats = { done: 0, right: 0 };
function renderReviewSummary() {
  const due = dueWords(vocab, Date.now()).length, learning = Object.values(vocab).filter((v) => v.state === 'learning').length;
  $('#revSummary').textContent = learning ? `${due} due now · ${learning} learning in ${LANGS[lang]}` : 'Look words up while reading to add them here.';
}
function startReview() {
  queue = dueWords(vocab, Date.now()).slice(0, 25);
  qi = 0; sessionStats = { done: 0, right: 0 };
  if (!queue.length) {
    const next = Object.values(vocab).filter((v) => v.state === 'learning' && v.srs).map((v) => v.srs.due).sort((a, b) => a - b)[0];
    $('#revCard').innerHTML = `<div class="card empty">Nothing due${next ? `. Next review ${new Date(next).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}.</div>`;
    return;
  }
  showCard();
}
function grade(w, g) {
  const v = vocab[w];
  v.srs = scheduleReview(v.srs, g, Date.now());
  logEvent('review', w);
  if (graduated(v.srs)) { v.state = 'known'; logEvent('known', w); toast(`“${w}” is now known`); }
  sessionStats.done++; if (g >= 2) sessionStats.right++;
  if (g === 0) queue.push(w);
  saveV();
  qi++;
  showCard();
}
function showCard() {
  const box = $('#revCard');
  box.innerHTML = '';
  renderReviewSummary();
  if (qi >= queue.length) {
    box.append(h('div', { class: 'card flash' }, h('div', { class: 'word' }, 'Done'), h('p', { class: 'muted' }, `${sessionStats.done} reviews, ${sessionStats.done ? Math.round((100 * sessionStats.right) / sessionStats.done) : 0}% remembered.`), h('button', { class: 'btn primary', onclick: startReview }, 'Review again')));
    stats();
    return;
  }
  const w = queue[qi], v = vocab[w], g = v.gloss || {};
  const prog = h('div', { class: 'small muted' }, `${qi + 1} / ${queue.length}`);
  const buttons = () => h('div', { class: 'grades' }, [['Again', 0, '<10 min'], ['Hard', 1, ''], ['Good', 2, ''], ['Easy', 3, '']].map(([label, n, hint]) => {
    const next = scheduleReview(v.srs, n, Date.now());
    return h('button', { class: 'btn' + (n === 2 ? ' primary' : ''), onclick: () => grade(w, n) }, label, h('small', {}, hint || `${next.interval} d`));
  }));
  if ($('#revMode').value === 'cloze' && v.ctx && makeCloze(v.ctx, w, lang)) {
    const c = makeCloze(v.ctx, w, lang);
    const input = h('input', { class: 'input', 'aria-label': 'Missing word', autocomplete: 'off', onkeydown: (e) => e.key === 'Enter' && submit() });
    const out = h('div');
    const submit = () => {
      if (input.disabled) return;
      input.disabled = true;
      const r = gradeAnswer(input.value, w, lang);
      const map = { exact: 2, accent: 2, close: 1, wrong: 0 };
      out.append(h('div', { class: 'ans', style: `color:var(--${r === 'wrong' ? 'bad' : r === 'close' ? 'warn' : 'good'})` }, { exact: 'Correct', accent: 'Correct (check the accents)', close: 'Almost', wrong: 'Not quite' }[r] + ': ' + w),
        h('div', { class: 'row', style: 'justify-content:center;margin-top:14px' }, h('button', { class: 'btn primary', onclick: () => grade(w, map[r]) }, 'Continue')));
    };
    box.append(h('div', { class: 'card flash' }, prog, h('div', { class: 'ctx', style: 'color:var(--text);font-size:22px' }, c.text), h('div', { class: 'muted', style: 'margin-top:8px' }, g.translation ? `(${g.translation})` : ''), input, h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn', onclick: submit }, 'Check')), out));
    input.focus();
    return;
  }
  const reveal = h('div');
  box.append(h('div', { class: 'card flash' }, prog, h('div', { class: 'word' }, w), v.ctx ? h('div', { class: 'ctx' }, v.ctx) : null,
    reveal, h('div', { style: 'margin-top:18px' }, h('button', { class: 'btn primary', id: 'showAns', onclick: (e) => { e.currentTarget.remove(); reveal.append(h('div', { class: 'ans' }, g.translation || '(no translation saved)'), g.note ? h('div', { class: 'small muted' }, g.note) : '', buttons()); } }, 'Show answer'))));
}
$('#revStart').onclick = startReview;
document.addEventListener('keydown', (e) => {
  if (Router.current !== 'review' || /input|textarea|select/i.test(e.target.tagName)) return;
  if (e.code === 'Space' && $('#showAns')) { e.preventDefault(); $('#showAns').click(); }
  const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
  if (n != null) { const b = $$('#revCard .grades .btn')[n]; if (b) b.click(); }
});

/* ================= library ================= */
function renderLibrary() {
  $('#libSummary').textContent = `${library.length} text${library.length === 1 ? '' : 's'} in ${LANGS[lang]}`;
  const box = $('#libList');
  box.innerHTML = '';
  if (!library.length) box.append(h('div', { class: 'empty' }, 'Generate a story or paste a text on the Read page.'));
  library.forEach((x) => {
    const paras = tokenize(x.text, lang), words = docWords(paras, lang), c = comprehension(words, vocab), d = difficulty(paras, lang);
    box.append(h('div', { class: 'card lib-card' + (doc && doc.id === x.id ? ' cur' : '') },
      h('div', { class: 'row between' }, h('span', { class: 'tag' }, '~' + d.level), h('span', { class: 'small muted' }, `${words.length} words`)),
      h('h2', {}, x.title),
      h('div', { class: 'small muted' }, x.text.slice(0, 120).replace(/\s+/g, ' ') + '…'),
      h('div', { class: 'bar' }, h('span', { style: `width:${c.pct}%` })),
      h('div', { class: 'small' }, `${c.pct}% understood · ${c.unknownUnique} new words`),
      h('div', { class: 'row' }, h('button', { class: 'btn sm primary', onclick: () => openText(x) }, 'Read'),
        h('button', { class: 'btn sm ghost', onclick: () => { const t = prompt('Title', x.title); if (t) { x.title = t; saveLib(); renderLibrary(); if (doc?.id === x.id) { doc.title = t; render(); } } } }, 'Rename'),
        h('button', { class: 'btn sm ghost danger', onclick: () => { if (!confirm(`Delete "${x.title}"?`)) return; library = library.filter((y) => y !== x); saveLib(); if (doc?.id === x.id) { doc = null; if (library[0]) openText(library[0], false); else render(); } renderLibrary(); } }, 'Delete'))));
  });
}
$('#libFile').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  addText(f.name.replace(/\.txt$/i, ''), (await f.text()).trim());
  e.target.value = '';
  renderLibrary();
  toast('Imported ' + f.name);
};

/* ================= vocabulary ================= */
function renderVocab() {
  const q = $('#vSearch').value.trim().toLowerCase(), st = $('#vState').value, due = new Set(dueWords(vocab, Date.now()));
  const rows = Object.entries(vocab).filter(([w, v]) => v.state !== 'new' && (!st || (st === 'due' ? due.has(w) : v.state === st)) && (!q || w.includes(q) || (v.gloss?.translation || '').toLowerCase().includes(q)))
    .sort((a, b) => a[0].localeCompare(b[0], lang));
  const t = $('#vTable');
  t.innerHTML = '';
  t.append(h('tr', {}, ['Word', 'Translation', 'State', 'Next review', 'Context', ''].map((x) => h('th', {}, x))));
  if (!rows.length) t.append(h('tr', {}, h('td', { colspan: 6, class: 'muted' }, 'No words yet.')));
  rows.slice(0, 500).forEach(([w, v]) => t.append(h('tr', {},
    h('td', {}, h('b', {}, w)),
    h('td', {}, h('input', { class: 'input', value: v.gloss?.translation || '', 'aria-label': 'Translation for ' + w, style: 'padding:4px 6px', onchange: (e) => { v.gloss = Object.assign({}, v.gloss || { lemma: w }, { translation: e.target.value }); saveV(); } })),
    h('td', {}, h('select', { style: 'width:auto;padding:3px 6px', 'aria-label': 'State', onchange: (e) => { setState(w, v, e.target.value); renderVocab(); } }, ['learning', 'known', 'new'].map((s) => h('option', { value: s, selected: v.state === s }, s)))),
    h('td', { class: 'small muted' }, v.state === 'learning' ? (v.srs ? (due.has(w) ? 'due' : new Date(v.srs.due).toLocaleDateString()) : 'due') : '—'),
    h('td', { class: 'small muted', style: 'max-width:340px' }, v.ctx || ''),
    h('td', {}, h('button', { class: 'btn ghost sm', 'aria-label': 'Remove ' + w, onclick: () => { delete vocab[w]; saveV(); renderVocab(); refreshColors(); } }, '×')))));
}
$('#vSearch').oninput = renderVocab;
$('#vState').onchange = renderVocab;
$('#vCsv').onclick = () => download(`vocab-${lang}.csv`, vocabToCSV(vocab), 'text/csv');
$('#vAnki').onclick = () => { download(`anki-${lang}.txt`, vocabToAnki(vocab, (v) => v.state === 'learning'), 'text/tab-separated-values'); toast('Import into Anki as "Basic", fields separated by tab, HTML allowed'); };
$('#vImport').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const r = importVocab(vocab, parseCSV(await f.text()), lang);
  vocab = r.vocab; saveV(); renderVocab(); refreshColors();
  toast(`Imported: ${r.added} new, ${r.updated} updated`);
  e.target.value = '';
};

/* ================= stats ================= */
function renderStats() {
  const now = Date.now(), all = Object.values(vocab), days = activityByDay(events, 30, now);
  $('#sKpis').innerHTML = [['Known words', all.filter((v) => v.state === 'known').length], ['Learning', all.filter((v) => v.state === 'learning').length], ['Streak', `${streakDays(events, now)} d`], ['Lookups (30 d)', days.reduce((a, d) => a + d.lookups, 0)], ['Reviews (30 d)', days.reduce((a, d) => a + d.reviews, 0)], ['Texts', library.length]]
    .map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  const W = 560, H = 170, pb = 20, max = Math.max(5, ...days.map((d) => d.lookups + d.reviews)), bw = W / days.length;
  $('#sChart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Lookups and reviews per day">${days.map((d, i) => {
    const hl = ((H - pb - 10) * d.lookups) / max, hr = ((H - pb - 10) * d.reviews) / max;
    return `<rect x="${i * bw + 2}" y="${H - pb - hl}" width="${bw - 4}" height="${hl}" fill="var(--new)"><title>${d.day}: ${d.lookups} lookups</title></rect><rect x="${i * bw + 2}" y="${H - pb - hl - hr}" width="${bw - 4}" height="${hr}" fill="var(--accent)"><title>${d.day}: ${d.reviews} reviews</title></rect>${i % 5 === 0 ? `<text x="${i * bw + bw / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="var(--muted)">${d.day.slice(5)}</text>` : ''}`;
  }).join('')}</svg><div class="row small"><span><span class="vstate new">&nbsp;</span> lookups</span><span><span class="vstate" style="background:var(--accent)">&nbsp;</span> reviews</span></div>`;
  const f = $('#sFreq');
  f.innerHTML = '';
  if (!doc) { f.append(h('div', { class: 'empty' }, 'Open a text first.')); return; }
  const top = frequencies(docWords(doc.paras, lang)).filter((x) => !vocab[x.word] || vocab[x.word].state === 'new').slice(0, 12);
  if (!top.length) f.append(h('div', { class: 'empty' }, 'You have looked at every word in this text.'));
  top.forEach((x) => f.append(h('div', { class: 'row between', style: 'padding:4px 0;border-bottom:1px solid var(--line)' }, h('b', {}, x.word), h('span', { class: 'small muted' }, `${x.n}×`))));
  f.append(h('p', { class: 'small muted', style: 'margin:8px 0 0' }, 'Learning the most frequent unknown words first raises comprehension fastest.'));
}

/* ================= boot ================= */
Router.on('review', renderReviewSummary);
Router.on('library', renderLibrary);
Router.on('vocab', renderVocab);
Router.on('stats', renderStats);
loadLanguage();

/* ================= AI command box ================= */
const langCode = (l) => { const s = String(l || '').toLowerCase(); return LANGS[s] ? s : Object.keys(LANGS).find((k) => LANGS[k].toLowerCase() === s) || null; };
const switchLang = (l) => { const k = langCode(l); if (k && k !== lang) { lang = k; store.set('lens.lang', lang); loadLanguage(); } };
Copilot.register({
  context: () => `Language: ${LANGS[lang]}. Open text: ${doc ? `"${doc.title}" (${$('#comp').textContent})` : 'none'}. Library: ${library.map((x) => x.title).join(' | ')}. Vocabulary: ${Object.values(vocab).filter((v) => v.state === 'known').length} known, ${Object.values(vocab).filter((v) => v.state === 'learning').length} learning, ${dueWords(vocab, Date.now()).length} due. Languages: ${Object.entries(LANGS).map(([k, v]) => `${k}=${v}`).join(', ')}.`,
  actions: [
    { name: 'write_story', description: 'Generate a graded reader story and open it', params: { language: 'language name or code', level: 'CEFR A1-C1', topic: 'topic' },
      run: async ({ language, level, topic }) => { switchLang(language); if (level) $('#cefr').value = String(level).toUpperCase(); if (topic) $('#topic').value = topic; Router.go('read'); await genStory(); return `Opened "${doc.title}" (${$('#comp').textContent})`; } },
    { name: 'mark_all_known', description: 'Mark every new word in the open text as known', params: {}, run: () => { $('#markAll').click(); return $('#comp').textContent; } },
    { name: 'set_word', description: 'Set words to new, learning or known', params: { words: 'comma-separated words', state: 'new | learning | known' },
      run: ({ words, state }) => { const s = ['new', 'learning', 'known'].includes(state) ? state : 'learning'; const ws = String(words).split(',').map((x) => key(x.trim())).filter(Boolean); ws.forEach((w) => setState(w, vocab[w] || (vocab[w] = { seen: 0, added: Date.now() }), s)); return `${ws.join(', ')} -> ${s}`; } },
    { name: 'look_up', description: 'Look up a word from the open text in context', params: { word: 'word' }, run: async ({ word }) => { Router.go('read'); const s = doc?.paras.flat().find((x) => x.tokens.some((t) => t.w && key(t.t) === key(word))); await lookup(word, s ? s.text : word); return `${word}: ${vocab[key(word)]?.gloss?.translation || ''}`; } },
    { name: 'start_review', description: 'Start reviewing due words', params: { mode: [...$('#revMode').options].map((o) => o.value).join(' | ') }, run: ({ mode }) => { Router.go('review'); if (mode && [...$('#revMode').options].some((o) => o.value === mode)) $('#revMode').value = mode; startReview(); return queue.length ? `Reviewing ${queue.length} words` : 'Nothing is due right now'; } },
    { name: 'comprehension_quiz', description: 'Make a comprehension quiz for the open text', params: {}, run: async () => { Router.go('read'); await quiz(); return 'Quiz ready under the text'; } },
    { name: 'open_text', description: 'Open a text from the library', params: { title: 'title' }, run: ({ title }) => { const x = library.find((t) => t.title.toLowerCase().includes(String(title).toLowerCase())); if (!x) throw new Error('No text ' + title); openText(x); return `Opened ${x.title}`; } },
    { name: 'vocab_stats', query: true, description: 'Look up vocabulary counts, due words, streak and the most frequent unknown words in the open text', params: {},
      run: () => JSON.stringify({ language: LANGS[lang], known: Object.values(vocab).filter((v) => v.state === 'known').length, learning: Object.entries(vocab).filter(([, v]) => v.state === 'learning').map(([w, v]) => `${w}=${v.gloss?.translation || '?'}`).slice(0, 60), due: dueWords(vocab, Date.now()).length, streak: streakDays(events, Date.now()), openText: doc ? { title: doc.title, comprehension: $('#comp').textContent, topUnknown: frequencies(docWords(doc.paras, lang)).filter((x) => !vocab[x.word] || vocab[x.word].state === 'new').slice(0, 12).map((x) => x.word) } : null }) },
  ],
});
