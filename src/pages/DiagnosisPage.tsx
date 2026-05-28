import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createDiagnosis } from '../lib/repository'

const prompts = [
  '你知道这道题考的是什么知识点吗？',
  '你当时是怎么想的，哪一步觉得没把握？',
  '你觉得是不会这个知识点，还是会但是算错了？',
]

export function DiagnosisPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const mistakeId = useMemo(
    () => new URLSearchParams(location.search).get('mistakeId') ?? 'demo-mistake',
    [location.search],
  )

  const [answers, setAnswers] = useState(['', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onChange = (index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const onDiagnose = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    const normalized = prompts.map((_, index) =>
      String(formData.get(`q${index + 1}`) ?? '').trim(),
    )
    const answeredIndexes = normalized
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.length > 0)

    if (answeredIndexes.length < 2) {
      setError('请至少回答 2 个问题，帮助系统更准确归纳错因。')
      return
    }

    // 保留题号，避免后续记录时出现 Q2/Q3 映射混淆。
    const messages = prompts.map(
      (prompt, index) =>
        `Q${index + 1}：${prompt} 学生回答：${normalized[index] || '（未作答）'}`,
    )

    setLoading(true)
    setError(null)
    try {
      const diagnosis = await createDiagnosis({ mistakeId, userMessages: messages })
      navigate('/summary', { state: { diagnosis } })
    } catch (e) {
      setError(e instanceof Error ? e.message : '诊断失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2 className="page-title">AI 对话诊断</h2>
      <p className="page-desc">
        控制在 2-3 个问题内完成状态与错因判断。当前页面先实现结构化采集，再接入真实大模型 Prompt。
      </p>

      <form className="card" onSubmit={onDiagnose}>
        {prompts.map((item, index) => (
          <div key={item} style={{ marginBottom: 12 }}>
            <label className="label">Q{index + 1}. {item}</label>
            <textarea
              name={`q${index + 1}`}
              value={answers[index]}
              onChange={(e) => onChange(index, e.target.value)}
              placeholder="请输入学生回答"
            />
          </div>
        ))}

        <div className="row">
          <button type="submit" disabled={loading}>
            {loading ? '诊断中...' : '生成错因归纳'}
          </button>
        </div>
        {error && <p className="muted">{error}</p>}
      </form>
    </section>
  )
}
