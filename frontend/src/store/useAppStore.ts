import { create } from "zustand";

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

interface SankeyPanelState {
  open: boolean;
  nodeId: string | null;
  nodeName: string | null;
  transactionIds: number[];
}

interface BankConfigModalState {
  open: boolean;
  bankId: number | null; // null = create mode
}

interface AppState {
  // Date range — shared between DashboardPage and TransactionTable filters
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;

  // Active category node — drives TransactionTable filter when on /transactions
  activeCategoryId: number | null;
  setActiveCategoryId: (id: number | null) => void;

  // Sankey drill-down panel state
  sankeyPanel: SankeyPanelState;
  openSankeyPanel: (nodeId: string, nodeName: string, transactionIds: number[]) => void;
  closeSankeyPanel: () => void;

  // Modal visibility flags
  importModalOpen: boolean;
  setImportModalOpen: (open: boolean) => void;

  bankConfigModalState: BankConfigModalState;
  openBankConfigModal: (bankId: number | null) => void;
  closeBankConfigModal: () => void;
}

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Initial date range: first day of current month → today
function getDefaultDateRange(): DateRange {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    from: toLocalDateString(from),
    to: toLocalDateString(today),
  };
}

export const useAppStore = create<AppState>((set) => ({
  dateRange: getDefaultDateRange(),
  setDateRange: (range) => set({ dateRange: range }),

  activeCategoryId: null,
  setActiveCategoryId: (id) => set({ activeCategoryId: id }),

  sankeyPanel: { open: false, nodeId: null, nodeName: null, transactionIds: [] },
  openSankeyPanel: (nodeId, nodeName, transactionIds) =>
    set({ sankeyPanel: { open: true, nodeId, nodeName, transactionIds } }),
  closeSankeyPanel: () =>
    set({ sankeyPanel: { open: false, nodeId: null, nodeName: null, transactionIds: [] } }),

  importModalOpen: false,
  setImportModalOpen: (open) => set({ importModalOpen: open }),

  bankConfigModalState: { open: false, bankId: null },
  openBankConfigModal: (bankId) => set({ bankConfigModalState: { open: true, bankId } }),
  closeBankConfigModal: () => set({ bankConfigModalState: { open: false, bankId: null } }),
}));
