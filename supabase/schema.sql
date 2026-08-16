create extension if not exists "pgcrypto";

create table if not exists mistakes (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  question_text text not null,
  student_answer text not null,
  ocr_raw_text text,
  created_at timestamptz not null default now()
);

create table if not exists diagnoses (
  id uuid primary key default gen_random_uuid(),
  mistake_id uuid not null references mistakes(id) on delete cascade,
  chat_log jsonb not null default '[]'::jsonb,
  error_type text not null,
  knowledge_point text not null,
  state_tag text not null,
  confidence numeric(4,3) not null default 0.5,
  summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists push_events (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid references diagnoses(id) on delete set null,
  reason text not null,
  content text not null,
  clicked boolean not null default false,
  feedback_score int,
  created_at timestamptz not null default now()
);

-- 匿名行为事件只记录流程与耗时，不记录题目、作答或对话原文。
create table if not exists product_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  event_name text not null check (event_name in (
    'mistake_created',
    'diagnosis_started',
    'diagnosis_completed',
    'diagnosis_failed'
  )),
  subject text,
  mistake_id uuid references mistakes(id) on delete set null,
  diagnosis_id uuid references diagnoses(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_events_created_at_idx on product_events (created_at desc);
create index if not exists product_events_session_id_idx on product_events (session_id, created_at);
create index if not exists product_events_event_name_idx on product_events (event_name, created_at desc);

alter table product_events enable row level security;
drop policy if exists "anonymous event insert" on product_events;
create policy "anonymous event insert"
  on product_events for insert to anon, authenticated
  with check (true);
