"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Card, CardContent } from '@/components/ui/card'
import { apiGet } from '@/lib/api-client'

interface ImportRecord {
  id: string
  created_at: string
  shop_name: string | null
  import_type: string[]
  status: 'identifying' | 'pending' | 'imported' | 'failed'
  items: any[]
  image_count: number
  viewed: boolean
}

interface IngredientOption {
  id: string
  name: string
}

const STATUS_LABEL: Record<string, { text: string; class: string }> = {
  identifying: { text: '识别中', class: 'bg-blue-100 text-blue-700' },
  pending: { text: '待导入', class: 'bg-yellow-100 text-yellow-700' },
  imported: { text: '已导入', class: 'bg-green-100 text-green-700' },
  failed: { text: '导入失败', class: 'bg-red-100 text-red-700' },
}

const formatDate = (iso: string) => {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

export default function ImportsPage() {
  const router = useRouter()
  const [records, setRecords] = useState<ImportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [ingredients, setIngredients] = useState<IngredientOption[]>([])

  const fetchRecords = async () => {
    try {
      const [recordsRes, ingredientsRes] = await Promise.all([
        apiGet<ImportRecord[]>('/import/records'),
        apiGet<IngredientOption[]>('/ingredients')
      ])
      setRecords(Array.isArray(recordsRes) ? recordsRes : [])
      setIngredients(Array.isArray(ingredientsRes) ? ingredientsRes : [])
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
    const interval = setInterval(fetchRecords, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleViewDetail = (recordId: string) => {
    // 将食材数据存储到 sessionStorage 供详情页使用
    sessionStorage.setItem('ingredients_cache', JSON.stringify(ingredients))
    router.push(`/imports/${recordId}`)
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 w-full bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-center h-14 px-4">
          <button
            onClick={() => router.back()}
            className="absolute left-4 p-2 -ml-2 rounded-full hover:bg-muted"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">导入记录</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            加载中...
          </div>
        ) : records.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-base">暂无导入记录</p>
              <p className="text-xs mt-2">在首页点击"导入小票"开始</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {records.map((rec) => {
              const statusInfo = STATUS_LABEL[rec.status] || STATUS_LABEL.pending
              return (
                <Card
                  key={rec.id}
                  className="shadow-sm hover:shadow-md transition-shadow"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between w-full gap-4">
                      {/* 时间 */}
                      <div className="flex-1 text-sm text-muted-foreground">
                        {formatDate(rec.created_at)}
                      </div>
                      
                      {/* 图片张数 */}
                      <div className="flex-1 text-sm text-muted-foreground">
                        {rec.image_count} 张图片
                      </div>
                      
                      {/* 状态 */}
                      <div className="flex-1 flex justify-center">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${statusInfo.class}`}
                        >
                          {statusInfo.text}
                        </span>
                      </div>
                      
                      {/* 查看详情按钮 */}
                      <div className="flex-1 flex justify-end">
                        {rec.status === 'identifying' ? (
                          <div className="text-xs text-blue-600 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            识别中...
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleViewDetail(rec.id)}
                            className="text-xs text-primary hover:underline"
                          >
                            查看详情
                          </button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
