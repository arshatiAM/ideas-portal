-- Let staff clear a prompt-injection flag after reading the original submission,
-- without having to invent an override score. The decision and reason are audited.

alter table evaluations add column if not exists injection_cleared_by uuid;
alter table evaluations add column if not exists injection_cleared_reason text;

create or replace view current_evaluations with (security_invoker = true) as
select distinct on (e.submission_id)
       e.id, e.submission_id, e.rubric_id, e.rubric_version, e.prompt_version, e.model_name,
       e.structured_profile, e.criterion_scores, e.total_score, e.disagreement, e.needs_review,
       e.injection_flagged, e.reasoning, e.override_score, e.override_reason, e.created_at,
       coalesce(e.override_score, e.total_score) as effective_score,
       e.injection_cleared_by, e.injection_cleared_reason
  from evaluations e
 order by e.submission_id, e.created_at desc;
grant select on current_evaluations to authenticated;

create or replace function staff_clear_injection_flag(p_evaluation_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'A reason of at least 10 characters is required';
  end if;
  update evaluations
     set injection_cleared_by = auth.uid(), injection_cleared_reason = p_reason, needs_review = false
   where id = p_evaluation_id and injection_flagged
  returning submission_id into sid;
  if sid is null then raise exception 'That evaluation has no injection flag'; end if;
  update submissions set status = 'evaluated' where id = sid and status = 'needs_review';
  perform log_audit('clear_injection_flag', p_evaluation_id::text, jsonb_build_object('reason', p_reason));
end $$;
revoke all on function staff_clear_injection_flag(uuid, text) from public, anon;
grant execute on function staff_clear_injection_flag(uuid, text) to authenticated;

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
         and (not ce.injection_flagged or ce.override_score is not null or ce.injection_cleared_by is not null)
       order by ce.effective_score desc, s.created_at asc
       limit p_size
    ) x;
  get diagnostics n = row_count;
  perform log_audit('build_shortlist', p_challenge_id::text, jsonb_build_object('size', n));
  return n;
end $$;
revoke all on function admin_build_shortlist(uuid, int) from public, anon;
grant execute on function admin_build_shortlist(uuid, int) to authenticated;
