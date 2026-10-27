begin;
create schema if not exists private;

create table public.tournaments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null check(length(name) between 3 and 100), game text not null check(game in ('valorant','lol')),
 level text not null default 'Amador' check(level in ('Amador','Semi-pro')),
 description text not null default '' check(length(description)<=5000),
 starts_at timestamptz not null, registration_closes_at timestamptz not null,
 max_teams integer not null default 8 check(max_teams in (2,4,8,16,32)),
 prize_cents bigint not null default 0 check(prize_cents between 0 and 1000000000),
 published boolean not null default false,
 status text not null default 'registration' check(status in ('registration','ongoing','completed')),
 created_at timestamptz not null default now(), check(registration_closes_at<=starts_at)
);
create index tournaments_owner_idx on public.tournaments(owner_id);
create index tournaments_catalog_idx on public.tournaments(published,starts_at);
create table public.teams (
 id uuid primary key default gen_random_uuid(), captain_id uuid not null references auth.users(id),
 name text not null check(length(name) between 2 and 60), tag text not null check(length(tag) between 2 and 5),
 game text not null check(game in ('valorant','lol')),
 color text not null default '#b79af4' check(color ~ '^#[0-9a-fA-F]{6}$'), created_at timestamptz not null default now()
);
create index teams_captain_idx on public.teams(captain_id);
create table public.players (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id),
 nickname text not null check(length(nickname) between 2 and 32), role text not null check(length(role) between 1 and 40),
 unique(team_id,nickname), unique(team_id,id)
);
create table public.registrations (
 id uuid primary key default gen_random_uuid(), tournament_id uuid not null references public.tournaments(id),
 team_id uuid not null references public.teams(id), status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), unique(tournament_id,team_id)
);
create table public.tournament_rosters (
 tournament_id uuid not null, team_id uuid not null, player_id uuid not null,
 nickname text not null, role text not null,
 primary key(tournament_id,player_id), unique(tournament_id,team_id,player_id),
 foreign key(tournament_id,team_id) references public.registrations(tournament_id,team_id),
 foreign key(team_id,player_id) references public.players(team_id,id)
);
create table public.matches (
 id uuid primary key default gen_random_uuid(), tournament_id uuid not null references public.tournaments(id),
 round integer not null check(round between 1 and 5), position integer not null check(position between 1 and 16),
 team_a uuid, team_b uuid, winner_id uuid, score_a integer not null default 0 check(score_a between 0 and 2),
 score_b integer not null default 0 check(score_b between 0 and 2), status text not null default 'scheduled' check(status in ('scheduled','completed')),
 next_match_id uuid references public.matches(id), next_slot text check(next_slot in ('a','b')),
 completed_at timestamptz, unique(tournament_id,round,position), unique(tournament_id,id),
 foreign key(tournament_id,team_a) references public.registrations(tournament_id,team_id),
 foreign key(tournament_id,team_b) references public.registrations(tournament_id,team_id),
 check(team_a is null or team_b is null or team_a<>team_b),
 check(winner_id is null or winner_id=team_a or winner_id=team_b),
 check(status<>'completed' or (winner_id is not null and greatest(score_a,score_b)=2 and least(score_a,score_b)<2))
);
create table public.match_maps (
 id uuid primary key default gen_random_uuid(), tournament_id uuid not null, match_id uuid not null,
 map_index integer not null check(map_index between 0 and 2), name text not null check(length(name) between 1 and 50),
 winner_id uuid not null references public.teams(id), score_a integer not null check(score_a between 0 and 100),
 score_b integer not null check(score_b between 0 and 100), rounds integer not null default 0 check(rounds between 0 and 200),
 duration_seconds integer not null check(duration_seconds between 60 and 14400), unique(match_id,map_index),unique(tournament_id,id),
 foreign key(tournament_id,match_id) references public.matches(tournament_id,id)
);
create index match_maps_match_idx on public.match_maps(match_id);
create table public.player_map_stats (
 map_id uuid not null, tournament_id uuid not null, team_id uuid not null, player_id uuid not null,
 agent text not null check(length(agent) between 1 and 40), kills integer not null check(kills between 0 and 200),
 deaths integer not null check(deaths between 0 and 200), assists integer not null check(assists between 0 and 300),
 damage integer not null check(damage between 0 and 1000000), acs numeric not null default 0 check(acs between 0 and 1500),
 headshot_pct numeric not null default 0 check(headshot_pct between 0 and 100),
 kast_rounds integer not null default 0 check(kast_rounds between 0 and 200), first_kills integer not null default 0 check(first_kills between 0 and 100),
 cs integer not null default 0 check(cs between 0 and 2000), gold integer not null default 0 check(gold between 0 and 100000),
 primary key(map_id,player_id),
 foreign key(tournament_id,map_id) references public.match_maps(tournament_id,id),
 foreign key(tournament_id,team_id,player_id) references public.tournament_rosters(tournament_id,team_id,player_id)
);
create index stats_tournament_idx on public.player_map_stats(tournament_id,player_id);
create table public.favorites (
 user_id uuid not null references auth.users(id) on delete cascade,
 tournament_id uuid not null references public.tournaments(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(user_id,tournament_id)
);

-- Helpers are not exposed as Data API RPCs. Definers avoid recursive RLS.
create function private.owns_tournament(tid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tournaments where id=tid and owner_id=auth.uid()); $$;
create function private.reads_tournament(tid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tournaments where id=tid and (published or owner_id=auth.uid())); $$;
create function private.owns_team(tid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teams where id=tid and captain_id=auth.uid()); $$;
revoke all on all functions in schema private from public;
grant usage on schema private to anon,authenticated;
grant execute on all functions in schema private to anon,authenticated;

alter table public.tournaments enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.registrations enable row level security;
alter table public.tournament_rosters enable row level security;
alter table public.matches enable row level security;
alter table public.match_maps enable row level security;
alter table public.player_map_stats enable row level security;
alter table public.favorites enable row level security;
create policy tournament_read on public.tournaments for select using(published or owner_id=auth.uid());
create policy team_read on public.teams for select using(true);
create policy player_read on public.players for select using(true);
create policy registration_read on public.registrations for select using(private.owns_tournament(tournament_id) or private.owns_team(team_id) or (status='approved' and private.reads_tournament(tournament_id)));
create policy roster_read on public.tournament_rosters for select using(private.owns_tournament(tournament_id) or private.owns_team(team_id) or (private.reads_tournament(tournament_id) and exists(select 1 from public.registrations r where r.tournament_id=tournament_rosters.tournament_id and r.team_id=tournament_rosters.team_id and r.status='approved')));
create policy match_read on public.matches for select using(private.reads_tournament(tournament_id));
create policy map_read on public.match_maps for select using(private.reads_tournament(tournament_id));
create policy stat_read on public.player_map_stats for select using(private.reads_tournament(tournament_id));
create policy favorite_read on public.favorites for select to authenticated using(user_id=auth.uid());
create policy favorite_insert on public.favorites for insert to authenticated with check(user_id=auth.uid() and private.reads_tournament(tournament_id));
create policy favorite_delete on public.favorites for delete to authenticated using(user_id=auth.uid());
-- No direct writes to competition data: changes go through authenticated atomic RPCs.
revoke all on public.tournaments,public.teams,public.players,public.registrations,public.tournament_rosters,public.matches,public.match_maps,public.player_map_stats,public.favorites from anon,authenticated;
grant select on public.tournaments,public.teams,public.players,public.registrations,public.tournament_rosters,public.matches,public.match_maps,public.player_map_stats to anon,authenticated;
grant select,insert,delete on public.favorites to authenticated;

create function public.save_tournament(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare tid uuid;begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 tid:=nullif(p_data->>'id','')::uuid;
 if tid is not null then
  perform 1 from public.tournaments where id=tid and owner_id=auth.uid() and status='registration' for update;
  if not found then raise exception 'not_owner_or_already_started' using errcode='42501';end if;
  -- Structural changes after registration would invalidate rosters/capacity.
  if exists(select 1 from public.registrations where tournament_id=tid) then raise exception 'registrations_exist';end if;
  update public.tournaments set name=p_data->>'name',description=coalesce(p_data->>'description',''),game=p_data->>'game',level=p_data->>'level',starts_at=(p_data->>'starts_at')::timestamptz,registration_closes_at=(p_data->>'registration_closes_at')::timestamptz,max_teams=(p_data->>'max_teams')::int,prize_cents=(p_data->>'prize_cents')::bigint,published=(p_data->>'published')::boolean where id=tid;
 else
  insert into public.tournaments(owner_id,name,description,game,level,starts_at,registration_closes_at,max_teams,prize_cents,published) values(auth.uid(),p_data->>'name',coalesce(p_data->>'description',''),p_data->>'game',p_data->>'level',(p_data->>'starts_at')::timestamptz,(p_data->>'registration_closes_at')::timestamptz,(p_data->>'max_teams')::int,(p_data->>'prize_cents')::bigint,(p_data->>'published')::boolean) returning id into tid;
 end if;return tid;
end;$$;
create function public.create_team(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare tid uuid;p jsonb;begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501';end if;
 if jsonb_typeof(p_data->'players')<>'array' or jsonb_array_length(p_data->'players')<>5 then raise exception 'exactly_five_players_required';end if;
 insert into public.teams(captain_id,name,tag,game,color) values(auth.uid(),p_data->>'name',p_data->>'tag',p_data->>'game',coalesce(p_data->>'color','#b79af4')) returning id into tid;
 for p in select * from jsonb_array_elements(p_data->'players') loop
  insert into public.players(team_id,nickname,role) values(tid,p->>'nickname',p->>'role');
 end loop;return tid;
end;$$;
create function public.register_team(p_tournament uuid,p_team uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.tournaments;tm public.teams;rid uuid;begin
 if not private.owns_team(p_team) then raise exception 'not_team_captain' using errcode='42501';end if;
 select * into t from public.tournaments where id=p_tournament for update;
 select * into tm from public.teams where id=p_team;
 if t.id is null or not t.published or t.status<>'registration' or now()>=t.registration_closes_at then raise exception 'registration_closed';end if;
 if tm.game<>t.game then raise exception 'game_mismatch';end if;
 if (select count(*) from public.players where team_id=p_team)<>5 then raise exception 'invalid_roster';end if;
 if (select count(*) from public.registrations where tournament_id=p_tournament and status in ('pending','approved'))>=t.max_teams then raise exception 'tournament_full';end if;
 insert into public.registrations(tournament_id,team_id) values(p_tournament,p_team) returning id into rid;
 insert into public.tournament_rosters(tournament_id,team_id,player_id,nickname,role) select p_tournament,p_team,id,nickname,role from public.players where team_id=p_team;
 return rid;
end;$$;
create function public.review_registration(p_registration uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare r public.registrations;begin
 select * into r from public.registrations where id=p_registration;
 if not private.owns_tournament(r.tournament_id) then raise exception 'not_organizer' using errcode='42501';end if;
 perform 1 from public.tournaments where id=r.tournament_id and status='registration' for update;
 if not found then raise exception 'bracket_already_started';end if;
 if p_status not in ('approved','rejected') or p_status is null then raise exception 'invalid_status';end if;
 if p_status='approved' and r.status<>'approved' and (select count(*) from public.registrations where tournament_id=r.tournament_id and status='approved') >= (select max_teams from public.tournaments where id=r.tournament_id) then raise exception 'tournament_full';end if;
 update public.registrations set status=p_status where id=p_registration;
end;$$;
create function public.generate_bracket(p_tournament uuid) returns void language plpgsql security definer set search_path='' as $$
declare seeds uuid[];n int;r int;pos int;rounds int;mid uuid;next_id uuid;begin
 if not private.owns_tournament(p_tournament) then raise exception 'not_organizer' using errcode='42501';end if;
 perform 1 from public.tournaments where id=p_tournament and status='registration' for update;
 if not found then raise exception 'bracket_already_started';end if;
 if exists(select 1 from public.registrations where tournament_id=p_tournament and status='pending') then raise exception 'review_pending_registrations';end if;
 select array_agg(team_id order by created_at,id) into seeds from public.registrations where tournament_id=p_tournament and status='approved';
 n:=coalesce(array_length(seeds,1),0);if n not in (2,4,8,16,32) then raise exception 'approved_count_must_be_power_of_two';end if;
 rounds:=round(log(2,n))::int;
 for r in reverse rounds..1 loop
  for pos in 1..(n/(2^r)::int) loop
   next_id:=null;
   if r<rounds then select id into next_id from public.matches where tournament_id=p_tournament and round=r+1 and position=(pos+1)/2;end if;
   insert into public.matches(tournament_id,round,position,team_a,team_b,next_match_id,next_slot) values(p_tournament,r,pos,case when r=1 then seeds[pos*2-1] end,case when r=1 then seeds[pos*2] end,next_id,case when next_id is not null then case when pos%2=1 then 'a' else 'b' end end);
  end loop;
 end loop;
 update public.tournaments set status='ongoing' where id=p_tournament;
end;$$;

-- Final results are append-only. No partial score can advance the bracket.
create function public.submit_match_result(p_match uuid,p_maps jsonb) returns void language plpgsql security definer set search_path='' as $$
declare m public.matches;g text;mp jsonb;s jsonb;mapid uuid;winner uuid;sa int:=0;sb int:=0;idx int:=0;ka int;kb int;da int;db int;begin
 select * into m from public.matches where id=p_match;
 if not private.owns_tournament(m.tournament_id) then raise exception 'not_organizer' using errcode='42501';end if;
 -- Serialize submissions in one tournament to prevent concurrent advancement conflicts.
 perform 1 from public.tournaments where id=m.tournament_id for update;
 select * into m from public.matches where id=p_match for update;
 select game into g from public.tournaments where id=m.tournament_id;
 if m.status='completed' then raise exception 'result_already_recorded';end if;
 if m.team_a is null or m.team_b is null then raise exception 'match_not_ready';end if;
 if jsonb_typeof(p_maps)<>'array' or jsonb_array_length(p_maps) not in (2,3) then raise exception 'invalid_best_of_three';end if;
 for mp in select * from jsonb_array_elements(p_maps) loop
  if sa=2 or sb=2 then raise exception 'series_already_decided';end if;
  winner:=(mp->>'winner_id')::uuid;
  if winner is null or winner not in (m.team_a,m.team_b) then raise exception 'invalid_map_winner';end if;
  if jsonb_typeof(mp->'players')<>'array' or jsonb_array_length(mp->'players')<>10 then raise exception 'ten_player_stats_required';end if;
  if g='valorant' and ((mp->>'rounds')::int<>((mp->>'score_a')::int+(mp->>'score_b')::int) or (mp->>'score_a')::int=(mp->>'score_b')::int or ((winner=m.team_a)<>((mp->>'score_a')::int>(mp->>'score_b')::int))) then raise exception 'invalid_round_score';end if;
  if g='lol' and (mp->>'rounds')::int<>0 then raise exception 'lol_has_no_rounds';end if;
  insert into public.match_maps(tournament_id,match_id,map_index,name,winner_id,score_a,score_b,rounds,duration_seconds) values(m.tournament_id,m.id,idx,mp->>'name',winner,(mp->>'score_a')::int,(mp->>'score_b')::int,(mp->>'rounds')::int,(mp->>'duration_seconds')::int) returning id into mapid;
  for s in select * from jsonb_array_elements(mp->'players') loop
   if (s->>'team_id') is null or (s->>'team_id')::uuid not in (m.team_a,m.team_b) then raise exception 'player_not_in_match';end if;
   if g='valorant' and ((s->>'kast_rounds')::int>(mp->>'rounds')::int or (s->>'deaths')::int>(mp->>'rounds')::int+5 or (s->>'first_kills')::int>(s->>'kills')::int) then raise exception 'invalid_round_stats';end if;
   insert into public.player_map_stats(map_id,tournament_id,team_id,player_id,agent,kills,deaths,assists,damage,acs,headshot_pct,kast_rounds,first_kills,cs,gold)
    values(mapid,m.tournament_id,(s->>'team_id')::uuid,(s->>'player_id')::uuid,s->>'agent',(s->>'kills')::int,(s->>'deaths')::int,(s->>'assists')::int,(s->>'damage')::int,coalesce((s->>'acs')::numeric,0),coalesce((s->>'headshot_pct')::numeric,0),coalesce((s->>'kast_rounds')::int,0),coalesce((s->>'first_kills')::int,0),coalesce((s->>'cs')::int,0),coalesce((s->>'gold')::int,0));
  end loop;
  if (select count(*) from public.player_map_stats where map_id=mapid and team_id=m.team_a)<>5 or (select count(*) from public.player_map_stats where map_id=mapid and team_id=m.team_b)<>5 then raise exception 'five_players_per_team_required';end if;
  select sum(kills),sum(deaths) into ka,da from public.player_map_stats where map_id=mapid and team_id=m.team_a;
  select sum(kills),sum(deaths) into kb,db from public.player_map_stats where map_id=mapid and team_id=m.team_b;
  -- Environmental deaths / executions may have no opposing player kill.
  if g='valorant' and (ka>db or kb>da) then raise exception 'kills_deaths_mismatch';end if;
  if g='lol' and (ka>db or kb>da or ka<>(mp->>'score_a')::int or kb<>(mp->>'score_b')::int or exists(select 1 from public.player_map_stats where map_id=mapid and kills+assists>case when team_id=m.team_a then ka else kb end)) then raise exception 'invalid_lol_totals';end if;
  if winner=m.team_a then sa:=sa+1;else sb:=sb+1;end if;idx:=idx+1;
 end loop;
 if greatest(sa,sb)<>2 then raise exception 'series_not_decided';end if;
 winner:=case when sa=2 then m.team_a else m.team_b end;
 update public.matches set score_a=sa,score_b=sb,winner_id=winner,status='completed',completed_at=now() where id=p_match;
 if m.next_match_id is null then update public.tournaments set status='completed' where id=m.tournament_id;
 elsif m.next_slot='a' then update public.matches set team_a=winner where id=m.next_match_id;
 else update public.matches set team_b=winner where id=m.next_match_id;end if;
end;$$;
revoke all on function public.save_tournament(jsonb),public.create_team(jsonb),public.register_team(uuid,uuid),public.review_registration(uuid,text),public.generate_bracket(uuid),public.submit_match_result(uuid,jsonb) from public,anon;
grant execute on function public.save_tournament(jsonb),public.create_team(jsonb),public.register_team(uuid,uuid),public.review_registration(uuid,text),public.generate_bracket(uuid),public.submit_match_result(uuid,jsonb) to authenticated;
commit;
