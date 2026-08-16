import { isSupabaseEnabled, supabase } from './supabase'
import type { Subject } from '../types'

type ProductEventName =
  | 'mistake_created'
  | 'diagnosis_started'
  | 'diagnosis_completed'
  | 'diagnosis_failed'

type ProductEventInput = {
  eventName: ProductEventName
  subject?: Subject
  mistakeId?: string
  diagnosisId?: string
  metadata?: Record<string, boolean | number | string | null>
}

const sessionStorageKey = 'ai-mistake-notebook-session-id'

const getSessionId = () => {
  try {
    const existing = window.localStorage.getItem(sessionStorageKey)
    if (existing) return existing
    const created = crypto.randomUUID()
    window.localStorage.setItem(sessionStorageKey, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

// 埋点失败不影响核心诊断流程；metadata 禁止放入题干、作答或对话内容。
export const trackProductEvent = async (input: ProductEventInput) => {
  if (!isSupabaseEnabled || !supabase) return

  try {
    await supabase.from('product_events').insert({
      session_id: getSessionId(),
      event_name: input.eventName,
      subject: input.subject ?? null,
      mistake_id: input.mistakeId ?? null,
      diagnosis_id: input.diagnosisId ?? null,
      metadata: input.metadata ?? {},
    })
  } catch (error) {
    console.warn('[analytics] failed to record product event', error)
  }
}
