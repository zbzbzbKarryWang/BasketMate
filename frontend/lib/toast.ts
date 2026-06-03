'use client'

import * as React from 'react'
import { toast as sonnerToast } from 'sonner'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastOptions {
  title?: string
  description?: string
  duration?: number
}

const defaultDuration = 3000

export const toast = {
  success: (message: string, options?: ToastOptions) => {
    sonnerToast.success(message, {
      duration: options?.duration || defaultDuration,
      description: options?.description,
    })
  },
  error: (message: string, options?: ToastOptions) => {
    sonnerToast.error(message, {
      duration: options?.duration || defaultDuration,
      description: options?.description,
    })
  },
  warning: (message: string, options?: ToastOptions) => {
    sonnerToast.warning(message, {
      duration: options?.duration || defaultDuration,
      description: options?.description,
    })
  },
  info: (message: string, options?: ToastOptions) => {
    sonnerToast.info(message, {
      duration: options?.duration || defaultDuration,
      description: options?.description,
    })
  },
  // 通用的 toast
  show: (message: string, type?: ToastType, options?: ToastOptions) => {
    sonnerToast(message, {
      duration: options?.duration || defaultDuration,
      description: options?.description,
    })
  },
}
