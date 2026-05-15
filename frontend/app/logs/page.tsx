"use client"

import { useState, useEffect, useCallback } from "react"
import { apiGet } from "@/lib/api-client"

export default function LogsPage() {
  const [logs, setLogs] = useState("")
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState(10)
  const [copied, setCopied] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/proxy/logs/recent?minutes=${timeRange}`)
      const text = await response.text()
      setLogs(text)
    } catch (e) {
      setLogs(`加载日志失败: ${e}`)
    } finally {
      setLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, 10000)
    return () => clearInterval(interval)
  }, [fetchLogs])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logs)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error("复制失败", e)
    }
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "bold" }}>系统日志</h1>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
            style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
          >
            <option value={10}>10分钟</option>
            <option value={30}>30分钟</option>
            <option value={60}>1小时</option>
          </select>
          <button
            onClick={handleCopy}
            style={{
              padding: "8px 16px",
              backgroundColor: copied ? "#4CAF50" : "#2196F3",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            {copied ? "已复制" : "一键复制"}
          </button>
        </div>
      </div>

      <div
        style={{
          backgroundColor: "#1e1e1e",
          color: "#d4d4d4",
          padding: "16px",
          borderRadius: "8px",
          fontFamily: "monospace",
          fontSize: "13px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          maxHeight: "70vh",
          overflow: "auto"
        }}
      >
        {loading ? "加载中..." : logs || "暂无日志"}
      </div>
    </div>
  )
}
