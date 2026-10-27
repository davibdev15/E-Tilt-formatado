# E-Tilt · Vercel + Supabase

Aplicação com front-end HTML/CSS/JS, API Node.js para Vercel, Supabase Auth e banco PostgreSQL com Row Level Security (RLS). Esta pasta é um projeto independente do Hupa e da demonstração hospedada no Sites.

## O que está implementado

- Cadastro, login, confirmação de e-mail, recuperação de senha e logout com Supabase Auth.
- Campeonatos publicados, busca por jogo/nome e favoritos por conta.
- Criação de campeonatos, rascunhos privados e edição antes da primeira inscrição.
- Cadastro de times com capitão e 5 jogadores. O capitão é a conta que criou o time.
- Inscrição com elenco fixado, revisão pelo organizador e controle de vagas.
- Chave de eliminação simples, MD3, com 2, 4, 8, 16 ou 32 equipes aprovadas.
- Registro de resultado completo por mapa e jogador; avanço automático e encerramento ao concluir a final.
- Leaderboard, confrontos, histórico individual, elenco e classificação por fase.
- Estatísticas de Valorant e LoL calculadas sobre os resultados registrados.

Nenhum campeonato ou jogador fictício é inserido automaticamente. O banco começa vazio. Os dados serão os cadastrados no painel.

## 1. Criar o banco no Supabase

Crie um **projeto novo para o E-Tilt**. Não aplique a migração em outro aplicativo existente.

1. Abra **SQL Editor** no painel do Supabase.
2. Cole o conteúdo inteiro de `supabase/migrations/202610270001_initial.sql` e execute **uma única vez**. A transação cria as tabelas, índices, funções e políticas.
3. Em **Project Settings → API / API Keys**, copie a URL e a **publishable key** (`sb_publishable_...`). A chave `anon` legada também é aceita.
4. Em **Authentication → Providers / Sign In**, habilite e-mail/senha e mantenha a confirmação de e-mail.
5. Em **Authentication → URL Configuration**, coloque o domínio final da Vercel em **Site URL** e adicione `https://SEU-DOMINIO/painel.html` em **Redirect URLs**. Para desenvolvimento, acrescente `http://127.0.0.1:4174/painel.html`.
6. Configure o envio de e-mails (SMTP) para cadastro e recuperação em produção. Os limites do provedor padrão do Supabase não são apropriados para distribuição ampla.
7. Configure a senha mínima para 12 caracteres no Auth. O formulário de criação segue esse mínimo.

Alternativa para quem usa a CLI: execute `npx supabase init`, `npx supabase login`, `npx supabase link --project-ref SEU_REF` e `npx supabase db push` nesta pasta. Use **SQL Editor ou CLI**, sem reaplicar a mesma migração pelos dois caminhos.

## 2. Configurar a Vercel

Suba **o conteúdo desta pasta** para um repositório próprio no GitHub e importe na Vercel.

| Configuração     | Valor                                                       |
| ---------------- | ----------------------------------------------------------- |
| Framework Preset | Other                                                       |
| Root Directory   | raiz deste projeto; se usar monorepo, `sites/e-tilt-vercel` |
| Node.js          | 22.x                                                        |
| Install Command  | `npm ci`                                                    |
| Build Command    | `npm run build`                                             |
| Output Directory | `public`                                                    |

O `vercel.json` já define build, diretório de saída, cabeçalhos e encaminhamento da API. Não configure um redirecionamento de todas as rotas para o HTML, pois isso impediria a API de funcionar.

Em **Settings → Environment Variables**, adicione em Production e Preview:

```dotenv
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE
```

Faça o deploy. Depois de cadastrar ou alterar as variáveis, faça **Redeploy**. Abra `/api/health`: o esperado é `{"status":"ok","database":true}`. Esse teste consulta uma tabela e confirma que o banco responde.

Não use `service_role`, `sb_secret_...` nem senha de banco neste projeto. A API usa a chave pública e o JWT do usuário; as permissões são aplicadas também no banco. `/api/config` expõe apenas a configuração pública necessária ao cliente Auth.

## 3. Rodar localmente

Requer Node.js 22.13+ (22.x é a versão configurada para a Vercel).

```sh
npm ci
```

Copie `.env.example` para `.env.local`, preencha as duas variáveis e rode:

```sh
npm run dev
```

Abra `http://127.0.0.1:4174`. Este servidor local executa a mesma função da API, além de servir os arquivos. Abrir o HTML diretamente não funciona nesta versão, pois há autenticação e chamadas à API.

## 4. Primeiro campeonato, do início ao fim

