-- 只用于匿名产品行为分析；不创建错题、作答或对话内容表。
create extension if not exists "pgcrypto";

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
  mistake_id uuid,
  diagnosis_id uuid,
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
