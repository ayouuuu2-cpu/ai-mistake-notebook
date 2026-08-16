import {
  completeDiagnosisTrace,
  endDiagnosisGeneration,
  failDiagnosisGeneration,
  fallbackDiagnosisTrace,
  startDiagnosisGeneration,
  startDiagnosisTrace,
} from './langfuse.js'

export const DEFAULT_DIAGNOSIS = {
  error_type: '题型不熟',
  knowledge_point: '待确认知识点',
  state: '正常',
  confidence: 0.5,
}

const SYSTEM_PROMPT = `你是“关心学生的学长”，任务是诊断错因，不是直接讲答案。

约束：
1) 说话简短自然，像学长，不要老师口吻。
2) 如果学生回答少于10个字，或包含“不知道/随便/都行/不会/不想”等词：
   - 先用一句共情
   - 再追问一个具体问题
   - 不直接给答案
3) 最终必须基于对话内容给出结构化诊断，只输出 JSON，不要额外文本。
4) JSON 必须严格是：
{
  "error_type": "知识盲区|题型不熟|计算粗心|状态差|态度问题",
  "knowledge_point": "具体知识点",
  "state": "正常|疲惫|敷衍",
  "confidence": 0到1的小数
}
`

export const normalizeMistakeContext = (value) => {
  if (!value || typeof value !== 'object') return null

  const trim = (input, maxLength) => String(input || '').trim().slice(0, maxLength)
  const subject = trim(value.subject, 20)
  const questionText = trim(value.questionText, 2400)
  const studentAnswer = trim(value.studentAnswer, 1200)

  if (!subject && !questionText && !studentAnswer) return null
  return { subject, questionText, studentAnswer }
}

const buildUserPrompt = (messages = [], mistakeContext = null) => {
  const transcript = messages.map((m, i) => `学生第${i + 1}次回答：${m}`).join('\n')
  const context = mistakeContext
    ? `错题背景：\n学科：${mistakeContext.subject || '未填写'}\n题目内容：${mistakeContext.questionText || '未填写'}\n学生原始作答：${mistakeContext.studentAnswer || '未填写'}\n\n`
    : ''

  return `${context}以下是学生在3轮诊断中的回答：\n${transcript}\n\n请先在内部完成“共情+追问”判断逻辑，再给出最终诊断 JSON。只返回 JSON。`
}

const parseDiagnosisJson = (rawContent) => {
  const trimmed = String(rawContent || '').trim()
  const jsonText = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    : trimmed
  const parsed = JSON.parse(jsonText)
  if (!parsed.error_type || !parsed.knowledge_point || !parsed.state) {
    throw new Error('模型返回字段不完整')
  }
  return {
    error_type: parsed.error_type,
    knowledge_point: parsed.knowledge_point,
    state: parsed.state,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
  }
}

const normalizeApiUrl = (apiUrl) => {
  try {
    const url = new URL(apiUrl)
    if (!url.pathname.endsWith('/chat/completions')) {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`
    }
    return url.toString()
  } catch {
    return apiUrl
  }
}

const callLlm = async (messages, mistakeContext, { trace, attempt }) => {
  const apiUrl = normalizeApiUrl(process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions')
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'
  const generation = startDiagnosisGeneration({ trace, messages, model, attempt })
  const startedAt = Date.now()

  if (!apiKey) throw new Error('服务端缺少 LLM_API_KEY')

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(messages, mistakeContext) },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) throw new Error(`LLM请求失败(${response.status}): ${await response.text()}`)

    const data = await response.json()
    const diagnosis = parseDiagnosisJson(data?.choices?.[0]?.message?.content)
    const usage = data?.usage
      ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens, total: data.usage.total_tokens }
      : undefined
    endDiagnosisGeneration({ generation, diagnosis, usage, latencyMs: Date.now() - startedAt })
    return diagnosis
  } catch (error) {
    failDiagnosisGeneration({ generation, error, latencyMs: Date.now() - startedAt })
    throw error
  }
}

export const diagnoseWithRetry = async ({ messages, mistakeContext, evaluationCaseId = null }) => {
  const maxAttempts = 3
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'
  const trace = startDiagnosisTrace({ messages, model, mistakeContext, evaluationCaseId })
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const diagnosis = await callLlm(messages, mistakeContext, { trace, attempt })
      completeDiagnosisTrace({ trace, diagnosis, attempts: attempt })
      return diagnosis
    } catch (error) {
      lastError = error
    }
  }

  fallbackDiagnosisTrace({ trace, error: lastError, attempts: maxAttempts })
  return {
    ...DEFAULT_DIAGNOSIS,
    fallback_reason: lastError instanceof Error ? lastError.message : 'unknown_error',
  }
}
