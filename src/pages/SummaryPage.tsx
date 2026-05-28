import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getLatestDiagnosis } from '../lib/repository'
import type { DiagnosisResult } from '../types'

export function SummaryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const stateDiagnosis = (location.state as { diagnosis?: DiagnosisResult } | null)?.diagnosis
  const [data, setData] = useState<DiagnosisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (stateDiagnosis) {
      setData(stateDiagnosis)
      setLoading(false)
      return
    }

    void (async () => {
      try {
        const latest = await getLatestDiagnosis()
        setData(latest)
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [stateDiagnosis])

  if (loading) return <p className="muted">加载归纳结果中...</p>
  if (error) return <p className="muted">加载失败：{error}</p>
  if (!data) return <p className="muted">暂无诊断数据，请先完成一次对话诊断。</p>

  return (
    <section>
      <h2 className="page-title">错因归纳</h2>
      <p className="page-desc">展示 AI 结构化输出：知识点、错误原因、状态标签和置信度。</p>

      <div className="card">
        <p><strong>知识点：</strong>{data.knowledgePoint}</p>
        <p><strong>错误原因：</strong>{data.errorType}</p>
        <p><strong>状态标签：</strong>{data.stateTag}</p>
        <p><strong>置信度：</strong>{Math.round(data.confidence * 100)}%</p>
        <p><strong>诊断结论：</strong>{data.summary}</p>
      </div>

      <div className="card">
        <p className="label">对话记录（用于人工抽样复核）</p>
        {data.chatLog.map((message, idx) => (
          <p key={idx} className="muted">
            {message.role === 'ai' ? 'AI' : '学生'}：{message.content}
          </p>
        ))}
      </div>

      <div className="row">
        <button onClick={() => navigate('/weakness-map')}>查看薄弱点地图</button>
      </div>
    </section>
  )
}