1. Abra `painel.html`, crie sua conta e confirme o e-mail.
2. Entre e crie um campeonato com datas futuras. Marque **Publicar no catálogo** para receber inscrições. Pode começar com 2 times para testar.
3. Cada capitão cria um time de 5 jogadores. Para um teste de fluxo, uma conta pode criar mais de um time.
4. O capitão abre o campeonato no catálogo, seleciona o time e solicita a inscrição.
5. No painel do organizador, clique **Gerenciar**. Aprove ou rejeite todas as inscrições pendentes.
6. Com 2, 4, 8, 16 ou 32 equipes aprovadas, clique **Gerar chave e iniciar**. As equipes são pareadas por ordem de inscrição aprovada; não há sorteio nem byes nesta versão.
7. Abra **Lançar resultado** em uma partida com os dois times definidos. Preencha os dois mapas; habilite o terceiro se houve 2–1. Informe os 10 jogadores em cada mapa.
8. Confira e salve. A transação grava o resultado inteiro e coloca o vencedor na partida seguinte. A final encerra o campeonato.
9. Abra as estatísticas pelo catálogo ou pelo painel. O botão **Atualizar resultados** busca os dados atuais.

Os registros concluídos são imutáveis pela aplicação. Correções de resultados exigem uma futura rotina de retificação transacional; não edite apenas um placar no SQL, pois mapas e fases seguintes dependem dele.

## Regras do banco

- Apenas o organizador da competição pode editar regulamento, revisar inscrição, gerar a chave ou registrar resultado.
- Apenas o capitão do time pode inscrevê-lo. Jogo, prazo e capacidade são conferidos no banco.
- O elenco é copiado para `tournament_rosters` ao se inscrever. As estatísticas só aceitam jogadores desse elenco, nas equipes daquela partida.
- Alterações no regulamento são bloqueadas após a primeira inscrição; a chave bloqueia novas inscrições e revisões.
- Inscrições rejeitadas não podem ser aprovadas além da capacidade. Há bloqueio transacional para concorrência.
- A série deve terminar em 2–0 ou 2–1. Mapas depois do segundo triunfo são recusados.
- Para Valorant, o placar e os rounds precisam concordar; abates não podem superar as mortes adversárias. Mortes ambientais são permitidas. O banco não impõe o regulamento oficial de overtime: os valores são informados pelo organizador.
- Para LoL, os abates do placar devem corresponder aos abates dos jogadores; execuções sem abate adversário são permitidas e a participação em abates não supera 100%.
- Rascunhos de campeonato e favoritos são privados. Times e nicknames são públicos; e-mails de login ficam no Auth e não são expostos no catálogo.
- Não há permissão de escrita direta nas tabelas de competição para `anon` ou `authenticated`. As alterações passam por funções atômicas autenticadas. Favoritos usam RLS por usuário.

## Estatísticas

Valorant: K/D/A total; K/D; ACS médio; dano por round ponderado pelos rounds; headshots médios; KAST calculado a partir dos rounds KAST informados; primeiros abates armazenados por mapa.

LoL: K/D/A total; KDA; CS/min ponderado pelos minutos; ouro médio; dano médio a campeões; participação média em abates.

As estatísticas são **informadas manualmente**, sem conexão com a Riot. Não há validação de identidade Riot, importação de partidas, atualização automática ao vivo, pagamentos, chat, upload de comprovantes, suplentes, edição de elenco, desclassificações ou rotina de retificação nesta entrega. Cada jogador é um registro de nickname no elenco do capitão, não uma conta autenticada independente.

## Testes

```sh
npm test
npm run build
```

Os testes executam a migração SQL e as funções em PostgreSQL embarcado (PGlite), com usuários e papéis de teste. Cobrem autorização, privacidade de rascunhos/favoritos, validação de dados, rollback e avanço da chave, além da API e dos cálculos de estatísticas. Eles não substituem a conferência de configuração no projeto Supabase e no deploy Vercel reais.

## Estrutura

```text
api/index.js                        API única em função Node.js da Vercel
server/validation.js                Validação dos payloads
server/stats.js                     Agregação das estatísticas
public/                             Site, autenticação e painel
scripts/                            Build e servidor de desenvolvimento
supabase/migrations/                Migração completa e regras de acesso
tests/                              Testes de banco, API, UI e cálculos
vercel.json                         Configuração da hospedagem
.env.example                        Variáveis necessárias (sem credenciais)
```

Documentação usada: [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Auth getUser](https://supabase.com/docs/reference/javascript/auth-getuser) e [migrações do Supabase](https://supabase.com/docs/guides/local-development/database-migrations).
