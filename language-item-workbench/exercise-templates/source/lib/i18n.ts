/**
 * Generic UI chrome for the speaking-family templates (buttons, status
 * lines, error messages) — not authored exercise content, so it lives here
 * rather than per-exercise. Every entry falls back to English when the
 * active language has no translation yet.
 */
type Lang = string;

function pick(dict: Record<Lang, string>, lang: Lang): string {
  return dict[lang] ?? dict.en;
}

/** Under a minute, shown as plain seconds (e.g. "45s"); a minute or more,
 *  shown as a digital-clock "m:ss" (e.g. "3:00") so long countdowns stay
 *  readable at a glance. */
function formatSeconds(lang: Lang, s: number): string {
  if (s < 60) {
    const unit = lang === 'zh' ? '秒' : 's';
    return `${s}${unit}`;
  }
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export const ui = {
  playSentence: (lang: Lang) =>
    pick({ en: '▶ Play sentence', es: '▶ Reproducir oración', zh: '▶ 播放句子' }, lang),
  playExtract: (lang: Lang) =>
    pick({ en: '▶ Play extract', es: '▶ Reproducir extracto', zh: '▶ 播放录音' }, lang),
  playPhrases: (lang: Lang) =>
    pick({ en: '▶ Play phrases', es: '▶ Reproducir frases', zh: '▶ 播放短语' }, lang),
  playConversation: (lang: Lang) =>
    pick({ en: '▶ Play conversation', es: '▶ Reproducir conversación', zh: '▶ 播放对话' }, lang),
  playQuestion: (lang: Lang) =>
    pick({ en: '▶ Play question', es: '▶ Reproducir pregunta', zh: '▶ 播放问题' }, lang),
  replayQuestion: (lang: Lang) =>
    pick({ en: '🔁 Replay question', es: '🔁 Repetir pregunta', zh: '🔁 重新播放问题' }, lang),

  listening: (lang: Lang) => pick({ en: 'Listening…', es: 'Escuchando…', zh: '正在听…' }, lang),
  preparationTime: (lang: Lang, s: number) =>
    pick(
      {
        en: `Preparation time: ${formatSeconds('en', s)}`,
        es: `Tiempo de preparación: ${formatSeconds('es', s)}`,
        zh: `准备时间：${formatSeconds('zh', s)}`,
      },
      lang,
    ),
  readingTime: (lang: Lang, s: number) =>
    pick(
      {
        en: `Reading time: ${formatSeconds('en', s)}`,
        es: `Tiempo de lectura: ${formatSeconds('es', s)}`,
        zh: `阅读时间：${formatSeconds('zh', s)}`,
      },
      lang,
    ),
  recording: (lang: Lang, s: number) =>
    pick(
      {
        en: `● Recording (${formatSeconds('en', s)} left)`,
        es: `● Grabando (quedan ${formatSeconds('es', s)})`,
        zh: `● 正在录音（剩余${formatSeconds('zh', s)}）`,
      },
      lang,
    ),
  stopWithElapsed: (lang: Lang, s: number) =>
    pick(
      {
        en: `■ Stop (${formatSeconds('en', s)})`,
        es: `■ Detener (${formatSeconds('es', s)})`,
        zh: `■ 停止（${formatSeconds('zh', s)}）`,
      },
      lang,
    ),
  stopRecording: (lang: Lang) => pick({ en: '■ Stop', es: '■ Detener', zh: '■ 停止' }, lang),

  yourRecording: (lang: Lang) => pick({ en: 'Your recording', es: 'Tu grabación', zh: '你的录音' }, lang),
  yourAnswerTo: (lang: Lang, n: number) =>
    pick(
      { en: `Your answer to question ${n}`, es: `Tu respuesta a la pregunta ${n}`, zh: `你对第${n}题的回答` },
      lang,
    ),
  modelAnswer: (lang: Lang) =>
    pick({ en: 'Model answer', es: 'Respuesta modelo', zh: '示范回答', ja: '解答例' }, lang),

  checkPronunciation: (lang: Lang) =>
    pick({ en: 'Check pronunciation', es: 'Revisar pronunciación', zh: '检查发音' }, lang),
  checkAnswer: (lang: Lang) => pick({ en: 'Check answer', es: 'Comprobar respuesta', zh: '检查答案' }, lang),
  checkAnswers: (lang: Lang) =>
    pick(
      {
        en: 'Check answers',
        es: 'Comprobar respuestas',
        zh: '检查所有答案',
        ar: 'تحقق من الإجابات',
        he: 'בדקו תשובות',
        'pt-BR': 'Verificar respostas',
        uk: 'Перевірити відповіді',
        fr: 'Vérifier les réponses',
      },
      lang,
    ),
  submitForReview: (lang: Lang) =>
    pick(
      { en: 'Submit for review', es: 'Enviar para revisión', zh: '提交以供审阅', ja: 'レビュー用に提出' },
      lang,
    ),
  reset: (lang: Lang) =>
    pick(
      {
        en: 'Reset',
        es: 'Reiniciar',
        zh: '重置',
        ja: 'リセット',
        ar: 'إعادة تعيين',
        he: 'איפוס',
        'pt-BR': 'Reiniciar',
        uk: 'Скинути',
        fr: 'Réinitialiser',
      },
      lang,
    ),

  passed: (lang: Lang) => pick({ en: 'Passed', es: 'Aprobado', zh: '通过' }, lang),
  keepPractising: (lang: Lang) => pick({ en: 'Keep practicing', es: 'Sigue practicando', zh: '继续练习' }, lang),
  wordsRecognised: (lang: Lang, score: number, total: number) =>
    pick(
      {
        en: `${score} of ${total} words recognized`,
        es: `${score} de ${total} palabras reconocidas`,
        zh: `识别出 ${score}/${total} 个词`,
      },
      lang,
    ),
  correct: (lang: Lang) => pick({ en: 'Correct', es: 'Correcto', zh: '正确', fr: 'Correct' }, lang),
  notQuite: (lang: Lang) => pick({ en: 'Not quite', es: 'No es correcto', zh: '不太对' }, lang),
  notQuiteExpected: (lang: Lang, answer: string) =>
    pick(
      {
        en: `Not quite. Expected answer: ${answer}`,
        es: `No es correcto. Respuesta esperada: ${answer}`,
        zh: `不太对，正确答案：${answer}`,
      },
      lang,
    ),
  whatRecognizerHeard: (lang: Lang) =>
    pick({ en: 'What the recognizer heard', es: 'Lo que el reconocedor escuchó', zh: '识别器听到的内容' }, lang),

  hintPronunciation: (lang: Lang) =>
    pick(
      {
        en:
          'This reflects which words were recognized, not accent or individual sounds. Compare ' +
          'your recording with the target sentence above for finer feedback.',
        es:
          'Esto refleja qué palabras fueron reconocidas, no el acento ni los sonidos individuales. ' +
          'Compara tu grabación con la oración objetivo de arriba para obtener información más precisa.',
        zh: '这只反映哪些词被识别出来，并不代表口音或单个发音的准确度。请将你的录音与上面的目标句子进行比较，获取更详细的反馈。',
      },
      lang,
    ),
  hintReadAloud: (lang: Lang) =>
    pick(
      {
        en:
          'This reflects which words were recognized, not pronunciation, intonation or stress. ' +
          'Listen back to the recording for finer feedback.',
        es:
          'Esto refleja qué palabras fueron reconocidas, no la pronunciación, la entonación ni el ' +
          'acento tónico. Escucha tu grabación para obtener información más precisa.',
        zh: '这只反映哪些词被识别出来，并不代表发音、语调或重音的准确度。请回听录音获取更详细的反馈。',
      },
      lang,
    ),
  hintSentenceBuilds: (lang: Lang) =>
    pick(
      {
        en: 'This reflects which words were recognized, not sentence structure or pronunciation.',
        es: 'Esto refleja qué palabras fueron reconocidas, no la estructura de la oración ni la pronunciación.',
        zh: '这只反映哪些词被识别出来，并不代表句子结构或发音的准确度。',
      },
      lang,
    ),

  autoScoreUnavailable: (lang: Lang) =>
    pick(
      {
        en:
          'Automatic scoring is unavailable in this browser. Listen back and self-assess, or ' +
          'ask a teacher to assess.',
        es:
          'La calificación automática no está disponible en este navegador. Escucha tu grabación ' +
          'y autoevalúate, o pide a un profesor que la evalúe.',
        zh: '此浏览器不支持自动评分，请回听录音自行评估，或请老师评估。',
      },
      lang,
    ),
  assessedByListening: (lang: Lang) =>
    pick(
      {
        en: 'This task is assessed by listening back to the recording.',
        es: 'Esta tarea se evalúa escuchando la grabación.',
        zh: '此任务通过回听录音进行评估。',
      },
      lang,
    ),

  micUnavailable: (lang: Lang) =>
    pick(
      {
        en: 'Microphone unavailable. Check browser permissions, then reset to try again.',
        es:
          'Micrófono no disponible. Comprueba los permisos del navegador y reinicia para ' +
          'intentarlo de nuevo.',
        zh: '麦克风不可用。请检查浏览器权限，然后重置后重试。',
      },
      lang,
    ),
  speechRecognitionError: (lang: Lang, code: string) =>
    pick(
      {
        en: `Speech recognition error: ${code}. You can still submit and self-assess.`,
        es: `Error de reconocimiento de voz: ${code}. Aún puedes enviar y autoevaluarte.`,
        zh: `语音识别错误：${code}。你仍然可以提交并自行评估。`,
      },
      lang,
    ),

  questionOf: (lang: Lang, n: number, total: number) =>
    pick(
      { en: `Question ${n} of ${total}`, es: `Pregunta ${n} de ${total}`, zh: `第 ${n} / ${total} 题` },
      lang,
    ),

  playsRemaining: (lang: Lang, left: number, max: number) =>
    pick(
      {
        en: `${left} of ${max} plays remaining`,
        es: `${left} de ${max} reproducciones restantes`,
        zh: `剩余播放次数：${left}/${max}`,
      },
      lang,
    ),
  noPlaysRemaining: (lang: Lang) =>
    pick({ en: 'No plays remaining', es: 'No quedan reproducciones', zh: '没有剩余播放次数' }, lang),

  writeSummaryHere: (lang: Lang) =>
    pick({ en: 'Write your summary here…', es: 'Escribe tu resumen aquí…', zh: '请在此输入你的总结…' }, lang),
  yourSummary: (lang: Lang) => pick({ en: 'Your summary', es: 'Tu resumen', zh: '你的总结' }, lang),
  wordCountTarget: (
    lang: Lang,
    count: number,
    unit: 'words' | 'characters',
    min: number | string,
    max: number | string,
  ) =>
    pick(
      {
        en: `${count} ${unit} (target: ${min}–${max})`,
        es: `${count} ${unit === 'characters' ? 'caracteres' : 'palabras'} (objetivo: ${min}–${max})`,
        zh: `${count} 个${unit === 'characters' ? '字' : '词'}（目标：${min}–${max}）`,
        ja: `${count}${unit === 'characters' ? '字' : '語'}（目標：${min}〜${max}）`,
      },
      lang,
    ),
  belowWordMinimum: (lang: Lang, min: number, unit: 'words' | 'characters') =>
    pick(
      {
        en: `Below the ${min}-${unit === 'characters' ? 'character' : 'word'} minimum: this response would score 0.`,
        es:
          `Por debajo del mínimo de ${min} ${unit === 'characters' ? 'caracteres' : 'palabras'}: ` +
          'esta respuesta obtendría 0 puntos.',
        zh: `低于${min}个${unit === 'characters' ? '字' : '词'}的最低要求：此回答将得0分。`,
      },
      lang,
    ),

  writeResponseHere: (lang: Lang) =>
    pick(
      {
        en: 'Write your response here…',
        es: 'Escribe tu respuesta aquí…',
        zh: '请在此输入你的回答…',
        ja: 'ここに回答を書いてください…',
      },
      lang,
    ),
  yourResponse: (lang: Lang) =>
    pick({ en: 'Your response', es: 'Tu respuesta', zh: '你的回答', ja: 'あなたの回答' }, lang),
  wordCountMinimum: (lang: Lang, count: number, unit: 'words' | 'characters', min: number) =>
    pick(
      {
        en: `${count} ${unit} (minimum: ${min})`,
        es: `${count} ${unit === 'characters' ? 'caracteres' : 'palabras'} (mínimo: ${min})`,
        zh: `${count} 个${unit === 'characters' ? '字' : '词'}（最低：${min}）`,
        ja: `${count}${unit === 'characters' ? '字' : '語'}（最低${min}）`,
      },
      lang,
    ),
  wordCount: (lang: Lang, count: number, unit: 'words' | 'characters') =>
    pick(
      {
        en: `${count} ${unit}`,
        es: `${count} ${unit === 'characters' ? 'caracteres' : 'palabras'}`,
        zh: `${count} 个${unit === 'characters' ? '字' : '词'}`,
        ja: `${count}${unit === 'characters' ? '字' : '語'}`,
      },
      lang,
    ),

  yourAnswer: (lang: Lang) => pick({ en: 'Your answer', es: 'Tu respuesta', zh: '你的回答' }, lang),
  typeSentenceHere: (lang: Lang) =>
    pick({ en: 'Type the sentence here…', es: 'Escribe la oración aquí…', zh: '请在此输入句子…' }, lang),
  useTheseWords: (lang: Lang) =>
    pick({ en: 'Use these words:', es: 'Usa estas palabras:', zh: '使用这些词语：' }, lang),
  answerThisQuestion: (lang: Lang) =>
    pick({ en: 'Answer this question', es: 'Responder a esta pregunta', zh: '回答这道题' }, lang),
  changeQuestion: (lang: Lang) =>
    pick({ en: '← Choose a different question', es: '← Elegir otra pregunta', zh: '← 选择另一道题' }, lang),
  emailFrom: (lang: Lang) => pick({ en: 'From', es: 'De', zh: '发件人' }, lang),
  emailSubject: (lang: Lang) => pick({ en: 'Subject', es: 'Asunto', zh: '主题' }, lang),
  /** Joins the 2-3 required points into one flowing sentence rather than a
   *  list — Oxford comma before "and" for English; Spanish and Chinese join
   *  the final item with "y"/"和" but no comma before it, per each
   *  language's own convention. */
  yourEmailShould: (lang: Lang, points: string[]) => {
    const init = points.slice(0, -1);
    const last = points[points.length - 1];
    const oxfordJoin = (conj: string) => (init.length ? `${init.join(', ')}, ${conj} ${last}` : last);
    const plainJoin = (conj: string) => (init.length ? `${init.join(', ')} ${conj} ${last}` : last);
    const zhJoin = (init.length ? `${init.join('、')}和${last}` : last);
    return pick(
      {
        en: `Your email should ${oxfordJoin('and')}.`,
        es: `Tu correo debe ${plainJoin('y')}.`,
        zh: `你的邮件应该${zhJoin}。`,
      },
      lang,
    );
  },

  moveItemEarlier: (lang: Lang, item: string) =>
    pick(
      { en: `Move "${item}" earlier`, es: `Mover "${item}" antes`, zh: `将"${item}"上移` },
      lang,
    ),
  moveItemLater: (lang: Lang, item: string) =>
    pick(
      { en: `Move "${item}" later`, es: `Mover "${item}" después`, zh: `将"${item}"下移` },
      lang,
    ),
  orderingFeedbackPerfect: (lang: Lang) =>
    pick(
      {
        en: 'Perfect order: you caught every logical link between the lines.',
        es: 'Orden perfecto: has detectado todos los vínculos lógicos entre las líneas.',
        zh: '完全正确：你找出了所有句子之间的逻辑联系。',
      },
      lang,
    ),
  orderingFeedbackPartial: (lang: Lang) =>
    pick(
      {
        en:
          'Getting there: re-check the connecting words and pronoun references between ' +
          'lines for clues to the right sequence.',
        es:
          'Casi lo tienes: revisa los conectores y las referencias pronominales entre ' +
          'líneas para encontrar pistas sobre el orden correcto.',
        zh: '接近了：请重新检查句子之间的连接词和代词指代，寻找正确顺序的线索。',
      },
      lang,
    ),
  scoreLine: (lang: Lang, correct: number, total: number, pct: number) =>
    pick(
      {
        en: `${correct} / ${total} correct (${pct}%)`,
        es: `${correct} / ${total} correctas (${pct}%)`,
        zh: `${correct} / ${total} 正确（${pct}%）`,
      },
      lang,
    ),
  orderingFeedbackLow: (lang: Lang) =>
    pick(
      {
        en:
          'Look for connecting words, pronouns, and cause-effect links that tie each ' +
          'line to the one before it.',
        es:
          'Busca conectores, pronombres y relaciones de causa y efecto que unan cada ' +
          'línea con la anterior.',
        zh: '请寻找连接词、代词以及因果关系，它们能将每一句与前一句联系起来。',
      },
      lang,
    ),

  realWord: (lang: Lang) => pick({ en: 'Real word', es: 'Palabra real', zh: '真实单词' }, lang),
  fakeWord: (lang: Lang) => pick({ en: 'Fake word', es: 'Palabra inventada', zh: '虚构单词' }, lang),
  wordProgress: (lang: Lang, current: number, total: number) =>
    pick(
      {
        en: `Word ${current} of ${total}`,
        es: `Palabra ${current} de ${total}`,
        zh: `第 ${current} 个词，共 ${total} 个`,
      },
      lang,
    ),
  wasRealWord: (lang: Lang) =>
    pick(
      { en: 'This is a real word.', es: 'Esta es una palabra real.', zh: '这是一个真实的单词。' },
      lang,
    ),
  wasFakeWord: (lang: Lang) =>
    pick(
      { en: 'This is not a real word.', es: 'Esta no es una palabra real.', zh: '这不是一个真实的单词。' },
      lang,
    ),
  yourGuess: (lang: Lang) => pick({ en: 'Your guess', es: 'Tu respuesta', zh: '你的判断' }, lang),
  passageLabel: (lang: Lang) => pick({ en: 'Passage', es: 'Texto', zh: '文章' }, lang),
  chooseASentence: (lang: Lang) =>
    pick({ en: 'Choose a sentence here', es: 'Elige una frase aquí', zh: '请在此选择一句话' }, lang),
  selectPlaceholder: (lang: Lang) => pick({ en: 'Select', es: 'Seleccionar', zh: '选择' }, lang),
  blankFeedbackPerfect: (lang: Lang) =>
    pick(
      {
        en: 'Perfect score: every blank was filled correctly.',
        es: 'Puntuación perfecta: todos los espacios están correctos.',
        zh: '满分：所有空白都填对了。',
      },
      lang,
    ),
  blankFeedbackPartial: (lang: Lang) =>
    pick(
      {
        en: 'Getting there: review the blanks marked wrong and think about why the other option fits better.',
        es: 'Casi lo tienes: revisa los espacios marcados como incorrectos y piensa por qué la otra opción encaja mejor.',
        zh: '接近了：请检查标记为错误的空白，想一想为什么另一个选项更合适。',
      },
      lang,
    ),
  blankFeedbackLow: (lang: Lang) =>
    pick(
      {
        en: 'Review each option carefully against the surrounding words before choosing again.',
        es: 'Revisa cada opción con cuidado según las palabras que la rodean antes de volver a elegir.',
        zh: '请再次根据上下文仔细检查每个选项，然后重新选择。',
      },
      lang,
    ),
  missingLettersFeedbackPerfect: (lang: Lang) =>
    pick(
      {
        en: 'Perfect score: every word was completed correctly.',
        es: 'Puntuación perfecta: todas las palabras están completas correctamente.',
        zh: '满分：所有单词都填对了。',
      },
      lang,
    ),
  missingLettersFeedbackPartial: (lang: Lang) =>
    pick(
      {
        en: 'Getting there: review the words marked wrong and re-read the sentence around them for clues.',
        es: 'Casi lo tienes: revisa las palabras marcadas como incorrectas y vuelve a leer la frase que las rodea.',
        zh: '接近了：请检查标记为错误的单词，并重新阅读周围的句子寻找线索。',
      },
      lang,
    ),
  missingLettersFeedbackLow: (lang: Lang) =>
    pick(
      {
        en: 'Read the whole passage again first, then use the letters already given as a starting clue for each word.',
        es: 'Vuelve a leer todo el texto primero y usa las letras ya dadas como pista para cada palabra.',
        zh: '请先重新阅读整篇文章，再把已给出的字母当作每个单词的提示。',
      },
      lang,
    ),
  wordBankHeading: (lang: Lang) =>
    pick(
      {
        en: 'Word bank',
        es: 'Banco de palabras',
        zh: '词库',
        ar: 'بنك الكلمات',
        he: 'בנק מילים',
        'pt-BR': 'Banco de palavras',
        uk: 'Список слів',
      },
      lang,
    ),
  dragOrTypeHint: (lang: Lang) =>
    pick(
      {
        en: 'Drag a word into a blank, or type it in',
        es: 'Arrastra una palabra a un espacio, o escríbela',
        zh: '将单词拖入空格，或直接输入',
        ar: 'اسحب كلمة إلى الفراغ، أو اكتبها',
        he: 'גררו מילה לתוך החלל, או הקלידו אותה',
        'pt-BR': 'Arraste uma palavra para a lacuna ou digite-a',
        uk: 'Перетягніть слово в пропуск або напишіть його',
      },
      lang,
    ),
  blankAriaLabel: (lang: Lang, blankNum: number, itemNum: number) =>
    pick(
      {
        en: `Blank ${blankNum} of item ${itemNum}`,
        es: `Espacio ${blankNum} del ítem ${itemNum}`,
        zh: `第${itemNum}题的第${blankNum}个空格`,
        ar: `الفراغ ${blankNum} من العنصر ${itemNum}`,
        he: `חלל ${blankNum} מתוך פריט ${itemNum}`,
        'pt-BR': `Lacuna ${blankNum} do item ${itemNum}`,
        uk: `Пропуск ${blankNum} елемента ${itemNum}`,
      },
      lang,
    ),
  answerWas: (lang: Lang, answer: string) =>
    pick(
      {
        en: `Answer: ${answer}`,
        es: `Respuesta: ${answer}`,
        zh: `答案：${answer}`,
        ar: `الإجابة: ${answer}`,
        he: `תשובה: ${answer}`,
        'pt-BR': `Resposta: ${answer}`,
        uk: `Відповідь: ${answer}`,
        fr: `Réponse : ${answer}`,
      },
      lang,
    ),
  statementBankHeading: (lang: Lang) => pick({ en: 'Statement bank', es: 'Banco de afirmaciones', zh: '陈述库' }, lang),
  playLabel: (lang: Lang) => pick({ en: 'Play', es: 'Reproducir', zh: '播放' }, lang),
  dropHere: (lang: Lang) => pick({ en: 'Drop here', es: 'Suelta aquí', zh: '拖放到此处' }, lang),
  nowPlaying: (lang: Lang) =>
    pick(
      {
        en: 'Audio is playing… You cannot pause the audio.',
        es: 'El audio se está reproduciendo… No se puede pausar el audio.',
        zh: '音频正在播放…无法暂停音频。',
      },
      lang,
    ),
  dragOrClickHint: (lang: Lang) =>
    pick(
      {
        en: 'Drag a word into a gap, or select a word and then select a gap. Drag a placed word back here to undo it.',
        es:
          'Arrastra una palabra a un espacio, o selecciona una palabra y luego un ' +
          'espacio. Arrastra una palabra colocada de vuelta aquí para deshacerla.',
        zh: '请把一个词拖到空白处，或先选择一个词再选择一个空白处。把已放置的词拖回这里即可撤销。',
      },
      lang,
    ),
  dragOrClickHintStatement: (lang: Lang) =>
    pick(
      {
        en: 'Drag a statement into a box, or select a statement and then select a box. Drag a placed statement back here to undo it.',
        es:
          'Arrastra una afirmación a un recuadro, o selecciona una afirmación y ' +
          'luego un recuadro. Arrastra una afirmación colocada de vuelta aquí ' +
          'para deshacerla.',
        zh: '请把一条陈述拖到方框中，或先选择一条陈述再选择一个方框。把已放置的陈述拖回这里即可撤销。',
      },
      lang,
    ),
  dragFeedbackPerfect: (lang: Lang) =>
    pick(
      {
        en: 'Perfect score: every gap was filled with the correct word.',
        es: 'Puntuación perfecta: todos los espacios tienen la palabra correcta.',
        zh: '满分：所有空白都填入了正确的词。',
      },
      lang,
    ),
  dragFeedbackPartial: (lang: Lang) =>
    pick(
      {
        en: 'Getting there: review the gaps marked wrong and re-read the sentence around them.',
        es: 'Casi lo tienes: revisa los espacios marcados como incorrectos y vuelve a leer la frase que los rodea.',
        zh: '接近了：请检查标记为错误的空白，并重新阅读周围的句子。',
      },
      lang,
    ),
  dragFeedbackLow: (lang: Lang) =>
    pick(
      {
        en: 'Read the whole passage again, then think about which word from the bank fits the grammar and meaning of each gap.',
        es:
          'Vuelve a leer todo el texto y piensa qué palabra del banco encaja con la ' +
          'gramática y el significado de cada espacio.',
        zh: '请重新阅读整篇文章，然后想一想词库中的哪个词符合每个空白的语法和意思。',
      },
      lang,
    ),
  typeAnswerHere: (lang: Lang) =>
    pick({ en: 'Type your answer here…', es: 'Escribe tu respuesta aquí…', zh: '请在此输入答案…' }, lang),
  selectAllThatApply: (lang: Lang) =>
    pick({ en: 'Select all that apply.', es: 'Selecciona todas las que correspondan.', zh: '请选出所有符合的选项。' }, lang),
  transcriptLabel: (lang: Lang) => pick({ en: 'Transcript', es: 'Transcripción', zh: '文字稿' }, lang),
  labelTrue: (lang: Lang) => pick({ en: 'True', es: 'Verdadero', zh: '正确' }, lang),
  labelFalse: (lang: Lang) => pick({ en: 'False', es: 'Falso', zh: '错误' }, lang),
  labelNotGiven: (lang: Lang) => pick({ en: 'Not given', es: 'No se menciona', zh: '未提及' }, lang),
  questionLabel: (lang: Lang, n: number) => `${pick({ en: 'Question', es: 'Pregunta', zh: '问题' }, lang)} ${n}`,
  highlightedPreview: (lang: Lang, text: string) =>
    text ? `${pick({ en: 'Highlighted', es: 'Resaltado', zh: '已高亮' }, lang)}: ${text}` : pick(
      { en: 'Nothing highlighted yet.', es: 'Aún no has resaltado nada.', zh: '尚未高亮任何内容。' },
      lang,
    ),

  allItemsPlaced: (lang: Lang) =>
    pick({ en: 'All items placed.', es: 'Todos los elementos están colocados.', zh: '所有项目均已放置。' }, lang),
  removeLabel: (lang: Lang) => pick({ en: 'Remove', es: 'Quitar', zh: '移除' }, lang),
  imageLabelFallback: (lang: Lang, n: number) =>
    pick(
      { en: `Image ${n}`, es: `Imagen ${n}`, zh: `图片 ${n}`, fr: `Image ${n}` },
      lang,
    ),
  typeTheWord: (lang: Lang) =>
    pick({ en: 'Type the word…', es: 'Escribe la palabra…', zh: '请输入这个词…', fr: 'Écrivez le mot…' }, lang),
  mcFeedbackPerfect: (lang: Lang) =>
    pick(
      { en: 'Perfect score: every choice was correct.', es: 'Puntuación perfecta: todas las respuestas fueron correctas.', zh: '满分：所有选择均正确。' },
      lang,
    ),
  mcFeedbackPartial: (lang: Lang) =>
    pick(
      {
        en: 'Getting there: review the explanations below for the ones you missed.',
        es: 'Casi lo tienes: revisa las explicaciones de las que fallaste.',
        zh: '接近了：请查看你答错题目下方的解释。',
      },
      lang,
    ),
  mcFeedbackLow: (lang: Lang) =>
    pick(
      {
        en: 'Review the explanations below for each question before trying again.',
        es: 'Revisa las explicaciones de cada pregunta antes de volver a intentarlo.',
        zh: '请先查看每道题的解释，然后再重新尝试。',
      },
      lang,
    ),
  blankNumberLabel: (lang: Lang, n: number) =>
    pick({ en: `Blank ${n}`, es: `Espacio ${n}`, zh: `第${n}个空格` }, lang),
  answerToQuestionLabel: (lang: Lang, n: number) =>
    pick(
      { en: `Answer to question ${n}`, es: `Respuesta a la pregunta ${n}`, zh: `第${n}题的回答` },
      lang,
    ),
  sampleAnswerHeading: (lang: Lang) =>
    pick({ en: 'Sample answer', es: 'Respuesta de ejemplo', zh: '示例答案' }, lang),
};
