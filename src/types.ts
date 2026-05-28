export type Subject = '数学' | '语文' | '英语' | '物理' | '化学' | '生物' | '其他'

export type ErrorType =
  | '知识盲区'
  | '题型不熟'
  | '计算粗心'
  | '状态差'
  | '态度问题'

export type StateTag = '正常' | '疲惫' | '敷衍'

export interface MistakeRecord {
  id: string
  subject: Subject
  questionText: string
  studentAnswer: string
  ocrRawText: string | null
  createdAt: string
}

export interface DiagnosisResult {
  id: string
  mistakeId: string
  chatLog: Array<{ role: 'ai' | 'student'; content: string }>
  errorType: ErrorType
  knowledgePoint: string
  stateTag: StateTag
  confidence: number
  summary: string
  createdAt: string
}

export interface WeaknessPoint {
  knowledgePoint: string
  errorCount: number
  lastErrorAt: string
  dominantErrorType: ErrorType
}
