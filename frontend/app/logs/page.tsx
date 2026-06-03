"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Download, Trash2, Upload } from "lucide-react"
import logger from "@/lib/logger"
import { toast } from "@/lib/toast"

type TabType = "backend" | "frontend-local" | "frontend-server"

const API_PATHS = [
  "全部",
  "/api/ingredients",
  "/api/recipes",
  "/api/plans",
  "/api/prices",
  "/api/shops",
  "/api/shopping",
  "/api/health",
  "/api/logs",
]

const LOG_LEVELS = [
  "全部",
  "INFO",
  "ERROR",
  "WARNING",
  "DEBUG",
]

const COMPONENTS = [
  "全部",
  "APIClient",
  "DataContext",
  "-",
]

const ACTIONS = [
  "全部",
  "request",
  "updateIngredient",
  "deleteIngredient",
  "addIngredient",
]

function parseLogTime(line: string): Date | null {
  try {
    const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})[,.](\d{3})/)
    if (match) {
      const timeStr = `${match[1]}.${match[2]}`
      return new Date(timeStr.replace(" ", "T") + "+08:00")
    }
    const match2 = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/)
    if (match2) {
      return new Date(match2[1].replace(" ", "T") + ".000+08:00")
    }
    return null
  } catch {
    return null
  }
}

function parseFrontendLogTime(line: string): Date | null {
  try {
    const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3})/)
    if (match) {
      return new Date(match[1] + "+08:00")
    }
    return null
  } catch {
    return null
  }
}

