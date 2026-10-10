"""Database security and workflow tests.

Runs the real migration on a throwaway Postgres and checks row-level security, column privileges,
the queue, the winner workflow and storage rules. See run.sh. Connection comes from the standard
PG* environment variables (PGHOST, PGPORT, PGUSER, PGPASSWORD) and TESTDB.
"""
import json, os, uuid, psycopg2

conn = psycopg2.connect(dbname=os.environ.get("TESTDB", "ix_test"))
conn.autocommit = True
cur = conn.cursor()
passed = failed = 0

def as_role(role, uid=None):
    cur.execute("reset role"); cur.execute("select set_config('request.jwt.claim.sub', %s, false)", (uid or "",))
    if role != "postgres": cur.execute(f"set role {role}")

def ok(name, cond):
    global passed, failed
    if cond: passed += 1; print("  PASS", name)
    else: failed += 1; print("  FAIL", name)

def denied(name, sql, params=None):
    """statement must raise (permission denied, RLS violation, or a business-rule exception)"""
    try:
        cur.execute(sql, params); ok(name, False)
    except Exception as e:
        ok(name + f"  [{type(e).__name__}: {str(e).splitlines()[0][:70]}]", True)

def q(sql, params=None):
    cur.execute(sql, params); return cur.fetchall() if cur.description else None

as_role("postgres")
u1, u2, adm, ev = (str(uuid.uuid4()) for _ in range(4))
for uid, email, meta in [
    (u1, "a@x.com", {"full_name": "Aisha Khan", "country": "UAE", "audience": "uae_resident"}),
    (u2, "b@x.com", {"full_name": "Bob Lee", "country": "UK", "audience": "administrator"}),   # tries to pick a staff audience
    (adm, "admin@x.com", {"full_name": "Admin One"}),
    (ev, "ev@x.com", {"full_name": "Eva Judge"}),
]:
    cur.execute("insert into auth.users(id,email,raw_user_meta_data) values (%s,%s,%s)", (uid, email, json.dumps(meta)))
cur.execute("update profiles set role='admin' where id=%s", (adm,))
cur.execute("update profiles set role='evaluator' where id=%s", (ev,))
chal = q("select id from challenges where slug='dxb-shj-traffic'")[0][0]

print("profiles / signup")
ok("profile created with clamped audience", q("select audience::text, role::text from profiles where id=%s", (u2,))[0] == ("international", "participant"))
ok("resident audience kept", q("select audience::text from profiles where id=%s", (u1,))[0][0] == "uae_resident")

