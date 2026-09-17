import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeKnowledgePoint } from './diagnosis-service.js'

const mathContext = { subject: '数学' }

test('normalizes malformed negative-parenthesis labels in math', () => {
  assert.equal(
    normalizeKnowledgePoint('字符串前有负号时的去字符串规则', mathContext),
    '括号前有负号时的去括号规则',
  )
  assert.equal(
    normalizeKnowledgePoint('直流前有负号时的去直流规则', mathContext),
    '括号前有负号时的去括号规则',
  )
  assert.equal(
    normalizeKnowledgePoint('括号前有负号时的去直流规则', mathContext),
    '括号前有负号时的去括号规则',
  )
})

test('preserves valid terms and non-math terminology', () => {
  assert.equal(
    normalizeKnowledgePoint('括号前有负号时的去括号规则', mathContext),
    '括号前有负号时的去括号规则',
  )
  assert.equal(
    normalizeKnowledgePoint('直流电路中电流方向判断', { subject: '物理' }),
    '直流电路中电流方向判断',
  )
  assert.equal(
    normalizeKnowledgePoint('字符串拼接与转义规则', { subject: '信息技术' }),
    '字符串拼接与转义规则',
  )
})
