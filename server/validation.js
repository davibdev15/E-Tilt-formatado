import { z } from 'zod';
const uuid = z.string().uuid(),
  integer = (max) => z.number().int().min(0).max(max);
export const tournamentSchema = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(3).max(100),
    description: z.string().max(5000).default(''),
    game: z.enum(['valorant', 'lol']),
    level: z.enum(['Amador', 'Semi-pro']),
    starts_at: z.iso.datetime({ offset: true }),
    registration_closes_at: z.iso.datetime({ offset: true }),
    max_teams: z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16), z.literal(32)]),
    prize_cents: integer(1000000000),
    published: z.boolean(),
  })
  .strict()
  .refine((t) => Date.parse(t.registration_closes_at) <= Date.parse(t.starts_at), {
    message: 'As inscrições devem encerrar antes do início.',
  });
export const teamSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    tag: z.string().trim().min(2).max(5),
    game: z.enum(['valorant', 'lol']),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    players: z
      .array(
        z
          .object({
            nickname: z.string().trim().min(2).max(32),
            role: z.string().trim().min(1).max(40),
          })
          .strict(),
      )
      .length(5),
  })
  .strict()
  .refine((t) => new Set(t.players.map((p) => p.nickname)).size === 5, {
    message: 'Os cinco nicknames devem ser diferentes.',
  });
export const playerStatSchema = z
  .object({
    player_id: uuid,
    team_id: uuid,
    agent: z.string().trim().min(1).max(40),
    kills: integer(200),
    deaths: integer(200),
    assists: integer(300),
    damage: integer(1000000),
    acs: z.number().min(0).max(1500).default(0),
    headshot_pct: z.number().min(0).max(100).default(0),
    kast_rounds: integer(200).default(0),
    first_kills: integer(100).default(0),
    cs: integer(2000).default(0),
    gold: integer(100000).default(0),
  })
  .strict();
export const resultSchema = z
  .object({
    maps: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(50),
            winner_id: uuid,
            score_a: integer(100),
            score_b: integer(100),
            rounds: integer(200),
            duration_seconds: z.number().int().min(60).max(14400),
            players: z.array(playerStatSchema).length(10),
          })
          .strict(),
      )
      .min(2)
      .max(3),
  })
  .strict();
export const idSchema = uuid;
export const registrationSchema = z.object({ team_id: uuid }).strict();
export const reviewSchema = z.object({ status: z.enum(['approved', 'rejected']) }).strict();
