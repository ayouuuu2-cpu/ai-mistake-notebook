import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { DEFAULT_DIAGNOSIS, PROMPT_VERSION, diagnoseWithRetry, normalizeMistakeContext } from './diagnosis-service.js'
import { flushLangfuse } from './langfuse.js'

dotenv.config({ override: true })

const app = express()
const port = Number(process.env.PORT || 8787)

app.use(cors())
app.use(express.json())

app.post('/api/diagnosis', async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.userMessages)
      ? req.body.userMessages.filter((item) => typeof item === 'string')
      : []
    const evaluationCaseId = typeof req.body?.evaluationCaseId === 'string'
      ? req.body.evaluationCaseId.slice(0, 80)
      : null
    const evaluationRunId = typeof req.body?.evaluationRunId === 'string'
      ? req.body.evaluationRunId.slice(0, 80)
      : null
    const evaluationDatasetVersion = typeof req.body?.evaluationDatasetVersion === 'string'
      ? req.body.evaluationDatasetVersion.slice(0, 40)
      : null
    const diagnosis = await diagnoseWithRetry({
      messages,
      mistakeContext: normalizeMistakeContext(req.body?.mistakeContext),
      evaluationCaseId,
      evaluationRunId,
      evaluationDatasetVersion,
    })
    res.json(diagnosis)
  } catch (error) {
    res.status(200).json({
      ...DEFAULT_DIAGNOSIS,
      fallback_reason: error instanceof Error ? error.message : 'server_error',
    })
  } finally {
    void flushLangfuse().catch((error) => console.warn('[Langfuse] flush failed', error))
  }
})

app.get('/api/health', (_req, res) => res.json({ ok: true, promptVersion: PROMPT_VERSION }))

app.listen(port, () => {
  console.log(`diagnosis-api running on http://localhost:${port}`)
  console.log(`[LLM] model=${process.env.LLM_MODEL || 'gpt-4o-mini'} apiKeyConfigured=${Boolean(process.env.LLM_API_KEY)}`)
})
