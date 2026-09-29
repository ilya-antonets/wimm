export interface SankeyNode {
  id: string;
  name: string;
  depth?: number | null;
  transaction_ids?: number[] | null;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyPayload {
  nodes: SankeyNode[];
  links: SankeyLink[];
  period_income: number;
  period_expenses: number;
  balance: number;
}
