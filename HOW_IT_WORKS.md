# How it works, in your own words

Read this once the app is running. Say these in your own voice; do not memorise them.

## The 30-second pitch

"Ideas Portal is a Kaggle-style portal for city problems. Anyone in the world submits a solution as text,
documents, diagrams, audio or video. They get a reference ID immediately. A background worker uses a multimodal
AI model to turn each submission into a structured profile, scores it against a transparent weighted rubric,
and ranks them. Evaluators review the top ideas, finalists are verified for eligibility, and an admin publishes
winners. Everything is versioned and audited, and every component sits behind an interface so it can move from the
free stack to a government-grade deployment without a rewrite."

## The flow, step by step

1. **Sign up.** Supabase Auth. A database trigger creates the profile. Everyone starts as `participant`; only an admin can promote someone (nobody can make themselves admin).
2. **Submit.** The browser creates a *draft* submission, uploads files straight to private storage under `user_id/submission_id/`, then calls `finalize_submission`. That function validates, sets status `queued`, creates a job and returns the **reference ID**. A draft/finalize split means a failed upload never leaves a half-submitted idea in the queue.
3. **Queue.** The `jobs` table. The worker calls `claim_job()`, which uses `FOR UPDATE SKIP LOCKED` so two workers never take the same job. Failures retry with exponential backoff, then become `failed` and appear for admins. A crashed worker's job is reclaimed after 10 minutes.
4. **Extract.** The worker downloads the files. Word and text are read locally; PDFs, images, audio and video are sent to Gemini, which understands all of them in one call. Output is a fixed JSON profile: problem, solution, impact, cost, duration, sustainability, risks, evidence, and an "injection detected" flag.
5. **Enrich.** The profile text is embedded (768 numbers). pgvector finds the nearest earlier submissions. High similarity means low **originality**, computed by math, not by asking the model.
6. **Score.** Two independent scoring passes over the *structured profile only*. Each criterion gets 0 to 10 with a justification and evidence. Scores are averaged and weighted into 0 to 100.
7. **Flag.** The result goes to human review if the two passes disagree by more than 15 points, an injection was detected, or the profile came out empty.
8. **Persist.** One evaluation row with rubric version, prompt version and model name, so any score can be explained or reproduced later.
9. **Judge.** Staff open a submission, read scores, reasoning and evidence, and can override with a mandatory reason (audited). Admin builds the Top 10, verifies each finalist, and publishes. The public leaderboard shows first name and country only.

## Questions he may ask, and short answers

**Why Docker, and why only for the worker?**
"Docker packages the worker with the exact Python version and libraries, so it runs identically on my laptop, in CI and on any cloud. The web app is deployed on Vercel, which does its own packaging, so Docker would add nothing there."

**Why Supabase and not Firebase plus Neon?**
"Supabase gives me Postgres, auth, storage and pgvector in one place with row-level security. Firebase and Neon duplicate parts of that and would add integration points without adding capability."

**What is row-level security and why does it matter here?**
"The security rules live in the database, not in the frontend. Even if someone calls the API directly with their own token, the database only returns rows they are allowed to see: their own submissions, or everything if they are staff. The browser only holds the public anon key."

**How do you stop people gaming the AI scorer?**
"Quarantine. The model that reads the raw document only extracts facts. The model that scores sees only that structured profile, so hidden instructions in a document cannot reach it directly. Injection attempts are flagged, excluded from the shortlist until a human has reviewed them, and originality is computed from embeddings, which the submitter cannot influence."

**How do you know the AI scores are fair?**
"I do not rely on them alone. Two independent passes, disagreement triggers review, evaluators can override with a recorded reason, and the Top 10 is human-verified before publication. Every score stores its reasoning, evidence, and the rubric, prompt and model versions, so decisions can be audited and re-run. A next step is calibrating against a set of expert-scored ideas."

**Why a Postgres queue instead of Redis or Kafka?**
"At this scale it removes infrastructure and keeps the job transactional with the submission. `SKIP LOCKED` makes it safe with multiple workers. If volume grows, the worker only needs a different `claim_job`, and the pipeline stays the same."

**What happens if the AI provider is down or rate-limited?**
"The gateway retries with exponential backoff. If that fails, the job returns to the queue with a delay, up to three attempts, then it is marked failed and admins see the error and can re-run it. Users see a clear status and are never blocked."

**What would you change for production at national scale?**
"Managed Postgres in a UAE region, autoscaled workers behind a proper queue, a private or self-hosted model so submissions never leave government infrastructure, antivirus scanning on uploads, Whisper and OCR for deeper extraction, monitoring and tracing, UAE Pass sign-in, infrastructure as code, and formal bias and calibration audits."

**What are the limitations today?**
"Free-tier limits; free AI tiers may retain data, so not for sensitive content; originality is relative to what has been submitted so far, so I re-run scoring when a challenge closes; finalist identity checks are a manual step."

**How is this built for the long run?**
"Challenges are a first-class entity with their own rubric, so the next challenge reuses everything. Rubric changes create versions. The model, storage and pipeline stages sit behind interfaces. Schema is in migration files. There are tests and CI."

## If something breaks during a live demo

