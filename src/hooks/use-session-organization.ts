import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SessionGroupBy = 'project' | 'status' | 'none'
export type SessionSortBy = 'last_updated' | 'last_prompt' | 'custom_order'
export type SessionFilterDays = '7_days' | '30_days' | 'none'

type SessionOrganizationState = {
  groupBy: SessionGroupBy
  sortBy: SessionSortBy
  filterDays: SessionFilterDays
  customOrder: string[]
  setGroupBy: (groupBy: SessionGroupBy) => void
  setSortBy: (sortBy: SessionSortBy) => void
  setFilterDays: (filterDays: SessionFilterDays) => void
  setCustomOrder: (customOrder: string[]) => void
  moveSessionInCustomOrder: (
    draggedKey: string,
    targetKey: string,
    currentVisibleKeys: string[],
  ) => void
}

export const useSessionOrganizationStore = create<SessionOrganizationState>()(
  persist(
    (set, get) => ({
      groupBy: 'project',
      sortBy: 'last_updated',
      filterDays: 'none',
      customOrder: [],
      setGroupBy: (groupBy) => set({ groupBy }),
      setSortBy: (sortBy) => set({ sortBy }),
      setFilterDays: (filterDays) => set({ filterDays }),
      setCustomOrder: (customOrder) => set({ customOrder }),
      moveSessionInCustomOrder: (draggedKey, targetKey, currentVisibleKeys) => {
        if (!draggedKey || !targetKey || draggedKey === targetKey) return
        const existing = get().customOrder
        // Build complete list starting with current order
        const baseKeys = currentVisibleKeys.length > 0 ? currentVisibleKeys : existing
        const combined = Array.from(new Set([...baseKeys, ...existing]))
        const fromIdx = combined.indexOf(draggedKey)
        const toIdx = combined.indexOf(targetKey)
        if (fromIdx === -1 || toIdx === -1) return
        combined.splice(fromIdx, 1)
        combined.splice(toIdx, 0, draggedKey)
        set({ customOrder: combined })
      },
    }),
    {
      name: 'hermes-session-organization-v1',
    },
  ),
)
