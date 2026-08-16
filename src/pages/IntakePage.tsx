import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createMistake } from '../lib/repository'
import { trackProductEvent } from '../lib/analytics'
import type { Subject } from '../types'

const subjects: Subject[] = ['数学', '语文', '英语', '物理', '化学', '生物', '其他']

export function IntakePage() {
  const navigate = useNavigate()
  const [subject, setSubject] = useState<Subject>('数学')
  const [questionText, setQuestionText] = useState('')
  const [studentAnswer, setStudentAnswer] = useState('')
  const [ocrRawText, setOcrRawText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const record = await createMistake({
        subject,
        questionText,
        studentAnswer,
        ocrRawText: ocrRawText || null,
      })
      void trackProductEvent({
        eventName: 'mistake_created',
        subject,
        mistakeId: record.id,
        metadata: {
          hasOcrText: Boolean(ocrRawText.trim()),
          questionLength: questionText.trim().length,
          answerLength: studentAnswer.trim().length,
        },
      })
      navigate(`/diagnosis?mistakeId=${record.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2 className="page-title">错题录入</h2>
      <p className="page-desc">MVP 支持拍照 OCR 文本确认（模拟）与手动录入，确认后立即进入 AI 对话诊断。</p>

      <form onSubmit={onSubmit} className="card">
        <div className="grid">
          <div>
            <label className="label">学科</label>
            <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
              {subjects.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">OCR 原文（拍照识别后可编辑确认）</label>
            <input
              value={ocrRawText}
              onChange={(e) => setOcrRawText(e.target.value)}
              placeholder="例如：已识别题干和作答草稿"
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label className="label">题目内容</label>
          <textarea
            required
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="请输入题干"
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label className="label">学生错误答案</label>
          <textarea
            required
            value={studentAnswer}
            onChange={(e) => setStudentAnswer(e.target.value)}
            placeholder="请输入学生当时的错误作答"
          />
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <button type="submit" disabled={saving}>
            {saving ? '提交中...' : '确认并进入 AI 诊断'}
          </button>
        </div>
        {error && <p className="muted">保存失败：{error}</p>}
      </form>
    </section>
  )
}
