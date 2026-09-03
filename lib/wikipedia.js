'use strict';

const WIKI_LANG = process.env.WIKI_LANG || 'pt';
const RANDOM_SUMMARY_URL = `https://${WIKI_LANG}.wikipedia.org/api/rest_v1/page/random/summary`;
const USER_AGENT = 'MasterMindWikiQuiz/1.0 (educational quiz app)';

const QUESTIONS_PER_DAY = 20;
const OPTIONS_PER_QUESTION = 4;
const MIN_EXTRACT_LENGTH = 80;
const POOL_SIZE = QUESTIONS_PER_DAY + 15; // extra articles used as distractors
const MAX_FETCH_ATTEMPTS = 200;
const FETCH_BATCH_SIZE = 8;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Simple seeded PRNG (mulberry32) so shuffling/picking is reproducible for a given date.
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

function shuffle(array, rng = Math.random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function fetchRandomSummary() {
  const res = await fetch(RANDOM_SUMMARY_URL, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return res.json();
}

function isUsableArticle(article) {
  if (!article || !article.title || !article.extract) return false;
  if (article.type && article.type !== 'standard') return false;
  if (article.extract.length < MIN_EXTRACT_LENGTH) return false;
  if (/^\d+$/.test(article.title.trim())) return false;
  return true;
}

// Builds a quiz clue from an article's extract, hiding the title so it isn't a giveaway.
function buildClue(extract, title) {
  let clue = extract.replace(/\s+/g, ' ').trim();

  const titleRegex = new RegExp(escapeRegExp(title), 'gi');
  clue = clue.replace(titleRegex, 'Este/Esta elemento');

  const firstWord = title.split(/\s+/)[0];
  if (firstWord && firstWord.length > 2) {
    const firstWordRegex = new RegExp(`\\b${escapeRegExp(firstWord)}\\b`, 'gi');
    clue = clue.replace(firstWordRegex, 'Este/Esta elemento');
  }

  const maxLength = 320;
  if (clue.length > maxLength) {
    const truncated = clue.slice(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    clue = lastPeriod > 60 ? truncated.slice(0, lastPeriod + 1) : `${truncated.trim()}…`;
  }

  return clue;
}

async function buildArticlePool(poolSize = POOL_SIZE) {
  const pool = [];
  const seenTitles = new Set();
  let attempts = 0;

  while (pool.length < poolSize && attempts < MAX_FETCH_ATTEMPTS) {
    const batchSize = Math.min(FETCH_BATCH_SIZE, poolSize - pool.length);
    const batch = await Promise.allSettled(
      Array.from({ length: batchSize }, () => fetchRandomSummary())
    );
    attempts += batchSize;

    for (const outcome of batch) {
      if (outcome.status !== 'fulfilled') continue;
      const article = outcome.value;
      if (!isUsableArticle(article)) continue;
      if (seenTitles.has(article.title)) continue;
      seenTitles.add(article.title);
      pool.push({ title: article.title, extract: article.extract });
    }
  }

  return pool;
}

async function generateDailyQuestions(dateStr, count = QUESTIONS_PER_DAY) {
  const pool = await buildArticlePool(count + 15);
  if (pool.length < count) {
    throw new Error(
      `Não foi possível obter artigos suficientes da Wikipédia (${pool.length}/${count}).`
    );
  }

  const rng = createSeededRandom(dateStr);
  const shuffledPool = shuffle(pool, rng);
  const chosen = shuffledPool.slice(0, count);

  return chosen.map((correct, index) => {
    const distractorPool = shuffledPool.filter((article) => article.title !== correct.title);
    const distractors = shuffle(distractorPool, rng)
      .slice(0, OPTIONS_PER_QUESTION - 1)
      .map((article) => article.title);

    const options = shuffle([correct.title, ...distractors], rng);

    return {
      id: index + 1,
      clue: buildClue(correct.extract, correct.title),
      options,
      correctAnswer: correct.title,
    };
  });
}

module.exports = {
  generateDailyQuestions,
  buildClue,
  shuffle,
  createSeededRandom,
  QUESTIONS_PER_DAY,
};
