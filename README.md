# Master-Mind — Quiz da Wikipédia

Jogo de quiz diário: todos os dias há 20 perguntas diferentes, geradas
automaticamente a partir de artigos aleatórios da Wikipédia (em português),
cada uma com 4 hipóteses de resposta. Cada resposta certa vale 1 ponto.

Este repositório tem duas variantes da mesma app:

- **`docs/`** — versão estática, publicada automaticamente no **GitHub Pages**.
- **`server.js` + `public/`** — versão com backend Node/Express, para quem
  preferir correr a app localmente ou num servidor próprio, com estatísticas
  partilhadas entre todos os jogadores.

## Versão publicada (GitHub Pages)

- As perguntas de cada dia são geradas por uma GitHub Action agendada
  (`.github/workflows/generate-daily-quiz.yml`), que corre `scripts/generate-daily-questions.js`
  e grava o resultado em `docs/data/questions/AAAA-MM-DD.json`. Todos os
  visitantes do site nesse dia veem as mesmas 20 perguntas.
- Outra Action (`.github/workflows/deploy-pages.yml`) publica a pasta `docs/`
  no GitHub Pages sempre que há alterações.
- Como o GitHub Pages é estático (sem servidor), as estatísticas são
  guardadas em **JSON no `localStorage` do navegador** de cada jogador, com
  botões para descarregar/importar esse ficheiro `.json` manualmente na aba
  "Estatísticas".
- Se ainda não existir ficheiro de perguntas para o dia (por exemplo, antes
  da primeira execução da Action), a página gera as perguntas diretamente no
  browser, chamando a API pública da Wikipédia.

## Versão com backend (self-hosted)

- `GET /api/quiz/today` gera (na primeira vez em cada dia) ou devolve do
  cache as 20 perguntas do dia, guardadas em `data/questions/AAAA-MM-DD.json`.
  Todos os jogadores recebem as mesmas 20 perguntas nesse dia.
- `POST /api/quiz/submit` regista o resultado do jogo (pontos/total) em
  `data/stats.json`.
- `GET /api/stats` devolve as estatísticas agregadas por mês (jogos, pontos
  totais, melhor resultado, média de acerto), partilhadas por todos os que
  usarem este servidor.

### Instalar e correr

```bash
npm install
npm start
```

Depois abrir `http://localhost:3000`.

> Nota: tanto o servidor como a Action de geração diária precisam de acesso
> à internet para contactar a Wikipédia (`https://pt.wikipedia.org`).

### Dados guardados

- `data/stats.json` — estatísticas por dia (jogos, pontos, melhor resultado).
- `data/questions/AAAA-MM-DD.json` — cache das 20 perguntas geradas nesse dia.

Ambos os ficheiros são criados automaticamente e não estão versionados no
git (ver `.gitignore`).
