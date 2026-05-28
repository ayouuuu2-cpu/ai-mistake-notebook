import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'

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

const buildUserPrompt = (messages = []) => {
  const transcript = messages.map((m, i) => `学生第${i + 1}次回答：${m}`).join('\n')
  return `以下是学生在3轮诊断中的回答：
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

const maskKey = (key) => {
  if (!key) return 'missing'
  if (key.length <= 8) return `${key.slice(0, 2)}***`
  return `${key.slice(0, 6)}***${key.slice(-2)}`
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

const callLlm = async (messages) => {
  const apiUrl = normalizeApiUrl(
    process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions',
  )
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'

  console.log(
    `[LLM] request apiUrl=${apiUrl} model=${model} keyPrefix=${maskKey(apiKey)} msgCount=${messages.length}`,
  )

  if (!apiKey) {
    throw new Error('服务端缺少 LLM_API_KEY')
  }

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
        { role: 'user', content: buildUserPrompt(messages) },
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
  const content = data?.choices?.[0]?.message?.content
  return parseDiagnosisJson(content)
}

const diagnoseWithRetry = async (messages) => {
  const maxAttempts = 3
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await callLlm(messages)
    } catch (error) {
      lastError = error
      const isFinal = attempt === maxAttempts
      if (isFinal) break
    }
  }

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

    const diagnosis = await diagnoseWithRetry(userMessages)
    res.json(diagnosis)
  } catch (error) {
    res.status(200).json({
      ...DEFAULT_DIAGNOSIS,
      fallback_reason: error instanceof Error ? error.message : 'server_error',
    })
  }
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.listen(port, () => {
  console.log(`diagnosis-api running on http://localhost:${port}`)
  console.log(
    `[LLM] config apiUrl=${process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions'} model=${process.env.LLM_MODEL || 'gpt-4o-mini'} keyPrefix=${maskKey(process.env.LLM_API_KEY)}`,
  )
})
