import type { ReactNode } from "react"

export function ActivityDisclosure({
  id,
  open,
  onToggle,
  summaryClassName,
  detailsClassName,
  summary,
  children,
}: {
  id: string
  open: boolean
  onToggle: () => void
  summaryClassName: string
  detailsClassName: string
  summary: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <button
        type="button"
        className={summaryClassName}
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        {summary}
      </button>
      <div id={id} className={detailsClassName} hidden={!open}>
        {children}
      </div>
    </>
  )
}
