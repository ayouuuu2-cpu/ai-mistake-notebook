import { runMockDiagnosis } from './mockAi'
import { isSupabaseEnabled, supabase } from './supabase'
import type { DiagnosisResult, MistakeRecord, Subject, WeaknessPoint } from '../types'

type NewMistakeInput = {
  subject: Subject
  questionText: string
  studentAnswer: string
  ocrRawText?: string | null
}

type NewDiagnosisInput = {
  mistakeId: string
  userMessages: string[]
}

const memoryStore = {
  mistakes: [] as MistakeRecord[],
  diagnosis: [] as DiagnosisResult[],
}

const now = () => new Date().toISOString()

const uid = () => crypto.randomUUID()

export const createMistake = async (input: NewMistakeInput): Promise<MistakeRecord> => {
  if (isSupabaseEnabled && supabase) {
    const { data, error } = await supabase
      .from('mistakes')
      .insert({
        subject: input.subject,
        question_text: input.questionText,
        student_answer: input.studentAnswer,
        ocr_raw_text: input.ocrRawText ?? null,
      })
      .select('*')
      .single()

    if (error) throw error
    return {
      id: data.id,
      subject: data.subject,
      questionText: data.question_text,
      studentAnswer: data.student_answer,
      ocrRawText: data.ocr_raw_text,
      createdAt: data.created_at,
    }
  }

  const created: MistakeRecord = {
    id: uid(),
    subject: input.subject,
    questionText: input.questionText,
    studentAnswer: input.studentAnswer,
    ocrRawText: input.ocrRawText ?? null,
    createdAt: now(),
  }
  memoryStore.mistakes.unshift(created)
  return created
}

export const createDiagnosis = async (input: NewDiagnosisInput): Promise<DiagnosisResult> => {
  const mock = await runMockDiagnosis(input.mistakeId, input.userMessages)

  if (isSupabaseEnabled && supabase) {
    const { data, error } = await supabase
      .from('diagnoses')
      .insert({
        mistake_id: mock.mistakeId,
        chat_log: mock.chatLog,
        error_type: mock.errorType,
        knowledge_point: mock.knowledgePoint,
        state_tag: mock.stateTag,
        confidence: mock.confidence,
        summary: mock.summary,
      })
      .select('*')
      .single()
    if (error) throw error
    return {
      id: data.id,
      mistakeId: data.mistake_id,
      chatLog: data.chat_log,
      errorType: data.error_type,
      knowledgePoint: data.knowledge_point,
      stateTag: data.state_tag,
      confidence: Number(data.confidence),
      summary: data.summary,
      createdAt: data.created_at,
    }
  }

  const created: DiagnosisResult = {
    id: uid(),
    createdAt: now(),
    ...mock,
  }
  memoryStore.diagnosis.unshift(created)
  return created
}

export const getLatestDiagnosis = async (): Promise<DiagnosisResult | null> => {
  if (isSupabaseEnabled && supabase) {
    const { data, error } = await supabase
      .from('diagnoses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    return {
      id: data.id,
      mistakeId: data.mistake_id,
      chatLog: data.chat_log,
      errorType: data.error_type,
      knowledgePoint: data.knowledge_point,
      stateTag: data.state_tag,
      confidence: Number(data.confidence),
      summary: data.summary,
      createdAt: data.created_at,
    }
  }

  return memoryStore.diagnosis[0] ?? null
}

export const getWeaknessMap = async (): Promise<WeaknessPoint[]> => {
  if (isSupabaseEnabled && supabase) {
    const { data, error } = await supabase
      .from('diagnoses')
      .select('knowledge_point,error_type,created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    const bucket = new Map<string, WeaknessPoint>()
    for (const row of data ?? []) {
      const key = row.knowledge_point as string
      const item = bucket.get(key)
      if (!item) {
        bucket.set(key, {
          knowledgePoint: key,
          errorCount: 1,
          lastErrorAt: row.created_at,
          dominantErrorType: row.error_type,
        })
      } else {
        item.errorCount += 1
      }
    }
    return Array.from(bucket.values()).sort((a, b) => b.errorCount - a.errorCount)
  }

  const bucket = new Map<string, WeaknessPoint>()
  for (const d of memoryStore.diagnosis) {
    const item = bucket.get(d.knowledgePoint)
    if (!item) {
      bucket.set(d.knowledgePoint, {
        knowledgePoint: d.knowledgePoint,
        errorCount: 1,
        dominantErrorType: d.errorType,
        lastErrorAt: d.createdAt,
      })
    } else {
      item.errorCount += 1
    }
  }
  return Array.from(bucket.values()).sort((a, b) => b.errorCount - a.errorCount)
}
