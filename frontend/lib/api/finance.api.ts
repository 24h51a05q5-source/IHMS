import { api } from './client';
import type { Expense, Voucher, ProfitAndLoss } from '@/lib/types';

export interface RecordExpenseInput {
  branchId?: string;
  category: string;
  amount: number;
  paymentMethod?: string;
  paidTo: string;
  description?: string;
  invoiceOrBillNumber?: string;
}

export const financeApi = {
  listExpenses: (params?: { branchId?: string; category?: string }) =>
    api.get<Expense[]>('/finance/expenses', { query: params as Record<string, string | undefined> }),

  recordExpense: (data: RecordExpenseInput) =>
    api.post<Expense>('/finance/expenses', data),

  listVouchers: (params?: { branchId?: string }) =>
    api.get<Voucher[]>('/finance/vouchers', { query: params as Record<string, string | undefined> }),

  getProfitAndLoss: (params?: { branchId?: string; startDate?: string; endDate?: string }) =>
    api.get<ProfitAndLoss>('/finance/profit-and-loss', { query: params as Record<string, string | undefined> }),
};
