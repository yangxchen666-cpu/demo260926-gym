import { useEffect } from 'react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmText?: string
  onConfirm(): void
  onCancel(): void
}

/** 危险操作二次确认弹窗：遮罩/ESC 关闭，点击遮罩也算取消 */
export default function ConfirmDialog({
  title,
  message,
  confirmText = '确认删除',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-96 rounded-lg bg-surface p-6 shadow-lg"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="mb-2 text-base font-semibold">{title}</h2>
        <p className="mb-6 text-sm text-muted">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-md bg-danger px-3 py-1.5 text-sm text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-danger"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
