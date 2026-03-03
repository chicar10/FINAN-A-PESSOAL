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
  Download
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
import { Transaction, MonthlyStats } from './types';

const App = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<MonthlyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'add'>('dashboard');
  const [aiMessage, setAiMessage] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedExpense, setParsedExpense] = useState<Partial<Transaction> | null>(null);
  
  // Filter states
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterResponsible, setFilterResponsible] = useState<string>('all');

  const exportToExcel = () => {
    const dataToExport = filteredTransactions.map(t => ({
      Tipo: t.type === 'income' ? 'Receita' : 'Despesa',
      Valor: t.amount,
      Data: format(parseISO(t.date), 'dd/MM/yyyy'),
      Responsável: t.responsible,
      'Forma de Pagamento': t.payment_method,
      Categoria: t.category,
      Observação: t.description
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Histórico');
    XLSX.writeFile(workbook, `Financas_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const fetchData = async () => {
    try {
      const [tRes, sRes] = await Promise.all([
        fetch('/api/transactions'),
        fetch('/api/stats')
      ]);
      const tData = await tRes.json();
      const sData = await sRes.json();
      setTransactions(tData);
      setStats(sData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddTransaction = async (data: Partial<Transaction>) => {
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        fetchData();
        setActiveTab('dashboard');
        setParsedExpense(null);
        setAiMessage('');
      }
    } catch (error) {
      console.error('Error adding transaction:', error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      console.error('Error deleting transaction:', error);
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
      const data = await res.json();
      setParsedExpense({ ...data, type: 'expense' });
    } catch (error) {
      console.error('Error parsing AI message:', error);
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

  const balance = totalIncome - totalExpense;

  const filteredTransactions = transactions.filter(t => {
    const matchesType = filterType === 'all' || t.type === filterType;
    const matchesCategory = filterCategory === 'all' || t.category === filterCategory;
    const matchesResponsible = filterResponsible === 'all' || t.responsible === filterResponsible;
    return matchesType && matchesCategory && matchesResponsible;
  });

  const uniqueCategories = ['Investimento', 'Necessário', 'Lazer'];
  const uniqueResponsibles = Array.from(new Set(transactions.map(t => t.responsible))).filter(Boolean);

  const categoryData = [
    { name: 'Investimento', value: transactions.filter(t => t.category === 'Investimento').reduce((acc, t) => acc + t.amount, 0) },
    { name: 'Necessário', value: transactions.filter(t => t.category === 'Necessário').reduce((acc, t) => acc + t.amount, 0) },
    { name: 'Lazer', value: transactions.filter(t => t.category === 'Lazer').reduce((acc, t) => acc + t.amount, 0) },
  ].filter(c => c.value > 0);

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b'];

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
          <div className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-1 rounded-full uppercase tracking-wider">
            Março 2026
          </div>
        </div>
      </header>

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
                <p className="text-zinc-400 text-sm font-medium">Saldo Total</p>
                <h2 className="text-3xl font-bold mt-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(balance)}
                </h2>
                <div className="grid grid-cols-2 gap-4 mt-6">
                  <div className="bg-white/10 rounded-2xl p-3">
                    <div className="flex items-center gap-2 text-emerald-400 mb-1">
                      <TrendingUp size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Receitas</span>
                    </div>
                    <p className="font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalIncome)}</p>
                  </div>
                  <div className="bg-white/10 rounded-2xl p-3">
                    <div className="flex items-center gap-2 text-rose-400 mb-1">
                      <TrendingDown size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Despesas</span>
                    </div>
                    <p className="font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalExpense)}</p>
                  </div>
                </div>
              </div>
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl" />
            </div>

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
