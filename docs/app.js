(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // Estatísticas (guardadas como JSON no localStorage do navegador, já que
  // o GitHub Pages é um site estático e não tem backend para escrever
  // ficheiros no servidor).
  // ---------------------------------------------------------------------

  const STATS_KEY = 'masterMindStats';

  function loadStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      const parsed = raw ? JSON.parse(raw) : { days: {} };
      if (!parsed.days) parsed.days = {};
      return parsed;
    } catch (err) {
      return { days: {} };
    }
  }

  function saveStats(stats) {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  function recordResult(dateStr, correct, total) {
    const stats = loadStats();
    if (!stats.days[dateStr]) {
      stats.days[dateStr] = { plays: 0, correct: 0, total: 0, best: 0, lastPlayed: null };
    }
    const day = stats.days[dateStr];
    day.plays += 1;
    day.correct += correct;
    day.total += total;
    day.best = Math.max(day.best, correct);
    day.lastPlayed = new Date().toISOString();
    saveStats(stats);
    return stats;
  }

  function getMonthlyStats(stats) {
    const months = {};
    for (const [date, day] of Object.entries(stats.days)) {
      const month = date.slice(0, 7);
      if (!months[month]) {
        months[month] = { month, days: 0, plays: 0, points: 0, totalQuestions: 0, best: 0 };
      }
      const m = months[month];
      m.days += 1;
      m.plays += day.plays;
      m.points += day.correct;
      m.totalQuestions += day.total;
      m.best = Math.max(m.best, day.best);
    }
    return Object.values(months)
      .map((m) => ({
        ...m,
        averagePercent: m.totalQuestions > 0 ? Math.round((m.points / m.totalQuestions) * 1000) / 10 : 0,
      }))
      .sort((a, b) => (a.month < b.month ? 1 : -1));
  }

  // ---------------------------------------------------------------------
  // Geração de perguntas a partir da Wikipédia, usada apenas como recurso
  // de emergência quando ainda não existe data/questions/<data>.json (por
  // exemplo, antes de a Action diária correr pela primeira vez nesse dia).
  // Mantém a mesma lógica de scripts/generate-daily-questions.js e
  // lib/wikipedia.js, mas em JavaScript de navegador (sem módulos Node).
  // ---------------------------------------------------------------------

  const WIKI_LANG = 'pt';
  const RANDOM_SUMMARY_URL = `https://${WIKI_LANG}.wikipedia.org/api/rest_v1/page/random/summary`;
  const QUESTIONS_PER_DAY = 20;
  const OPTIONS_PER_QUESTION = 4;
  const MIN_EXTRACT_LENGTH = 80;
  const MAX_FETCH_ATTEMPTS = 200;
  const FETCH_BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 300;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function createSeededRandom(seedStr) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) {
      h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function seededRandom() {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h = (h ^ (h >>> 16)) >>> 0;
      return h / 4294967296;
    };
  }

  function shuffle(array, rng) {
    const result = array.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  async function fetchRandomSummary() {
    try {
      const res = await fetch(RANDOM_SUMMARY_URL, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        console.warn(`Wikipédia devolveu estado inesperado: ${res.status}`);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.warn(`Pedido à Wikipédia falhou: ${err.message}`);
      return null;
    }
  }

  function isUsableArticle(article) {
    if (!article || !article.title || !article.extract) return false;
    if (article.type && article.type !== 'standard') return false;
    if (article.extract.length < MIN_EXTRACT_LENGTH) return false;
    if (/^\d+$/.test(article.title.trim())) return false;
    return true;
  }

  function buildClue(extract, title) {
    let clue = extract.replace(/\s+/g, ' ').trim();
    clue = clue.replace(new RegExp(escapeRegExp(title), 'gi'), 'Este/Esta elemento');

    const firstWord = title.split(/\s+/)[0];
    if (firstWord && firstWord.length > 2) {
      clue = clue.replace(new RegExp(`\\b${escapeRegExp(firstWord)}\\b`, 'gi'), 'Este/Esta elemento');
    }

    const maxLength = 320;
    if (clue.length > maxLength) {
      const truncated = clue.slice(0, maxLength);
      const lastPeriod = truncated.lastIndexOf('.');
      clue = lastPeriod > 60 ? truncated.slice(0, lastPeriod + 1) : `${truncated.trim()}…`;
    }
    return clue;
  }

  async function buildArticlePool(poolSize) {
    const pool = [];
    const seenTitles = new Set();
    let attempts = 0;

    while (pool.length < poolSize && attempts < MAX_FETCH_ATTEMPTS) {
      const batchSize = Math.min(FETCH_BATCH_SIZE, poolSize - pool.length);
      const batch = await Promise.all(Array.from({ length: batchSize }, () => fetchRandomSummary()));
      attempts += batchSize;

      for (const article of batch) {
        if (!isUsableArticle(article)) continue;
        if (seenTitles.has(article.title)) continue;
        seenTitles.add(article.title);
        pool.push({ title: article.title, extract: article.extract });
      }

      if (pool.length < poolSize && attempts < MAX_FETCH_ATTEMPTS) {
        await sleep(BATCH_DELAY_MS);
      }
    }
    return pool;
  }

  async function generateQuestionsFromWikipedia(dateStr, count = QUESTIONS_PER_DAY) {
    const pool = await buildArticlePool(count + 15);
    if (pool.length < count) {
      throw new Error(`Não foi possível obter artigos suficientes da Wikipédia (${pool.length}/${count}).`);
    }

    const rng = createSeededRandom(dateStr + Date.now());
    const shuffledPool = shuffle(pool, rng);
    const chosen = shuffledPool.slice(0, count);

    return chosen.map((correct, index) => {
      const distractorPool = shuffledPool.filter((a) => a.title !== correct.title);
      const distractors = shuffle(distractorPool, rng)
        .slice(0, OPTIONS_PER_QUESTION - 1)
        .map((a) => a.title);
      const options = shuffle([correct.title, ...distractors], rng);
      return {
        id: index + 1,
        clue: buildClue(correct.extract, correct.title),
        options,
        correctAnswer: correct.title,
      };
    });
  }

  async function loadTodaysQuestions(dateStr) {
    try {
      const res = await fetch(`data/questions/${dateStr}.json`, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (err) {
      // segue para o recurso de emergência
    }
    return generateQuestionsFromWikipedia(dateStr);
  }

  // ---------------------------------------------------------------------
  // Estado e UI do quiz
  // ---------------------------------------------------------------------

  const state = { date: null, questions: [], currentIndex: 0, score: 0, answered: false };

  const els = {
    tabBtns: document.querySelectorAll('.tab-btn'),
    panels: { play: document.getElementById('tab-play'), stats: document.getElementById('tab-stats') },
    playLoading: document.getElementById('play-loading'),
    playError: document.getElementById('play-error'),
    errorText: document.querySelector('#play-error .error-text'),
    retryBtn: document.getElementById('retry-btn'),
    alreadyPlayed: document.getElementById('already-played'),
    alreadyScore: document.querySelector('.already-score'),
    viewStatsFromPlayed: document.getElementById('view-stats-from-played'),
    quizCard: document.getElementById('quiz-card'),
    questionCounter: document.getElementById('question-counter'),
    scoreCounter: document.getElementById('score-counter'),
    progressFill: document.getElementById('progress-fill'),
    questionClue: document.getElementById('question-clue'),
    optionsBox: document.getElementById('options'),
    nextBtn: document.getElementById('next-btn'),
    resultCard: document.getElementById('result-card'),
    resultScore: document.getElementById('result-score'),
    resultMessage: document.getElementById('result-message'),
    goToStatsBtn: document.getElementById('go-to-stats-btn'),
    statsLoading: document.getElementById('stats-loading'),
    statsEmpty: document.getElementById('stats-empty'),
    statsList: document.getElementById('stats-list'),
    exportStatsBtn: document.getElementById('export-stats-btn'),
    importStatsInput: document.getElementById('import-stats-input'),
  };

  function setVisible(el, visible) {
    el.classList.toggle('hidden', !visible);
  }

  function showTab(tab) {
    els.tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    Object.entries(els.panels).forEach(([name, panel]) => panel.classList.toggle('active', name === tab));
    if (tab === 'stats') renderStats();
  }

  els.tabBtns.forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  els.goToStatsBtn.addEventListener('click', () => showTab('stats'));
  els.viewStatsFromPlayed.addEventListener('click', () => showTab('stats'));
  els.retryBtn.addEventListener('click', () => loadQuiz());

  function playedKey(date) {
    return `masterMindPlayed:${date}`;
  }

  function getPlayedRecord(date) {
    const raw = localStorage.getItem(playedKey(date));
    return raw ? JSON.parse(raw) : null;
  }

  function setPlayedRecord(date, score, total) {
    localStorage.setItem(playedKey(date), JSON.stringify({ score, total }));
  }

  function todayDateString() {
    return new Date().toISOString().slice(0, 10);
  }

  async function loadQuiz() {
    setVisible(els.playLoading, true);
    setVisible(els.playError, false);
    setVisible(els.alreadyPlayed, false);
    setVisible(els.quizCard, false);
    setVisible(els.resultCard, false);

    const dateStr = todayDateString();

    try {
      const questions = await loadTodaysQuestions(dateStr);
      if (!questions || questions.length === 0) throw new Error('Sem perguntas disponíveis.');

      state.date = dateStr;
      state.questions = questions;
      state.currentIndex = 0;
      state.score = 0;
      state.answered = false;

      setVisible(els.playLoading, false);

      const played = getPlayedRecord(dateStr);
      if (played) {
        els.alreadyScore.textContent = `Resultado de hoje: ${played.score}/${played.total}`;
        setVisible(els.alreadyPlayed, true);
        return;
      }

      setVisible(els.quizCard, true);
      renderQuestion();
    } catch (err) {
      setVisible(els.playLoading, false);
      els.errorText.textContent =
        err.message || 'Falha ao carregar as perguntas. Verifica a tua ligação à internet.';
      setVisible(els.playError, true);
    }
  }

  function renderQuestion() {
    const q = state.questions[state.currentIndex];
    state.answered = false;

    els.questionCounter.textContent = `Pergunta ${state.currentIndex + 1}/${state.questions.length}`;
    els.scoreCounter.textContent = `Pontos: ${state.score}`;
    els.progressFill.style.width = `${(state.currentIndex / state.questions.length) * 100}%`;
    els.questionClue.textContent = q.clue;

    els.optionsBox.innerHTML = '';
    q.options.forEach((option) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = option;
      btn.addEventListener('click', () => selectOption(option, btn));
      els.optionsBox.appendChild(btn);
    });

    setVisible(els.nextBtn, false);
  }

  function selectOption(selected, btnEl) {
    if (state.answered) return;
    state.answered = true;

    const q = state.questions[state.currentIndex];
    if (selected === q.correctAnswer) state.score += 1;

    Array.from(els.optionsBox.children).forEach((btn) => {
      btn.disabled = true;
      if (btn.textContent === q.correctAnswer) btn.classList.add('correct');
      else if (btn === btnEl) btn.classList.add('wrong');
    });

    els.scoreCounter.textContent = `Pontos: ${state.score}`;
    setVisible(els.nextBtn, true);
  }

  els.nextBtn.addEventListener('click', () => {
    state.currentIndex += 1;
    if (state.currentIndex >= state.questions.length) finishQuiz();
    else renderQuestion();
  });

  function finishQuiz() {
    setVisible(els.quizCard, false);
    els.progressFill.style.width = '100%';

    const total = state.questions.length;
    setPlayedRecord(state.date, state.score, total);
    recordResult(state.date, state.score, total);

    els.resultScore.textContent = `${state.score} / ${total}`;
    els.resultMessage.textContent = messageForScore(state.score, total);
    setVisible(els.resultCard, true);
  }

  function messageForScore(score, total) {
    const ratio = score / total;
    if (ratio === 1) return 'Perfeito! Sabes tudo sobre tudo. 🏆';
    if (ratio >= 0.7) return 'Muito bom! Quase perfeito. 🎉';
    if (ratio >= 0.4) return 'Nada mau, volta amanhã para melhorar. 👍';
    return 'Amanhã há mais 20 perguntas — vais conseguir! 💪';
  }

  // ---------------------------------------------------------------------
  // Estatísticas — UI
  // ---------------------------------------------------------------------

  const MONTH_NAMES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];

  function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-').map(Number);
    return `${MONTH_NAMES[month - 1]} de ${year}`;
  }

  function renderStats() {
    setVisible(els.statsLoading, false);
    els.statsList.innerHTML = '';

    const stats = loadStats();
    const months = getMonthlyStats(stats);

    if (months.length === 0) {
      setVisible(els.statsEmpty, true);
      return;
    }
    setVisible(els.statsEmpty, false);

    months.forEach((m) => {
      const card = document.createElement('div');
      card.className = 'month-card';
      card.innerHTML = `
        <h3>${formatMonth(m.month)}</h3>
        <div class="month-metrics">
          <span class="metric-label">Dias jogados</span><span class="metric-value">${m.days}</span>
          <span class="metric-label">Jogos totais</span><span class="metric-value">${m.plays}</span>
          <span class="metric-label">Pontos totais</span><span class="metric-value">${m.points}</span>
          <span class="metric-label">Melhor jogo</span><span class="metric-value">${m.best}/20</span>
          <span class="metric-label">Média de acerto</span><span class="metric-value">${m.averagePercent}%</span>
        </div>
        <div class="month-bar-track"><div class="month-bar-fill" style="width:${m.averagePercent}%"></div></div>
      `;
      els.statsList.appendChild(card);
    });
  }

  els.exportStatsBtn.addEventListener('click', () => {
    const stats = loadStats();
    const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `master-mind-estatisticas-${todayDateString()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  els.importStatsInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!imported.days) throw new Error('Formato inválido.');

        const current = loadStats();
        for (const [date, day] of Object.entries(imported.days)) {
          if (!current.days[date]) {
            current.days[date] = day;
          } else {
            current.days[date].plays += day.plays || 0;
            current.days[date].correct += day.correct || 0;
            current.days[date].total += day.total || 0;
            current.days[date].best = Math.max(current.days[date].best, day.best || 0);
          }
        }
        saveStats(current);
        renderStats();
        alert('Estatísticas importadas com sucesso.');
      } catch (err) {
        alert('Não foi possível importar este ficheiro. Confirma que é um export do Master-Mind.');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  });

  loadQuiz();
})();
