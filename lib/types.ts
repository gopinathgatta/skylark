export interface MondayColumnValue {
  id: string;
  text: string | null;
  value: string | null;
  type: string;
  column?: { title: string };
}

export interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
}

export interface MondayBoard {
  id: string;
  name: string;
  columns: { id: string; title: string; type: string }[];
  items_page: {
    cursor: string | null;
    items: MondayItem[];
  };
}

export interface DealRecord {
  id: string;
  name: string;
  ownerCode: string | null;
  clientCode: string | null;
  dealStatus: string | null;
  closeDate: string | null;
  tentativeCloseDate: string | null;
  closureProbability: string | null;
  dealValue: number | null;
  dealStage: string | null;
  productDeal: string | null;
  sector: string | null;
  createdDate: string | null;
  dataQualityNotes: string[];
}

export interface WorkOrderRecord {
  id: string;
  name: string;
  customerCode: string | null;
  serial: string | null;
  natureOfWork: string | null;
  executionStatus: string | null;
  sector: string | null;
  typeOfWork: string | null;
  amountExclGst: number | null;
  billedExclGst: number | null;
  collectedInclGst: number | null;
  amountReceivable: number | null;
  woStatus: string | null;
  billingStatus: string | null;
  invoiceStatus: string | null;
  dataQualityNotes: string[];
}

export interface BusinessDataSnapshot {
  fetchedAt: string;
  dealsBoardName: string;
  workOrdersBoardName: string;
  deals: DealRecord[];
  workOrders: WorkOrderRecord[];
  summary: ReturnType<typeof import('./data/analytics').buildAnalyticsSummary>;
  dataQuality: {
    dealsWithMissingSector: number;
    dealsWithMissingValue: number;
    dealsWithMissingCloseDate: number;
    workOrdersWithMissingSector: number;
    workOrdersWithMissingAmount: number;
    duplicateDealNames: number;
    headerArtifactValuesStripped: number;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
