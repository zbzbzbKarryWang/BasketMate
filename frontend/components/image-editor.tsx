'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RotateCcw, RotateCw, Check, X, ZoomIn, ZoomOut } from 'lucide-react'
import { Slider } from '@/components/ui/slider'

interface ImageEditorProps {
  isOpen: boolean
  onClose: () => void
  imageFile: File
  onConfirm: (croppedBlob: Blob) => void
}

export function ImageEditor({ isOpen, onClose, imageFile, onConfirm }: ImageEditorProps) {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    width: 70,
    height: 70,
    x: 15,
    y: 15,
  })
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const [rotation, setRotation] = useState(0)
  const [scale, setScale] = useState(1)
  
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile)
      setImageUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [imageFile])

  useEffect(() => {
    if (isOpen) {
      setCrop({
        unit: '%',
        width: 70,
        height: 70,
        x: 15,
        y: 15,
      })
      setCompletedCrop(null)
      setRotation(0)
      setScale(1)
    }
  }, [isOpen])

  const onCropChange = useCallback((c: Crop) => {
    setCrop(c)
  }, [])

  const onCropComplete = useCallback((c: PixelCrop) => {
    setCompletedCrop(c)
  }, [])

  const getCroppedImg = useCallback(async (): Promise<Blob> => {
    if (!completedCrop || !imageRef.current) {
      throw new Error('No cropped area')
    }

    const image = imageRef.current
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

    const naturalWidth = image.naturalWidth
    const naturalHeight = image.naturalHeight
    const displayWidth = image.width
    const displayHeight = image.height
    
    const scaleX = naturalWidth / displayWidth
    const scaleY = naturalHeight / displayHeight

    const actualX = completedCrop.x * scaleX
    const actualY = completedCrop.y * scaleY
    const actualWidth = completedCrop.width * scaleX
    const actualHeight = completedCrop.height * scaleY

    const radians = (rotation * Math.PI) / 180
    const rotatedWidth = Math.abs(naturalWidth * Math.cos(radians)) + Math.abs(naturalHeight * Math.sin(radians))
    const rotatedHeight = Math.abs(naturalHeight * Math.cos(radians)) + Math.abs(naturalWidth * Math.sin(radians))

    const tempCanvas = document.createElement('canvas')
    const tempCtx = tempCanvas.getContext('2d')!
    tempCanvas.width = rotatedWidth
    tempCanvas.height = rotatedHeight
    
    tempCtx.save()
    tempCtx.translate(rotatedWidth / 2, rotatedHeight / 2)
    tempCtx.rotate(radians)
    tempCtx.drawImage(image, -naturalWidth / 2, -naturalHeight / 2)
    tempCtx.restore()

    const centerX = rotatedWidth / 2
    const centerY = rotatedHeight / 2
    const originalCenterX = naturalWidth / 2
    const originalCenterY = naturalHeight / 2
    
    const dx = actualX + actualWidth / 2 - originalCenterX
    const dy = actualY + actualHeight / 2 - originalCenterY
    const rotatedCropCenterX = centerX + dx * Math.cos(radians) - dy * Math.sin(radians)
    const rotatedCropCenterY = centerY + dx * Math.sin(radians) + dy * Math.cos(radians)

    canvas.width = actualWidth
    canvas.height = actualHeight

    ctx.drawImage(
      tempCanvas,
      rotatedCropCenterX - actualWidth / 2,
      rotatedCropCenterY - actualHeight / 2,
      actualWidth,
      actualHeight,
      0,
      0,
      canvas.width,
      canvas.height
    )

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to create blob'))
        }
      }, 'image/jpeg', 0.95)
    })
  }, [completedCrop, rotation])

  const handleConfirm = async () => {
    try {
      const croppedBlob = await getCroppedImg()
      onConfirm(croppedBlob)
      onClose()
    } catch (error) {
      console.error('Error cropping image:', error)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>编辑图片</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col h-[60vh]">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setRotation((r) => (r - 90 + 360) % 360)}>
                <RotateCcw className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setRotation((r) => (r + 90) % 360)}>
                <RotateCw className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground w-8">|</span>
              <Button variant="outline" size="icon" onClick={() => setRotation((r) => (r - 1 + 360) % 360)}>
                <span className="text-xs">-</span>
              </Button>
              <Slider
                value={[rotation]}
                onValueChange={(value) => setRotation(value[0])}
                min={0}
                max={360}
                step={1}
                className="w-32"
              />
              <span className="text-xs text-muted-foreground w-10 text-right">{rotation}°</span>
              <Button variant="outline" size="icon" onClick={() => setRotation((r) => (r + 1) % 360)}>
                <span className="text-xs">+</span>
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setScale((s) => Math.max(1, s - 0.2))}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(scale * 100)}%</span>
              <Button variant="outline" size="icon" onClick={() => setScale((s) => Math.min(3, s + 0.2))}>
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => {
                setCrop({ unit: '%', width: 70, height: 70, x: 15, y: 15 })
                setRotation(0)
                setScale(1)
              }}>
                重置
              </Button>
            </div>
          </div>

          <div className="flex-1 relative bg-neutral-100 overflow-auto flex items-center justify-center">
            {imageUrl && (
              <div 
                style={{ 
                  transform: `scale(${scale})`,
                  transformOrigin: 'center center',
                }}
              >
                <ReactCrop
                  crop={crop}
                  onChange={onCropChange}
                  onComplete={onCropComplete}
                >
                  <img
                    ref={imageRef}
                    src={imageUrl}
                    alt="Crop"
                    style={{
                      maxWidth: '800px',
                      maxHeight: 'calc(55vh - 1rem)',
                      objectFit: 'contain',
                      transform: `rotate(${rotation}deg)`,
                      transformOrigin: 'center center',
                    }}
                  />
                </ReactCrop>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t gap-3">
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" />
            取消
          </Button>
          <Button onClick={handleConfirm}>
            <Check className="w-4 h-4 mr-2" />
            确认上传
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}