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
