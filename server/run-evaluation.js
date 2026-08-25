import { readFile, writeFile } from 'node:fs/promises'

const baseUrl = process.env.EVALUATION_API_URL || 'http://127.0.0.1:8787'
const casesPath = new URL('../evaluation/mistake-diagnosis-cases.json', import.meta.url)
const dataset = JSON.parse(await readFile(casesPath, 'utf8'))
const cases = dataset.cases
const evaluationRunId = process.env.EVALUATION_RUN_ID || `eval-${new Date().toISOString().replace(/[:.]/g, '-')}`

const getRuntimeInfo = async () => {
  try {
    const response = await fetch(`${baseUrl}/api/health`)
    if (!response.ok) return { promptVersion: 'unknown' }
    return await response.json()
  } catch {
    return { promptVersion: 'unknown' }
  }
}

const runtimeInfo = await getRuntimeInfo()

const requestDiagnosis = async (body) => {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return await response.json()
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 300))
    }
  }
  throw lastError
}

const runCase = async (testCase) => {
  const startedAt = Date.now()
  try {
    const actual = await requestDiagnosis({
      evaluationCaseId: testCase.id,
      evaluationRunId,
      evaluationDatasetVersion: dataset.version,
      userMessages: testCase.userMessages,
      mistakeContext: {
        subject: testCase.subject,
        questionText: testCase.questionText,
        studentAnswer: testCase.studentAnswer,
      },
    })

    const structured = Boolean(
      actual.error_type && actual.knowledge_point && actual.state && Number.isFinite(actual.confidence),
    )

    return {
      id: testCase.id,
      stage: testCase.stage,
      subject: testCase.subject,
      expectedErrorType: testCase.expected.errorType,
      expectedState: testCase.expected.state,
      expected: testCase.expected,
      actual,
      latencyMs: Date.now() - startedAt,
      structured,
      errorTypeMatched: actual.error_type === testCase.expected.errorType,
      stateMatched: actual.state === testCase.expected.state,
    }
  } catch (error) {
    return {
      id: testCase.id,
      stage: testCase.stage,
      subject: testCase.subject,
      expectedErrorType: testCase.expected.errorType,
      expectedState: testCase.expected.state,
      expected: testCase.expected,
      actual: { fallback_reason: error instanceof Error ? error.message : 'request_failed' },
      latencyMs: Date.now() - startedAt,
      structured: false,
      errorTypeMatched: false,
      stateMatched: false,
    }
  }
}

const results = []
const concurrency = Math.max(1, Math.min(4, Number(process.env.EVALUATION_CONCURRENCY || 3)))
let nextIndex = 0

const worker = async () => {
  while (nextIndex < cases.length) {
    const testCase = cases[nextIndex]
    nextIndex += 1
    results.push(await runCase(testCase))
  }
}

await Promise.all(Array.from({ length: concurrency }, worker))

const count = (predicate) => results.filter(predicate).length
const summarizeBy = (key, matchedKey) => {
  const buckets = new Map()
  for (const item of results) {
    const value = item[key]
    const current = buckets.get(value) || { total: 0, matched: 0 }
    current.total += 1
    if (item[matchedKey]) current.matched += 1
    buckets.set(value, current)
  }
  return Object.fromEntries(
    [...buckets.entries()].map(([name, item]) => [name, {
      ...item,
      matchRate: Number((item.matched / item.total).toFixed(4)),
    }]),
  )
}

const report = {
  evaluatedAt: new Date().toISOString(),
  evaluationRunId,
  datasetVersion: dataset.version,
  datasetDescription: dataset.description,
  promptVersion: runtimeInfo.promptVersion || 'unknown',
  total: results.length,
  structuredOutputRate: count((item) => item.structured) / results.length,
  errorTypeMatchRate: count((item) => item.errorTypeMatched) / results.length,
  stateMatchRate: count((item) => item.stateMatched) / results.length,
  averageLatencyMs: Math.round(results.reduce((sum, item) => sum + item.latencyMs, 0) / results.length),
  byErrorType: summarizeBy('expectedErrorType', 'errorTypeMatched'),
  byState: summarizeBy('expectedState', 'stateMatched'),
  byStage: summarizeBy('stage', 'errorTypeMatched'),
  results,
}

const reportPath = new URL('../evaluation/latest-report.json', import.meta.url)
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

const output = process.env.EVALUATION_OUTPUT === 'summary'
  ? { ...report, results: undefined }
  : report

console.log(JSON.stringify(output, null, 2))
