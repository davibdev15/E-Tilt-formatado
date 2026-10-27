# API do E-Tilt

Base: `/api` no mesmo domínio do site. Respostas em JSON, sem cache de dados privados.

Para operações autenticadas: `Authorization: Bearer ACCESS_TOKEN_DO_SUPABASE`. O servidor verifica a sessão com Supabase Auth. Requisições de escrita exigem `Content-Type: application/json`. O front-end usa `ET.api()` em `public/backend.js` para enviar o token renovado pelo cliente Auth.

| Método | Rota                             | Acesso / finalidade                                                          |
| ------ | -------------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/config`                        | Público: URL e chave pública do cliente Auth                                 |
| GET    | `/health`                        | Público: verifica configuração e leitura do banco                            |
| GET    | `/tournaments?game=valorant`     | Público: até 100 campeonatos publicados, ordenados por início                |
| GET    | `/tournaments/:id`               | Público se publicado; organizador vê seu rascunho                            |
| POST   | `/tournaments`                   | Usuário autenticado: cria campeonato próprio                                 |
| PATCH  | `/tournaments/:id`               | Organizador: atualiza todos os campos editáveis antes de receber inscrições  |
| GET    | `/tournaments/:id/stats`         | Dados de times, jogadores, séries, mapas e estatísticas da competição        |
| GET    | `/tournaments/:id/leaderboard`   | Métricas agregadas por participante; ordem por ACS (Valorant) ou KDA (LoL)   |
| GET    | `/me`                            | Conta atual, seus times/elencos e campeonatos próprios                       |
| POST   | `/teams`                         | Cria time com a conta atual como capitão e exatamente 5 titulares            |
| GET    | `/tournaments/:id/registrations` | Organizador vê todas; capitão vê as próprias e inscrições aprovadas públicas |
| POST   | `/tournaments/:id/registrations` | Capitão: solicita inscrição do seu time                                      |
| PATCH  | `/registrations/:id`             | Organizador: aprova/rejeita antes da chave                                   |
| POST   | `/tournaments/:id/bracket`       | Organizador: inicia a chave transacionalmente                                |
| POST   | `/matches/:id/result`            | Organizador: registra série completa e avança vencedor                       |
| GET    | `/favorites`                     | Favoritos da conta atual                                                     |
| POST   | `/favorites/:tournament_id`      | Adiciona favorito de forma idempotente                                       |
| DELETE | `/favorites/:tournament_id`      | Remove favorito                                                              |

## Criar / editar campeonato

`prize_cents` é inteiro em centavos. Datas usam ISO 8601 com fuso. No PATCH, envie todos os campos abaixo; o ID vem da URL. `owner_id`, `status` e outros campos internos não são aceitos no payload.

```json
{
  "name": "E-Tilt Open",
  "description": "Regulamento e informações do campeonato.",
  "game": "valorant",
  "level": "Amador",
  "starts_at": "2030-11-15T14:00:00-03:00",
  "registration_closes_at": "2030-11-14T23:00:00-03:00",
  "max_teams": 8,
  "prize_cents": 250000,
  "published": true
}
```

Resposta: `{"id":"UUID"}`. O estado inicial é `registration`; passa a `ongoing` ao gerar a chave e a `completed` na final.

## Criar time

```json
{
  "name": "Nebula",
  "tag": "NBL",
  "game": "valorant",
  "color": "#b79af4",
  "players": [
    { "nickname": "nyx", "role": "Duelista" },
    { "nickname": "kairo", "role": "Iniciador" },
    { "nickname": "lumi", "role": "Controlador" },
    { "nickname": "vex", "role": "Sentinela" },
    { "nickname": "atlas", "role": "Iniciador" }
  ]
}
```

Resposta: `{"id":"UUID"}`. O elenco cadastrado pode ser consultado em `/me`. Para inscrever: `{"team_id":"UUID_DO_TIME"}`. Para revisar: `{"status":"approved"}` ou `{"status":"rejected"}`. Para gerar chave, envie `{}`.

## Registrar resultado

Envie `{"maps":[MAPA_1,MAPA_2]}` para 2–0 ou três mapas para 2–1. Cada mapa precisa de exatamente 10 registros únicos de jogador: 5 de cada time. Os IDs são retornados em `/tournaments/:id/stats` após as aprovações. O painel já constrói esse formulário; não é necessário escrever JSON à mão.

Estrutura de **um mapa** (o array `players` abaixo mostra apenas um registro como referência; o payload final exige os dez):

```json
{
  "name": "Ascent",
  "winner_id": "UUID_DO_TIME_VENCEDOR",
  "score_a": 13,
  "score_b": 8,
  "rounds": 21,
  "duration_seconds": 2100,
  "players": [
    {
      "player_id": "UUID_DO_JOGADOR",
      "team_id": "UUID_DO_TIME",
      "agent": "Jett",
      "kills": 20,
      "deaths": 15,
      "assists": 4,
      "damage": 3150,
      "acs": 240.5,
      "headshot_pct": 28.3,
      "kast_rounds": 16,
      "first_kills": 3,
      "cs": 0,
      "gold": 0
    }
  ]
}
```

No LoL: `rounds: 0`, `score_a/score_b` contêm abates por equipe, `agent` contém o campeão, `damage` é dano a campeões e `cs/gold` são farm e ouro. Os campos exclusivos de Valorant podem ser omitidos (assumem zero). O vencedor no LoL é informado independentemente do número de abates.

Não há atualizações parciais. As funções SQL desfazem todos os mapas se um registro falhar. Reenvio de série já concluída retorna erro sem duplicar estatísticas. Não há endpoint de exclusão/retificação de resultados.

## Erros

`{"error":"Mensagem"}`; erros de validação também incluem `fields` com caminho e motivo. Status: `400` dados/estado inválidos, `401` sessão ausente/inválida, `403` sem permissão, `404` recurso/rota não encontrado, `413` payload acima de 200 KB, `415` Content-Type incorreto, `503` ambiente incompleto, `500` erro interno sem detalhes do banco.

As regras também são aplicadas nas funções SQL e no RLS; chamar o Supabase diretamente não concede permissão extra.
