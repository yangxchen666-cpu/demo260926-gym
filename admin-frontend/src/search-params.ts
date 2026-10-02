import type { useSearchParams } from 'react-router-dom'

type SetSearchParams = ReturnType<typeof useSearchParams>[1]

/** 修改查询参数的回调式封装，避免覆盖未涉及的其他参数（列表页共用） */
export function updateParams(
  setSearchParams: SetSearchParams,
  mutate: (params: URLSearchParams) => void,
  { replace = false }: { replace?: boolean } = {},
): void {
  setSearchParams(
    prev => {
      const next = new URLSearchParams(prev)
      mutate(next)
      return next
    },
    { replace },
  )
}
