-- =====================================================================
-- Idea Exchange: initial schema
-- Paste this whole file into Supabase -> SQL Editor -> Run (once).
-- It creates tables, security policies (RLS), RPC functions, storage rules.
-- =====================================================================

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
do $$ begin
  create type audience_type as enum ('uae_national', 'uae_resident', 'international');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('participant', 'evaluator', 'admin', 'stakeholder');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  country     text not null default '',
  audience    audience_type not null default 'international',
  role        user_role not null default 'participant',
  language    text not null default 'en',
  created_at  timestamptz not null default now()
);

create table if not exists rubrics (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  version        int  not null default 1,
  -- [{ "key": "impact", "label": "Impact", "weight": 0.30, "source": "llm"|"embedding", "description": "..." }]
  criteria       jsonb not null,
  prompt_version text not null default 'v1',
  created_at     timestamptz not null default now(),
  unique (name, version)
);

create table if not exists challenges (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  description     text not null,
  status          text not null default 'draft'
                  check (status in ('draft', 'open', 'closed', 'judging', 'published')),
  opens_at        timestamptz not null default now(),
  closes_at       timestamptz not null,
  prize_amount    numeric,
  prize_currency  text default 'AED',
  rubric_id       uuid not null references rubrics (id),
  created_at      timestamptz not null default now()
);

create sequence if not exists submission_ref_seq start 1;

