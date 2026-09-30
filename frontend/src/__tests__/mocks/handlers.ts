import { http, HttpResponse } from "msw";

import type { BankRead } from "../../types/bank";
import type { CategoryRead } from "../../types/category";
import type { ImportResult } from "../../types/imports";
import type { SankeyPayload } from "../../types/sankey";
import type { SuggestionResult } from "../../types/suggestion";
import type { TransactionPage, TransactionRead } from "../../types/transaction";

const API = "http://localhost:8000/api";

const mockBanks: BankRead[] = [
  {
    id: 1,
    name: "Test Bank",
    column_map: { date: "Date", amount: "Amount", description: "Description" },
    date_format: "%Y-%m-%d",
    skip_header_rows: 0,
    skip_footer_rows: 0,
    encoding: "utf-8",
  },
];

const mockCategories: CategoryRead[] = [
  { id: 1, name: "Uncategorized", parent_id: null, sort_order: 0 },
  { id: 2, name: "Food", parent_id: null, sort_order: 1 },
  { id: 3, name: "Groceries", parent_id: 2, sort_order: 0 },
];

const mockTransactions: TransactionRead[] = [
  {
    id: 1,
    bank_id: 1,
    bank_name: "Test Bank",
    import_batch_id: 1,
    date: "2026-09-01",
    amount: "-42.5000",
    description: "GROCERY STORE",
    type: "expense",
    mapping: null,
  },
  {
    id: 2,
    bank_id: 1,
    bank_name: "Test Bank",
    import_batch_id: 1,
    date: "2026-09-02",
    amount: "-18.0000",
    description: "COFFEE SHOP",
    type: "expense",
    mapping: { category_id: 2, category_name: "Food" },
  },
  {
    id: 3,
    bank_id: 1,
    bank_name: "Test Bank",
    import_batch_id: 1,
    date: "2026-09-03",
    amount: "2500.0000",
    description: "PAYCHECK",
    type: "income",
    mapping: null,
  },
];

const mockSuggestions: SuggestionResult[] = [
  {
    transaction_id: 1,
    suggested_category_id: 3,
    suggested_category_name: "Groceries",
    confidence: 0.92,
    method: "tfidf",
  },
];

const mockSankey: SankeyPayload = {
  nodes: [],
  links: [],
  period_income: 0,
  period_expenses: 0,
  balance: 0,
};

export const handlers = [
  http.get(`${API}/banks`, () => HttpResponse.json(mockBanks)),
  http.post(`${API}/banks`, async ({ request }) => {
    const body = (await request.json()) as Omit<BankRead, "id">;
    return HttpResponse.json({ id: 2, ...body }, { status: 201 });
  }),
  http.put(`${API}/banks/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Omit<BankRead, "id">;
    return HttpResponse.json({ id: Number(params.id), ...body });
  }),
  http.delete(`${API}/banks/:id`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${API}/categories`, () => HttpResponse.json(mockCategories)),
  http.post(`${API}/categories`, async ({ request }) => {
    const body = (await request.json()) as Omit<CategoryRead, "id">;
    return HttpResponse.json({ id: 99, ...body }, { status: 201 });
  }),
  http.put(`${API}/categories/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Partial<CategoryRead>;
    return HttpResponse.json({
      id: Number(params.id),
      name: body.name ?? "Renamed",
      parent_id: null,
      sort_order: body.sort_order ?? 0,
    });
  }),
  http.patch(`${API}/categories/:id/move`, async ({ request, params }) => {
    const body = (await request.json()) as { new_parent_id?: number | null; sort_order?: number };
    return HttpResponse.json({
      id: Number(params.id),
      name: "Moved",
      parent_id: body.new_parent_id ?? null,
      sort_order: body.sort_order ?? 0,
    });
  }),
  http.delete(`${API}/categories/:id`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${API}/transactions`, () => {
    const page: TransactionPage = {
      items: mockTransactions,
      total: mockTransactions.length,
      page: 1,
      page_size: 50,
      pages: 1,
    };
    return HttpResponse.json(page);
  }),
  http.delete(`${API}/transactions/:id`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${API}/mappings`, () =>
    HttpResponse.json({ id: 1, transaction_id: 1, category_id: 2 }, { status: 201 })
  ),
  http.delete(`${API}/mappings/:transactionId`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${API}/suggestions`, () => HttpResponse.json(mockSuggestions)),
  http.post(`${API}/import`, () => {
    const result: ImportResult = {
      import_batch_id: 1,
      total_rows_parsed: 20,
      new_transactions: 12,
      duplicate_transactions: 8,
      failed_rows: [],
    };
    return HttpResponse.json(result, { status: 201 });
  }),
  http.get(`${API}/sankey`, () => HttpResponse.json(mockSankey)),
];
