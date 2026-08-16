import dotenv from 'dotenv'
import { LangfuseSpanProcessor } from '@langfuse/otel'
import { startObservation } from '@langfuse/tracing'
import { NodeSDK } from '@opentelemetry/sdk-node'

// This module is imported before index.js calls dotenv.config(). Load the local
// configuration here so tracing is initialized with the correct project keys.
dotenv.config({ override: true, quiet: true })

let initialized = false
let tracingEnabled = false
let langfuseSpanProcessor = null

const inputSummary = (messages) => ({
  answerCount: messages.length,
  answerLengths: messages.map((message) => String(message).trim().length),
})

const safeError = (error) => {
  const message = error instanceof Error ? error.message : String(error || 'unknown_error')
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 300)
}

const ensureTracing = () => {
  if (initialized) return tracingEnabled
  initialized = true

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY

  if (!publicKey || !secretKey) {
    console.log('[Langfuse] disabled: missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY')
    return false
  }

  langfuseSpanProcessor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    environment: process.env.NODE_ENV || 'development',
    exportMode: 'immediate',
  })

  const sdk = new NodeSDK({ spanProcessors: [langfuseSpanProcessor] })
  sdk.start()
  tracingEnabled = true
  console.log('[Langfuse] tracing enabled (OpenTelemetry)')
  return true
}

export const startDiagnosisTrace = ({ messages, model, mistakeContext, evaluationCaseId }) => {
  if (!ensureTracing()) return null

  return startObservation('mistake-diagnosis', {
    input: inputSummary(messages),
    metadata: {
      feature: 'ai-mistake-notebook',
      model,
      subject: mistakeContext?.subject || 'unknown',
      hasMistakeContext: Boolean(mistakeContext),
      evaluationCaseId,
      rawStudentContentLogged: false,
    },
  })
}

export const startDiagnosisGeneration = ({ trace, messages, model, attempt }) => {
  if (!trace) return null

  return trace.startObservation(
    'diagnosis-llm-call',
    {
      model,
      input: inputSummary(messages),
      modelParameters: {
        temperature: 0.2,
        response_format: 'json_object',
      },
      metadata: { attempt },
    },
    { asType: 'generation' },
  )
}

export const endDiagnosisGeneration = ({ generation, diagnosis, usage, latencyMs }) => {
  if (!generation) return
  generation.update({
    output: diagnosis,
    usageDetails: usage,
    metadata: { latencyMs, schemaValid: true },
  })
  generation.end()
}

export const failDiagnosisGeneration = ({ generation, error, latencyMs }) => {
  if (!generation) return
  generation.update({
    level: 'ERROR',
    statusMessage: safeError(error),
    metadata: { latencyMs, schemaValid: false },
  })
  generation.end()
}

export const completeDiagnosisTrace = ({ trace, diagnosis, attempts }) => {
  if (!trace) return
  trace.update({
    output: { status: 'success', diagnosis },
    metadata: { attempts, fallback: false },
  })
  trace.end()
}

export const fallbackDiagnosisTrace = ({ trace, error, attempts }) => {
  if (!trace) return
  trace.update({
    output: { status: 'fallback' },
    metadata: {
      attempts,
      fallback: true,
      fallbackReason: safeError(error),
    },
  })
  trace.end()
}

export const flushLangfuse = async () => {
  if (ensureTracing()) await langfuseSpanProcessor.forceFlush()
}
