interface LogEntry {
  timestamp: string
  level: string
  message: string
  component?: string
  action?: string
}

const MAX_BUFFER_SIZE = 500

let logBuffer: LogEntry[] = []
let version = 0
let rafId: number | null = null

const logger = {
  log(
    level: 'log' | 'warn' | 'error',
    message: string,
    component?: string,
    action?: string
  ) {
    if (typeof window === 'undefined') return

    if (level === 'error') {
      console.error(message)
    } else if (level === 'warn') {
      console.warn(message)
    } else {
      console.log(message)
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      component: component || '-',
      action: action || '-',
    }

    logBuffer.push(entry)

    if (logBuffer.length > MAX_BUFFER_SIZE) {
      logBuffer.shift()
    }

    version++

    if (rafId !== null) {
      cancelAnimationFrame(rafId)
    }
    rafId = requestAnimationFrame(() => {
      rafId = null
    })
  },

  getLogs(): LogEntry[] {
    return logBuffer
  },

  getVersion(): number {
    return version
  },

  clearLogs() {
    logBuffer = []
    version++
  },
}

export default logger