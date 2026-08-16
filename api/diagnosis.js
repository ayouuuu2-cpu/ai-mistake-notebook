import { DEFAULT_DIAGNOSIS, diagnoseWithRetry, normalizeMistakeContext } from '../server/diagnosis-service.js'
import { flushLangfuse } from '../server/langfuse.js'

export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const messages = Array.isArray(req.body?.userMessages)
      ? req.body.userMessages.filter((item) => typeof item === 'string')
      : []
    const evaluationCaseId = typeof req.body?.evaluationCaseId === 'string'
      ? req.body.evaluationCaseId.slice(0, 80)
      : null
    const diagnosis = await diagnoseWithRetry({
      messages,
      mistakeContext: normalizeMistakeContext(req.body?.mistakeContext),
      evaluationCaseId,
    })
    res.status(200).json(diagnosis)
  } catch (error) {
    res.status(200).json({
      ...DEFAULT_DIAGNOSIS,
      fallback_reason: error instanceof Error ? error.message : 'server_error',
    })
  } finally {
    await flushLangfuse().catch((error) => console.warn('[Langfuse] flush failed', error))
  }
}