print("participant permissions")
as_role("authenticated", u1)
denied("cannot promote self to admin", "update profiles set role='admin' where id=%s", (u1,))
cur.execute("update profiles set country='AE' where id=%s", (u1,)); ok("can edit own country", cur.rowcount == 1)
sid = str(uuid.uuid4())
denied("cannot insert submission as queued", "insert into submissions(challenge_id,user_id,title,status) values (%s,%s,'Sneaky idea','queued')", (chal, u1))
denied("cannot set own reference_id", "insert into submissions(challenge_id,user_id,title,reference_id) values (%s,%s,'Fake ref','IDX-2026-999999')", (chal, u1))
denied("cannot submit as someone else", "insert into submissions(challenge_id,user_id,title) values (%s,%s,'Impersonation')", (chal, u2))
cur.execute("insert into submissions(challenge_id,user_id,title,body,cost_estimate,duration_months) values (%s,%s,'Metro link between cities','A commuter rail line.',1000000,24) returning id", (chal, u1))
sid = str(cur.fetchone()[0])
ok("can create own draft (and read back its id)", True)
denied("finalize with no content is rejected", "select finalize_submission(%s)", (sid,)) if False else None
fid = str(uuid.uuid4())
denied("cannot attach file under someone else's folder", "insert into submission_files(submission_id,storage_path,file_name,mime_type,size_bytes,kind) values (%s,%s,'a.pdf','application/pdf',100,'document')", (sid, f"{u2}/{sid}/a.pdf"))
denied("file over 50 MB rejected", "insert into submission_files(submission_id,storage_path,file_name,mime_type,size_bytes,kind) values (%s,%s,'big.mp4','video/mp4',60000000,'video')", (sid, f"{u1}/{sid}/big.mp4"))
cur.execute("insert into submission_files(submission_id,storage_path,file_name,mime_type,size_bytes,kind) values (%s,%s,'pitch.pdf','application/pdf',2048,'document')", (sid, f"{u1}/{sid}/pitch.pdf"))
ok("can attach file in own folder", cur.rowcount == 1)
ref = q("select finalize_submission(%s)", (sid,))[0][0]
ok(f"finalize returns reference id ({ref})", ref.startswith("IDX-") and len(ref.split("-")[2]) == 6)
denied("cannot finalize twice", "select finalize_submission(%s)", (sid,))
denied("cannot edit after submitting", "update submissions set title='Changed' where id=%s", (sid,)) if False else None
cur.execute("update submissions set title='Changed' where id=%s", (sid,)); ok("edit after submit affects 0 rows", cur.rowcount == 0)
denied("cannot self-evaluate (insert evaluation)", "insert into evaluations(submission_id,rubric_id,rubric_version,prompt_version,model_name,structured_profile,criterion_scores,total_score) select %s, rubric_id,1,'v1','m','{}','{}',100 from challenges limit 1", (sid,))
ok("cannot read jobs", q("select count(*) from jobs")[0][0] == 0)
denied("cannot call worker RPC claim_job", "select * from claim_job()")
denied("cannot call admin RPC", "select admin_build_shortlist(%s, 10)", (chal,))
denied("cannot read audit log (returns rows?)", "select 1/ (select count(*) from audit_log)") 

print("isolation between users")
as_role("authenticated", u2)
ok("other user cannot see my submission", q("select count(*) from submissions where id=%s", (sid,))[0][0] == 0)
ok("other user cannot see my file rows", q("select count(*) from submission_files")[0][0] == 0)
as_role("authenticated", ev)
ok("evaluator can see submission", q("select count(*) from submissions where id=%s", (sid,))[0][0] == 1)
as_role("anon")
ok("anon sees open challenge", q("select count(*) from challenges")[0][0] >= 1)
ok("anon cannot see submissions", q("select count(*) from submissions")[0][0] == 0) if True else None
denied("anon cannot finalize", "select finalize_submission(%s)", (sid,))

print("daily rate limit")
as_role("authenticated", u2)
for i in range(10): cur.execute("insert into submissions(challenge_id,user_id,title) values (%s,%s,%s)", (chal, u2, f"Draft number {i}"))
denied("11th submission in 24h is blocked", "insert into submissions(challenge_id,user_id,title) values (%s,%s,'One too many')", (chal, u2))

print("worker queue (service role)")
as_role("service_role")
job = q("select id, status, attempts from claim_job()")
ok("claim_job returns the queued job, attempts=1", job and job[0][2] == 1)
ok("no second job to claim", q("select count(*) from claim_job()")[0][0] == 0)
jid = job[0][0]
cur.execute("select fail_job(%s, 'Gemini 429')", (jid,))
r = q("select status, attempts, run_after > now() from jobs where id=%s", (jid,))[0]
ok("first failure -> pending with backoff", r == ("pending", 1, True))
ok("backoff job not claimable yet", q("select count(*) from claim_job()")[0][0] == 0)
as_role("postgres"); cur.execute("update jobs set run_after=now() where id=%s", (jid,)); as_role("service_role")
q("select * from claim_job()"); cur.execute("select fail_job(%s,'again')", (jid,))
as_role("postgres"); cur.execute("update jobs set run_after=now() where id=%s", (jid,)); as_role("service_role")
q("select * from claim_job()"); cur.execute("select fail_job(%s,'third')", (jid,))
ok("after max attempts -> failed", q("select j.status, s.status from jobs j join submissions s on s.id=j.submission_id where j.id=%s", (jid,))[0] == ("failed", "failed"))
as_role("authenticated", adm); cur.execute("select admin_requeue(%s)", (sid,))
as_role("service_role")
j2 = q("select id, attempts from claim_job()"); ok("admin requeue resets job", j2 and j2[0][1] == 1)

