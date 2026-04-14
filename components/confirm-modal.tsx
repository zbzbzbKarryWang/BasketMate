"use client"

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { cn } from '@/lib/utils'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  variant?: 'default' | 'destructive'
  isLoading?: boolean
  showCancelButton?: boolean
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  variant = 'default',
  isLoading = false,
  showCancelButton = true
}: ConfirmModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />
      
      {/* 弹窗内容 */}
      <div className="relative bg-card rounded-xl shadow-xl w-[280px] overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">{title}</h3>
            <button 
              onClick={onCancel}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        
        <div className="flex border-t border-border">
          {showCancelButton && (
            <>
              <button
                onClick={onCancel}
                disabled={isLoading}
                className="flex-1 py-3 text-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelText}
              </button>
              <div className="w-px bg-border" />
            </>
          )}
          <LoadingButton
            onClick={() => void onConfirm()}
            isLoading={isLoading}
            loadingText="处理中..."
            variant="ghost"
            className={cn(
              "py-3 text-sm font-medium rounded-none border-0 hover:bg-transparent",
              showCancelButton ? "flex-1" : "w-full"
            )}
            style={{ color: '#008B1D' }}
            spinnerColor="#008B1D"
          >
            {confirmText}
          </LoadingButton>
        </div>
      </div>
    </div>
  )
}
