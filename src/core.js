/* Tokenization, comprehension estimates, spaced-repetition scheduling, cloze cards, answer grading and vocabulary import/export (pure, unit-tested). */

var LANGS = { es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ja: 'Japanese', ko: 'Korean', zh: 'Chinese' };
var DAY_MS = 864e5;

function wordKey(w, lang) { return String(w).toLocaleLowerCase(lang || undefined); }
/* Paragraphs → sentences → tokens ({t, w: isWord}). Uses Intl.Segmenter so CJK text splits into words too. */
function tokenize(text, lang) {
  var sentSeg = new Intl.Segmenter(lang, { granularity: 'sentence' }), wordSeg = new Intl.Segmenter(lang, { granularity: 'word' });
  return String(text).split(/\n\s*\n/).filter(function (p) { return p.trim(); }).map(function (p) {
    return Array.from(sentSeg.segment(p.trim())).map(function (s) {
      return { text: s.segment, tokens: Array.from(wordSeg.segment(s.segment)).map(function (t) { return { t: t.segment, w: !!t.isWordLike && !/^\d+([.,]\d+)?$/.test(t.segment) }; }) };
    });
  });
}
function docWords(paras, lang) {
  var out = [];
  paras.forEach(function (p) { p.forEach(function (s) { s.tokens.forEach(function (t) { if (t.w) out.push(wordKey(t.t, lang)); }); }); });
  return out;
}
/* Share of running words understood: known = 1, learning = 0.5. */
function comprehension(words, vocab) {
  if (!words.length) return { pct: 0, unknownUnique: 0, unique: 0 };
  var score = 0, seen = {}, unknown = 0;
  words.forEach(function (w) {
    var st = vocab[w] && vocab[w].state;
    score += st === 'known' ? 1 : st === 'learning' ? 0.5 : 0;
    if (!seen[w]) { seen[w] = 1; if (!st || st === 'new') unknown++; }
  });
  return { pct: Math.round((100 * score) / words.length), unknownUnique: unknown, unique: Object.keys(seen).length };
}
/* Rough difficulty from sentence length and lexical variety; returns a CEFR-ish label. */
function difficulty(paras, lang) {
  var sents = [].concat.apply([], paras), words = docWords(paras, lang);
  if (!sents.length || !words.length) return { avgSentence: 0, variety: 0, level: '—' };
  var avg = words.length / sents.length, uniq = {};
  words.forEach(function (w) { uniq[w] = 1; });
  var variety = Object.keys(uniq).length / words.length, long = words.filter(function (w) { return w.length >= 8; }).length / words.length;
  var avgLen = words.reduce(function (a, w) { return a + w.length; }, 0) / words.length;
  var score = avg * 0.4 + avgLen * 1.5 + long * 20;
  var level = score < 10 ? 'A1' : score < 14 ? 'A2' : score < 17 ? 'B1' : score < 20 ? 'B2' : 'C1';
  return { avgSentence: +avg.toFixed(1), variety: +variety.toFixed(2), level: level };
}
function frequencies(words) {
  var c = {};
  words.forEach(function (w) { c[w] = (c[w] || 0) + 1; });
  return Object.keys(c).map(function (w) { return { word: w, n: c[w] }; }).sort(function (a, b) { return b.n - a.n || a.word.localeCompare(b.word); });
}

/* ---------- spaced repetition (SM-2 variant) ---------- */
/* grade: 0 again, 1 hard, 2 good, 3 easy. Returns a new srs object {reps, ease, interval (days), due (ms)}. */
function scheduleReview(srs, grade, now) {
  srs = Object.assign({ reps: 0, ease: 2.5, interval: 0 }, srs || {});
  var ease = Math.max(1.3, srs.ease + [-0.2, -0.15, 0, 0.15][grade]), interval, reps;
  if (grade === 0) { reps = 0; interval = 0; }
  else {
    reps = srs.reps + 1;
    interval = reps === 1 ? (grade === 3 ? 3 : 1) : reps === 2 ? (grade === 1 ? 3 : 6) : Math.round(srs.interval * ease * (grade === 1 ? 0.6 : grade === 3 ? 1.3 : 1));
  }
  return { reps: reps, ease: +ease.toFixed(2), interval: interval, due: now + (interval ? interval * DAY_MS : 10 * 60 * 1000) };
}
function dueWords(vocab, now) {
  return Object.keys(vocab).filter(function (w) { var v = vocab[w]; return v.state === 'learning' && (!v.srs || v.srs.due <= now); })
    .sort(function (a, b) { return ((vocab[a].srs || {}).due || 0) - ((vocab[b].srs || {}).due || 0); });
}
/* A learning word becomes "known" once its interval reaches three weeks. */
function graduated(srs) { return !!srs && srs.interval >= 21; }

