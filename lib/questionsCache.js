'use strict';

const fs = require('fs');
const path = require('path');
const { generateDailyQuestions } = require('./wikipedia');

const QUESTIONS_DIR = path.join(__dirname, '..', 'data', 'questions');

function ensureDir() {
  fs.mkdirSync(QUESTIONS_DIR, { recursive: true });
}

function cacheFilePath(dateStr) {
  return path.join(QUESTIONS_DIR, `${dateStr}.json`);
}

async function getOrCreateDailyQuestions(dateStr) {
  ensureDir();
  const file = cacheFilePath(dateStr);

  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  }

  const questions = await generateDailyQuestions(dateStr);
  fs.writeFileSync(file, JSON.stringify(questions, null, 2), 'utf-8');
  return questions;
}

module.exports = { getOrCreateDailyQuestions };
