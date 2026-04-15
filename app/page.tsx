"use client"

import { BottomNav } from '@/components/bottom-nav'
import { HomePage } from '@/components/home-page'
import { PlanPage } from '@/components/plan-page'
import { ShoppingPage } from '@/components/shopping-page'
import { InventoryPage } from '@/components/inventory-page'
import { PricePage } from '@/components/price-page'
import { RecipesPage } from '@/components/recipes-page'
import { useAppStore } from '@/lib/store'

export default function App() {
  const { activeTab } = useAppStore()

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {activeTab === 'home' && <HomePage />}
      {activeTab === 'plan' && <PlanPage />}
      {activeTab === 'shopping' && <ShoppingPage />}
      {activeTab === 'inventory' && <InventoryPage />}
      {activeTab === 'recipes' && <RecipesPage />}
      {activeTab === 'price' && <PricePage />}
      <footer className="w-full bg-white border-t">
        <BottomNav />
      </footer>
    </div>
  )
}
