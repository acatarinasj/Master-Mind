'use strict';

const express = require('express');
const path = require('path');

const { getOrCreateDailyQuestions } = require('./lib/questionsCache');
const { loadStats, recordResult, getMonthlyStats } = require('./lib/stats');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // AAAA-MM-DD (UTC)
}

app.get('/api/quiz/today', async (req, res) => {
  const dateStr = todayDateString();
  try {
    const questions = await getOrCreateDailyQuestions(dateStr);
    res.json({ date: dateStr, questions });
  } catch (err) {
    console.error('Falha ao gerar perguntas do dia:', err);
    res.status(502).json({
      error: 'Não foi possível obter perguntas da Wikipédia neste momento. Tenta novamente daqui a pouco.',
    });
  }
});

app.post('/api/quiz/submit', (req, res) => {
  const { date, correct, total } = req.body || {};

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Campo "date" inválido, esperado AAAA-MM-DD.' });
  }
  if (typeof total !== 'number' || total <= 0 || typeof correct !== 'number' || correct < 0) {
    return res.status(400).json({ error: 'Campos "correct"/"total" inválidos.' });
  }

  try {
    const stats = recordResult(date, correct, total);
    res.json({ ok: true, day: stats.days[date] });
  } catch (err) {
    console.error('Falha ao guardar estatísticas:', err);
    res.status(500).json({ error: 'Não foi possível guardar o resultado.' });
  }
});

app.get('/api/stats', (req, res) => {
  const stats = loadStats();
  res.json({ days: stats.days, months: getMonthlyStats(stats) });
});

app.listen(PORT, () => {
  console.log(`Master-Mind Wiki Quiz a correr em http://localhost:${PORT}`);
});
