"use client"

import { Home, Calendar, ShoppingCart, Package, TrendingDown, ChefHat } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const navItems = [
  { id: 'home' as const, label: '首页', icon: Home },
  { id: 'plan' as const, label: '计划', icon: Calendar },
  { id: 'shopping' as const, label: '采购', icon: ShoppingCart },
  { id: 'recipes' as const, label: '菜谱', icon: ChefHat },
  { id: 'inventory' as const, label: '库存', icon: Package },
  { id: 'price' as const, label: '比价', icon: TrendingDown },
]

export function BottomNav() {
  const { activeTab, setActiveTab } = useAppStore()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg">
      <div className="max-w-md mx-auto flex items-center justify-around h-16 px-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 min-w-0 h-full transition-colors",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("w-[18px] h-[18px] sm:w-5 sm:h-5 mb-0.5 sm:mb-1 shrink-0", isActive && "stroke-[2.5px]")} />
              <span className={cn("text-[10px] sm:text-xs leading-tight truncate max-w-full px-0.5", isActive && "font-medium")}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
