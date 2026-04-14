"use client"

import { DataProvider } from "@/contexts/DataContext"

export function Providers({ children }: { children: React.ReactNode }) {
  return <DataProvider>{children}</DataProvider>
}
