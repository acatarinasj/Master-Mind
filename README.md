# Master-Mind — Quiz da Wikipédia

Jogo de quiz diário: todos os dias há 20 perguntas diferentes, geradas
automaticamente a partir de artigos aleatórios da Wikipédia (em português),
cada uma com 4 hipóteses de resposta. Cada resposta certa vale 1 ponto.

## Como funciona

- `GET /api/quiz/today` gera (na primeira vez em cada dia) ou devolve do
  cache as 20 perguntas do dia, guardadas em `data/questions/AAAA-MM-DD.json`.
  Todos os jogadores recebem as mesmas 20 perguntas nesse dia.
- Cada pergunta mostra um excerto do resumo de um artigo da Wikipédia (com o
  título escondido) e pede para escolher o título certo entre 4 opções.
- `POST /api/quiz/submit` regista o resultado do jogo (pontos/total) em
  `data/stats.json`.
- `GET /api/stats` devolve as estatísticas agregadas por mês (jogos, pontos
  totais, melhor resultado, média de acerto), usadas na área "Estatísticas".

## Instalar e correr

```bash
npm install
npm start
```

Depois abrir `http://localhost:3000`.

> Nota: o servidor precisa de acesso à internet para contactar a Wikipédia
> (`https://pt.wikipedia.org`). Se não houver rede disponível, a aba "Jogar"
> mostra uma mensagem de erro e permite tentar novamente.

## Dados guardados

- `data/stats.json` — estatísticas por dia (jogos, pontos, melhor resultado),
  usadas para calcular as estatísticas mensais.
- `data/questions/AAAA-MM-DD.json` — cache das 20 perguntas geradas nesse dia.

Ambos os ficheiros são criados automaticamente e não estão versionados no
git (ver `.gitignore`).
