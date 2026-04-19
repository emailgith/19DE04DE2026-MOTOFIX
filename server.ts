import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware para JSON
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Proxy para Evolution API (Contornar erro de Mixed Content / SSL)
  app.post("/api/evolution-proxy", async (req, res) => {
    const { url, apiKey, method, body } = req.body;

    if (!url || !apiKey) {
      return res.status(400).json({ error: "URL e API Key são obrigatórios." });
    }

    try {
      const response = await axios({
        url,
        method: method || "GET",
        headers: {
          "Content-Type": "application/json",
          "apikey": apiKey
        },
        data: body,
        timeout: 10000 // 10 segundos de timeout
      });

      res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || 500;
      
      let errorMessage = error.message;
      if (error.code === 'ECONNREFUSED') errorMessage = "Conexão Recusada: O servidor no DigitalOcean não está aceitando conexões na porta 8081. Verifique se o Docker está rodando.";
      if (error.code === 'ETIMEDOUT') errorMessage = "Tempo Esgotado: O servidor demorou muito para responder. Verifique o Firewall.";
      if (error.code === 'ENOTFOUND') errorMessage = "Endereço não encontrado: Verifique se o IP está correto.";
      
      console.error("Erro no Proxy da Evolution API:", errorMessage);
      
      const data = error.response?.data || { message: errorMessage };
      res.status(status).json(data);
    }
  });

  // Rota de saúde básica
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Configuração do Vite para desenvolvimento ou produção
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  });
}

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();
