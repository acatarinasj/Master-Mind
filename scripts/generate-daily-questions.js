'use strict';

const fs = require('fs');
const path = require('path');
const { generateDailyQuestions } = require('../lib/wikipedia');

const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'data', 'questions');

async function main() {
  const dateStr = new Date().toISOString().slice(0, 10);
  const outFile = path.join(OUTPUT_DIR, `${dateStr}.json`);

  if (fs.existsSync(outFile)) {
    console.log(`Perguntas de ${dateStr} já existem, nada a fazer.`);
    return;
  }

  console.log(`A gerar perguntas para ${dateStr}...`);
  const questions = await generateDailyQuestions(dateStr);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(questions, null, 2), 'utf-8');
  console.log(`Guardadas ${questions.length} perguntas em ${outFile}`);
}

main().catch((err) => {
  console.error('Falha ao gerar perguntas diárias:', err);
  process.exit(1);
});
