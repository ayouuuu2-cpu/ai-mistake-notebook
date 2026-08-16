-- 在 Supabase SQL Editor 中运行。所有结果只基于真实流程事件，不引入模拟用户量。

-- 1. 最近 7 天的事件量与去重会话数
select
  event_name,
  count(*) as event_count,
  count(distinct session_id) as session_count
from product_events
where created_at >= now() - interval '7 days'
group by event_name
order by event_count desc;

-- 2. 诊断漏斗：创建错题 -> 发起诊断 -> 得到结果
with session_funnel as (
  select
    session_id,
    bool_or(event_name = 'mistake_created') as created_mistake,
    bool_or(event_name = 'diagnosis_started') as started_diagnosis,
    bool_or(event_name = 'diagnosis_completed') as completed_diagnosis
  from product_events
  where created_at >= now() - interval '7 days'
  group by session_id
)
select
  count(*) filter (where created_mistake) as created_sessions,
  count(*) filter (where started_diagnosis) as started_sessions,
  count(*) filter (where completed_diagnosis) as completed_sessions,
  round(
    100.0 * count(*) filter (where completed_diagnosis)
      / nullif(count(*) filter (where started_diagnosis), 0),
    1
  ) as completion_rate_pct
from session_funnel;

-- 3. 线上诊断耗时与失败率
select
  round(avg((metadata ->> 'latencyMs')::numeric), 0) as avg_latency_ms,
  percentile_cont(0.95) within group (order by (metadata ->> 'latencyMs')::numeric) as p95_latency_ms,
  count(*) filter (where event_name = 'diagnosis_failed') as failed_count,
  count(*) filter (where event_name = 'diagnosis_started') as started_count
from product_events
where event_name in ('diagnosis_started', 'diagnosis_completed', 'diagnosis_failed')
  and created_at >= now() - interval '7 days';