/* ---------- cloze + grading ---------- */
function makeCloze(sentence, word, lang) {
  var k = wordKey(word, lang), segs = Array.from(new Intl.Segmenter(lang, { granularity: 'word' }).segment(sentence)), hit = false;
  var text = segs.map(function (s) { if (!hit && s.isWordLike && wordKey(s.segment, lang) === k) { hit = true; return '____'; } return s.segment; }).join('');
  return hit ? { text: text, answer: word } : null;
}
function stripAccents(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function editDistance(a, b) {
  var d = [];
  for (var i = 0; i <= a.length; i++) { d[i] = [i]; for (var j = 1; j <= b.length; j++) d[i][j] = i ? 0 : j; }
  for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/* exact | accent (right apart from diacritics) | close (one typo) | wrong */
function gradeAnswer(input, expected, lang) {
  var a = wordKey(String(input).trim(), lang), b = wordKey(String(expected).trim(), lang);
  if (!a) return 'wrong';
  if (a === b) return 'exact';
  if (stripAccents(a) === stripAccents(b)) return 'accent';
  var alts = b.split(/\s*[\/;,]\s*/);
  if (alts.length > 1 && alts.some(function (x) { return x === a || stripAccents(x) === stripAccents(a); })) return 'exact';
  return b.length > 3 && editDistance(stripAccents(a), stripAccents(b)) <= 1 ? 'close' : 'wrong';
}

/* ---------- import / export ---------- */
function csvCell(x) { return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; }
function vocabToCSV(vocab) {
  return 'word,state,lemma,translation,context\n' + Object.keys(vocab).sort().map(function (w) { var v = vocab[w], g = v.gloss || {}; return [w, v.state, g.lemma || '', g.translation || '', v.ctx || ''].map(csvCell).join(','); }).join('\n');
}
/* Anki-importable TSV: front = word (with context sentence, the word in bold), back = translation and note. */
function vocabToAnki(vocab, filter) {
  return Object.keys(vocab).filter(function (w) { return !filter || filter(vocab[w]); }).sort().map(function (w) {
    var v = vocab[w], g = v.gloss || {}, clean = function (s) { return String(s || '').replace(/[\t\n]/g, ' '); };
    var front = clean(w) + (v.ctx ? '<br><i>' + clean(v.ctx).replace(new RegExp('(^|[^\\p{L}])(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?=[^\\p{L}]|$)', 'iu'), '$1<b>$2</b>') + '</i>' : '');
    return front + '\t' + clean(g.translation) + (g.note ? '<br>' + clean(g.note) : '');
  }).join('\n');
}
function parseCSV(text) {
  var rows = [], row = [], cell = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (x) { return x.trim(); }); });
}
/* Merge imported rows (word, state?, lemma?, translation?) into a vocabulary. Never downgrades a word you already know. */
function importVocab(vocab, rows, lang) {
  var order = { new: 0, learning: 1, known: 2 }, added = 0, updated = 0, out = Object.assign({}, vocab);
  var start = rows.length && /^word$/i.test((rows[0][0] || '').trim()) ? 1 : 0;
  rows.slice(start).forEach(function (r) {
    var w = wordKey((r[0] || '').trim(), lang);
    if (!w) return;
    var st = /^(new|learning|known)$/.test((r[1] || '').trim()) ? r[1].trim() : 'learning';
    var tr = r.length === 2 ? r[1] : r[3] || '';
    var cur = out[w];
    if (!cur) { out[w] = { state: st, seen: 0, gloss: tr || r[2] ? { lemma: r[2] || w, translation: tr } : undefined, added: 0 }; added++; return; }
    var next = Object.assign({}, cur);
    if (order[st] > order[cur.state || 'new']) next.state = st;
    if (tr && !(cur.gloss && cur.gloss.translation)) next.gloss = Object.assign({}, cur.gloss || {}, { translation: tr });
    if (JSON.stringify(next) !== JSON.stringify(cur)) { out[w] = next; updated++; }
  });
  return { vocab: out, added: added, updated: updated };
}

/* ---------- activity ---------- */
function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function activityByDay(events, days, now) {
  var out = [];
  for (var i = days - 1; i >= 0; i--) {
    var k = dayKey(now - i * DAY_MS);
    out.push({ day: k, lookups: 0, reviews: 0, known: 0 });
  }
  var idx = {}; out.forEach(function (o, i) { idx[o.day] = i; });
  events.forEach(function (e) { var i = idx[dayKey(e.t)]; if (i == null) return; if (e.type === 'lookup') out[i].lookups++; else if (e.type === 'review') out[i].reviews++; else if (e.type === 'known') out[i].known++; });
  return out;
}
function streakDays(events, now) {
  var days = {}; events.forEach(function (e) { days[dayKey(e.t)] = 1; });
  var n = 0, t = days[dayKey(now)] ? now : now - DAY_MS;
  while (days[dayKey(t)]) { n++; t -= DAY_MS; }
  return n;
}
