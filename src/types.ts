export interface Transaction {
  id: number;
  type: 'income' | 'expense';
  amount: number;
  date: string;
  responsible: string;
  payment_method: 'Crédito' | 'Débito' | 'Pix' | string;
  category: 'Investimento' | 'Necessário' | 'Lazer' | string;
  bank?: string;
  description: string;
  installments?: number;
  installment_number?: number;
  created_at: string;
}

export interface CardLimit {
  id: number;
  bank_name: string;
  limit_amount: number;
  updated_at: string;
}

export interface MonthlyStats {
  month: string;
  income: number;
  expense: number;
}
