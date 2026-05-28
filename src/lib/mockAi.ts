import type { DiagnosisResult, ErrorType, StateTag } from '../types'

type DiagnosisJson = {
  error_type: ErrorType
  knowledge_point: string
  state: StateTag
  confidence: number
  fallback_reason?: string
}

const parseDiagnosisJson = (raw: unknown): DiagnosisJson => {
  const parsed = raw as Partial<DiagnosisJson>
  if (parsed?.fallback_reason) {
    throw new Error(`诊断降级：${parsed.fallback_reason}`)
  }
  if (!parsed || !parsed.error_type || !parsed.knowledge_point || !parsed.state) {
    throw new Error('后端返回字段不完整')
  }
  return {
    error_type: parsed.error_type,
    knowledge_point: parsed.knowledge_point,
    state: parsed.state,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
  }
}

export const runMockDiagnosis = async (
  mistakeId: string,
  userMessages: string[],
): Promise<Omit<DiagnosisResult, 'id' | 'createdAt'>> => {
  const response = await fetch('/api/diagnosis', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userMessages }),
  })

  if (!response.ok) {
    throw new Error(`诊断服务请求失败：${response.status}`)
  }

  const parsed = parseDiagnosisJson(await response.json())
  const summary = `初步判断你在「${parsed.knowledge_point}」主要是「${parsed.error_type}」，建议先复盘关键步骤。`

  return {
    mistakeId,
    chatLog: [
      { role: 'ai', content: '你知道这道题考的是什么知识点吗？' },
      ...userMessages.map((text) => ({ role: 'student' as const, content: text })),
    ],
    errorType: parsed.error_type,
    knowledgePoint: parsed.knowledge_point,
    stateTag: parsed.state,
    confidence: parsed.confidence,
    summary,
  }
}
