import { useEffect, useState } from 'react'
import { getWeaknessMap } from '../lib/repository'
import type { WeaknessPoint } from '../types'

export function WeaknessMapPage() {
  const [points, setPoints] = useState<WeaknessPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const list = await getWeaknessMap()
        setPoints(list)
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <section>
      <h2 className="page-title">薄弱点地图</h2>
      <p className="page-desc">按知识点聚合错误次数，形成个体化薄弱点排序。</p>

      {loading && <p className="muted">加载中...</p>}
      {error && <p className="muted">加载失败：{error}</p>}
      {!loading && !error && points.length === 0 && (
        <p className="muted">暂无数据，请先完成几条错题诊断。</p>
      )}

      {!loading &&
        !error &&
        points.map((item) => (
          <article className="card" key={item.knowledgePoint}>
            <h3 style={{ marginTop: 0 }}>{item.knowledgePoint}</h3>
            <span className="pill">累计错误：{item.errorCount}</span>
            <span className="pill">主导错因：{item.dominantErrorType}</span>
            <span className="pill">
              最近错题：{new Date(item.lastErrorAt).toLocaleString('zh-CN')}
            </span>
          </article>
        ))}
    </section>
  )
}
