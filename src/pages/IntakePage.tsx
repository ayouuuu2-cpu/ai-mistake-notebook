import { useEffect, useState } from 'react'
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
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [imageName, setImageName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
  }, [imagePreviewUrl])

  const onImageSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const image = event.target.files?.[0]
    if (!image) return
    if (!image.type.startsWith('image/')) {
      setError('请上传图片格式的错题截图或照片。')
      event.target.value = ''
      return
    }
    if (image.size > 8 * 1024 * 1024) {
      setError('图片请控制在 8MB 以内。')
      event.target.value = ''
      return
    }
    setError(null)
    setImageName(image.name)
    setImagePreviewUrl(URL.createObjectURL(image))
  }

  const clearSelectedImage = () => {
    setImagePreviewUrl(null)
    setImageName(null)
  }

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
          hasImage: Boolean(imagePreviewUrl),
          hasOcrText: Boolean(ocrRawText.trim()),
          ocrTextConfirmed: Boolean(ocrRawText.trim() && questionText.trim()),
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
      <p className="page-desc">先选择错题图片并确认题干文本，再进入 AI 对话诊断。图片仅在当前浏览器预览，不会上传或写入数据库。</p>

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
            <label className="label">识别文本（可编辑确认）</label>
            <input
              value={ocrRawText}
              onChange={(e) => setOcrRawText(e.target.value)}
              placeholder="粘贴 OCR 识别出的题干或作答草稿"
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label className="label">错题图片（可选）</label>
          <input className="file-input" type="file" accept="image/*" onChange={onImageSelected} />
          <p className="muted upload-note">支持截图或拍照；当前版本提供本地预览与人工文本确认，不调用第三方 OCR，也不保存原图。</p>
          {imagePreviewUrl && (
            <div className="image-preview-wrap">
              <img className="image-preview" src={imagePreviewUrl} alt="待确认的错题图片预览" />
              <div className="row image-preview-meta">
                <span className="muted">已选择：{imageName}</span>
                <button className="secondary compact-button" type="button" onClick={clearSelectedImage}>移除图片</button>
              </div>
            </div>
          )}
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
