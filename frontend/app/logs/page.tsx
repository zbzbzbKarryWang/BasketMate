"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Download, Trash2 } from "lucide-react"

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

export default function LogsPage() {
  const router = useRouter()
  const [allLogs, setAllLogs] = useState<string[]>([])
  const [filteredLogs, setFilteredLogs] = useState<string[]>([])
  const [rawLogs, setRawLogs] = useState("")
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  
  const [timeRange, setTimeRange] = useState(10)
  const [customStartTime, setCustomStartTime] = useState("")
  const [customEndTime, setCustomEndTime] = useState("")
  const [selectedPath, setSelectedPath] = useState("全部")
  const [keyword, setKeyword] = useState("")
  const [viewMode, setViewMode] = useState<"realtime" | "history">("realtime")
  
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const url = `/api/proxy/logs/recent?minutes=120`
      const response = await fetch(url)
      const text = await response.text()
      setRawLogs(text)
    } catch (e) {
      setRawLogs(`加载日志失败: ${e}`)
    } finally {
      setLoading(false)
    }
  }, [])

  const startRealtimeMode = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    fetchLogs()
    intervalRef.current = setInterval(fetchLogs, 10000)
  }, [fetchLogs])

  const stopRealtimeMode = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (viewMode === "realtime") {
      startRealtimeMode()
    } else {
      stopRealtimeMode()
    }
    return () => stopRealtimeMode()
  }, [viewMode, startRealtimeMode, stopRealtimeMode])

  useEffect(() => {
    if (!rawLogs) {
      setAllLogs([])
      return
    }
    const lines = rawLogs.split("\n").filter(line => line.trim())
    setAllLogs(lines)
  }, [rawLogs])

  useEffect(() => {
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

    const filtered = allLogs.filter(line => {
      if (viewMode === "history" && startTime) {
        const logTime = parseLogTime(line)
        if (logTime && logTime.getTime() < startTime.getTime()) {
          return false
        }
      }
      if (viewMode === "history" && endTime) {
        const logTime = parseLogTime(line)
        if (logTime && logTime.getTime() > endTime.getTime()) {
          return false
        }
      }
      if (viewMode === "realtime" && startTime) {
        const logTime = parseLogTime(line)
        if (logTime && logTime.getTime() < startTime.getTime()) {
          return false
        }
      }
      if (selectedPath !== "全部" && !line.includes(selectedPath)) {
        return false
      }
      if (keyword && !line.toLowerCase().includes(keyword.toLowerCase())) {
        return false
      }
      return true
    })
    
    setFilteredLogs(filtered)
  }, [allLogs, timeRange, customStartTime, customEndTime, selectedPath, keyword, viewMode])

  useEffect(() => {
    if (viewMode === "realtime" && logsContainerRef.current && shouldAutoScroll.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }
  }, [filteredLogs, viewMode])

  const handleScroll = () => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current
      shouldAutoScroll.current = scrollTop + clientHeight >= scrollHeight - 50
    }
  }

  const handleCopy = async () => {
    const text = filteredLogs.join("\n")
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExport = () => {
    const text = filteredLogs.join("\n")
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `logs-${new Date().toISOString().slice(0,19)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClear = () => {
    setFilteredLogs([])
  }

  const handleViewHistory = () => {
    shouldAutoScroll.current = false
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
          <button
            onClick={handleCopy}
            className="absolute right-4 px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
          >
            {copied ? "已复制" : "一键复制"}
          </button>
        </div>
      </header>

      <div className="flex-shrink-0 border-b px-4 py-3 space-y-3">
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
          
          <select
            value={selectedPath}
            onChange={(e) => setSelectedPath(e.target.value)}
            className="px-3 py-2 rounded-md border bg-white text-gray-900 font-medium min-w-[120px]"
          >
            {API_PATHS.map(path => (
              <option key={path} value={path}>{path}</option>
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
                console.log("历史模式默认值 - 结束时间:", endTime, "开始时间:", startTime)
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
              <button
                onClick={handleViewHistory}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
              >
                查询
              </button>
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
        <pre className="text-[#d4d4d4] text-xs font-mono whitespace-pre-wrap break-all">
          {loading ? "加载中..." : filteredLogs.length > 0 ? filteredLogs.join("\n") : "无日志信息"}
        </pre>
      </main>

      <div className="flex-shrink-0 border-t px-4 py-3 flex justify-between items-center">
        <button
          onClick={handleClear}
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
        >
          <Trash2 className="w-4 h-4" />
          <span>清空日志</span>
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
        >
          <Download className="w-4 h-4" />
          <span>导出日志</span>
        </button>
      </div>
    </div>
  )
}
