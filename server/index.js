import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import {
  completeDiagnosisTrace,
  endDiagnosisGeneration,
  failDiagnosisGeneration,
  fallbackDiagnosisTrace,
  flushLangfuse,
  startDiagnosisGeneration,
  startDiagnosisTrace,
} from './langfuse.js'

// Ensure .env values override any stale shell-level exported vars.
dotenv.config({ override: true })

const app = express()
const port = Number(process.env.PORT || 8787)

app.use(cors())
app.use(express.json())

const DEFAULT_DIAGNOSIS = {
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

const normalizeMistakeContext = (value) => {
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
    ? `错题背景：
学科：${mistakeContext.subject || '未填写'}
题目内容：${mistakeContext.questionText || '未填写'}
学生原始作答：${mistakeContext.studentAnswer || '未填写'}\n\n`
    : ''

  return `${context}以下是学生在3轮诊断中的回答：
${transcript}

请先在内部完成“共情+追问”判断逻辑，再给出最终诊断 JSON。只返回 JSON。`
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
    const path = url.pathname || '/'
    if (!path.endsWith('/chat/completions')) {
      url.pathname = `${path.replace(/\/$/, '')}/chat/completions`
    }
    return url.toString()
  } catch {
    return apiUrl
  }
}

const callLlm = async (messages, mistakeContext, { trace, attempt }) => {
  const apiUrl = normalizeApiUrl(
    process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions',
  )
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'
  const generation = startDiagnosisGeneration({ trace, messages, model, attempt })
  const startedAt = Date.now()

  if (!apiKey) {
    throw new Error('服务端缺少 LLM_API_KEY')
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
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

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`LLM请求失败(${response.status}): ${body}`)
    }

    const data = await response.json()
    const diagnosis = parseDiagnosisJson(data?.choices?.[0]?.message?.content)
    const usage = data?.usage
      ? {
          input: data.usage.prompt_tokens,
          output: data.usage.completion_tokens,
          total: data.usage.total_tokens,
        }
      : undefined

    endDiagnosisGeneration({
      generation,
      diagnosis,
      usage,
      latencyMs: Date.now() - startedAt,
    })
    return diagnosis
  } catch (error) {
    failDiagnosisGeneration({
      generation,
      error,
      latencyMs: Date.now() - startedAt,
    })
    throw error
  }
}

const diagnoseWithRetry = async (messages, mistakeContext, evaluationCaseId = null) => {
  const maxAttempts = 3
  let lastError = null
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'
  const trace = startDiagnosisTrace({ messages, model, mistakeContext, evaluationCaseId })

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const diagnosis = await callLlm(messages, mistakeContext, { trace, attempt })
      completeDiagnosisTrace({ trace, diagnosis, attempts: attempt })
      return diagnosis
    } catch (error) {
      lastError = error
      const isFinal = attempt === maxAttempts
      if (isFinal) break
    }
  }

  fallbackDiagnosisTrace({ trace, error: lastError, attempts: maxAttempts })
  return {
    ...DEFAULT_DIAGNOSIS,
    fallback_reason: lastError instanceof Error ? lastError.message : 'unknown_error',
  }
}

app.post('/api/diagnosis', async (req, res) => {
  try {
    const userMessages = Array.isArray(req.body?.userMessages)
      ? req.body.userMessages.filter((m) => typeof m === 'string')
      : []

    const mistakeContext = normalizeMistakeContext(req.body?.mistakeContext)
    const evaluationCaseId = typeof req.body?.evaluationCaseId === 'string'
      ? req.body.evaluationCaseId.slice(0, 80)
      : null
    const diagnosis = await diagnoseWithRetry(userMessages, mistakeContext, evaluationCaseId)
    res.json(diagnosis)
  } catch (error) {
    res.status(200).json({
      ...DEFAULT_DIAGNOSIS,
      fallback_reason: error instanceof Error ? error.message : 'server_error',
    })
  } finally {
    // Flush asynchronously so observability does not delay the student-facing response.
    void flushLangfuse().catch((error) => console.warn('[Langfuse] flush failed', error))
  }
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.listen(port, () => {
  console.log(`diagnosis-api running on http://localhost:${port}`)
  console.log(
    `[LLM] config apiUrl=${process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions'} model=${process.env.LLM_MODEL || 'gpt-4o-mini'} apiKeyConfigured=${Boolean(process.env.LLM_API_KEY)}`,
  )
})
