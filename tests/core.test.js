const NOW = new Date(2026, 9, 8, 12).getTime();

test('tokenize splits paragraphs, sentences and words', () => {
  const p = tokenize('Hola, Ana. ¿Cómo estás?\n\nTengo 3 gatos.', 'es');
  assert.eq(p.length, 2);
  assert.eq(p[0].length, 2);
  assert.deepEq(docWords(p, 'es'), ['hola', 'ana', 'cómo', 'estás', 'tengo', 'gatos']);
  assert.ok(docWords(tokenize('私は猫が好きです。', 'ja'), 'ja').length >= 3, 'Japanese is segmented into words');
});

test('comprehension weights known and learning words', () => {
  const c = comprehension(['a', 'b', 'a', 'c'], { a: { state: 'known' }, b: { state: 'learning' } });
  assert.eq(c.pct, 63); assert.eq(c.unknownUnique, 1); assert.eq(c.unique, 3);
  assert.eq(comprehension([], {}).pct, 0);
});

test('difficulty separates simple and dense text', () => {
  assert.eq(difficulty(tokenize('Yo como. Tú bebes. Él lee.', 'es'), 'es').level, 'A1');
  const dense = 'La implementación sistemática de infraestructuras interdisciplinarias contemporáneas requiere necesariamente consideraciones metodológicas extraordinariamente complejas y particularmente específicas para comunidades internacionales.';
  assert.eq(difficulty(tokenize(dense, 'es'), 'es').level, 'C1');
  assert.deepEq(frequencies(['b', 'a', 'b']), [{ word: 'b', n: 2 }, { word: 'a', n: 1 }]);
});

test('scheduleReview grows intervals and resets on a lapse', () => {
  let s = scheduleReview(null, 2, NOW);
  assert.deepEq([s.reps, s.interval], [1, 1]);
  s = scheduleReview(s, 2, NOW); assert.eq(s.interval, 6);
  s = scheduleReview(s, 2, NOW); assert.eq(s.interval, 15);
  const lapse = scheduleReview(s, 0, NOW);
  assert.deepEq([lapse.reps, lapse.interval, lapse.ease], [0, 0, 2.3]);
  assert.eq(lapse.due, NOW + 10 * 60 * 1000);
  const easy = scheduleReview(null, 3, NOW);
  assert.deepEq([easy.interval, easy.ease], [3, 2.65]);
  assert.ok(graduated({ interval: 21 })); assert.ok(!graduated({ interval: 20 }));
});

test('dueWords lists learning words whose review is due, oldest first', () => {
  const v = { a: { state: 'learning' }, b: { state: 'learning', srs: { due: NOW + 1000 } }, c: { state: 'known' }, d: { state: 'learning', srs: { due: NOW - 5 } } };
  assert.deepEq(dueWords(v, NOW), ['a', 'd']);
});

test('makeCloze blanks the first matching word', () => {
  assert.eq(makeCloze('Hoy es sábado y quiere ir.', 'sábado', 'es').text, 'Hoy es ____ y quiere ir.');
  assert.eq(makeCloze('Hoy es sábado.', 'hoy', 'es').text, '____ es sábado.');
  assert.eq(makeCloze('Hoy es sábado.', 'mercado', 'es'), null);
});

test('gradeAnswer tolerates accents, case, alternatives and one typo', () => {
  assert.eq(gradeAnswer('Sábado', 'sábado', 'es'), 'exact');
  assert.eq(gradeAnswer('sabado', 'sábado', 'es'), 'accent');
  assert.eq(gradeAnswer('sabaso', 'sábado', 'es'), 'close');
  assert.eq(gradeAnswer('bank', 'bench / bank'), 'exact');
  assert.eq(gradeAnswer('xyz', 'sábado'), 'wrong');
  assert.eq(gradeAnswer('  ', 'sábado'), 'wrong');
});

test('vocabulary exports to CSV and Anki', () => {
  const v = { banco: { state: 'learning', gloss: { lemma: 'banco', translation: 'bench', note: 'also bank' }, ctx: 'Me siento en el banco.' } };
  assert.eq(vocabToCSV(v), 'word,state,lemma,translation,context\n"banco","learning","banco","bench","Me siento en el banco."');
  assert.eq(vocabToAnki(v), 'banco<br><i>Me siento en el <b>banco</b>.</i>\tbench<br>also bank');
  assert.eq(vocabToAnki(v, (x) => x.state === 'known'), '');
});

test('parseCSV handles quotes, embedded commas, newlines and tabs', () => {
  assert.deepEq(parseCSV('a,"b, c","d ""q"""\n"x\ny",z\n'), [['a', 'b, c', 'd "q"'], ['x\ny', 'z']]);
  assert.deepEq(parseCSV('casa\thouse\r\nperro\tdog'), [['casa', 'house'], ['perro', 'dog']]);
});

test('importVocab merges without downgrading known words', () => {
  const r = importVocab({ casa: { state: 'known', seen: 3 } }, [['word', 'state', 'lemma', 'translation'], ['casa', 'learning', 'casa', 'house'], ['perro', 'learning', 'perro', 'dog']], 'es');
  assert.eq(r.added, 1); assert.eq(r.updated, 1);
  assert.eq(r.vocab.casa.state, 'known'); assert.eq(r.vocab.casa.gloss.translation, 'house');
  assert.eq(r.vocab.perro.gloss.translation, 'dog');
  const two = importVocab({}, [['Gato', 'cat']], 'es');
  assert.eq(two.vocab.gato.state, 'learning'); assert.eq(two.vocab.gato.gloss.translation, 'cat');
});

test('activityByDay and streakDays', () => {
  const ev = [0, 1, 2, 4].map((d) => ({ t: NOW - d * DAY_MS, type: d === 1 ? 'review' : 'lookup' }));
  assert.eq(streakDays(ev, NOW), 3);
  assert.eq(streakDays(ev, NOW + DAY_MS), 3, 'today empty still counts yesterday');
  const a = activityByDay(ev, 7, NOW);
  assert.eq(a.length, 7);
  assert.deepEq([a[6].lookups, a[5].reviews, a[3].lookups], [1, 1, 0]);
});