create table if not exists submissions (
  id              uuid primary key default gen_random_uuid(),
  reference_id    text not null unique
                  default ('IDX-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('submission_ref_seq')::text, 6, '0')),
  challenge_id    uuid not null references challenges (id),
  user_id         uuid not null references profiles (id),
  title           text not null check (char_length(title) between 3 and 200),
  summary         text check (char_length(summary) <= 2000),
  body            text check (char_length(body) <= 30000),
  cost_estimate   numeric check (cost_estimate >= 0),
  duration_months numeric check (duration_months >= 0),
  status          text not null default 'draft'
                  check (status in ('draft', 'queued', 'processing', 'evaluated', 'needs_review', 'failed')),
  created_at      timestamptz not null default now()
);
create index if not exists submissions_challenge_idx on submissions (challenge_id);
create index if not exists submissions_user_idx on submissions (user_id, created_at desc);

create table if not exists submission_files (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions (id) on delete cascade,
  storage_path  text not null,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  kind          text not null check (kind in ('document', 'image', 'audio', 'video', 'text')),
  created_at    timestamptz not null default now()
);
create index if not exists submission_files_sub_idx on submission_files (submission_id);

create table if not exists jobs (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references submissions (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts      int not null default 0,
  max_attempts  int not null default 3,
  last_error    text,
  run_after     timestamptz not null default now(),
  locked_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists jobs_claim_idx on jobs (status, run_after);

create table if not exists evaluations (
  id                  uuid primary key default gen_random_uuid(),
  submission_id       uuid not null references submissions (id) on delete cascade,
  rubric_id           uuid not null references rubrics (id),
  rubric_version      int  not null,
  prompt_version      text not null,
  model_name          text not null,
  structured_profile  jsonb not null,
  criterion_scores    jsonb not null,   -- {key: {score, justification, evidence}} per run, plus final
  total_score         numeric not null check (total_score between 0 and 100),
  disagreement        numeric not null default 0,
  needs_review        boolean not null default false,
  injection_flagged   boolean not null default false,
  reasoning           text not null default '',
  embedding           vector(768),
  override_score      numeric check (override_score between 0 and 100),
  override_reason     text,
  override_by         uuid references profiles (id),
  created_at          timestamptz not null default now()
);
create index if not exists evaluations_sub_idx on evaluations (submission_id, created_at desc);

create table if not exists rankings (
  id                    uuid primary key default gen_random_uuid(),
  challenge_id          uuid not null references challenges (id),
  submission_id         uuid not null references submissions (id) on delete cascade,
  rank                  int not null,
  eligibility_verified  boolean not null default false,
  status                text not null default 'shortlisted' check (status in ('shortlisted', 'published')),
  created_at            timestamptz not null default now(),
  unique (challenge_id, submission_id)
);

create table if not exists audit_log (
  id         bigserial primary key,
  actor      uuid,
  action     text not null,
  target     text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'evaluator'));
$$;

create or replace function log_audit(p_action text, p_target text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (actor, action, target, details) values (auth.uid(), p_action, p_target, p_details);
$$;
revoke all on function log_audit(text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
-- Create a profile for every new auth user. Role is ALWAYS 'participant';
-- only an admin (via SQL) can promote someone. Audience is clamped.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare a audience_type;
begin
  begin
    a := (new.raw_user_meta_data ->> 'audience')::audience_type;
  exception when others then
    a := 'international';
  end;
  if a is null then a := 'international'; end if;
  insert into profiles (id, full_name, country, audience, language)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    left(coalesce(new.raw_user_meta_data ->> 'country', ''), 80),
    a,
    case when new.raw_user_meta_data ->> 'language' in ('en', 'ar') then new.raw_user_meta_data ->> 'language' else 'en' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();

-- Business rules on submission creation: challenge must be open, and a
-- per-user daily limit (basic abuse / cost protection).
create or replace function enforce_submission_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare c challenges; n int;
begin
  select * into c from challenges where id = new.challenge_id;
  if not found or c.status <> 'open' or now() < c.opens_at or now() > c.closes_at then
    raise exception 'This challenge is not open for submissions';
  end if;
  select count(*) into n from submissions
   where user_id = new.user_id and created_at > now() - interval '24 hours';
  if n >= 10 then
    raise exception 'Daily submission limit reached (10 per 24 hours)';
  end if;
  return new;
end $$;

drop trigger if exists submissions_rules on submissions;
create trigger submissions_rules
  before insert on submissions for each row execute function enforce_submission_rules();

-- ---------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------
-- Latest evaluation per submission, with the score that counts
-- (human override wins over the AI score). Respects the caller's RLS.
create or replace view current_evaluations with (security_invoker = true) as
select distinct on (e.submission_id)
       e.id, e.submission_id, e.rubric_id, e.rubric_version, e.prompt_version, e.model_name,
       e.structured_profile, e.criterion_scores, e.total_score, e.disagreement, e.needs_review,
       e.injection_flagged, e.reasoning, e.override_score, e.override_reason, e.created_at,
       coalesce(e.override_score, e.total_score) as effective_score
  from evaluations e
 order by e.submission_id, e.created_at desc;

-- Public leaderboard: ONLY published rankings, minimal personal data
-- (first name + country). Runs with the owner's rights on purpose.
create or replace view public_leaderboard as
select r.challenge_id,
       r.rank,
       s.reference_id,
       s.title,
       split_part(p.full_name, ' ', 1) as first_name,
       p.country,
       ce.score
  from rankings r
  join submissions s on s.id = r.submission_id
  join profiles p on p.id = s.user_id
  join lateral (
    select coalesce(e.override_score, e.total_score) as score
      from evaluations e
     where e.submission_id = s.id
     order by e.created_at desc
     limit 1
  ) ce on true
 where r.status = 'published';

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table profiles          enable row level security;
alter table rubrics           enable row level security;
alter table challenges        enable row level security;
alter table submissions       enable row level security;
alter table submission_files  enable row level security;
alter table jobs              enable row level security;
alter table evaluations       enable row level security;
alter table rankings          enable row level security;
alter table audit_log         enable row level security;

-- profiles
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_staff());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on profiles from authenticated;
grant update (full_name, country, language) on profiles to authenticated;

-- rubrics: public read (transparent criteria), admin write
drop policy if exists rubrics_select on rubrics;
create policy rubrics_select on rubrics for select to anon, authenticated using (true);
drop policy if exists rubrics_admin on rubrics;
create policy rubrics_admin on rubrics for all to authenticated
  using (is_admin()) with check (is_admin());

-- challenges: public read of non-draft, admin write
drop policy if exists challenges_select on challenges;
create policy challenges_select on challenges for select to anon, authenticated
  using (status <> 'draft' or is_staff());
drop policy if exists challenges_admin on challenges;
create policy challenges_admin on challenges for all to authenticated
  using (is_admin()) with check (is_admin());

-- submissions: owners and staff read; owners insert/update only while draft
drop policy if exists submissions_select on submissions;
create policy submissions_select on submissions for select to authenticated
  using (user_id = auth.uid() or is_staff());
drop policy if exists submissions_insert on submissions;
create policy submissions_insert on submissions for insert to authenticated
  with check (user_id = auth.uid() and status = 'draft');
drop policy if exists submissions_update on submissions;
create policy submissions_update on submissions for update to authenticated
  using (user_id = auth.uid() and status = 'draft')
  with check (user_id = auth.uid() and status = 'draft');

revoke insert, update, delete on submissions from authenticated, anon;
grant insert (challenge_id, user_id, title, summary, body, cost_estimate, duration_months)
  on submissions to authenticated;
grant update (title, summary, body, cost_estimate, duration_months)
  on submissions to authenticated;

-- submission_files
drop policy if exists files_select on submission_files;
create policy files_select on submission_files for select to authenticated
  using (
    exists (select 1 from submissions s
             where s.id = submission_id and (s.user_id = auth.uid() or is_staff()))
  );
drop policy if exists files_insert on submission_files;
create policy files_insert on submission_files for insert to authenticated
  with check (
    exists (select 1 from submissions s
             where s.id = submission_id and s.user_id = auth.uid() and s.status = 'draft')
    and split_part(storage_path, '/', 1) = auth.uid()::text
  );
revoke insert, update, delete on submission_files from authenticated, anon;
grant insert (submission_id, storage_path, file_name, mime_type, size_bytes, kind)
  on submission_files to authenticated;

-- jobs: staff can read; nobody writes except the service role / RPCs
drop policy if exists jobs_select on jobs;
create policy jobs_select on jobs for select to authenticated using (is_staff());
revoke insert, update, delete on jobs from authenticated, anon;

-- evaluations: staff read; owner reads only after the challenge is published
drop policy if exists evaluations_select on evaluations;
create policy evaluations_select on evaluations for select to authenticated
  using (
    is_staff()
    or exists (
      select 1 from submissions s join challenges c on c.id = s.challenge_id
       where s.id = submission_id and s.user_id = auth.uid() and c.status = 'published'
    )
  );
revoke insert, update, delete on evaluations from authenticated, anon;

-- rankings: published are public; staff see all
drop policy if exists rankings_select on rankings;
create policy rankings_select on rankings for select to anon, authenticated
  using (status = 'published' or is_staff());
revoke insert, update, delete on rankings from authenticated, anon;

-- audit log: admins only
drop policy if exists audit_select on audit_log;
create policy audit_select on audit_log for select to authenticated using (is_admin());
revoke insert, update, delete on audit_log from authenticated, anon;

grant select on public_leaderboard to anon, authenticated;
grant select on current_evaluations to authenticated;

-- ---------------------------------------------------------------------
-- RPCs used by the web app (run as the signed-in user)
-- ---------------------------------------------------------------------
-- Owner finishes a draft: validates, queues it, and returns the reference ID.
create or replace function finalize_submission(p_submission_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare s submissions; n_files int;
begin
  select * into s from submissions where id = p_submission_id;
  if not found or s.user_id <> auth.uid() then
    raise exception 'Submission not found';
  end if;
  if s.status <> 'draft' then
    raise exception 'Submission was already submitted';
  end if;
  select count(*) into n_files from submission_files where submission_id = s.id;
  if n_files = 0 and coalesce(char_length(trim(s.body)), 0) < 20 then
    raise exception 'Please add a written description (20+ characters) or upload at least one file';
  end if;
  update submissions set status = 'queued' where id = s.id;
  insert into jobs (submission_id) values (s.id) on conflict (submission_id) do nothing;
  return s.reference_id;
end $$;
revoke all on function finalize_submission(uuid) from public, anon;
grant execute on function finalize_submission(uuid) to authenticated;

-- Staff: human review. Score override with a mandatory reason (audited).
create or replace function staff_override_score(p_evaluation_id uuid, p_score numeric, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  if p_score < 0 or p_score > 100 then raise exception 'Score must be between 0 and 100'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'A reason of at least 10 characters is required';
  end if;
  update evaluations
     set override_score = p_score, override_reason = p_reason, override_by = auth.uid(),
         needs_review = false
   where id = p_evaluation_id;
  perform log_audit('override_score', p_evaluation_id::text,
                    jsonb_build_object('score', p_score, 'reason', p_reason));
end $$;
revoke all on function staff_override_score(uuid, numeric, text) from public, anon;
grant execute on function staff_override_score(uuid, numeric, text) to authenticated;

-- Admin: build the top-N shortlist. Excluded: submissions the AI flagged for
-- prompt-injection unless a human has reviewed them (override present).
create or replace function admin_build_shortlist(p_challenge_id uuid, p_size int default 10)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if exists (select 1 from rankings where challenge_id = p_challenge_id and status = 'published') then
    raise exception 'Winners were already published for this challenge';
  end if;
  delete from rankings where challenge_id = p_challenge_id and status = 'shortlisted';
  insert into rankings (challenge_id, submission_id, rank)
  select p_challenge_id, x.submission_id, row_number() over (order by x.effective_score desc, x.created_at asc)
    from (
      select ce.submission_id, ce.effective_score, s.created_at
        from current_evaluations ce
        join submissions s on s.id = ce.submission_id
       where s.challenge_id = p_challenge_id
         and (not ce.injection_flagged or ce.override_score is not null)
       order by ce.effective_score desc, s.created_at asc
       limit p_size
    ) x;
  get diagnostics n = row_count;
  perform log_audit('build_shortlist', p_challenge_id::text, jsonb_build_object('size', n));
  return n;
end $$;
revoke all on function admin_build_shortlist(uuid, int) from public, anon;
grant execute on function admin_build_shortlist(uuid, int) to authenticated;

create or replace function admin_verify_eligibility(p_ranking_id uuid, p_verified boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  update rankings set eligibility_verified = p_verified
   where id = p_ranking_id and status = 'shortlisted';
  perform log_audit('verify_eligibility', p_ranking_id::text, jsonb_build_object('verified', p_verified));
end $$;
revoke all on function admin_verify_eligibility(uuid, boolean) from public, anon;
grant execute on function admin_verify_eligibility(uuid, boolean) to authenticated;

create or replace function admin_publish_winners(p_challenge_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if not exists (select 1 from rankings where challenge_id = p_challenge_id and status = 'shortlisted') then
    raise exception 'Build a shortlist first';
  end if;
  if exists (select 1 from rankings
              where challenge_id = p_challenge_id and status = 'shortlisted'
                and not eligibility_verified) then
    raise exception 'Verify eligibility of every shortlisted entry before publishing';
  end if;
  update rankings set status = 'published' where challenge_id = p_challenge_id and status = 'shortlisted';
  update challenges set status = 'published' where id = p_challenge_id;
  perform log_audit('publish_winners', p_challenge_id::text, '{}'::jsonb);
end $$;
revoke all on function admin_publish_winners(uuid) from public, anon;
grant execute on function admin_publish_winners(uuid) to authenticated;

-- Admin: re-run a failed or outdated evaluation.
create or replace function admin_requeue(p_submission_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  update jobs set status = 'pending', attempts = 0, last_error = null, run_after = now(), locked_at = null,
                  updated_at = now()
   where submission_id = p_submission_id;
  update submissions set status = 'queued' where id = p_submission_id;
  perform log_audit('requeue', p_submission_id::text, '{}'::jsonb);
end $$;
revoke all on function admin_requeue(uuid) from public, anon;
grant execute on function admin_requeue(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RPCs used ONLY by the Python worker (service role)
-- ---------------------------------------------------------------------
-- Atomically claim one job. FOR UPDATE SKIP LOCKED lets many workers run
-- in parallel without ever picking the same job. Stale 'running' jobs
-- (worker crashed) are picked up again after 10 minutes.
create or replace function claim_job() returns setof jobs
language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs
   where (status = 'pending' and run_after <= now())
      or (status = 'running' and locked_at < now() - interval '10 minutes')
   order by created_at
   for update skip locked
   limit 1;
  if not found then return; end if;
  update jobs set status = 'running', attempts = attempts + 1, locked_at = now(), updated_at = now()
   where id = j.id returning * into j;
  update submissions set status = 'processing' where id = j.submission_id;
  return next j;
end $$;

create or replace function complete_job(p_job_id uuid, p_needs_review boolean) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  update jobs set status = 'done', last_error = null, updated_at = now() where id = p_job_id
  returning submission_id into sid;
  update submissions set status = case when p_needs_review then 'needs_review' else 'evaluated' end
   where id = sid;
end $$;

-- Failure with exponential backoff; after max_attempts the job is 'failed'
-- and shows up for admins.
create or replace function fail_job(p_job_id uuid, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_job_id for update;
  if j.attempts >= j.max_attempts then
    update jobs set status = 'failed', last_error = left(p_error, 2000), updated_at = now() where id = j.id;
    update submissions set status = 'failed' where id = j.submission_id;
  else
    update jobs set status = 'pending', last_error = left(p_error, 2000),
                    run_after = now() + (power(2, j.attempts) * interval '1 minute'),
                    locked_at = null, updated_at = now()
     where id = j.id;
    update submissions set status = 'queued' where id = j.submission_id;
  end if;
end $$;

-- Nearest existing submissions in the same challenge (for originality).
create or replace function match_similar(p_challenge_id uuid, p_embedding vector(768),
                                         p_exclude uuid, p_limit int default 3)
returns table (submission_id uuid, similarity float)
language sql stable security definer set search_path = public as $$
  select e.submission_id, 1 - (e.embedding <=> p_embedding) as similarity
    from evaluations e
    join submissions s on s.id = e.submission_id
   where s.challenge_id = p_challenge_id
     and e.submission_id <> p_exclude
     and e.embedding is not null
   order by e.embedding <=> p_embedding
   limit p_limit;
$$;

revoke all on function claim_job() from public, anon, authenticated;
revoke all on function complete_job(uuid, boolean) from public, anon, authenticated;
revoke all on function fail_job(uuid, text) from public, anon, authenticated;
revoke all on function match_similar(uuid, vector, uuid, int) from public, anon, authenticated;
grant execute on function claim_job() to service_role;
grant execute on function complete_job(uuid, boolean) to service_role;
grant execute on function fail_job(uuid, text) to service_role;
grant execute on function match_similar(uuid, vector, uuid, int) to service_role;

-- ---------------------------------------------------------------------
-- Storage: private bucket, 50 MB per file, MIME allow-list, per-user folders
-- Path convention: {user_id}/{submission_id}/{file_name}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions', 'submissions', false, 52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png', 'image/jpeg', 'image/webp',
    'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/webm', 'audio/ogg',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = false;

drop policy if exists "submissions_upload_own_folder" on storage.objects;
create policy "submissions_upload_own_folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "submissions_read_own_or_staff" on storage.objects;
create policy "submissions_read_own_or_staff" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
