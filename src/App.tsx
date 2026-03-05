import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Minus, 
  MessageSquare, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Calendar, 
  User, 
  CreditCard, 
  Tag, 
  Trash2,
  ChevronRight,
  PieChart as PieChartIcon,
  LayoutDashboard,
  History,
  Send,
  Loader2,
  CheckCircle2,
  Download,
  Cloud
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from '@supabase/supabase-js';
import { Transaction, MonthlyStats, CardLimit } from './types';

// Client-side Supabase fallback
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_EXPO_PUBLIC_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || import.meta.env.VITE_EXPO_PUBLIC_SUPABASE_KEY || "";
const supabaseClient = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const App = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<MonthlyStats[]>([]);
  const [cards, setCards] = useState<CardLimit[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'add'>('dashboard');
  const [showCardManager, setShowCardManager] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedExpense, setParsedExpense] = useState<Partial<Transaction> | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [needsSync, setNeedsSync] = useState(false);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);
  
  // Filter states
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterResponsible, setFilterResponsible] = useState<string>('all');
  const [filterBank, setFilterBank] = useState<string>('all');

  // Helper to calculate stats locally when server is offline
  const calculateStatsLocally = (data: Transaction[]) => {
    const monthlyData: { [key: string]: { income: number, expense: number } } = {};
    
    data.forEach(t => {
      try {
        const month = t.date.substring(0, 7); // Pega YYYY-MM
        if (!monthlyData[month]) {
          monthlyData[month] = { income: 0, expense: 0 };
        }
        if (t.type === 'income') {
          monthlyData[month].income += t.amount;
        } else {
          monthlyData[month].expense += t.amount;
        }
      } catch (e) {
        console.error("Erro ao processar data para gráfico:", e);
      }
    });

    return Object.entries(monthlyData)
      .map(([month, values]) => ({
        month,
        income: values.income,
        expense: values.expense
      }))
      .sort((a, b) => a.month.localeCompare(b.month)) // Ordem cronológica para o gráfico de barras
      .slice(-12); // Últimos 12 meses
  };

  const exportToExcel = () => {
    const dataToExport = filteredTransactions.map(t => ({
      Tipo: t.type === 'income' ? 'Receita' : 'Despesa',
      Valor: t.amount,
      Data: format(parseISO(t.date), 'dd/MM/yyyy'),
      Responsável: t.responsible,
      'Forma de Pagamento': t.payment_method,
      Banco: t.bank || '-',
      Categoria: t.category,
      Observação: t.description
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Histórico');
    XLSX.writeFile(workbook, `Financas_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Try server first
      const hRes = await fetch('/api/health').catch(() => null);
      const isServerUp = hRes && hRes.ok;
      
      if (isServerUp) {
        const health = await hRes.json();
        setIsSupabaseConnected(health.supabase);

        const [tRes, sRes, cRes] = await Promise.all([
          fetch('/api/transactions'),
          fetch('/api/stats'),
          fetch('/api/cards')
        ]);

        const tData = await tRes.json();
        const sData = await sRes.json();
        const cData = await cRes.json();
        
        const localData = localStorage.getItem('finance_transactions');
        const localTransactions = localData ? JSON.parse(localData) : [];

        if (health.supabase) {
          if (tData.length === 0 && localTransactions.length > 0) {
            setNeedsSync(true);
            setTransactions(localTransactions);
            setStats(calculateStatsLocally(localTransactions));
          } else {
            setTransactions(tData);
            setStats(sData);
            setNeedsSync(false);
            localStorage.setItem('finance_transactions', JSON.stringify(tData));
          }
        } else {
          setTransactions(localTransactions);
          setStats(calculateStatsLocally(localTransactions));
        }
        setCards(cData);
      } else if (supabaseClient) {
        // Direct Supabase fallback (useful for Vercel static)
        console.log("Using direct Supabase connection");
        const { data: tData } = await supabaseClient.from('transactions').select('*').order('date', { ascending: false });
        const { data: cData } = await supabaseClient.from('card_limits').select('*');
        
        if (tData) {
          setTransactions(tData);
          setStats(calculateStatsLocally(tData));
          localStorage.setItem('finance_transactions', JSON.stringify(tData));
          setIsSupabaseConnected(true);
        }
        if (cData) setCards(cData);
      } else {
        throw new Error('No connection available');
      }
    } catch (error) {
      console.warn('Using local storage fallback:', error);
      const localData = localStorage.getItem('finance_transactions');
      if (localData) {
        const parsedData = JSON.parse(localData);
        setTransactions(parsedData);
        setStats(calculateStatsLocally(parsedData));
      }
      setIsSupabaseConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const handleForceSync = async () => {
    setToast({ message: 'Sincronizando dados com a nuvem...', type: 'success' });
    try {
      // Upload all local transactions to server
      for (const t of transactions) {
        await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(t)
        });
      }
      setNeedsSync(false);
      setToast({ message: 'Todos os dispositivos agora estão iguais!', type: 'success' });
      fetchData();
    } catch (error) {
      setToast({ message: 'Erro ao sincronizar', type: 'error' });
    }
  };

  const handleAddCard = async (bank_name: string, limit_amount: number) => {
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank_name, limit_amount })
      });
      if (res.ok) {
        setToast({ message: 'Limite de cartão atualizado!', type: 'success' });
        fetchData();
      }
    } catch (error) {
      setToast({ message: 'Erro ao salvar limite', type: 'error' });
    }
  };

  const handleDeleteCard = async (id: number) => {
    try {
      const res = await fetch(`/api/cards/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setToast({ message: 'Cartão removido', type: 'success' });
        fetchData();
      }
    } catch (error) {
      setToast({ message: 'Erro ao remover', type: 'error' });
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleAddTransaction = async (data: Partial<Transaction>) => {
    // Optimistic local update
    const tempId = Date.now();
    const newTransaction = { ...data, id: tempId, created_at: new Date().toISOString() } as Transaction;
    const updatedTransactions = [newTransaction, ...transactions];
    
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      const result = await res.json();

      if (res.ok && result.success) {
        setToast({ message: 'Sincronizado com servidor!', type: 'success' });
        fetchData();
      } else {
        throw new Error('Server error');
      }
    } catch (error) {
      console.error('Server save failed, keeping local only:', error);
      setTransactions(updatedTransactions);
      setStats(calculateStatsLocally(updatedTransactions)); // Atualiza gráficos localmente
      localStorage.setItem('finance_transactions', JSON.stringify(updatedTransactions));
      setToast({ message: 'Salvo no aparelho (Offline)', type: 'success' });
    } finally {
      setActiveTab('dashboard');
      setParsedExpense(null);
      setAiMessage('');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir?')) return;
    
    // Local update
    const updatedTransactions = transactions.filter(t => t.id !== id);
    setTransactions(updatedTransactions);
    localStorage.setItem('finance_transactions', JSON.stringify(updatedTransactions));

    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setToast({ message: 'Excluído em todo lugar', type: 'success' });
      }
    } catch (error) {
      setToast({ message: 'Excluído apenas deste aparelho', type: 'success' });
    }
  };

  const handleParseAI = async () => {
    if (!aiMessage.trim()) return;
    setIsParsing(true);
    try {
      const res = await fetch('/api/parse-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: aiMessage })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Erro na IA');
      }

      const data = await res.json();
      if (!data.amount) throw new Error('Valor não identificado');
      
      setParsedExpense({ ...data, type: 'expense' });
      setToast({ message: 'IA processou com sucesso!', type: 'success' });
    } catch (error: any) {
      console.error('Error parsing AI message:', error);
      setToast({ 
        message: error.message === 'Failed to fetch' 
          ? 'Erro de conexão. Use o formulário manual.' 
          : 'IA falhou. Tente o formulário manual abaixo.', 
        type: 'error' 
      });
    } finally {
      setIsParsing(false);
    }
  };

  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((acc, t) => acc + t.amount, 0);
  
  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => acc + t.amount, 0);

  // Cash Balance: Income - Expenses (excluding credit card expenses)
  const cashBalance = totalIncome - transactions
    .filter(t => t.type === 'expense' && t.payment_method !== 'Crédito')
    .reduce((acc, t) => acc + t.amount, 0);

  // Credit Card Usage per bank
  const cardUsage = transactions
    .filter(t => t.type === 'expense' && t.payment_method === 'Crédito')
    .reduce((acc, t) => {
      const bank = t.bank || 'Outros';
      acc[bank] = (acc[bank] || 0) + t.amount;
      return acc;
    }, {} as { [key: string]: number });

  const totalCardLimit = cards.reduce((acc, c) => acc + c.limit_amount, 0);
  const totalCardUsage = Object.values(cardUsage).reduce((acc, val) => acc + val, 0);
  const availableCardLimit = totalCardLimit - totalCardUsage;

  const balance = cashBalance; // Dashboard shows cash balance as primary

  const filteredTransactions = transactions.filter(t => {
    const matchesType = filterType === 'all' || t.type === filterType;
    const matchesCategory = filterCategory === 'all' || t.category === filterCategory;
    const matchesResponsible = filterResponsible === 'all' || t.responsible === filterResponsible;
    const matchesBank = filterBank === 'all' || t.bank === filterBank;
    return matchesType && matchesCategory && matchesResponsible && matchesBank;
  });

  const filteredTotalIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((acc, t) => acc + t.amount, 0);
  
  const filteredTotalExpense = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => acc + t.amount, 0);

  const filteredBalance = filteredTotalIncome - filteredTotalExpense;

  const uniqueCategories = ['Investimento', 'Necessário', 'Lazer'];
  const uniqueResponsibles = Array.from(new Set(transactions.map(t => t.responsible))).filter(Boolean);
  const uniqueBanks = Array.from(new Set(transactions.map(t => t.bank))).filter(Boolean);

  const categoryData = [
    { name: 'Investimento', value: transactions.filter(t => t.category === 'Investimento').reduce((acc, t) => acc + t.amount, 0) },
    { name: 'Necessário', value: transactions.filter(t => t.category === 'Necessário').reduce((acc, t) => acc + t.amount, 0) },
    { name: 'Lazer', value: transactions.filter(t => t.category === 'Lazer').reduce((acc, t) => acc + t.amount, 0) },
  ].filter(c => c.value > 0);

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b'];

  const [manualPaymentMethod, setManualPaymentMethod] = useState('Pix');

  return (
    <div className="min-h-screen bg-zinc-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-2 rounded-xl">
              <Wallet className="text-white w-5 h-5" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">Finanças</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${isSupabaseConnected ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
              <Cloud size={12} className={isSupabaseConnected ? '' : 'animate-pulse'} />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {isSupabaseConnected ? 'Nuvem' : 'Local'}
              </span>
            </div>
            <div className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-1 rounded-full uppercase tracking-wider">
              Março 2026
            </div>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-lg text-white font-bold text-sm flex items-center gap-2 whitespace-nowrap ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}
          >
            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <TrendingDown size={18} />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sync Banner */}
      <AnimatePresence>
        {needsSync && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="bg-amber-50 border-b border-amber-100 px-4 py-2"
          >
            <div className="max-w-md mx-auto flex justify-between items-center">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                Dados locais detectados. Sincronizar com outros aparelhos?
              </p>
              <button 
                onClick={handleForceSync}
                className="bg-amber-600 text-white text-[10px] font-bold px-3 py-1 rounded-lg hover:bg-amber-700 transition-colors"
              >
                Sincronizar Agora
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {activeTab === 'dashboard' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Balance Card */}
            <div className="bg-zinc-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-zinc-400 text-sm font-medium">Saldo em Dinheiro</p>
                    <h2 className="text-3xl font-bold mt-1">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cashBalance)}
                    </h2>
                  </div>
                  <button 
                    onClick={() => setShowCardManager(!showCardManager)}
                    className="bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-colors"
                    title="Gerenciar Cartões"
                  >
                    <CreditCard size={20} />
                  </button>
                </div>
                
                <div className="mt-6 pt-6 border-t border-white/10">
                  <div className="flex justify-between items-end mb-2">
                    <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Limite dos Cartões</p>
                    <p className="text-sm font-bold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(availableCardLimit)}
                      <span className="text-zinc-500 font-normal text-[10px] ml-1">/ {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCardLimit)}</span>
                    </p>
                  </div>
                  <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (availableCardLimit / totalCardLimit) * 100)}%` }}
                      className="h-full bg-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6">
                  <div className="bg-white/10 rounded-2xl p-3">
                    <div className="flex items-center gap-2 text-emerald-400 mb-1">
                      <TrendingUp size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Receitas</span>
                    </div>
                    <p className="font-semibold text-sm">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalIncome)}</p>
                  </div>
                  <div className="bg-white/10 rounded-2xl p-3">
                    <div className="flex items-center gap-2 text-rose-400 mb-1">
                      <TrendingDown size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Despesas</span>
                    </div>
                    <p className="font-semibold text-sm">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalExpense)}</p>
                  </div>
                </div>
              </div>
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl" />
            </div>

            {/* Card Manager Section */}
            <AnimatePresence>
              {showCardManager && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100 space-y-4 overflow-hidden"
                >
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-zinc-800">Gerenciar Limites</h3>
                    <button onClick={() => setShowCardManager(false)} className="text-zinc-400 hover:text-zinc-600">
                      <Plus className="rotate-45" size={20} />
                    </button>
                  </div>
                  
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    handleAddCard(formData.get('bank_name') as string, Number(formData.get('limit_amount')));
                    (e.target as HTMLFormElement).reset();
                  }} className="grid grid-cols-2 gap-2">
                    <input name="bank_name" placeholder="Banco" required className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                    <div className="flex gap-2">
                      <input name="limit_amount" type="number" placeholder="Limite" required className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 flex-1" />
                      <button type="submit" className="bg-zinc-900 text-white p-2 rounded-xl">
                        <Plus size={20} />
                      </button>
                    </div>
                  </form>

                  <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                    {cards.map(card => (
                      <div key={card.id} className="flex justify-between items-center p-3 bg-zinc-50 rounded-2xl border border-zinc-100">
                        <div>
                          <p className="font-bold text-sm">{card.bank_name}</p>
                          <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Limite: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(card.limit_amount)}</p>
                        </div>
                        <button onClick={() => handleDeleteCard(card.id)} className="text-zinc-300 hover:text-rose-500">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {cards.length === 0 && <p className="text-center text-xs text-zinc-400 py-4">Nenhum cartão cadastrado</p>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Charts Section */}
            <div className="space-y-4">
              <h3 className="font-bold text-zinc-800 flex items-center gap-2">
                <PieChartIcon size={18} className="text-zinc-400" />
                Gastos por Categoria
              </h3>
              <div className="bg-white rounded-3xl p-4 shadow-sm border border-zinc-100 h-64">
                {categoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-400 text-sm">
                    Nenhum dado para exibir
                  </div>
                )}
              </div>
            </div>

            {/* Monthly Trend */}
            <div className="space-y-4">
              <h3 className="font-bold text-zinc-800 flex items-center gap-2">
                <TrendingUp size={18} className="text-zinc-400" />
                Evolução Mensal
              </h3>
              <div className="bg-white rounded-3xl p-4 shadow-sm border border-zinc-100 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      width={40}
                    />
                    <Tooltip />
                    <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-zinc-800">Transações Recentes</h3>
              <div className="flex items-center gap-3">
                <button 
                  onClick={exportToExcel}
                  className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors"
                >
                  <Download size={14} />
                  Exportar Excel
                </button>
                <span className="text-xs text-zinc-400">{filteredTransactions.length} itens</span>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 space-y-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                <button 
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${filterType === 'all' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'}`}
                >
                  Todos
                </button>
                <button 
                  onClick={() => setFilterType('income')}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${filterType === 'income' ? 'bg-emerald-500 text-white' : 'bg-zinc-100 text-zinc-500'}`}
                >
                  Receitas
                </button>
                <button 
                  onClick={() => setFilterType('expense')}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${filterType === 'expense' ? 'bg-rose-500 text-white' : 'bg-zinc-100 text-zinc-500'}`}
                >
                  Despesas
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select 
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Todas Categorias</option>
                  {uniqueCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <select 
                  value={filterResponsible}
                  onChange={(e) => setFilterResponsible(e.target.value)}
                  className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Todos Responsáveis</option>
                  {uniqueResponsibles.map(resp => (
                    <option key={resp} value={resp}>{resp}</option>
                  ))}
                </select>
                <select 
                  value={filterBank}
                  onChange={(e) => setFilterBank(e.target.value)}
                  className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Todos Bancos</option>
                  {uniqueBanks.map(bank => (
                    <option key={bank} value={bank}>{bank}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filtered Totals Summary */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white p-3 rounded-2xl border border-zinc-100 shadow-sm">
                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Receitas</p>
                <p className="text-xs font-bold text-emerald-600">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(filteredTotalIncome)}
                </p>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-zinc-100 shadow-sm">
                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Despesas</p>
                <p className="text-xs font-bold text-rose-600">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(filteredTotalExpense)}
                </p>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-zinc-100 shadow-sm">
                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Saldo</p>
                <p className={`text-xs font-bold ${filteredBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(filteredBalance)}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {filteredTransactions.map((t) => (
                <div key={t.id} className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {t.type === 'income' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-zinc-800">{t.description}</p>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-medium uppercase tracking-wider mt-0.5">
                        <span>{format(parseISO(t.date), 'dd MMM', { locale: ptBR })}</span>
                        <span>•</span>
                        <span>{t.responsible}</span>
                        <span>•</span>
                        <span>{t.category}</span>
                        {t.bank && (
                          <>
                            <span>•</span>
                            <span className="text-indigo-500">{t.bank}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className={`font-bold text-sm ${t.type === 'income' ? 'text-emerald-600' : 'text-zinc-800'}`}>
                      {t.type === 'income' ? '+' : '-'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                    </p>
                    <button 
                      onClick={() => handleDelete(t.id)}
                      className="text-zinc-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {filteredTransactions.length === 0 && (
                <div className="text-center py-12 text-zinc-400 space-y-2">
                  <History size={40} className="mx-auto opacity-20" />
                  <p>Nenhuma transação encontrada</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'add' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            {/* AI Entry */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-indigo-500 p-1.5 rounded-lg">
                  <MessageSquare size={16} className="text-white" />
                </div>
                <h3 className="font-bold text-zinc-800">Entrada Rápida por Voz/Texto</h3>
              </div>
              <p className="text-xs text-zinc-500">Ex: "Gastei 50 reais no almoço hoje, pago no Pix pelo João"</p>
              <div className="relative">
                <textarea 
                  value={aiMessage}
                  onChange={(e) => setAiMessage(e.target.value)}
                  placeholder="O que você comprou?"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none h-24"
                />
                <button 
                  onClick={handleParseAI}
                  disabled={isParsing || !aiMessage.trim()}
                  className="absolute bottom-3 right-3 bg-indigo-600 text-white p-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
                >
                  {isParsing ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                </button>
              </div>
            </div>

            {/* Parsed Result / Manual Form */}
            <AnimatePresence>
              {parsedExpense && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 size={18} />
                      Confirmar Detalhes
                    </h4>
                    <button onClick={() => setParsedExpense(null)} className="text-emerald-400 text-xs font-bold uppercase tracking-widest">Cancelar</button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Valor</label>
                      <input 
                        type="number" 
                        value={parsedExpense.amount} 
                        onChange={(e) => setParsedExpense({...parsedExpense, amount: Number(e.target.value)})}
                        className="w-full bg-white border-none rounded-xl p-2 text-sm font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Data</label>
                      <input 
                        type="date" 
                        value={parsedExpense.date} 
                        onChange={(e) => setParsedExpense({...parsedExpense, date: e.target.value})}
                        className="w-full bg-white border-none rounded-xl p-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Responsável</label>
                      <input 
                        type="text" 
                        value={parsedExpense.responsible} 
                        onChange={(e) => setParsedExpense({...parsedExpense, responsible: e.target.value})}
                        className="w-full bg-white border-none rounded-xl p-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Pagamento</label>
                      <select 
                        value={parsedExpense.payment_method} 
                        onChange={(e) => setParsedExpense({...parsedExpense, payment_method: e.target.value})}
                        className="w-full bg-white border-none rounded-xl p-2 text-sm"
                      >
                        <option value="Pix">Pix</option>
                        <option value="Crédito">Crédito</option>
                        <option value="Débito">Débito</option>
                      </select>
                    </div>
                    {parsedExpense.payment_method === 'Crédito' && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Banco</label>
                          <input 
                            type="text" 
                            value={parsedExpense.bank || ''} 
                            onChange={(e) => setParsedExpense({...parsedExpense, bank: e.target.value})}
                            className="w-full bg-white border-none rounded-xl p-2 text-sm"
                            placeholder="Ex: Nubank"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Parcelas</label>
                          <input 
                            type="number" 
                            min="1"
                            max="48"
                            value={parsedExpense.installments || 1} 
                            onChange={(e) => setParsedExpense({...parsedExpense, installments: Number(e.target.value)})}
                            className="w-full bg-white border-none rounded-xl p-2 text-sm"
                          />
                        </div>
                      </>
                    )}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Categoria</label>
                      <select 
                        value={parsedExpense.category} 
                        onChange={(e) => setParsedExpense({...parsedExpense, category: e.target.value})}
                        className="w-full bg-white border-none rounded-xl p-2 text-sm"
                      >
                        <option value="Necessário">Necessário</option>
                        <option value="Investimento">Investimento</option>
                        <option value="Lazer">Lazer</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Observação</label>
                      <input 
                        type="text" 
                        value={parsedExpense.description} 
                        onChange={(e) => setParsedExpense({...parsedExpense, description: e.target.value})}
                        className="w-full bg-white border-none rounded-xl p-2 text-sm"
                      />
                    </div>
                  </div>

                  <button 
                    onClick={() => handleAddTransaction(parsedExpense)}
                    className="w-full bg-emerald-600 text-white font-bold py-3 rounded-2xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all"
                  >
                    Salvar Despesa
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Manual Income Form */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100 space-y-4">
              <h3 className="font-bold text-zinc-800 flex items-center gap-2">
                <Plus size={18} className="text-emerald-500" />
                Adicionar Receita Manual
              </h3>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleAddTransaction({
                  type: 'income',
                  amount: Number(formData.get('amount')),
                  date: formData.get('date') as string,
                  description: formData.get('description') as string,
                  responsible: formData.get('responsible') as string,
                  category: 'Receita',
                  payment_method: 'Pix'
                });
                (e.target as HTMLFormElement).reset();
              }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <input name="amount" type="number" step="0.01" placeholder="Valor" required className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <input name="description" type="text" placeholder="Observação (ex: Salário)" required className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                <input name="responsible" type="text" placeholder="Responsável" required className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                <button type="submit" className="w-full bg-zinc-900 text-white font-bold py-3 rounded-2xl hover:bg-zinc-800 transition-all">
                  Adicionar Receita
                </button>
              </form>
            </div>

            {/* Manual Expense Form Fallback */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100 space-y-4">
              <h3 className="font-bold text-zinc-800 flex items-center gap-2">
                <Minus size={18} className="text-rose-500" />
                Adicionar Despesa Manual
              </h3>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleAddTransaction({
                  type: 'expense',
                  amount: Number(formData.get('amount')),
                  date: formData.get('date') as string,
                  description: formData.get('description') as string,
                  responsible: formData.get('responsible') as string,
                  category: formData.get('category') as string,
                  payment_method: formData.get('payment_method') as string,
                  bank: formData.get('bank') as string || undefined,
                  installments: Number(formData.get('installments')) || 1
                });
                (e.target as HTMLFormElement).reset();
              }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <input name="amount" type="number" step="0.01" placeholder="Valor" required className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-rose-500" />
                  <input name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-rose-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <select name="category" required className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-rose-500">
                    <option value="Necessário">Necessário</option>
                    <option value="Lazer">Lazer</option>
                    <option value="Investimento">Investimento</option>
                  </select>
                  <select 
                    name="payment_method" 
                    required 
                    value={manualPaymentMethod}
                    onChange={(e) => setManualPaymentMethod(e.target.value)}
                    className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="Pix">Pix</option>
                    <option value="Crédito">Crédito</option>
                    <option value="Débito">Débito</option>
                  </select>
                </div>
                {manualPaymentMethod === 'Crédito' && (
                  <div className="grid grid-cols-2 gap-4">
                    <input name="bank" type="text" placeholder="Qual o Banco? (ex: Nubank)" required className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-rose-500" />
                    <input name="installments" type="number" min="1" max="48" defaultValue="1" placeholder="Parcelas" required className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-rose-500" />
                  </div>
                )}
                <input name="description" type="text" placeholder="Observação (ex: Almoço)" required className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-rose-500" />
                <input name="responsible" type="text" placeholder="Responsável" required className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-rose-500" />
                <button type="submit" className="w-full bg-rose-600 text-white font-bold py-3 rounded-2xl hover:bg-rose-700 transition-all">
                  Adicionar Despesa
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-zinc-200 pb-safe">
        <div className="max-w-md mx-auto px-8 py-3 flex justify-between items-center">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'dashboard' ? 'text-emerald-600' : 'text-zinc-400'}`}
          >
            <LayoutDashboard size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Início</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('add')}
            className="bg-emerald-500 text-white p-4 rounded-2xl shadow-lg shadow-emerald-200 -mt-10 border-4 border-zinc-50 active:scale-95 transition-all"
          >
            <Plus size={24} />
          </button>

          <button 
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'history' ? 'text-emerald-600' : 'text-zinc-400'}`}
          >
            <History size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Histórico</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default App;
