export interface Transaction {
  id: number;
  type: 'income' | 'expense';
  amount: number;
  date: string;
  responsible: string;
  payment_method: 'Crédito' | 'Débito' | 'Pix' | string;
  category: 'Investimento' | 'Necessário' | 'Lazer' | string;
  description: string;
  created_at: string;
}

export interface MonthlyStats {
  month: string;
  income: number;
  expense: number;
}
