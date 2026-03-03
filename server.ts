import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";

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
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/transactions", (req, res) => {
    const transactions = db.prepare("SELECT * FROM transactions ORDER BY date DESC, id DESC").all();
    res.json(transactions);
  });

  app.post("/api/transactions", (req, res) => {
    const { type, amount, date, responsible, payment_method, category, description } = req.body;
    const stmt = db.prepare(`
      INSERT INTO transactions (type, amount, date, responsible, payment_method, category, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(type, amount, date, responsible, payment_method, category, description);
    res.json({ id: result.lastInsertRowid });
  });

  app.delete("/api/transactions/:id", (req, res) => {
    db.prepare("DELETE FROM transactions WHERE id = ?").run(req.params.id);
    res.json({ success: true });
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
        5. Categoria (category): Identifique se é 'Investimento', 'Necessário' ou 'Lazer'.
        6. Observação (observation): Uma breve descrição do que foi comprado ou o motivo do gasto.

        Retorne estritamente um JSON com estas chaves: amount, date, responsible, payment_method, category, observation.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              amount: { type: Type.NUMBER },
              date: { type: Type.STRING },
              responsible: { type: Type.STRING },
              payment_method: { type: Type.STRING, enum: ["Crédito", "Débito", "Pix"] },
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
