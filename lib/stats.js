'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStats() {
  ensureDataDir();
  if (!fs.existsSync(STATS_FILE)) {
    return { days: {} };
  }
  try {
    const raw = fs.readFileSync(STATS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.days) parsed.days = {};
    return parsed;
  } catch (err) {
    return { days: {} };
  }
}

function saveStats(stats) {
  ensureDataDir();
  const tmpFile = `${STATS_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(stats, null, 2), 'utf-8');
  fs.renameSync(tmpFile, STATS_FILE);
}

function recordResult(dateStr, correct, total) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Data inválida, esperado formato AAAA-MM-DD.');
  }
  const safeCorrect = Math.max(0, Math.min(Number(correct) || 0, Number(total) || 0));
  const safeTotal = Math.max(0, Number(total) || 0);

  const stats = loadStats();
  if (!stats.days[dateStr]) {
    stats.days[dateStr] = { plays: 0, correct: 0, total: 0, best: 0, lastPlayed: null };
  }
  const day = stats.days[dateStr];
  day.plays += 1;
  day.correct += safeCorrect;
  day.total += safeTotal;
  day.best = Math.max(day.best, safeCorrect);
  day.lastPlayed = new Date().toISOString();

  saveStats(stats);
  return stats;
}

function getMonthlyStats(stats) {
  const months = {};

  for (const [date, day] of Object.entries(stats.days)) {
    const month = date.slice(0, 7); // AAAA-MM
    if (!months[month]) {
      months[month] = {
        month,
        days: 0,
        plays: 0,
        points: 0,
        totalQuestions: 0,
        best: 0,
      };
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

module.exports = {
  loadStats,
  saveStats,
  recordResult,
  getMonthlyStats,
  STATS_FILE,
};
