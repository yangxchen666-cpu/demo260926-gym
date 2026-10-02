import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch, AuthRedirectError } from '../api'
import { VENUE_TYPES } from '../types'
import type { VenueRow, VenueType } from '../types'

type LoadStatus = 'loading' | 'notfound' | 'error' | 'ready'

interface FormState {
  name: string
  type: VenueType
  location: string
  image: string
  description: string
  opening_hours: string
  contact: string
}

const EMPTY_FORM: FormState = {
  name: '',
  type: '足球场',
  location: '',
  image: '',
  description: '',
  opening_hours: '',
  contact: '',
}

/** 前端预校验，规则与服务端 VenueRequest 对齐（非空 + 四类） */
function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {}
  if (!form.name.trim()) errors.name = '请输入场馆名称'
  if (!VENUE_TYPES.includes(form.type)) errors.type = '请选择场馆类型'
  if (!form.location.trim()) errors.location = '请输入位置'
  if (!form.image.trim()) errors.image = '请输入图片 URL'
  if (!form.description.trim()) errors.description = '请输入场馆简介'
  if (!form.opening_hours.trim()) errors.opening_hours = '请输入开放时间'
  if (!form.contact.trim()) errors.contact = '请输入联系方式'
  return errors
}

/** 新建/编辑二合一：/venues/new 与 /venues/:id/edit 共用 */
export default function VenueEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = id !== undefined
  const parsedId = isEdit ? Number(id) : NaN

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loadStatus, setLoadStatus] = useState<LoadStatus>(() =>
    isEdit ? 'loading' : 'ready',
  )
  const [reloadTick, setReloadTick] = useState(0)
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  /* 编辑模式：非法 id 不发请求；拉取详情回填表单 */
  useEffect(() => {
    if (!isEdit) return
    if (!Number.isInteger(parsedId) || parsedId < 1) {
      setLoadStatus('notfound')
      return
    }
    let cancelled = false
    apiFetch<VenueRow>(`/api/venues/${parsedId}`)
      .then(data => {
        if (cancelled) return
        setForm({
          name: data.name,
          type: data.type,
          location: data.location,
          image: data.image,
          description: data.description,
          opening_hours: data.opening_hours,
          contact: data.contact,
        })
        setLoadStatus('ready')
      })
      .catch(err => {
        if (cancelled) return
        if (err instanceof AuthRedirectError) return
        const msg = err instanceof Error ? err.message : ''
        if (msg === 'venue not found') setLoadStatus('notfound')
        else setLoadStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [isEdit, parsedId, reloadTick])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setFieldErrors(prev => ({ ...prev, [key]: undefined }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const errors = validate(form)
    setFieldErrors(errors)
    if (Object.values(errors).some(Boolean)) return
    setSubmitting(true)
    setServerError(null)
    try {
      if (isEdit) {
        await apiFetch<VenueRow>(`/api/venues/${parsedId}`, {
          method: 'PUT',
          body: form,
        })
      } else {
        await apiFetch<VenueRow>('/api/venues', { method: 'POST', body: form })
      }
      navigate('/venues')
    } catch (err) {
      if (err instanceof AuthRedirectError) return
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'venue not found') {
        setServerError('该场馆已被删除，无法保存')
      } else {
        setServerError(msg || '保存失败，请重试')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm ' +
    'focus:border-accent focus:outline-none'
  const labelClass = 'mb-1 block text-sm text-muted'
  const errorClass = 'mt-1 text-sm text-danger'

  function fieldError(key: keyof FormState) {
    return fieldErrors[key] ? (
      <p className={errorClass}>{fieldErrors[key]}</p>
    ) : null
  }

  return (
    <div className="max-w-3xl">
      <Link
        to="/venues"
        className="text-sm text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      >
        ← 返回场馆列表
      </Link>
      <h1 className="mt-3 text-xl font-semibold">
        {isEdit ? '编辑场馆' : '新增场馆'}
      </h1>

      {loadStatus === 'loading' && (
        <p className="py-10 text-center text-sm text-muted">加载中…</p>
      )}

      {loadStatus === 'notfound' && (
        <div className="py-10 text-center">
          <p className="font-medium">该场馆不存在或已被删除</p>
          <Link
            to="/venues"
            className="mt-4 inline-block rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:bg-bg"
          >
            返回列表
          </Link>
        </div>
      )}

      {loadStatus === 'error' && (
        <div className="py-10 text-center">
          <p className="font-medium">场馆数据加载失败</p>
          <button
            type="button"
            onClick={() => setReloadTick(t => t + 1)}
            className="mt-4 rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-strong"
          >
            重新加载
          </button>
        </div>
      )}

      {loadStatus === 'ready' && (
        <form
          className="mt-4 rounded-lg border border-line bg-surface p-6"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className={labelClass}>
                名称
              </label>
              <input
                id="name"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                className={inputClass}
              />
              {fieldError('name')}
            </div>
            <div>
              <label htmlFor="type" className={labelClass}>
                类型
              </label>
              <select
                id="type"
                value={form.type}
                onChange={e => set('type', e.target.value as VenueType)}
                className={inputClass}
              >
                {VENUE_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {fieldError('type')}
            </div>
            <div className="col-span-2">
              <label htmlFor="location" className={labelClass}>
                位置
              </label>
              <input
                id="location"
                value={form.location}
                onChange={e => set('location', e.target.value)}
                className={inputClass}
              />
              {fieldError('location')}
            </div>
            <div className="col-span-2">
              <label htmlFor="image" className={labelClass}>
                图片 URL
              </label>
              <input
                id="image"
                value={form.image}
                onChange={e => set('image', e.target.value)}
                placeholder="https://…"
                className={inputClass}
              />
              {fieldError('image')}
              {form.image.trim() !== '' && (
                <img
                  src={form.image}
                  alt="场馆图片预览"
                  className="mt-2 h-28 w-44 rounded-md border border-line object-cover"
                  onError={e => {
                    e.currentTarget.style.display = 'none'
                  }}
                  onLoad={e => {
                    e.currentTarget.style.display = ''
                  }}
                />
              )}
            </div>
            <div>
              <label htmlFor="opening_hours" className={labelClass}>
                开放时间
              </label>
              <input
                id="opening_hours"
                value={form.opening_hours}
                onChange={e => set('opening_hours', e.target.value)}
                placeholder="如 08:00-22:00"
                className={inputClass}
              />
              {fieldError('opening_hours')}
            </div>
            <div>
              <label htmlFor="contact" className={labelClass}>
                联系方式
              </label>
              <input
                id="contact"
                value={form.contact}
                onChange={e => set('contact', e.target.value)}
                placeholder="如 010-12345678"
                className={inputClass}
              />
              {fieldError('contact')}
            </div>
            <div className="col-span-2">
              <label htmlFor="description" className={labelClass}>
                场馆简介
              </label>
              <textarea
                id="description"
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={4}
                className={inputClass}
              />
              {fieldError('description')}
            </div>
          </div>

          {serverError && (
            <p className="mt-4 text-sm text-danger" role="alert">
              {serverError}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Link
              to="/venues"
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
            >
              取消
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-accent px-4 py-1.5 text-sm text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent-strong disabled:opacity-50"
            >
              {submitting ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