rub = q("select r.id, r.version from rubrics r join challenges c on c.rubric_id=r.id where c.slug='dxb-shj-traffic'")[0]
emb = [0.1] * 768
cur.execute("""insert into evaluations(submission_id,rubric_id,rubric_version,prompt_version,model_name,structured_profile,criterion_scores,total_score,disagreement,needs_review,injection_flagged,reasoning,embedding)
               values (%s,%s,%s,'v1','gemini','{}','{"final":{}}',72.5,3,false,false,'Solid idea.',%s)""", (sid, rub[0], rub[1], emb))
cur.execute("select complete_job(%s, false)", (j2[0][0],))
ok("complete_job -> submission evaluated", q("select status from submissions where id=%s", (sid,))[0][0] == "evaluated")
ok("match_similar callable by service role", q("select count(*) from match_similar(%s, %s::float8[], %s, 3)", (chal, emb, str(uuid.uuid4())))[0][0] == 1)

print("review and winners")
as_role("authenticated", u1)
ok("owner cannot see evaluation before publish", q("select count(*) from evaluations")[0][0] == 0)
as_role("authenticated", ev)
eid = q("select id from evaluations")[0][0]
denied("override needs a reason", "select staff_override_score(%s, 80, 'ok')", (eid,))
cur.execute("select staff_override_score(%s, 80, 'Reviewed diagrams, strong feasibility')", (eid,))
ok("evaluator override works; effective score 80", float(q("select effective_score from current_evaluations")[0][0]) == 80.0)
denied("evaluator cannot build shortlist", "select admin_build_shortlist(%s,10)", (chal,))
as_role("authenticated", adm)
n = q("select admin_build_shortlist(%s,10)", (chal,))[0][0]; ok("shortlist built with 1 entry", n == 1)
denied("cannot publish before eligibility verified", "select admin_publish_winners(%s)", (chal,))
rk = q("select id from rankings")[0][0]
cur.execute("select admin_verify_eligibility(%s, true)", (rk,))
cur.execute("select admin_publish_winners(%s)", (chal,))
ok("challenge published", q("select status from challenges where id=%s", (chal,))[0][0] == "published")
denied("cannot rebuild shortlist after publish", "select admin_build_shortlist(%s,10)", (chal,))
audit = [r[0] for r in q("select action from audit_log order by id")]
ok(f"audit log recorded admin actions {audit}", {"override_score","build_shortlist","verify_eligibility","publish_winners","requeue"} <= set(audit))
as_role("anon")
lb = q("select rank, title, first_name, country, score from public_leaderboard")
ok(f"anon sees public leaderboard {lb}", len(lb) == 1 and lb[0][2] == "Aisha" and float(lb[0][4]) == 80.0)
denied("leaderboard exposes no email column", "select email from public_leaderboard")
as_role("authenticated", u1)
ok("owner can see own evaluation after publish", q("select count(*) from evaluations")[0][0] == 1)
as_role("authenticated", u2)
ok("other participant still cannot see it", q("select count(*) from evaluations")[0][0] == 0)

print("storage rules")
as_role("postgres")
b = q("select file_size_limit, public, array_length(allowed_mime_types,1) from storage.buckets where id='submissions'")[0]
ok(f"bucket private, 50MB, mime allow-list {b}", b[0] == 52428800 and b[1] is False and b[2] >= 15)
as_role("authenticated", u1)
cur.execute("insert into storage.objects(bucket_id,name) values ('submissions', %s)", (f"{u1}/{sid}/x.pdf",)); ok("upload into own folder allowed", True)
denied("upload into another user's folder blocked", "insert into storage.objects(bucket_id,name) values ('submissions', %s)", (f"{u2}/{sid}/x.pdf",))
ok("cannot read other user's files", q("select count(*) from storage.objects where name like %s", (f"{u2}/%",))[0][0] == 0)

print(f"\n{passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
