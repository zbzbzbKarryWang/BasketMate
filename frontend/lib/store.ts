"use client"

import { create } from "zustand"

interface AppState {
  activeTab: "home" | "plan" | "shopping" | "inventory" | "price" | "recipes"
  setActiveTab: (tab: AppState["activeTab"]) => void
  showNewPlan: boolean
  setShowNewPlan: (show: boolean) => void
  pendingRecipeAdd: boolean
  setPendingRecipeAdd: (v: boolean) => void
  navigateToRecipeAdd: () => void
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: "home",
  setActiveTab: (tab) => set({ activeTab: tab }),
  showNewPlan: false,
  setShowNewPlan: (show) => set({ showNewPlan: show }),
  pendingRecipeAdd: false,
  setPendingRecipeAdd: (v) => set({ pendingRecipeAdd: v }),
  navigateToRecipeAdd: () =>
    set({ activeTab: "recipes", pendingRecipeAdd: true }),
}))
