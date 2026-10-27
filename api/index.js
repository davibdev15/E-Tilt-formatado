import { createClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import {
  tournamentSchema,
  teamSchema,
  resultSchema,
  idSchema,
  registrationSchema,
  reviewSchema,
} from '../server/validation.js';
import { buildStatsBundle, leaderboard } from '../server/stats.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const check = ({ data, error }) => {
  if (error) {
    const denied = error.code === '42501',
      missing = error.code === 'PGRST116';
    throw new HttpError(
      denied ? 403 : missing ? 404 : 400,
      errorMessages[error.message] ||
        (denied
          ? 'Você não tem permissão para esta operação.'
          : 'Não foi possível concluir a operação. Confira os dados e o estado do campeonato.'),
    );
  }
  return data;
};
const errorMessages = {
  registration_closed: 'As inscrições estão encerradas.',
  tournament_full: 'O campeonato está sem vagas.',
  game_mismatch: 'O jogo do time deve ser o mesmo do campeonato.',
  result_already_recorded: 'Este resultado já foi registrado e está bloqueado para edição.',
  match_not_ready: 'Os dois times ainda não foram definidos.',
  review_pending_registrations: 'Revise todas as inscrições antes de gerar a chave.',
  approved_count_must_be_power_of_two: 'Aprove 2, 4, 8, 16 ou 32 equipes para gerar a chave.',
  registrations_exist: 'O regulamento não pode ser alterado após receber inscrições.',
  bracket_already_started: 'O chaveamento já foi iniciado.',
  kills_deaths_mismatch: 'Os abates de um time devem corresponder às mortes do adversário.',
  invalid_round_score: 'Confira o placar e o vencedor de cada mapa.',
  invalid_lol_totals: 'Confira abates, mortes e assistências das equipes.',
  series_not_decided: 'É preciso registrar todos os mapas até uma equipe vencer a MD3.',
};
function config() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new HttpError(503, 'Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY na Vercel.');
  if (key.startsWith('sb_secret_'))
    throw new HttpError(
      503,
      'A configuração exige uma chave publishable, nunca uma chave secreta.',
    );
  if (key.split('.').length === 3) {
    try {
      if (JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role !== 'anon')
        throw new Error();
    } catch {
      throw new HttpError(503, 'Use uma publishable key ou a anon key do Supabase.');
    }
  }
  return { url, key };
}
async function body(req) {
  if (req.body !== undefined) {
    const value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (Buffer.byteLength(JSON.stringify(value)) > 200000)
      throw new HttpError(413, 'Requisição muito grande.');
    return value;
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > 200000) throw new HttpError(413, 'Requisição muito grande.');
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}
async function loadBundle(db, id) {
  const t = check(await db.from('tournaments').select('*').eq('id', id).single());
  const [r, m, mp, s, registrations] = await Promise.all([
    db.from('tournament_rosters').select('*').eq('tournament_id', id).limit(160),
    db
      .from('matches')
      .select('*')
      .eq('tournament_id', id)
      .order('round')
      .order('position')
      .limit(31),
    db.from('match_maps').select('*').eq('tournament_id', id).limit(93),
    db.from('player_map_stats').select('*').eq('tournament_id', id).limit(930),
    db
      .from('registrations')
      .select('team_id')
      .eq('tournament_id', id)
      .eq('status', 'approved')
      .limit(32),
  ]);
  const approved = new Set(check(registrations).map((r) => r.team_id));
  const rosters = check(r).filter((r) => approved.has(r.team_id)),
    ids = [...new Set(rosters.map((x) => x.team_id))];
  const teams = ids.length
    ? check(await db.from('teams').select('id,name,tag,color').in('id', ids))
    : [];
  return buildStatsBundle(t, teams, rosters, check(m), check(mp), check(s));
}
export function createHandler(makeClient = createClient) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url, 'https://etilt.invalid'),
        parts = String(
          req.query?.route ||
            url.searchParams.get('route') ||
            url.pathname.replace(/^\/api\/?/, ''),
        )
          .split('/')
          .filter(Boolean);
      const method = req.method || 'GET',
        isWrite = !['GET', 'HEAD'].includes(method);
      if (isWrite && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)
        throw new HttpError(403, 'Origem não autorizada.');
      if (isWrite && !String(req.headers['content-type'] || '').includes('application/json'))
        throw new HttpError(415, 'Envie application/json.');
      const cfg = config();
      if (method === 'GET' && parts[0] === 'config')
        return res.status(200).json({ supabaseUrl: cfg.url, supabasePublishableKey: cfg.key });
      const authorization = req.headers.authorization || '';
      if (authorization && !/^Bearer [^\s]+$/.test(authorization))
        throw new HttpError(401, 'Sessão inválida.');
      const db = makeClient(cfg.url, cfg.key, {
        global: { headers: authorization ? { Authorization: authorization } : {} },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      let user = null;
      if (authorization) {
        const result = await db.auth.getUser(authorization.slice(7));
        if (result.error || !result.data?.user)
          throw new HttpError(401, 'Entre novamente na sua conta.');
        user = result.data.user;
      }
      if (isWrite && !user) throw new HttpError(401, 'Entre na sua conta para continuar.');
      const requireUser = () => {
        if (!user) throw new HttpError(401, 'Entre na sua conta para continuar.');
      };
      if (method === 'GET' && parts[0] === 'health') {
        check(await db.from('tournaments').select('id').limit(1));
        return res.status(200).json({ status: 'ok', database: true });
      }
      if (method === 'GET' && parts[0] === 'me') {
        requireUser();
        const [teams, tournaments] = await Promise.all([
          db.from('teams').select('*,players(*)').eq('captain_id', user.id).order('created_at'),
          db.from('tournaments').select('*').eq('owner_id', user.id).order('created_at'),
        ]);
        return res
          .status(200)
          .json({
            user: { id: user.id, email: user.email },
            teams: check(teams),
            tournaments: check(tournaments),
          });
      }
      if (parts[0] === 'tournaments') {
        if (parts.length === 1 && method === 'GET') {
          let q = db
            .from('tournaments')
            .select(
              'id,name,description,game,level,starts_at,registration_closes_at,max_teams,prize_cents,status,published',
            )
            .eq('published', true)
            .order('starts_at')
            .limit(100);
          const game = url.searchParams.get('game');
          if (game && ['valorant', 'lol'].includes(game)) q = q.eq('game', game);
          return res.status(200).json(check(await q));
        }
        if (parts.length === 1 && method === 'POST') {
          const data = tournamentSchema.parse(await body(req));
          const id = check(await db.rpc('save_tournament', { p_data: data }));
          return res.status(201).json({ id });
        }
        const id = idSchema.parse(parts[1]);
        if (parts.length === 2 && method === 'GET')
          return res
            .status(200)
            .json(check(await db.from('tournaments').select('*').eq('id', id).single()));
        if (parts.length === 2 && method === 'PATCH') {
          const data = tournamentSchema.parse({ ...(await body(req)), id });
          return res
            .status(200)
            .json({ id: check(await db.rpc('save_tournament', { p_data: data })) });
        }
        if (['stats', 'leaderboard'].includes(parts[2]) && parts.length === 3 && method === 'GET') {
          const bundle = await loadBundle(db, id);
          return res.status(200).json(parts[2] === 'leaderboard' ? leaderboard(bundle) : bundle);
        }
        if (parts[2] === 'registrations' && parts.length === 3 && method === 'GET') {
          requireUser();
          return res
            .status(200)
            .json(
              check(
                await db
                  .from('registrations')
                  .select('*,teams(id,name,tag)')
                  .eq('tournament_id', id)
                  .order('created_at'),
              ),
            );
        }
        if (parts[2] === 'registrations' && parts.length === 3 && method === 'POST') {
          const data = registrationSchema.parse(await body(req));
          return res
            .status(201)
            .json({
              id: check(await db.rpc('register_team', { p_tournament: id, p_team: data.team_id })),
            });
        }
        if (parts[2] === 'bracket' && parts.length === 3 && method === 'POST') {
          check(await db.rpc('generate_bracket', { p_tournament: id }));
          return res.status(201).json({ ok: true });
        }
      }
      if (parts[0] === 'teams' && parts.length === 1 && method === 'POST') {
        const data = teamSchema.parse(await body(req));
        return res.status(201).json({ id: check(await db.rpc('create_team', { p_data: data })) });
      }
      if (parts[0] === 'registrations' && parts.length === 2 && method === 'PATCH') {
        const id = idSchema.parse(parts[1]),
          data = reviewSchema.parse(await body(req));
        check(await db.rpc('review_registration', { p_registration: id, p_status: data.status }));
        return res.status(200).json({ ok: true });
      }
      if (
        parts[0] === 'matches' &&
        parts.length === 3 &&
        parts[2] === 'result' &&
        method === 'POST'
      ) {
        const id = idSchema.parse(parts[1]),
          data = resultSchema.parse(await body(req));
        check(await db.rpc('submit_match_result', { p_match: id, p_maps: data.maps }));
        return res.status(200).json({ ok: true });
      }
      if (parts[0] === 'favorites') {
        requireUser();
        if (parts.length === 1 && method === 'GET')
          return res
            .status(200)
            .json(check(await db.from('favorites').select('tournament_id').eq('user_id', user.id)));
        if (parts.length === 2) {
          const id = idSchema.parse(parts[1]);
          if (method === 'POST') {
            check(
              await db
                .from('favorites')
                .upsert(
                  { user_id: user.id, tournament_id: id },
                  { onConflict: 'user_id,tournament_id', ignoreDuplicates: true },
                ),
            );
            return res.status(200).json({ ok: true });
          }
          if (method === 'DELETE') {
            check(
              await db.from('favorites').delete().eq('user_id', user.id).eq('tournament_id', id),
            );
            return res.status(200).json({ ok: true });
          }
        }
      }
      throw new HttpError(404, 'Rota não encontrada.');
    } catch (error) {
      if (error instanceof ZodError)
        return res
          .status(400)
          .json({
            error: 'Confira os campos enviados.',
            fields: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          });
      if (error instanceof SyntaxError) return res.status(400).json({ error: 'JSON inválido.' });
      if (error instanceof HttpError)
        return res.status(error.status).json({ error: error.message });
      console.error('E-Tilt API:', error?.name || 'Error');
      return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
    }
  };
}
export default createHandler();