export default function LogsPage() {
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<TabType>("backend")

  const [backendLogs, setBackendLogs] = useState<string[]>([])
  const [rawBackendLogs, setRawBackendLogs] = useState("")
  const [backendLoading, setBackendLoading] = useState(true)
  const [backendCopied, setBackendCopied] = useState(false)

  const [frontendLocalLogs, setFrontendLocalLogs] = useState<any[]>([])
  const [frontendLocalVersion, setFrontendLocalVersion] = useState(0)
  const [frontendLocalCopied, setFrontendLocalCopied] = useState(false)
  const [frontendLocalUploading, setFrontendLocalUploading] = useState(false)

  const [serverLogs, setServerLogs] = useState<string[]>([])
  const [rawServerLogs, setRawServerLogs] = useState("")
  const [serverLoading, setServerLoading] = useState(true)
  const [serverCopied, setServerCopied] = useState(false)

  const [timeRange, setTimeRange] = useState(10)
  const [customStartTime, setCustomStartTime] = useState("")
  const [customEndTime, setCustomEndTime] = useState("")
  const [selectedPath, setSelectedPath] = useState("全部")
  const [selectedLogLevel, setSelectedLogLevel] = useState("全部")
  const [selectedComponent, setSelectedComponent] = useState("全部")
  const [selectedAction, setSelectedAction] = useState("全部")
  const [keyword, setKeyword] = useState("")
  const [viewMode, setViewMode] = useState<"realtime" | "history">("realtime")

  const logsContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const localIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchBackendLogs = useCallback(async () => {
    setBackendLoading(true)
    try {
      const url = `/api/proxy/logs/recent?minutes=120`
      const response = await fetch(url)
      let text = await response.text()
      text = text.replace(/\\n/g, '\n')
      setRawBackendLogs(text)
    } catch (e) {
      setRawBackendLogs(`加载日志失败: ${e}`)
    } finally {
      setBackendLoading(false)
    }
  }, [])

  const fetchServerLogs = useCallback(async () => {
    setServerLoading(true)
    try {
      const url = `/api/proxy/logs/frontend?minutes=120`
      const response = await fetch(url)
      let text = await response.text()
      text = text.replace(/\\n/g, '\n')
      setRawServerLogs(text)
    } catch (e) {
      setRawServerLogs(`加载日志失败: ${e}`)
    } finally {
      setServerLoading(false)
    }
  }, [])

  const startRealtimeMode = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    fetchBackendLogs()
    intervalRef.current = setInterval(fetchBackendLogs, 10000)
  }, [fetchBackendLogs])

  const stopRealtimeMode = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (activeTab === "backend") {
      if (viewMode === "realtime") {
        startRealtimeMode()
      } else {
        stopRealtimeMode()
        fetchBackendLogs()
      }
    } else if (activeTab === "frontend-server") {
      if (viewMode === "realtime") {
        fetchServerLogs()
        const id = setInterval(fetchServerLogs, 10000)
        return () => clearInterval(id)
      } else {
        fetchServerLogs()
      }
    } else if (activeTab === "frontend-local") {
      const updateLocalLogs = () => {
        const newVersion = logger.getVersion()
        if (newVersion !== frontendLocalVersion) {
          requestAnimationFrame(() => {
            setFrontendLocalLogs([...logger.getLogs()])
            setFrontendLocalVersion(newVersion)
          })
        }
      }
      updateLocalLogs()
      if (viewMode === "realtime") {
        localIntervalRef.current = setInterval(updateLocalLogs, 3000)
        return () => {
          if (localIntervalRef.current) {
            clearInterval(localIntervalRef.current)
          }
        }
      }
    }
    return () => stopRealtimeMode()
  }, [activeTab, viewMode, startRealtimeMode, stopRealtimeMode, fetchBackendLogs, fetchServerLogs, frontendLocalVersion])

  useEffect(() => {
    if (!rawBackendLogs) {
      setBackendLogs([])
      return
    }
    const lines = rawBackendLogs.split("\n").filter(line => line.trim())
    setBackendLogs(lines)
  }, [rawBackendLogs])

  useEffect(() => {
    if (!rawServerLogs) {
      setServerLogs([])
      return
    }
    const lines = rawServerLogs.split("\n").filter(line => line.trim())
    setServerLogs(lines)
  }, [rawServerLogs])

  const filteredBackendLogs = useMemo(() => {
    const now = new Date()
    let startTime: Date | null = null
    let endTime: Date | null = null

    if (viewMode === "realtime") {
      startTime = new Date(now.getTime() - timeRange * 60 * 1000)
    } else {
      if (customStartTime) {
        const parsed = new Date(customStartTime)
        if (!isNaN(parsed.getTime())) {
          startTime = parsed
        }
      }
      if (customEndTime) {
        const parsed = new Date(customEndTime)
        if (!isNaN(parsed.getTime())) {
          endTime = parsed
        }
      }
    }

    const keywordLower = keyword.toLowerCase()
    const isPathFilter = selectedPath !== "全部"
    const isLevelFilter = selectedLogLevel !== "全部"
    const isKeywordFilter = !!keyword

    return backendLogs.filter(line => {
      if (viewMode === "history" && startTime) {
        const logTime = parseLogTime(line)
        if (logTime && logTime.getTime() < startTime.getTime()) return false
      }
      if (viewMode === "history" && endTime) {
        const logTime = parseLogTime(line)
        if (logTime && logTime.getTime() > endTime.getTime()) return false
      }
      if (viewMode === "realtime" && startTime) {
        const logTime = parseLogTime(line)
        if (logTime && logTime.getTime() < startTime.getTime()) return false
      }

      if (isPathFilter && !line.includes(selectedPath)) return false

      if (isLevelFilter) {
        if (!line.includes(`.${selectedLogLevel} `) && !line.includes(`[${selectedLogLevel}]`)) {
          return false
        }
      }

      if (isKeywordFilter && !line.toLowerCase().includes(keywordLower)) return false

      return true
    })
  }, [backendLogs, timeRange, customStartTime, customEndTime, selectedPath, selectedLogLevel, keyword, viewMode])

  const filteredServerLogs = useMemo(() => {
    const now = new Date()
    let startTime: Date | null = null
    let endTime: Date | null = null

    if (viewMode === "realtime") {
      startTime = new Date(now.getTime() - timeRange * 60 * 1000)
    } else {
      if (customStartTime) {
        const parsed = new Date(customStartTime)
        if (!isNaN(parsed.getTime())) {
          startTime = parsed
        }
      }
      if (customEndTime) {
        const parsed = new Date(customEndTime)
        if (!isNaN(parsed.getTime())) {
          endTime = parsed
        }
      }
    }

    const keywordLower = keyword.toLowerCase()
    const isLevelFilter = selectedLogLevel !== "全部"
    const isKeywordFilter = !!keyword

    return serverLogs.filter(line => {
      if (viewMode === "realtime" && startTime) {
        const logTime = parseFrontendLogTime(line)
        if (logTime && logTime.getTime() < startTime.getTime()) return false
      }
      if (viewMode === "history" && startTime) {
        const logTime = parseFrontendLogTime(line)
        if (logTime && logTime.getTime() < startTime.getTime()) return false
      }
      if (viewMode === "history" && endTime) {
        const logTime = parseFrontendLogTime(line)
        if (logTime && logTime.getTime() > endTime.getTime()) return false
      }

      if (isLevelFilter) {
        if (!line.includes(`[${selectedLogLevel}]`)) {
          return false
        }
      }

      if (isKeywordFilter && !line.toLowerCase().includes(keywordLower)) return false

      return true
    })
  }, [serverLogs, timeRange, customStartTime, customEndTime, selectedLogLevel, keyword, viewMode])

  const filteredLocalLogs = useMemo(() => {
    const now = new Date()
    let startTime: Date | null = null
    let endTime: Date | null = null

    if (viewMode === "realtime") {
      startTime = new Date(now.getTime() - timeRange * 60 * 1000)
    } else {
      if (customStartTime) {
        const parsed = new Date(customStartTime)
        if (!isNaN(parsed.getTime())) {
          startTime = parsed
        }
      }
      if (customEndTime) {
        const parsed = new Date(customEndTime)
        if (!isNaN(parsed.getTime())) {
          endTime = parsed
        }
      }
    }

    const keywordLower = keyword.toLowerCase()
    const isLevelFilter = selectedLogLevel !== "全部"
    const isComponentFilter = selectedComponent !== "全部"
    const isActionFilter = selectedAction !== "全部"
    const isKeywordFilter = !!keyword

    return frontendLocalLogs.filter(entry => {
      const logTime = new Date(entry.timestamp)
      if (viewMode === "realtime" && startTime) {
        if (logTime.getTime() < startTime.getTime()) return false
      }
      if (viewMode === "history" && startTime) {
        if (logTime.getTime() < startTime.getTime()) return false
      }
      if (viewMode === "history" && endTime) {
        if (logTime.getTime() > endTime.getTime()) return false
      }

      if (isLevelFilter && entry.level !== selectedLogLevel) return false

      if (isComponentFilter && entry.component !== selectedComponent) return false

      if (isActionFilter && entry.action !== selectedAction) return false

      if (isKeywordFilter && !entry.message.toLowerCase().includes(keywordLower)) return false

      return true
    }).slice(-200)
  }, [frontendLocalLogs, timeRange, customStartTime, customEndTime, selectedLogLevel, selectedComponent, selectedAction, keyword, viewMode])

  useEffect(() => {
    if (viewMode === "realtime" && logsContainerRef.current && shouldAutoScroll.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }
  }, [filteredBackendLogs, filteredServerLogs, filteredLocalLogs, viewMode])

  const handleScroll = () => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current
      shouldAutoScroll.current = scrollTop + clientHeight >= scrollHeight - 50
    }
  }

  const handleBackendCopy = async () => {
    const text = filteredBackendLogs.join("\n")
    await navigator.clipboard.writeText(text)
    setBackendCopied(true)
    setTimeout(() => setBackendCopied(false), 2000)
  }

  const handleBackendExport = () => {
    const text = filteredBackendLogs.join("\n")
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `backend-logs-${new Date().toISOString().slice(0,19)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleBackendClear = () => {
    setRawBackendLogs("")
    setBackendLogs([])
  }

  const handleLocalCopy = async () => {
    const text = filteredLocalLogs.map(entry =>
      `${entry.timestamp} [FRONTEND] [${entry.level}] [${entry.component}] [${entry.action}] ${entry.message}`
    ).join("\n")
    await navigator.clipboard.writeText(text)
    setFrontendLocalCopied(true)
    setTimeout(() => setFrontendLocalCopied(false), 2000)
  }

  const handleLocalUpload = async () => {
    setFrontendLocalUploading(true)
    try {
      const logs = logger.getLogs()
      const response = await fetch("/api/proxy/logs/frontend/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logs),
      })
      const result = await response.json()
      if (result.success) {
        logger.clearLogs()
        setFrontendLocalLogs([])
        toast.success(`上传成功，共 ${result.count} 条日志`)
      } else {
        toast.error(`上传失败: ${result.message}`)
      }
    } catch (e) {
      toast.error(`上传失败: ${e}`)
    } finally {
      setFrontendLocalUploading(false)
    }
  }

  const handleLocalClear = () => {
    logger.clearLogs()
    setFrontendLocalLogs([])
  }

  const handleServerCopy = async () => {
    const text = filteredServerLogs.join("\n")
    await navigator.clipboard.writeText(text)
    setServerCopied(true)
    setTimeout(() => setServerCopied(false), 2000)
  }

  const formatNowForInput = (): string => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
  }

  const formatBeforeForInput = (endTime: string): string => {
    const endDate = new Date(endTime)
    endDate.setMinutes(endDate.getMinutes() - 10)
    const year = endDate.getFullYear()
    const month = String(endDate.getMonth() + 1).padStart(2, '0')
    const day = String(endDate.getDate()).padStart(2, '0')
    const hours = String(endDate.getHours()).padStart(2, '0')
    const minutes = String(endDate.getMinutes()).padStart(2, '0')
    const seconds = String(endDate.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
  }

  return (
    <div className="flex flex-col h-full bg-[#F5F4F0]">
      <header className="flex-shrink-0 w-full bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-center h-14 px-4">
          <button
            onClick={() => router.back()}
            className="absolute left-4 p-2 -ml-2 rounded-full hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">系统日志</h1>
        </div>
      </header>

      <div className="flex-shrink-0 border-b bg-white">
        <div className="flex px-4 pt-3">
          <button
            onClick={() => setActiveTab("backend")}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              activeTab === "backend"
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            后端日志
          </button>
          <button
            onClick={() => setActiveTab("frontend-local")}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ml-1 ${
              activeTab === "frontend-local"
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            前端日志（本地）
          </button>
          <button
            onClick={() => setActiveTab("frontend-server")}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ml-1 ${
              activeTab === "frontend-server"
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            前端日志（服务器）
          </button>
        </div>
      </div>

      <div className="flex-shrink-0 border-b px-4 py-3 space-y-3 bg-white">
        <div className="flex flex-wrap gap-3 items-center">
          {viewMode === "realtime" ? (
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(Number(e.target.value))}
              className="px-3 py-2 rounded-md border bg-white text-gray-900 font-medium min-w-[140px]"
            >
              <option value={10}>最近10分钟</option>
              <option value={30}>最近30分钟</option>
              <option value={60}>最近1小时</option>
            </select>
          ) : (
            <div className="px-3 py-2 text-gray-400 font-medium min-w-[140px]">自定义范围</div>
          )}

          {activeTab === "backend" && (
            <select
              value={selectedPath}
              onChange={(e) => setSelectedPath(e.target.value)}
              className="px-3 py-2 rounded-md border bg-white text-gray-900 font-medium min-w-[120px]"
            >
              {API_PATHS.map(path => (
                <option key={path} value={path}>{path}</option>
              ))}
            </select>
          )}

          {(activeTab === "frontend-local" || activeTab === "frontend-server") && (
            <select
              value={selectedComponent}
              onChange={(e) => setSelectedComponent(e.target.value)}
              className="px-3 py-2 rounded-md border bg-white text-gray-900 font-medium min-w-[120px]"
            >
              {COMPONENTS.map(comp => (
                <option key={comp} value={comp}>{comp}</option>
              ))}
            </select>
          )}

          {(activeTab === "frontend-local" || activeTab === "frontend-server") && (
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="px-3 py-2 rounded-md border bg-white text-gray-900 font-medium min-w-[120px]"
            >
              {ACTIONS.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          )}

          <select
            value={selectedLogLevel}
            onChange={(e) => setSelectedLogLevel(e.target.value)}
            className="px-3 py-2 rounded-md border bg-white text-gray-900 font-medium min-w-[120px]"
          >
            {LOG_LEVELS.map(level => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="搜索关键字..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="px-3 py-2 rounded-md border bg-white text-gray-900 font-medium flex-1 min-w-[150px]"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="viewMode"
              checked={viewMode === "realtime"}
              onChange={() => setViewMode("realtime")}
              className="w-4 h-4 text-green-600"
            />
            <span className="text-sm font-medium text-gray-700">实时模式</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="viewMode"
              checked={viewMode === "history"}
              onChange={() => {
                setViewMode("history")
                const endTime = formatNowForInput()
                const startTime = formatBeforeForInput(endTime)
                setCustomEndTime(endTime)
                setCustomStartTime(startTime)
              }}
              className="w-4 h-4 text-green-600"
            />
            <span className="text-sm font-medium text-gray-700">历史模式</span>
          </label>

          {viewMode === "history" && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-gray-600">从</span>
              <input
                type="datetime-local"
                step="1"
                value={customStartTime}
                onChange={(e) => setCustomStartTime(e.target.value)}
                className="px-2 py-1 rounded-md border bg-white text-gray-900 text-sm"
                readOnly
                onFocus={(e) => e.target.removeAttribute("readonly")}
              />
              <span className="text-sm text-gray-600">至</span>
              <input
                type="datetime-local"
                step="1"
                value={customEndTime}
                onChange={(e) => setCustomEndTime(e.target.value)}
                className="px-2 py-1 rounded-md border bg-white text-gray-900 text-sm"
                readOnly
                onFocus={(e) => e.target.removeAttribute("readonly")}
              />
            </div>
          )}
        </div>
      </div>

      <main
        ref={logsContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-[#1e1e1e] p-4 mx-4 my-3 rounded-lg"
        style={{ minHeight: "50%" }}
      >
        {activeTab === "backend" && (
          <pre className="text-[#d4d4d4] text-sm font-mono whitespace-pre-wrap break-words">
            {backendLoading ? "加载中..." : filteredBackendLogs.length > 0 ? filteredBackendLogs.join("\n") : "无日志信息"}
          </pre>
        )}
        {activeTab === "frontend-local" && (
          <div className="max-h-[60vh] overflow-y-auto">
            {filteredLocalLogs.length > 0 ? (
              filteredLocalLogs.map((entry, index) => (
                <div key={index} className="text-[#d4d4d4] text-sm font-mono whitespace-pre-wrap break-words py-1 border-b border-gray-800">
                  {entry.timestamp} [FRONTEND] [{entry.level}] [{entry.component}] [{entry.action}] {entry.message}
                </div>
              ))
            ) : (
              <pre className="text-[#d4d4d4] text-sm font-mono">无日志信息</pre>
            )}
          </div>
        )}
        {activeTab === "frontend-server" && (
          <pre className="text-[#d4d4d4] text-sm font-mono whitespace-pre-wrap break-words">
            {serverLoading ? "加载中..." : filteredServerLogs.length > 0 ? filteredServerLogs.join("\n") : "无日志信息"}
          </pre>
        )}
      </main>

      <div className="flex-shrink-0 border-t px-4 py-3 flex justify-between items-center bg-white">
        {activeTab === "backend" && (
          <>
            <button
              onClick={handleBackendClear}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              <Trash2 className="w-4 h-4" />
              <span>清空日志</span>
            </button>
            <div className="flex gap-3">
              <button
                onClick={handleBackendCopy}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {backendCopied ? "已复制" : "一键复制"}
              </button>
              <button
                onClick={handleBackendExport}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                <Download className="w-4 h-4" />
                <span>导出日志</span>
              </button>
            </div>
          </>
        )}
        {activeTab === "frontend-local" && (
          <>
            <button
              onClick={handleLocalClear}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              <Trash2 className="w-4 h-4" />
              <span>清空缓存</span>
            </button>
            <div className="flex gap-3">
              <button
                onClick={handleLocalCopy}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {frontendLocalCopied ? "已复制" : "一键复制"}
              </button>
              <button
                onClick={handleLocalUpload}
                disabled={frontendLocalUploading}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>{frontendLocalUploading ? "上传中..." : "上传到服务器"}</span>
              </button>
            </div>
          </>
        )}
        {activeTab === "frontend-server" && (
          <>
            <div className="text-sm text-gray-500">共 {filteredServerLogs.length} 条</div>
            <div className="flex gap-3">
              <button
                onClick={handleServerCopy}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {serverCopied ? "已复制" : "一键复制"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}