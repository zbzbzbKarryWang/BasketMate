"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Plus, X, Search, Check, Trash2 } from "lucide-react"
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiGet, apiPut, apiPost } from '@/lib/api-client'
import { toast } from '@/lib/toast'

interface IngredientOption {
  id: string
  name: string
}

interface ImportItem {
  name: string
  price: number
  quantity: number
  image_index: number
  original_name?: string
  mapped?: boolean
  ingredient_id?: string
  ingredient_name?: string // 后端匹配到的食材名
  target_ingredient?: string // 用户选择的归并目标
  target_ingredient_name?: string // 用户选择的归并目标名称
}

interface ImportRecord {
  id: string
  created_at: string
  shop_name: string | null
  import_type: string[]
  status: 'identifying' | 'pending' | 'imported' | 'failed'
  items: ImportItem[]
  image_count: number
  viewed: boolean
  deleted_patterns?: string[]
}

const formatDate = (iso: string) => {
  const d = new Date(iso)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

const STATUS_LABEL: Record<string, { text: string; class: string }> = {
  identifying: { text: '识别中', class: 'bg-blue-100 text-blue-700' },
  pending: { text: '待导入', class: 'bg-yellow-100 text-yellow-700' },
  imported: { text: '已导入', class: 'bg-green-100 text-green-700' },
  failed: { text: '导入失败', class: 'bg-red-100 text-red-700' },
}

export default function ImportDetailPage() {
  const params = useParams()
  const router = useRouter()
  const recordId = params.id as string

  const [record, setRecord] = useState<ImportRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ImportItem[]>([])
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deletedPatterns, setDeletedPatterns] = useState<string[]>([])
  const [deletedItems, setDeletedItems] = useState<ImportItem[]>([])  // 保存被删除的完整项目
  const [savedOnce, setSavedOnce] = useState(false)  // 标记是否已保存过
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchResults, setSearchResults] = useState<IngredientOption[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [activeSearchIdx, setActiveSearchIdx] = useState<number | null>(null)
  const [cachedIngredients, setCachedIngredients] = useState<IngredientOption[]>([])

  const itemsRef = useRef<ImportItem[]>([])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  // 从缓存读取预加载的食材数据，若无则加载所有食材
  useEffect(() => {
    const loadIngredients = async () => {
      try {
        // 首先尝试从 sessionStorage 读取缓存
        const cached = sessionStorage.getItem('ingredients_cache')
        if (cached) {
          const ingredients = JSON.parse(cached)
          if (Array.isArray(ingredients)) {
            setCachedIngredients(ingredients)
            return
          }
        }
        
        // 缓存为空，主动加载所有食材
        const res = await apiGet<IngredientOption[]>('/ingredients')
        if (res && Array.isArray(res)) {
          setCachedIngredients(res)
          sessionStorage.setItem('ingredients_cache', JSON.stringify(res))
        }
      } catch (e) {
        // ignore
      }
    }
    loadIngredients()
  }, [])

  const fetchRecord = async () => {
    try {
      const res = await apiGet<ImportRecord>(`/import/records/${recordId}`)
      if (res && res.id) {
        setRecord(res)
        setItems(res.items || [])
        // 从记录中恢复已删除的黑名单
        if (res.deleted_patterns && res.deleted_patterns.length > 0) {
          setDeletedPatterns(res.deleted_patterns)
          setSavedOnce(true)  // 从数据库加载的已有黑名单，视为已保存
        }
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecord()
    const interval = setInterval(() => {
      if (record?.status === 'identifying') {
        fetchRecord()
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [recordId, record?.status])

  const isEditable = record?.status === 'pending' || record?.status === 'failed'

  const handleItemChange = (idx: number, field: keyof ImportItem, value: any) => {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const handleDeleteItem = (idx: number) => {
    const item = items[idx]
    if (!item) return
    
    const itemName = item.name
    
    if (itemName) {
      // 同时更新所有相关状态，确保原子性
      setItems((prev) => prev.filter((_, i) => i !== idx))
      setDeletedPatterns((prev) => {
        if (!prev.includes(itemName)) {
          return [...prev, itemName]
        }
        return prev
      })
      setDeletedItems((prev) => [...prev, item])
    } else {
      // 无名项目直接删除，不加入黑名单
      setItems((prev) => prev.filter((_, i) => i !== idx))
    }
  }

  // 取消删除（只有保存前可以）
  const handleUndeleteItem = (pattern: string) => {
    // 找到对应的删除项
    const deletedItem = deletedItems.find((item) => item.name === pattern)
    if (deletedItem) {
      setItems((prev) => [...prev, deletedItem])
      setDeletedPatterns((prev) => prev.filter((p) => p !== pattern))
      setDeletedItems((prev) => prev.filter((item) => item.name !== pattern))
    }
  }

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { name: '', price: 0, quantity: 1, image_index: 0 },
    ])
  }

  const handleSave = async () => {
    if (!record) return
    setSaving(true)
    try {
      const filtered = items.filter((it) => it.name && it.name.trim() !== '')
      // 清理 undefined 的字段
      const cleanedItems = filtered.map((item) => {
        const cleaned = { ...item }
        if (cleaned.target_ingredient === undefined) delete cleaned.target_ingredient
        if (cleaned.target_ingredient_name === undefined) delete cleaned.target_ingredient_name
        if (cleaned.ingredient_id === undefined) delete cleaned.ingredient_id
        if (cleaned.ingredient_name === undefined) delete cleaned.ingredient_name
        return cleaned
      })
      await apiPut(`/import/records/${record.id}`, { 
        items: cleanedItems,
        deleted_patterns: deletedPatterns,
      })
      toast.success('保存成功')
      setSavedOnce(true)  // 标记已保存
      setDeletedItems([])  // 清空可恢复的删除项
      // 返回上一界面
      router.back()
    } catch (e: any) {
      toast.error(`保存失败: ${e?.message || '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  // 优化的搜索函数：优先从缓存搜索，缓存为空时才调用 API
  const handleSearchIngredients = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    
    const trimmedQuery = query.trim().toLowerCase()
    
    // 优先从缓存搜索
    if (cachedIngredients.length > 0) {
      const results = cachedIngredients.filter(ing => 
        ing.name.toLowerCase().includes(trimmedQuery)
      )
      setSearchResults(results)
      return
    }
    
    // 缓存为空时，调用 API
    setSearchLoading(true)
    apiGet<IngredientOption[]>(`/ingredients/search?q=${encodeURIComponent(trimmedQuery)}`)
      .then(res => setSearchResults(res || []))
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false))
  }, [cachedIngredients])

  const handleTargetSelect = (idx: number, ingredientId: string, ingredientName: string) => {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = { 
        ...next[idx], 
        target_ingredient: ingredientId,
        target_ingredient_name: ingredientName,
      }
      return next
    })
    setActiveSearchIdx(null)
    setSearchQuery('')
    setSearchResults([])
  }

  const handleClearTarget = (idx: number) => {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = { 
        ...next[idx], 
        target_ingredient: undefined,
        target_ingredient_name: undefined,
        ingredient_id: undefined,
        ingredient_name: undefined,
      }
      return next
    })
    setActiveSearchIdx(null)  // 关闭下拉框
    setSearchQuery('')
    setSearchResults([])
  }

  const handleConfirm = async () => {
    if (!record) return
    setConfirming(true)
    try {
      const filtered = items.filter((it) => it.name && it.name.trim() !== '')
      const confirmItems = filtered.map((item) => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        target_ingredient: item.target_ingredient || item.ingredient_id,
      }))
      
      await apiPost(`/import/confirm`, {
        record_id: record.id,
        items: confirmItems,
        deleted_patterns: deletedPatterns,
      })
      
      toast.success('导入成功')
      await fetchRecord()
    } catch (e: any) {
      toast.error(`导入失败: ${e?.message || '未知错误'}`)
    } finally {
      setConfirming(false)
    }
  }

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (activeSearchIdx !== null && searchQuery) {
        handleSearchIngredients(searchQuery)
      }
    }, 300)
    return () => clearTimeout(debounce)
  }, [searchQuery, activeSearchIdx, handleSearchIngredients])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        加载中...
      </div>
    )
  }

  if (!record) {
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
            <h1 className="text-lg font-semibold">导入详情</h1>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center text-muted-foreground">
          记录不存在
        </main>
      </div>
    )
  }

  const statusInfo = STATUS_LABEL[record.status] || STATUS_LABEL.pending

  return (
    <div className="flex flex-col h-full">
      {/* 全屏等待状态 */}
      {(saving || confirming) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 flex items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-lg">{saving ? '保存中...' : '导入中...'}</span>
          </div>
        </div>
      )}
      
      <header className="flex-shrink-0 w-full bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-center h-14 px-4">
          <button
            onClick={() => router.back()}
            className="absolute left-4 p-2 -ml-2 rounded-full hover:bg-muted"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">导入详情</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        <Card className="shadow-sm mb-3">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-muted-foreground">
                {formatDate(record.created_at)}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${statusInfo.class}`}>
                {statusInfo.text}
              </span>
            </div>
            <div className="space-y-1 text-sm">
              {/* 店铺 - 只有比价时才显示 */}
                {record.import_type?.includes('price_compare') && (
                  <div>
                    <span className="text-muted-foreground">店铺：</span>
                    <span>{record.shop_name || '仅库存'}</span>
                  </div>
                )}
                <div>
                <span className="text-muted-foreground">导入类型：</span>
                <span>
                  {(record.import_type || [])
                    .map((t) => (t === 'inventory' ? '库存' : '比价'))
                    .join('、')}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">图片数量：</span>
                <span>共 {record.image_count} 张</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {record.status === 'identifying' ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              正在识别中，请稍候...
            </CardContent>
          </Card>
        ) : (
          <>
            {deletedPatterns.length > 0 && (
              <Card className="shadow-sm mb-3 border-red-200">
                <CardContent className="p-3">
                  <div className="text-sm text-red-600 mb-2">
                    已删除（将加入黑名单）：
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {deletedPatterns.map((pattern, idx) => (
                      <span
                        key={idx}
                        className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${
                          savedOnce
                            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                            : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {pattern}
                        {!savedOnce && (
                          <button
                            onClick={() => handleUndeleteItem(pattern)}
                            className="hover:text-red-800"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                        {savedOnce && (
                          <span className="text-gray-400 text-xs">(已保存)</span>
                        )}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="shadow-sm mb-3">
              <CardContent className="p-4">
                <div className="grid grid-cols-[1.5fr_1fr_80px_130px_40px] gap-3 text-xs text-muted-foreground mb-2 px-1">
                  <div>商品名</div>
                  <div>归并食材</div>
                  <div className="text-center">单价</div>
                  <div className="text-center">数量</div>
                  <div></div>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pb-16">
                  {items.length === 0 && (
                    <div className="text-center text-sm text-muted-foreground py-6">
                      暂无食材，请点击下方"添加一行"
                    </div>
                  )}
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[1.5fr_1fr_80px_130px_40px] gap-3 items-center"
                    >
                      {/* 商品名（取 item.name） */}
                      {isEditable ? (
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                          placeholder="食材名称"
                          className="h-9 px-3 rounded-md border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          disabled={!!item.target_ingredient}
                        />
                      ) : (
                        <div className="h-9 px-3 flex items-center text-sm">
                          {item.name}
                        </div>
                      )}

                      {/* 归并食材选择 */}
                      <div className="relative">
                        {isEditable ? (
                          <div className="relative">
                            {/* 显示已选食材 */}
                            {item.target_ingredient_name || item.ingredient_name ? (
                              <div className="flex items-center h-9 px-3 rounded-md border border-input bg-transparent gap-2">
                                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                                <span className="truncate text-sm flex-1">{item.target_ingredient_name || item.ingredient_name}</span>
                                <button
                                  onClick={() => handleClearTarget(idx)}
                                  className="w-5 h-5 rounded hover:bg-muted flex items-center justify-center flex-shrink-0"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              /* 输入搜索框 */
                              <div className="relative">
                                <input
                                  type="text"
                                  value={activeSearchIdx === idx ? searchQuery : ''}
                                  onFocus={() => setActiveSearchIdx(idx)}
                                  onChange={(e) => {
                                    setSearchQuery(e.target.value)
                                    if (cachedIngredients.length > 0) {
                                      const q = e.target.value.toLowerCase()
                                      const results = cachedIngredients.filter(ing => 
                                        ing.name.toLowerCase().includes(q)
                                      )
                                      setSearchResults(results)
                                    }
                                  }}
                                  placeholder="搜索食材..."
                                  className="w-full h-9 px-3 pr-8 rounded-md border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                                <Search className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                
                                {/* 搜索结果下拉 */}
                                {activeSearchIdx === idx && searchQuery && (
                                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-input rounded-md shadow-lg z-20 max-h-32 overflow-y-auto">
                                    {searchResults.length === 0 ? (
                                      <div className="p-3 text-center text-xs text-muted-foreground">
                                        未找到匹配的食材
                                      </div>
                                    ) : (
                                      searchResults.slice(0, 10).map((ing) => (
                                        <button
                                          key={ing.id}
                                          onClick={() => handleTargetSelect(idx, ing.id, ing.name)}
                                          className="w-full px-3 py-2 text-sm hover:bg-muted text-left"
                                        >
                                          {ing.name}
                                        </button>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="h-9 px-3 flex items-center justify-center text-sm">
                            {item.target_ingredient_name || item.ingredient_name ? (
                              <span>{item.target_ingredient_name || item.ingredient_name}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 单价 */}
                      {isEditable ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.price}
                          onChange={(e) =>
                            handleItemChange(idx, 'price', parseFloat(e.target.value) || 0)
                          }
                          className="h-9 px-2 rounded-md border border-input bg-transparent text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      ) : (
                        <div className="h-9 px-2 flex items-center justify-center text-sm">
                          ¥{item.price.toFixed(2)}
                        </div>
                      )}

                      {/* 数量 */}
                      {isEditable ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleItemChange(
                                idx,
                                'quantity',
                                Math.max(0, (item.quantity || 0) - 1),
                              )
                            }
                            className="w-10 h-8 rounded-md border border-input text-sm hover:bg-muted flex items-center justify-center"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemChange(
                                idx,
                                'quantity',
                                parseInt(e.target.value) || 0,
                              )
                            }
                            className="w-14 h-8 text-center rounded-md border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleItemChange(idx, 'quantity', (item.quantity || 0) + 1)
                            }
                            className="w-10 h-8 rounded-md border border-input text-sm hover:bg-muted flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <div className="h-9 px-2 flex items-center justify-center text-sm">
                          {item.quantity}
                        </div>
                      )}

                      {/* 删除按钮 */}
                      {isEditable ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(idx)}
                          className="w-7 h-7 rounded-full hover:bg-red-100 text-red-500 flex items-center justify-center"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : (
                        <div></div>
                      )}
                    </div>
                  ))}
                </div>

                {isEditable && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={handleAddItem}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    添加一行
                  </Button>
                )}
              </CardContent>
            </Card>

            {isEditable && (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSave}
                  disabled={saving || confirming}
                >
                  {saving ? '保存中...' : '保存修改'}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleConfirm}
                  disabled={saving || confirming}
                >
                  {confirming ? '导入中...' : '确认导入'}
                </Button>
              </div>
            )}

            {record.status === 'imported' && (
              <div className="mt-4 text-center text-sm text-muted-foreground">
                已导入完成
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}