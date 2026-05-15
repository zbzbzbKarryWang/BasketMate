// 工具函数
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const weekday = weekdays[date.getDay()]
  return `${month}月${day}日 ${weekday}`
}

export function getRelativeDay(dateStr: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === -1) return '昨天'
  if (diff === 2) return '后天'
  return ''
}

export function getTodayString(): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getTomorrowString(): string {
  const tomorrow = new Date()
  tomorrow.setHours(0, 0, 0, 0)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const year = tomorrow.getFullYear()
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
  const day = String(tomorrow.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getDayAfterTomorrowString(): string {
  const dayAfterTomorrow = new Date()
  dayAfterTomorrow.setHours(0, 0, 0, 0)
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)
  const year = dayAfterTomorrow.getFullYear()
  const month = String(dayAfterTomorrow.getMonth() + 1).padStart(2, '0')
  const day = String(dayAfterTomorrow.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
