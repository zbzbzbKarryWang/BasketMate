"use client"

import { useState, useMemo, useEffect } from 'react'
import { CalendarDays, ShoppingCart, Utensils, Package, FileText, FolderOpen, FileUp, Trash2, Edit3, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppStore } from '@/lib/store'
import { useData } from '@/contexts/DataContext'
import { formatDate, getTodayString, getTomorrowString, getDayAfterTomorrowString } from '@/lib/mock-data'
import { ingredientStockOk } from '@/lib/ingredient-stock'
import { ConfirmModal } from '@/components/confirm-modal'
import { getBreakfastEmojiById } from '@/lib/breakfast-emojis'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { apiGet, apiPost } from '@/lib/api-client'
import { toast } from '@/lib/toast'
import { ImageEditor } from '@/components/image-editor'

interface ProcessedImage {
  id: string
  originalFile: File
  editedBlob: Blob | null
  previewUrl: string
}

export function HomePage() {
  const { mealPlans, inventory, recipes, activePurchaseTask, error, connectionStatus, shops } = useData()
  const { setActiveTab, setShowNewPlan } = useAppStore()
  const router = useRouter()

  const [showImportModal, setShowImportModal] = useState(false)
  const [importInventory, setImportInventory] = useState(true)
  const [importPrice, setImportPrice] = useState(true)
  const [selectedShopId, setSelectedShopId] = useState<string>('')
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([])
  const [importSubmitting, setImportSubmitting] = useState(false)
  const [unviewedImportCount, setUnviewedImportCount] = useState(0)
  const [showUploadSuccess, setShowUploadSuccess] = useState(false)
  
  const [editorOpen, setEditorOpen] = useState(false)
  const [currentImage, setCurrentImage] = useState<ProcessedImage | null>(null)

  const fetchUnviewedCount = async () => {
    try {
      const res = await apiGet<{ id: string; viewed: boolean }[]>('/import/records')
      if (Array.isArray(res)) {
        setUnviewedImportCount(res.filter((r) => !r.viewed).length)
      }
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => {
    fetchUnviewedCount()
    const interval = setInterval(fetchUnviewedCount, 15000)
    return () => clearInterval(interval)
  }, [])

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      const newImages: ProcessedImage[] = files.map(file => ({
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        originalFile: file,
        editedBlob: null,
        previewUrl: URL.createObjectURL(file)
      }))
      setProcessedImages([...processedImages, ...newImages])
      
      if (newImages.length > 0) {
        setCurrentImage(newImages[0])
        setEditorOpen(true)
      }
      
      e.target.value = ''
    }
  }

  const openEditor = (image: ProcessedImage) => {
    setCurrentImage(image)
    setEditorOpen(true)
  }

  const handleEditorConfirm = (croppedBlob: Blob) => {
    if (!currentImage) return
    
    const newPreviewUrl = URL.createObjectURL(croppedBlob)
    
    setProcessedImages(processedImages.map(img => {
      if (img.id === currentImage.id) {
        return {
          ...img,
          editedBlob: croppedBlob,
          previewUrl: newPreviewUrl
        }
      }
      return img
    }))
    
    if (currentImage.previewUrl) {
      URL.revokeObjectURL(currentImage.previewUrl)
    }
    setCurrentImage(null)
    setEditorOpen(false)
    toast.success('图片编辑成功')
  }

  const handleEditorCancel = () => {
    if (currentImage?.previewUrl) {
      URL.revokeObjectURL(currentImage.previewUrl)
    }
    setCurrentImage(null)
    setEditorOpen(false)
  }

  const removeImage = (imageId: string) => {
    const image = processedImages.find(img => img.id === imageId)
    if (image?.previewUrl) {
      URL.revokeObjectURL(image.previewUrl)
    }
    setProcessedImages(processedImages.filter((img) => img.id !== imageId))
  }

  const handleConfirmImport = async () => {
    if (processedImages.length === 0) {
      toast.warning('请至少选择一张图片')
      return
    }
    if (!importInventory && !importPrice) {
      toast.warning('请至少选择一种导入类型')
      return
    }
    if (importPrice && !selectedShopId) {
      toast.warning('导入比价时请选择店铺')
      return
    }

    const importType: string[] = []
    if (importInventory) importType.push('inventory')
    if (importPrice) importType.push('price')

    const shopName = importPrice
      ? shops.find((s) => s.id === selectedShopId)?.name || ''
      : undefined

    setImportSubmitting(true)
    try {
      const images = await Promise.all(processedImages.map(async (img) => {
        const blob = img.editedBlob || img.originalFile
        return blobToBase64(blob)
      }))
      
      await apiPost('/import/upload', {
        images,
        import_type: importType,
        shop_name: shopName,
      })
      
      setShowImportModal(false)
      processedImages.forEach((img) => {
        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl)
      })
      setProcessedImages([])
      setSelectedShopId('')
      fetchUnviewedCount()
      setShowUploadSuccess(true)
    } catch (e: any) {
      toast.error(`上传失败: ${e?.message || '未知错误'}`)
    } finally {
      setImportSubmitting(false)
    }
  }

  const handleOpenImportModal = () => {
    setShowImportModal(true)
    setProcessedImages([])
    setSelectedShopId('')
  }

  const formatIngredientName = (name: string) => {
    const item = inventory.find(i => {
      if (i.name.toLowerCase() === name.toLowerCase()) return true
      if (i.alias) {
        const aliases = i.alias.split(/[、,，]/).filter(a => a.trim())
        return aliases.some(alias => alias.toLowerCase() === name.toLowerCase())
      }
      return false
    })
    if (!item?.alias) return name
    const aliases = item.alias.split(/[、,，]/).filter(a => a.trim())
    if (aliases.length === 0) return name
    return `${name}（${aliases.join('、')}）`
  }

  const [showPlanFullError, setShowPlanFullError] = useState(false)
  const [showNoShoppingError, setShowNoShoppingError] = useState(false)
  const today = getTodayString()
  const tomorrow = getTomorrowString()
  const dayAfterTomorrow = getDayAfterTomorrowString()
  const todayPlan = mealPlans.find(p => p.date === today)
  
  const breakfastRecipes = useMemo(() => {
    return recipes.filter(r => r.category === 'breakfast')
  }, [recipes])
  
  const hasShoppingItems = (activePurchaseTask?.pending_items?.length ?? 0) > 0 || (activePurchaseTask?.custom_items?.length ?? 0) > 0
  
  const getNextAvailableDate = () => {
    const planDates = new Set(mealPlans.map(p => p.date))
    
    if (!planDates.has(today)) return today
    if (!planDates.has(tomorrow)) return tomorrow
    if (!planDates.has(dayAfterTomorrow)) return dayAfterTomorrow
    return null
  }
  
  const handleWhatsForDinner = () => {
    const nextDate = getNextAvailableDate()
    if (nextDate) {
      setActiveTab('plan')
      setShowNewPlan(true)
    } else {
      setShowPlanFullError(true)
    }
  }
  
  const handleGoShopping = () => {
    if (hasShoppingItems) {
      setActiveTab('shopping')
    } else {
      setShowNoShoppingError(true)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 w-full bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-center h-14 px-4">
          <h1 className="text-lg font-semibold">
            {formatDate(today)}
          </h1>
        </div>
      </header>

      {connectionStatus === "error" && error && (
        <div
          className="mx-4 mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="status"
        >
          云端未连接：{error}
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-6 py-4 pb-16">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              今日计划
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayPlan ? (
              <div className="space-y-4">
                {todayPlan.breakfast_recipe_id && (
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <span className="text-2xl">{getBreakfastEmojiById(todayPlan.breakfast_recipe_id, breakfastRecipes)}</span>
                    <div>
                      <div className="text-xs text-muted-foreground">早餐</div>
                      <div className="font-medium">{recipes.find(r => r.id === todayPlan.breakfast_recipe_id)?.name || '未知早餐'}</div>
                    </div>
                  </div>
                )}
                
                {todayPlan.recipes.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Utensils className="w-3.5 h-3.5" />
                      正餐菜谱
                    </div>
                    <div className="space-y-2">
                      {todayPlan.recipes.map((recipe) => (
                        <div 
                          key={recipe.id}
                          className="p-3 bg-muted rounded-lg"
                        >
                          <div className="font-medium text-sm">{recipe.name}</div>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {recipe.ingredients.map((ing, idx) => {
                              const ok = ingredientStockOk(inventory, ing)
                              return (
                                <span
                                  key={idx}
                                  className={
                                    ok
                                      ? "text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                                      : "text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                                  }
                                >
                                  {formatIngredientName(ing.name)}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm">今日无计划</p>
                <button 
                  type="button"
                  onClick={() => {
                    setActiveTab('plan')
                    setShowNewPlan(true)
                  }}
                  className="mt-3 text-sm text-primary hover:underline"
                >
                  制定计划
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Card 
            className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setActiveTab('inventory')}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-medium">查看库存</div>
                <div className="text-xs text-muted-foreground">管理食材</div>
              </div>
            </CardContent>
          </Card>
          <Card 
            className="shadow-sm cursor-pointer hover:shadow-md transition-shadow relative"
            onClick={handleGoShopping}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <div className="text-sm font-medium">采购清单</div>
                <div className="text-xs text-muted-foreground">去买菜</div>
              </div>
            </CardContent>
            {hasShoppingItems && (
              <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-destructive flex items-center justify-center text-xs text-white font-bold">
                •
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <Card
            className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={handleOpenImportModal}
          >
            <CardContent className="flex items-center justify-center gap-2 p-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <FileUp className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium">导入小票</span>
            </CardContent>
          </Card>
          <Card
            className="shadow-sm cursor-pointer hover:shadow-md transition-shadow relative"
            onClick={() => router.push('/imports')}
          >
            <CardContent className="flex items-center justify-center gap-2 p-3">
              <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
                <FolderOpen className="w-4 h-4 text-secondary" />
              </div>
              <span className="text-sm font-medium">查看导入</span>
            </CardContent>
            {unviewedImportCount > 0 && (
              <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500" />
            )}
          </Card>
          <Card 
            className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => router.push('/logs')}
          >
            <CardContent className="flex items-center justify-center gap-2 p-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium">查看日志</span>
            </CardContent>
          </Card>
        </div>

        <Card 
          className="shadow-sm cursor-pointer hover:shadow-md transition-shadow mt-4"
          onClick={handleWhatsForDinner}
        >
          <CardContent className="flex items-center justify-center gap-2 p-2.5">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Utensils className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-medium">吃什么</span>
          </CardContent>
        </Card>
      </main>

      <ConfirmModal
        isOpen={showPlanFullError}
        title="提示"
        message="未来三天计划已满"
        onConfirm={() => setShowPlanFullError(false)}
        onCancel={() => setShowPlanFullError(false)}
        showCancelButton={false}
      />

      <ConfirmModal
        isOpen={showNoShoppingError}
        title="提示"
        message="今日无采购任务"
        onConfirm={() => setShowNoShoppingError(false)}
        onCancel={() => setShowNoShoppingError(false)}
        showCancelButton={false}
      />

      <ConfirmModal
        isOpen={showUploadSuccess}
        title="上传成功"
        message="正在识别，请稍后查看导入记录"
        onConfirm={() => setShowUploadSuccess(false)}
        onCancel={() => setShowUploadSuccess(false)}
        showCancelButton={false}
      />

      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>导入小票</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="importInventory"
                checked={importInventory}
                onCheckedChange={(checked) => setImportInventory(checked as boolean)}
              />
              <Label htmlFor="importInventory">导入库存</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="importPrice"
                checked={importPrice}
                onCheckedChange={(checked) => setImportPrice(checked as boolean)}
              />
              <Label htmlFor="importPrice">导入比价</Label>
            </div>
            {importPrice && (
              <div className="grid gap-2">
                <Label htmlFor="shop-select">选择店铺</Label>
                <select
                  id="shop-select"
                  value={selectedShopId}
                  onChange={(e) => setSelectedShopId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">请选择店铺</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                id="file-upload"
                onChange={handleFileSelect}
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <FileUp className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">
                  点击选择图片或拖拽到此处
                </p>
              </label>
            </div>

            {processedImages.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">
                  已选择 {processedImages.length} 张图片
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {processedImages.map((img) => (
                    <div key={img.id} className="relative group">
                      <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden border">
                        <img
                          src={img.previewUrl}
                          alt="preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditor(img)}
                        >
                          <Edit3 className="w-3 h-3 mr-1" />
                          编辑
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeImage(img.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      {img.editedBlob && (
                        <div className="absolute top-1 left-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded">
                          已编辑
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              onClick={() => setShowImportModal(false)}
              disabled={importSubmitting}
            >
              取消
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={importSubmitting}
            >
              {importSubmitting ? '上传中...' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editorOpen && currentImage && (
        <ImageEditor
          isOpen={editorOpen}
          onClose={handleEditorCancel}
          imageFile={currentImage.editedBlob 
            ? new File([currentImage.editedBlob], 'edited.jpg', { type: 'image/jpeg' })
            : currentImage.originalFile
          }
          onConfirm={handleEditorConfirm}
        />
      )}
    </div>
  )
}
