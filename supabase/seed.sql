-- =====================================================================
-- Seed data: the first rubric and the first challenge.
-- Run AFTER 0001_init.sql (Supabase -> SQL Editor).
-- The prize amount below is a DEMO value for the take-home, not a real prize.
-- =====================================================================

insert into rubrics (name, version, prompt_version, criteria)
values (
  'Urban mobility rubric', 1, 'v1',
  '[
    {"key":"impact","label":"Impact","weight":0.30,"source":"llm",
     "description":"Expected reduction in Dubai-Sharjah traffic and how well the claim is supported by evidence or reasoning."},
    {"key":"cost_effectiveness","label":"Cost-effectiveness","weight":0.20,"source":"llm",
     "description":"Benefit relative to total cost; are cost figures stated and realistic?"},
    {"key":"feasibility","label":"Feasibility and duration","weight":0.20,"source":"llm",
     "description":"Realistic timeline, dependencies, regulatory and technical feasibility."},
    {"key":"sustainability","label":"Sustainability","weight":0.15,"source":"llm",
     "description":"Emissions, long-term viability, and maintainability over many years."},
    {"key":"originality","label":"Originality","weight":0.10,"source":"embedding",
     "description":"How different the idea is from other submissions (computed from embeddings, not by the model)."},
    {"key":"clarity","label":"Clarity and completeness","weight":0.05,"source":"llm",
     "description":"Is the idea clearly explained with supporting evidence, diagrams, or data?"}
  ]'::jsonb
)
on conflict (name, version) do nothing;

insert into challenges (slug, title, description, status, opens_at, closes_at, prize_amount, prize_currency, rubric_id)
select
  'dxb-shj-traffic',
  'Reduce traffic between Dubai and Sharjah',
  'Every day hundreds of thousands of people commute between Dubai and Sharjah in both directions. '
  || 'Submit your idea for reducing congestion on this corridor. Ideas can be technology, policy, transport, '
  || 'urban planning, or behavioural change. Explain the problem you address, how your solution works, '
  || 'the estimated cost and timeline, and why it stays effective in the long run and is sustainable. '
  || 'You can upload documents, diagrams, audio or video. The competition is open to everyone worldwide.',
  'open',
  now(),
  now() + interval '90 days',
  100000,
  'AED',
  (select id from rubrics where name = 'Urban mobility rubric' and version = 1)
where not exists (select 1 from challenges where slug = 'dxb-shj-traffic');
