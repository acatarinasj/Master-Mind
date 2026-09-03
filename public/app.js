(() => {
  'use strict';

  const state = {
    date: null,
    questions: [],
    currentIndex: 0,
    score: 0,
    answered: false,
  };

  const els = {
    tabBtns: document.querySelectorAll('.tab-btn'),
    panels: {
      play: document.getElementById('tab-play'),
      stats: document.getElementById('tab-stats'),
    },
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
  };

  function showTab(tab) {
    els.tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    Object.entries(els.panels).forEach(([name, panel]) => panel.classList.toggle('active', name === tab));
    if (tab === 'stats') loadStats();
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

  function setVisible(el, visible) {
    el.classList.toggle('hidden', !visible);
  }

  async function loadQuiz() {
    setVisible(els.playLoading, true);
    setVisible(els.playError, false);
    setVisible(els.alreadyPlayed, false);
    setVisible(els.quizCard, false);
    setVisible(els.resultCard, false);

    try {
      const res = await fetch('/api/quiz/today');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar perguntas.');

      state.date = data.date;
      state.questions = data.questions;
      state.currentIndex = 0;
      state.score = 0;
      state.answered = false;

      setVisible(els.playLoading, false);

      const played = getPlayedRecord(state.date);
      if (played) {
        els.alreadyScore.textContent = `Resultado de hoje: ${played.score}/${played.total}`;
        setVisible(els.alreadyPlayed, true);
        return;
      }

      setVisible(els.quizCard, true);
      renderQuestion();
    } catch (err) {
      setVisible(els.playLoading, false);
      els.errorText.textContent = err.message || 'Falha ao carregar as perguntas.';
      setVisible(els.playError, true);
    }
  }

  function renderQuestion() {
    const q = state.questions[state.currentIndex];
    state.answered = false;

    els.questionCounter.textContent = `Pergunta ${state.currentIndex + 1}/${state.questions.length}`;
    els.scoreCounter.textContent = `Pontos: ${state.score}`;
    els.progressFill.style.width = `${((state.currentIndex) / state.questions.length) * 100}%`;
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
    const correct = selected === q.correctAnswer;
    if (correct) state.score += 1;

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
    if (state.currentIndex >= state.questions.length) {
      finishQuiz();
    } else {
      renderQuestion();
    }
  });

  async function finishQuiz() {
    setVisible(els.quizCard, false);
    els.progressFill.style.width = '100%';

    const total = state.questions.length;
    setPlayedRecord(state.date, state.score, total);

    els.resultScore.textContent = `${state.score} / ${total}`;
    els.resultMessage.textContent = messageForScore(state.score, total);
    setVisible(els.resultCard, true);

    try {
      await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: state.date, correct: state.score, total }),
      });
    } catch (err) {
      console.error('Falha ao guardar resultado:', err);
    }
  }

  function messageForScore(score, total) {
    const ratio = score / total;
    if (ratio === 1) return 'Perfeito! Sabes tudo sobre tudo. 🏆';
    if (ratio >= 0.7) return 'Muito bom! Quase perfeito. 🎉';
    if (ratio >= 0.4) return 'Nada mau, volta amanhã para melhorar. 👍';
    return 'Amanhã há mais 20 perguntas — vais conseguir! 💪';
  }

  const MONTH_NAMES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];

  function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-').map(Number);
    return `${MONTH_NAMES[month - 1]} de ${year}`;
  }

  async function loadStats() {
    setVisible(els.statsLoading, true);
    setVisible(els.statsEmpty, false);
    els.statsList.innerHTML = '';

    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setVisible(els.statsLoading, false);

      if (!data.months || data.months.length === 0) {
        setVisible(els.statsEmpty, true);
        return;
      }

      data.months.forEach((m) => {
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
    } catch (err) {
      setVisible(els.statsLoading, false);
      els.statsList.innerHTML = '<p class="error-text">Não foi possível carregar as estatísticas.</p>';
    }
  }

  loadQuiz();
})();
