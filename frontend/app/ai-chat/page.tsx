"use client"

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Mic, Send, Image as ImageIcon, X, User, Loader2, Edit3, ArrowLeft } from 'lucide-react'
import { toast } from '@/lib/toast'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ImageEditor } from '@/components/image-editor'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking: string  // 思考过程
  toolActions: string[]  // 工具调用描述（中文）
  showConfirmButtons?: boolean
  pendingConfirmMessage?: string
  confirmToolCallId?: string
  thinkingCollapsed?: boolean  // 思考区域是否折叠
}

interface PendingImage {
  id: string
  file: File
  blob: Blob
  previewUrl: string
}

export default function AIChatPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '你好！我是你的厨房搭子，有什么可以帮你的吗？',
      thinking: '',
      toolActions: [],
    },
  ])
  
  // 工具名到中文描述的映射表
  const toolDescriptions: Record<string, string> = {
    'resolve_ingredient': '正在查询食材信息',
    'search_ingredients': '正在搜索食材',
    'update_ingredient': '正在更新库存',
    'create_ingredient': '正在创建食材记录',
    'delete_ingredient': '正在删除食材',
    'get_inventory': '正在获取库存列表',
    'get_recipe': '正在获取菜谱详情',
    'search_recipes': '正在搜索菜谱',
    'create_recipe': '正在创建菜谱',
    'update_recipe': '正在更新菜谱',
    'delete_recipe': '正在删除菜谱',
    'create_plan': '正在创建计划',
    'update_plan': '正在更新计划',
    'delete_plan': '正在删除计划',
    'get_plans': '正在获取计划列表',
    'search_recipe_online': '正在联网搜索菜谱',
    'check_inventory_alerts': '正在检查库存提醒',
    'complete_purchase': '正在完成采购',
    'add_to_shopping_list': '正在添加到购物清单',
    'remove_from_shopping_list': '正在从购物清单移除',
    'clear_shopping_list': '正在清空购物清单',
    'get_shopping_list': '正在获取购物清单',
    'ask_confirmation': '请求用户确认',
  }
  
  const getToolDescription = (toolName: string): string => {
    return toolDescriptions[toolName] || '正在执行操作'
  }
  const [inputValue, setInputValue] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [currentEditingImage, setCurrentEditingImage] = useState<PendingImage | null>(null)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const speechRecognitionRef = useRef<any>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [messages])

  const getSpeechRecognition = () => {
    return window.SpeechRecognition || window.webkitSpeechRecognition
  }

  const startRecording = async () => {
    const SpeechRecognition = getSpeechRecognition()
    
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'zh-CN'
        
        let finalTranscript = ''
        
        recognition.onresult = (event: any) => {
          let interimTranscript = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalTranscript += transcript
            } else {
              interimTranscript += transcript
            }
          }
          setInputValue(finalTranscript + interimTranscript)
        }
        
        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error)
          toast.error('语音识别出错，使用录音方式')
          startMediaRecorder()
        }
        
        recognition.onend = () => {
          setIsRecording(false)
        }
        
        speechRecognitionRef.current = recognition
        recognition.start()
        setIsRecording(true)
      } catch (err) {
        console.error('Speech recognition initialization failed:', err)
        startMediaRecorder()
      }
    } else {
      startMediaRecorder()
    }
  }

  const startMediaRecorder = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await transcribeAudio(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('无法访问麦克风:', err)
      toast.error('无法访问麦克风，请检查权限设置')
    }
  }

  const stopRecording = () => {
    if (speechRecognitionRef.current && isRecording) {
      speechRecognitionRef.current.stop()
      speechRecognitionRef.current = null
      setIsRecording(false)
    } else if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsLoading(true)
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')

      const response = await fetch('/api/proxy/ai/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('转录失败')
      }

      const data = await response.json()
      if (data.success && data.data) {
        setInputValue(data.data.text)
      } else {
        toast.error(data.message || '转录失败')
      }
    } catch (err) {
      console.error('转录失败:', err)
      toast.error('音频转录失败')
    } finally {
      setIsLoading(false)
    }
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const newImages: PendingImage[] = files.map(file => {
      const id = Date.now().toString() + Math.random().toString(36).substr(2, 9)
      const previewUrl = URL.createObjectURL(file)
      return {
        id,
        file,
        blob: file,
        previewUrl,
      }
    })

    setPendingImages(prev => [...prev, ...newImages])
    e.target.value = ''
  }

  const removeImage = (id: string) => {
    setPendingImages(prev => {
      const image = prev.find(img => img.id === id)
      if (image) {
        URL.revokeObjectURL(image.previewUrl)
      }
      return prev.filter(img => img.id !== id)
    })
  }

  const openImageEditor = (image: PendingImage) => {
    setCurrentEditingImage(image)
    setEditorOpen(true)
  }

  const handleEditorConfirm = (croppedBlob: Blob) => {
    if (!currentEditingImage) return

    const newPreviewUrl = URL.createObjectURL(croppedBlob)
    
    setPendingImages(prev => prev.map(img => {
      if (img.id === currentEditingImage.id) {
        URL.revokeObjectURL(img.previewUrl)
        return {
          ...img,
          blob: croppedBlob,
          previewUrl: newPreviewUrl,
        }
      }
      return img
    }))

    setCurrentEditingImage(null)
    setEditorOpen(false)
  }

  const handleEditorCancel = () => {
    setCurrentEditingImage(null)
    setEditorOpen(false)
  }

  const uploadAndGetDescription = async (image: PendingImage): Promise<string> => {
    const formData = new FormData()
    formData.append('image', image.blob, image.file.name)

    const response = await fetch('/api/proxy/ai/upload-image', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error('上传失败')
    }

    const data = await response.json()
    if (data.success && data.data) {
      return data.data.description || data.data.text || ''
    } else {
      throw new Error(data.message || '图片上传失败')
    }
  }

  const sendMessage = async () => {
    if (!inputValue.trim() && pendingImages.length === 0) return
    if (isLoading) return

    setIsLoading(true)

    try {
      let imageDescriptions: string[] = []

      if (pendingImages.length > 0) {
        const uploadPromises = pendingImages.map(img => uploadAndGetDescription(img))
        imageDescriptions = await Promise.all(uploadPromises)
      }

      const combinedText = [...imageDescriptions, inputValue.trim()].filter(Boolean).join('\n\n')

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: combinedText,
        thinking: '',
        toolActions: [],
      }

      const assistantMessageId = (Date.now() + 1).toString()
      const emptyAssistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        thinking: '',
        toolActions: [],
      }

      // 检查是否有未确认的请求
      const pendingConfirmIndex = messages.findIndex(
        msg => msg.role === 'assistant' && msg.pendingConfirmMessage && !msg.showConfirmButtons
      )
      
      // 如果有未确认的请求，且当前消息不是"确认"或"取消"，则视为取消
      let updatedMessages = [...messages]
      if (pendingConfirmIndex !== -1 && combinedText !== '确认' && combinedText !== '取消') {
        updatedMessages[pendingConfirmIndex] = {
          ...updatedMessages[pendingConfirmIndex],
          pendingConfirmMessage: undefined,
          confirmToolCallId: undefined,
        }
      }

      // 构建完整的消息历史（包含当前要发送的消息）
      const completeMessageHistory = [
        ...updatedMessages,
        userMessage,
        emptyAssistantMessage
      ]

      // 检查是否是确认响应
      const lastAssistantMsg = updatedMessages[updatedMessages.length - 1]
      const isConfirmationResponse = (combinedText === '确认' || combinedText === '取消') && 
                                     lastAssistantMsg?.role === 'assistant' && 
                                     lastAssistantMsg.pendingConfirmMessage

      // 先更新本地状态（清除未确认的请求）
      setMessages(completeMessageHistory)
      setInputValue('')
      pendingImages.forEach(img => URL.revokeObjectURL(img.previewUrl))
      setPendingImages([])

      // 发送完整的消息历史给后端（只在有未确认请求时才添加 tool_calls）
      await sendChatRequest(assistantMessageId, completeMessageHistory.map(msg => {
        const hasPendingConfirm = msg.role === 'assistant' && msg.pendingConfirmMessage
        return {
          role: msg.role,
          content: msg.content,
          tool_calls: hasPendingConfirm ? [
            {
              id: msg.id,
              name: 'ask_confirmation',
              args: { message: msg.pendingConfirmMessage }
            }
          ] : undefined,
        }
      }), isConfirmationResponse ? combinedText : undefined)
    } catch (err) {
      console.error('发送消息失败:', err)
      toast.error('发送消息失败')
    } finally {
      setIsLoading(false)
    }
  }

  // 通用的聊天请求函数
  const sendChatRequest = async (assistantMessageId: string, messageHistory: Array<{ role: string; content: string }>, confirmationResponse?: string) => {
    try {
      const response = await fetch('/api/proxy/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messageHistory,
          confirmation_response: confirmationResponse,
        }),
      })

      if (!response.ok) {
        throw new Error('发送失败')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)
                
                if (parsed.type === 'thought') {
                  // 思考过程 - 追加到 thinking
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, thinking: (msg.thinking || '') + (parsed.content || '') }
                      : msg
                  ))
                } else if (parsed.type === 'tool_call') {
                  // 工具调用 - 添加中文描述
                  const toolDesc = getToolDescription(parsed.name || '')
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, toolActions: [...(msg.toolActions || []), toolDesc] }
                      : msg
                  ))
                } else if (parsed.type === 'confirmation') {
                  // 需要确认
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { 
                          ...msg, 
                          showConfirmButtons: true,
                          pendingConfirmMessage: parsed.message,
                          confirmToolCallId: parsed.tool_call_id
                        }
                      : msg
                  ))
                  return  // 中断，等待用户确认
                } else if (parsed.type === 'text') {
                  // 最终回答 - 追加到 content
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: (msg.content || '') + (parsed.content || '') }
                      : msg
                  ))
                } else if (parsed.type === 'done') {
                  // 完成
                  return
                }
              } catch (e) {
                console.error('解析 SSE 数据失败:', e)
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('发送消息失败:', err)
      toast.error('发送消息失败')
    }
  }

  const handleConfirm = (confirm: boolean, messageId: string) => {
    const response = confirm ? '确认' : '取消'
    
    // 构建完整的消息历史（包含所有必要字段，包括 tool_calls）
    const messageHistory = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      tool_calls: msg.role === 'assistant' && msg.toolActions.length > 0 ? [
        {
          id: msg.id,
          name: 'ask_confirmation',
          args: { message: msg.pendingConfirmMessage || '确认操作' }
        }
      ] : undefined,
    }))
    
    // 隐藏确认按钮
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, showConfirmButtons: false } : msg
    ))
    
    // 创建新的助手消息
    const newAssistantMessageId = (Date.now() + 1).toString()
    const emptyAssistantMessage: Message = {
      id: newAssistantMessageId,
      role: 'assistant',
      content: '',
      thinking: '',
      toolActions: [],
    }
    setMessages(prev => [...prev, emptyAssistantMessage])
    
    // 发送确认响应（包含完整历史）
    sendChatRequest(newAssistantMessageId, messageHistory, response)
  }

  return (
    <div className="flex flex-col h-screen bg-[#F5F4F0]">
      <header className="flex-shrink-0 w-full bg-white border-b sticky top-0 z-10">
        <div className="flex items-center h-14 px-4">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="返回"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold flex items-center justify-center gap-2 pr-8">
            <span className="text-xl">👩‍🍳</span>
            厨房搭子
          </h1>
        </div>
      </header>

      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="max-w-2xl mx-auto space-y-4 pb-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.role === 'user'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-secondary/10 text-secondary'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="w-4 h-4" />
                ) : (
                  <span className="text-lg">👩‍🍳</span>
                )}
              </div>
              <div
                className={`max-w-[80%] ${
                  message.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <Card
                  className={`px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-white'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <div className="space-y-3">
                      {/* 思考过程区域 - 可折叠 */}
                      {(message.thinking || (message.toolActions && message.toolActions.length > 0)) && (
                        <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                          {/* 折叠头部 */}
                          <button
                            className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                            onClick={() => {
                              setMessages(prev => prev.map(msg =>
                                msg.id === message.id
                                  ? { ...msg, thinkingCollapsed: !msg.thinkingCollapsed }
                                  : msg
                              ))
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <span>💭</span>
                              <span>思考过程</span>
                            </span>
                            <span className={`transform transition-transform ${message.thinkingCollapsed ? 'rotate-0' : 'rotate-180'}`}>
                              ▼
                            </span>
                          </button>
                          {/* 折叠内容 */}
                          {!message.thinkingCollapsed && (
                            <div className="px-3 pb-2 space-y-2">
                              {/* 思考文本 */}
                              {message.thinking && (
                                <div className="text-xs text-gray-500 bg-gray-100 rounded p-2">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {message.thinking}
                                  </ReactMarkdown>
                                </div>
                              )}
                              {/* 工具操作 */}
                              {message.toolActions && message.toolActions.length > 0 && (
                                <div className="space-y-1">
                                  {message.toolActions.map((action, index) => (
                                    <div key={index} className="flex items-center gap-2 text-xs text-gray-500">
                                      <span className="text-gray-400">🔧</span>
                                      <span>{action}</span>
                                      <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* 主要回答内容 */}
                      <div className="text-sm leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed">{message.content}</p>
                  )}
                </Card>
                {message.showConfirmButtons && (
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      onClick={() => handleConfirm(true, message.id)}
                    >
                      确认
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleConfirm(false, message.id)}
                    >
                      取消
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-secondary/10 text-secondary text-lg">
                👩‍🍳
              </div>
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                正在思考...
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <footer className="flex-shrink-0 bg-white border-t p-3">
        <div className="max-w-2xl mx-auto">
          {pendingImages.length > 0 && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
              {pendingImages.map((image) => (
                <div key={image.id} className="relative group flex-shrink-0">
                  <div 
                    className="w-20 h-20 rounded-lg overflow-hidden border cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => openImageEditor(image)}
                  >
                    <img
                      src={image.previewUrl}
                      alt={image.file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeImage(image.id)
                    }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute bottom-1 right-1 w-5 h-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      openImageEditor(image)
                    }}
                  >
                    <Edit3 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              id="image-upload"
              multiple
              onChange={handleImageSelect}
              disabled={isLoading}
            />
            <Button
              variant="outline"
              size="icon"
              className="flex-shrink-0"
              onClick={() => document.getElementById('image-upload')?.click()}
              disabled={isLoading}
            >
              <ImageIcon className="w-4 h-4" />
            </Button>
            <Button
              variant={isRecording ? 'destructive' : 'outline'}
              size="icon"
              className="flex-shrink-0 relative"
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              disabled={isLoading}
            >
              <Mic className="w-4 h-4" />
              {isRecording && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                </span>
              )}
            </Button>
            <div className="flex-1">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="输入消息..."
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                disabled={isLoading}
              />
            </div>
            <Button
              size="icon"
              className="flex-shrink-0"
              onClick={sendMessage}
              disabled={(!inputValue.trim() && pendingImages.length === 0) || isLoading}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </footer>

      {editorOpen && currentEditingImage && (
        <ImageEditor
          isOpen={editorOpen}
          onClose={handleEditorCancel}
          imageFile={new File([currentEditingImage.blob], currentEditingImage.file.name, { type: currentEditingImage.file.type })}
          onConfirm={handleEditorConfirm}
        />
      )}
    </div>
  )
}