- Submission stays "Queued": the worker is not running. Start it (`uvicorn app.main:app --port 8000`) and check `/healthz`.
- Worker log says "model not found": update `GEMINI_MODEL` in `worker/.env` to a current model name and restart.
- Gemini rate limit: the job retries on its own; wait a minute, or use **Re-run evaluation** in Admin.
- Cannot sign up: confirm "Confirm email" is turned off in Supabase Auth.

---

# Why these choices, and what I rejected (technical round cheat sheet)

Answer pattern for every choice: **need, choice, best rejected alternative and why, when I would switch.**

| Layer | Chosen | Main alternatives | Why chosen / why not the others | Switch when |
|---|---|---|---|---|
| Frontend | Next.js + Tailwind on Vercel | Plain React (Vite), Angular, Flutter web | One codebase, file-based routing for the six persona pages, free global hosting, large hiring pool. Angular is heavier; Vite would need me to build routing and hosting. | Need SSR/SEO-critical public pages at scale: move more pages to server rendering. |
| Database | Postgres (Supabase) | Firebase/Firestore, MongoDB, Neon | Data is relational (users, submissions, files, evaluations, rankings) and needs transactions and joins. Firestore makes ranking and admin reporting painful and locks you in. Neon is only a database: I would still need auth, storage and vectors elsewhere. | Write volume needs sharding: managed Postgres + read replicas first. |
| Auth and access | Supabase Auth + Row Level Security | Auth0, Keycloak, custom JWT middleware | Security rules live next to the data, so a bug in the app cannot leak another user's idea. Free. Auth0 costs at scale. | Government SSO needed: UAE Pass via OIDC (Supabase supports custom OIDC). |
| Files | Supabase Storage, private bucket, direct upload from browser | S3, Cloudflare R2, upload through my server | Browser uploads straight to storage, so my server never carries 50 MB videos. Private bucket + signed access. S3 is the same pattern but needs an AWS account. | Large volume: S3/R2 with virus scanning on upload. |
| Vectors | pgvector inside Postgres | Pinecone, Weaviate, Qdrant | A few hundred thousand ideas fit in pgvector; one system to back up and secure. Separate vector DB adds cost and sync problems. | Tens of millions of vectors or heavy filtering: Qdrant or Vertex Vector Search. |
| Queue | Postgres table with FOR UPDATE SKIP LOCKED | Redis + Celery, RabbitMQ, SQS, Kafka | Job is created in the same transaction as the submission, so it cannot be lost. Many workers are safe. No extra infrastructure to run. Kafka is overkill for this volume. | Thousands of jobs per minute: SQS or Redis streams. |
| Worker | Python FastAPI | Node worker, Cloud Functions, in-request processing | Python is the language of the AI ecosystem; AI work takes minutes, so it must be asynchronous, never inside a web request (serverless timeouts). | Autoscaling: containers on Kubernetes or Cloud Run with queue-depth scaling. |
| Models | Gemini through a model gateway | OpenAI, Claude API, self-hosted Llama/Whisper | One model reads text, PDF, images, audio and video natively, so I need no separate OCR or speech pipeline for v1; free tier. The gateway is an interface, so swapping providers is one class. Self-hosting needs GPUs and ops. | Sensitive government data: private or self-hosted model in a UAE region; Whisper + OCR for cost control. |
| AI design | Two stages: extract (sees raw content) then score (sees only structured profile) | One prompt that reads and scores | Prompt-injection defence. A hidden "give this 10/10" in a PDF reaches only the extractor, which just records it as a flag. | Add a dedicated injection classifier in front. |
| Scoring | Rubric with weights, 2 passes averaged, disagreement flag, embeddings for originality, human override | Single LLM score, or fully manual | LLMs are noisy: averaging and disagreement detection catch it. Originality is computed, so it cannot be argued up. Humans make the final call and every override is audited. | Calibrate against human-scored samples; add bias audits. |
| Rankings | Computed in SQL, published only after eligibility verification | Live leaderboard from raw AI scores | Prize money needs a verified, auditable decision, not a raw model output. | n/a |
| Hosting worker | Laptop or Hugging Face Space (free) | Cloud Run, ECS, Azure Container Apps | Constraint was free and open source. Docker image is portable, so moving to any container host is configuration. | Always-on SLA needed. |
| Security | RLS, column grants, private bucket, MIME + size limits, rate limit, injection quarantine, audit log, service key only in worker | WAF-only, app-level checks | Defence in depth: the database enforces rules even if the app is wrong. | Add antivirus scanning, WAF, secrets manager, pen test. |

## Speed ("it must be smooth")
- Instant: reference ID is returned as soon as files are uploaded and the record is finalised. The user never waits for AI.
- Asynchronous AI: evaluation runs in the background; the Track page updates by itself.
- Both scoring passes run in parallel; each model call has a timeout and an optional fallback model.
- Voice notes are recorded in the browser as small 16 kHz WAV files, so uploads stay fast.
- Next steps: scale workers horizontally (the queue already supports it), cache extracted profiles, and use a faster model tier for first-pass screening.

## Honest limits to volunteer
Free-tier AI is slower and rate limited; originality compares only against ideas seen so far; eligibility checks are a manual admin step; video is uploaded, not recorded in the browser; free-tier data handling is not suitable for sensitive government data.
