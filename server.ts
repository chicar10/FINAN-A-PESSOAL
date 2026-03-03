import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("finance.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'income' or 'expense'
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    responsible TEXT,
    payment_method TEXT, -- 'Crédito', 'Débito', 'Pix'
    category TEXT, -- 'Investimento', 'Necessário', 'Lazer'
    bank TEXT, -- Name of the bank
    description TEXT,
    installments INTEGER DEFAULT 1,
    installment_number INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS card_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_name TEXT UNIQUE NOT NULL,
    limit_amount REAL NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/transactions", (req, res) => {
    try {
      const transactions = db.prepare("SELECT * FROM transactions ORDER BY date DESC, id DESC").all();
      res.json(transactions);
    } catch (error) {
      console.error("Fetch error:", error);
      res.status(500).json({ error: "Erro ao buscar transações" });
    }
  });

  app.post("/api/transactions", (req, res) => {
    try {
      const { type, amount, date, responsible, payment_method, category, bank, description, installments = 1 } = req.body;
      
      if (!type || !amount || !date) {
        return res.status(400).json({ error: "Dados obrigatórios faltando" });
      }

      if (payment_method === 'Crédito' && installments > 1) {
        const installmentAmount = amount / installments;
        const stmt = db.prepare(`
          INSERT INTO transactions (type, amount, date, responsible, payment_method, category, bank, description, installments, installment_number)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const baseDate = new Date(date);
        for (let i = 1; i <= installments; i++) {
          const installmentDate = new Date(baseDate);
          installmentDate.setMonth(baseDate.getMonth() + (i - 1));
          const dateStr = installmentDate.toISOString().split('T')[0];
          
          stmt.run(
            type, 
            installmentAmount, 
            dateStr, 
            responsible, 
            payment_method, 
            category, 
            bank, 
            `${description} (${i}/${installments})`,
            installments,
            i
          );
        }
        res.json({ success: true, message: `${installments} parcelas criadas` });
      } else {
        const stmt = db.prepare(`
          INSERT INTO transactions (type, amount, date, responsible, payment_method, category, bank, description, installments, installment_number)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(type, amount, date, responsible, payment_method, category, bank, description, 1, 1);
        res.json({ id: result.lastInsertRowid, success: true });
      }
    } catch (error) {
      console.error("Insert error:", error);
      res.status(500).json({ error: "Erro ao salvar no banco de dados" });
    }
  });

  // Card Limits Routes
  app.get("/api/cards", (req, res) => {
    try {
      const cards = db.prepare("SELECT * FROM card_limits").all();
      res.json(cards);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar limites" });
    }
  });

  app.post("/api/cards", (req, res) => {
    try {
      const { bank_name, limit_amount } = req.body;
      const stmt = db.prepare(`
        INSERT INTO card_limits (bank_name, limit_amount)
        VALUES (?, ?)
        ON CONFLICT(bank_name) DO UPDATE SET limit_amount = excluded.limit_amount, updated_at = CURRENT_TIMESTAMP
      `);
      stmt.run(bank_name, limit_amount);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao salvar limite" });
    }
  });

  app.delete("/api/cards/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM card_limits WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao deletar limite" });
    }
  });

  app.delete("/api/transactions/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM transactions WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao deletar" });
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

  app.get("/api/stats", (req, res) => {
    const stats = db.prepare(`
      SELECT 
        strftime('%Y-%m', date) as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
      FROM transactions
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `).all();
    res.json(stats);
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
