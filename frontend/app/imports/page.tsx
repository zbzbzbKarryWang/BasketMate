"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent } from '@/components/ui/card'

export default function ImportsPage() {
  const router = useRouter()

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

      <main className="flex-1 overflow-y-auto px-6 py-4">
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-base">导入记录功能开发中…</p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
