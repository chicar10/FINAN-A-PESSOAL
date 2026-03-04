import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/transactions", async (req, res) => {
    try {
      if (!supabase) throw new Error("Supabase not configured");
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false })
        .order("id", { ascending: false });
      
      if (error) throw error;
      res.json(data);
    } catch (error) {
      console.error("Fetch error:", error);
      res.status(500).json({ error: "Erro ao buscar transações" });
    }
  });

  app.post("/api/transactions", async (req, res) => {
    try {
      if (!supabase) throw new Error("Supabase not configured");
      const { type, amount, date, responsible, payment_method, category, bank, description, installments = 1 } = req.body;
      
      if (!type || !amount || !date) {
        return res.status(400).json({ error: "Dados obrigatórios faltando" });
      }

      if (payment_method === 'Crédito' && installments > 1) {
        const installmentAmount = amount / installments;
        const baseDate = new Date(date);
        const newTransactions = [];

        for (let i = 1; i <= installments; i++) {
          const installmentDate = new Date(baseDate);
          installmentDate.setMonth(baseDate.getMonth() + (i - 1));
          const dateStr = installmentDate.toISOString().split('T')[0];
          
          newTransactions.push({
            type, 
            amount: installmentAmount, 
            date: dateStr, 
            responsible, 
            payment_method, 
            category, 
            bank, 
            description: `${description} (${i}/${installments})`,
            installments,
            installment_number: i
          });
        }
        
        const { error } = await supabase.from("transactions").insert(newTransactions);
        if (error) throw error;
        res.json({ success: true, message: `${installments} parcelas criadas` });
      } else {
        const { data, error } = await supabase
          .from("transactions")
          .insert([{ type, amount, date, responsible, payment_method, category, bank, description, installments: 1, installment_number: 1 }])
          .select();
        
        if (error) throw error;
        res.json({ id: data[0].id, success: true });
      }
    } catch (error) {
      console.error("Insert error:", error);
      res.status(500).json({ error: "Erro ao salvar no Supabase" });
    }
  });

  app.delete("/api/transactions/:id", async (req, res) => {
    try {
      if (!supabase) throw new Error("Supabase not configured");
      const { error } = await supabase.from("transactions").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao deletar" });
    }
  });

  // Card Limits Routes
  app.get("/api/cards", async (req, res) => {
    try {
      if (!supabase) throw new Error("Supabase not configured");
      const { data, error } = await supabase.from("card_limits").select("*");
      if (error) throw error;
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar limites" });
    }
  });

  app.post("/api/cards", async (req, res) => {
    try {
      if (!supabase) throw new Error("Supabase not configured");
      const { bank_name, limit_amount } = req.body;
      
      const { error } = await supabase
        .from("card_limits")
        .upsert({ bank_name, limit_amount, updated_at: new Date().toISOString() }, { onConflict: 'bank_name' });
      
      if (error) throw error;
      res.json({ success: true });
    } catch (error) {
      console.error("Card limit error:", error);
      res.status(500).json({ error: "Erro ao salvar limite" });
    }
  });

  app.delete("/api/cards/:id", async (req, res) => {
    try {
      if (!supabase) throw new Error("Supabase not configured");
      const { error } = await supabase.from("card_limits").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao deletar limite" });
    }
  });

  app.post("/api/parse-expense", async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analise a seguinte mensagem sobre um gasto financeiro: "${message}". 
        A data atual é ${new Date().toISOString().split('T')[0]}.
        Extraia com precisão:
        1. Valor (amount): O valor numérico gasto.
        2. Data (date): A data do gasto no formato YYYY-MM-DD. Se disser "hoje", use a data atual.
        3. Responsável (responsible): Quem fez o gasto.
        4. Forma de Pagamento (payment_method): Identifique se foi 'Crédito', 'Débito' ou 'Pix'.
        5. Banco (bank): Se o pagamento for 'Crédito', tente identificar o nome do banco (ex: Nubank, Itaú, Bradesco).
        6. Categoria (category): Identifique se é 'Investimento', 'Necessário' ou 'Lazer'.
        7. Observação (observation): Uma breve descrição do que foi comprado ou o motivo do gasto.

        Retorne estritamente um JSON com estas chaves: amount, date, responsible, payment_method, bank, category, observation.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              amount: { type: Type.NUMBER },
              date: { type: Type.STRING },
              responsible: { type: Type.STRING },
              payment_method: { type: Type.STRING, enum: ["Crédito", "Débito", "Pix"] },
              bank: { type: Type.STRING },
              category: { type: Type.STRING, enum: ["Investimento", "Necessário", "Lazer"] },
              observation: { type: Type.STRING },
            },
            required: ["amount", "date", "observation"]
          }
        }
      });

      const parsed = JSON.parse(response.text || "{}");
      // Map observation to description for DB
      if (parsed.observation) {
        parsed.description = parsed.observation;
      }
      res.json(parsed);
    } catch (error) {
      console.error("AI Parse Error:", error);
      res.status(500).json({ error: "Failed to parse expense" });
    }
  });

  app.get("/api/stats", async (req, res) => {
    try {
      if (!supabase) throw new Error("Supabase not configured");
      const { data, error } = await supabase
        .from("transactions")
        .select("type, amount, date");
      
      if (error) throw error;

      const monthlyData: { [key: string]: { income: number, expense: number } } = {};
      
      data.forEach(t => {
        const month = t.date.substring(0, 7);
        if (!monthlyData[month]) {
          monthlyData[month] = { income: 0, expense: 0 };
        }
        if (t.type === 'income') {
          monthlyData[month].income += t.amount;
        } else {
          monthlyData[month].expense += t.amount;
        }
      });

      const stats = Object.entries(monthlyData)
        .map(([month, values]) => ({
          month,
          income: values.income,
          expense: values.expense
        }))
        .sort((a, b) => b.month.localeCompare(a.month))
        .slice(0, 12);

      res.json(stats);
    } catch (error) {
      console.error("Stats error:", error);
      res.status(500).json({ error: "Erro ao calcular estatísticas" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
