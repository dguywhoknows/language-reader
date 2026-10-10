/* Sample stories, sentence translations, a small dictionary and a quiz used without a model provider. */
var DEMO_STORY = {
  es: { title: 'Una mañana en el mercado', text: `Lucía se despierta temprano. Hoy es sábado y quiere ir al mercado con su abuelo. El mercado está cerca de su casa, en la plaza del pueblo.\n\n—¿Qué necesitamos, abuelo? —pregunta Lucía.\n—Tomates, pan y un poco de queso —responde él con una sonrisa.\n\nEn el mercado hay mucha gente. Las frutas tienen colores brillantes y el pan huele muy bien. Lucía compra tomates rojos y el abuelo habla con la señora del queso. Ella les regala una naranja dulce.\n\nDespués, los dos se sientan en un banco y comen la naranja. Lucía piensa que los sábados son sus días favoritos.` },
  fr: { title: 'Le petit café', text: `Chaque matin, Paul va au petit café du coin. Il commande un croissant et un café crème.\n\n— Bonjour Paul ! Comme d'habitude ? demande la serveuse.\n— Oui, merci beaucoup, répond-il.\n\nIl lit le journal près de la fenêtre et regarde les gens qui passent dans la rue. Il aime ce moment calme avant le travail.` },
};
var DEMO_SENT = {
  'Lucía se despierta temprano.': 'Lucía wakes up early.',
  'Hoy es sábado y quiere ir al mercado con su abuelo.': 'Today is Saturday and she wants to go to the market with her grandfather.',
  'El mercado está cerca de su casa, en la plaza del pueblo.': "The market is near her house, in the town square.",
  'En el mercado hay mucha gente.': 'There are a lot of people at the market.',
  'Ella les regala una naranja dulce.': 'She gives them a sweet orange as a gift.',
};
var DICT = {
  se: ['se', 'pronoun', 'herself / himself (reflexive)', '', 'Ella se llama Ana.', 'Her name is Ana.', 'Reflexive verbs like despertarse use se.'], despierta: ['despertarse', 'verb', 'wakes up', '', 'Me despierto a las siete.', 'I wake up at seven.', 'Stem-changing: e → ie.'],
  temprano: ['temprano', 'adverb', 'early', '', 'Llego temprano.', 'I arrive early.', ''], hoy: ['hoy', 'adverb', 'today', '', 'Hoy hace sol.', 'Today it is sunny.', ''], sábado: ['sábado', 'noun', 'Saturday', 'm', 'El sábado voy al cine.', 'On Saturday I go to the cinema.', 'Days of the week are not capitalized in Spanish.'],
  quiere: ['querer', 'verb', 'wants', '', '¿Quieres café?', 'Do you want coffee?', 'Stem-changing: e → ie.'], mercado: ['mercado', 'noun', 'market', 'm', 'Voy al mercado.', "I'm going to the market.", ''], abuelo: ['abuelo', 'noun', 'grandfather', 'm', 'Mi abuelo es simpático.', 'My grandfather is nice.', ''],
  cerca: ['cerca', 'adverb', 'near / close', '', 'Vivo cerca.', 'I live nearby.', 'Use "cerca de" + noun.'], plaza: ['plaza', 'noun', 'square (town square)', 'f', 'La plaza es grande.', 'The square is big.', ''], pueblo: ['pueblo', 'noun', 'town / village', 'm', 'Es un pueblo pequeño.', "It's a small town.", ''],
  necesitamos: ['necesitar', 'verb', 'we need', '', 'Necesito ayuda.', 'I need help.', ''], pregunta: ['preguntar', 'verb', 'asks', '', 'Ella pregunta la hora.', 'She asks the time.', ''], pan: ['pan', 'noun', 'bread', 'm', 'Compro pan.', 'I buy bread.', ''], queso: ['queso', 'noun', 'cheese', 'm', 'Me gusta el queso.', 'I like cheese.', ''],
  responde: ['responder', 'verb', 'answers / replies', '', 'Él responde rápido.', 'He answers quickly.', ''], sonrisa: ['sonrisa', 'noun', 'smile', 'f', 'Tiene una sonrisa bonita.', 'She has a nice smile.', ''], gente: ['gente', 'noun', 'people', 'f', 'Hay mucha gente.', 'There are a lot of people.', 'Gente is singular in Spanish: "la gente es…".'],
  huele: ['oler', 'verb', 'smells', '', 'La comida huele bien.', 'The food smells good.', 'Irregular: huelo, hueles, huele.'], regala: ['regalar', 'verb', 'gives (as a gift)', '', 'Le regalo un libro.', 'I give him a book.', ''], naranja: ['naranja', 'noun', 'orange', 'f', 'La naranja es dulce.', 'The orange is sweet.', ''],
  dulce: ['dulce', 'adjective', 'sweet', '', 'El pastel es dulce.', 'The cake is sweet.', ''], banco: ['banco', 'noun', 'bench (here); also bank', 'm', 'Me siento en el banco.', 'I sit on the bench.', 'Banco means both bench and bank.'], sientan: ['sentarse', 'verb', 'sit down (they)', '', 'Nos sentamos aquí.', 'We sit here.', 'Stem-changing: e → ie.'],
  piensa: ['pensar', 'verb', 'thinks', '', 'Pienso en ti.', 'I think of you.', 'Stem-changing: e → ie.'], favoritos: ['favorito', 'adjective', 'favorite', '', 'Mi color favorito es azul.', 'My favorite color is blue.', ''],
};
function demoGloss(word) {
  var d = DICT[wordKey(word, 'es')];
  if (d) return { lemma: d[0], pos: d[1], translation: d[2], gender: d[3], example: d[4], example_translation: d[5], note: d[6] };
  return { lemma: word, pos: '', translation: '(the offline dictionary only covers the sample story; connect a model provider to look up any word)', gender: '', example: '', example_translation: '', note: '' };
}
var DEMO_QUIZ = { questions: [
  { q: 'When does the story take place?', options: ['On a Monday evening', 'On a Saturday morning', 'On a Sunday afternoon', 'During a holiday at night'], answer: 1, explain: '"Hoy es sábado" + "se despierta temprano".' },
  { q: 'Who does Lucía go to the market with?', options: ['Her mother', 'A friend', 'Her grandfather', 'Alone'], answer: 2, explain: '"con su abuelo".' },
  { q: 'Which item is NOT on their list?', options: ['Tomatoes', 'Bread', 'Cheese', 'Milk'], answer: 3, explain: 'They need tomates, pan y queso.' },
  { q: 'How does Lucía probably feel at the end?', options: ['Bored', 'Happy', 'Angry', 'Scared'], answer: 1, explain: 'Saturdays are her favorite days.' },
] };
