import { readFile, writeFile } from 'node:fs/promises'

const baseUrl = process.env.EVALUATION_API_URL || 'http://127.0.0.1:8787'
const casesPath = new URL('../evaluation/mistake-diagnosis-cases.json', import.meta.url)
const cases = JSON.parse(await readFile(casesPath, 'utf8')).cases

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
const report = {
  evaluatedAt: new Date().toISOString(),
  total: results.length,
  structuredOutputRate: count((item) => item.structured) / results.length,
  errorTypeMatchRate: count((item) => item.errorTypeMatched) / results.length,
  stateMatchRate: count((item) => item.stateMatched) / results.length,
  averageLatencyMs: Math.round(results.reduce((sum, item) => sum + item.latencyMs, 0) / results.length),
  results,
}

const reportPath = new URL('../evaluation/latest-report.json', import.meta.url)
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

const output = process.env.EVALUATION_OUTPUT === 'summary'
  ? { ...report, results: undefined }
  : report

console.log(JSON.stringify(output, null, 2))
