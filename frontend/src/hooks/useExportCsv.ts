import { useCallback } from 'react'

type Row = Record<string, any>

function escapeCell(val: any): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.indexOf('\n') !== -1) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function useExportCsv() {
  const exportCsv = useCallback((filename: string, rows: Row[], columns?: { key: string; label: string }[]) => {
    if (!rows || rows.length === 0) return

    const cols = columns || Object.keys(rows[0]).map((k) => ({ key: k, label: k }))
    const header = cols.map((c) => escapeCell(c.label)).join(',')
    const body = rows.map((row) =>
      cols.map((c) => escapeCell(row[c.key])).join(',')
    ).join('\n')

    const csv = header + '\n' + body
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  return { exportCsv }
}
