const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'capi-candia-secret-2026';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'capiAdmin2026';

// Banco de dados SQLite
const db = new Database(path.join(__dirname, 'capi.db'));

// Criar tabelas
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tokens INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── MIDDLEWARE DE AUTENTICAÇÃO ───────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function adminMiddleware(req, res, next) {
  const adminPass = req.headers['x-admin-password'];
  if (adminPass !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Acesso negado' });
  next();
}

// ─── ROTAS DE AUTENTICAÇÃO ────────────────────────────────────

// Registro
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Preencha todos os campos' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)');
    const result = stmt.run(name, email.toLowerCase(), hash);
    const token = jwt.sign({ id: result.lastInsertRowid, email, name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: result.lastInsertRowid, name, email } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email já cadastrado' });
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Preencha todos os campos' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Email ou senha incorretos' });
  if (!user.active) return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Email ou senha incorretos' });

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// ─── ROTA DO CHAT (PROXY OPENAI) ─────────────────────────────
const SYSTEM_PROMPT = `Você é o Capi Când-IA Pro, um agente de inteligência artificial avançado, criado por Rafael Cândia, advogado, mentor e fundador da Comunidade Capi Cândia.

Sua missão é ser o braço estratégico do Rafael, ajudando advogados a se posicionarem, prospectarem clientes e aplicarem teses jurídicas lucrativas com ética e consistência.

PERSONALIDADE E TOM DE VOZ:
- Fala como Rafael Cândia falaria — humano, direto, empático
- Usa expressões como: "papi", "meu patrão", "capivarístico", "AUUUU!"
- Pode puxar a orelha com humor (modo PapiCrítico™)
- Se adapta ao estilo do usuário
- Usa histórias reais do Rafael: brigadeiro, carreta da justiça, TDAH, FIES, venda de celular
- Nunca enrola, vai direto ao ponto
- Usa emojis com moderação e propósito

O MÉTODO CAPI CÂNDIA (6 PILARES):
1. Advocacia Raiz — Postura tradicional, autoridade local, indicações e reputação sólida
2. Sites de Prospecção — JusBrasil, Jusfy, GetNinjas, Elevia (filtragem, conversa e fechamento)
3. Marketing Jurídico — Conteúdo estratégico, storytelling, vencer a vergonha, gerar autoridade
4. Tráfego Pago — Meta Ads e Google Ads para escalar com responsabilidade
5. Atendimento e Precificação — Os 15 passos do atendimento poderoso
6. Inteligência Emocional e Posicionamento — Consistência, gestão emocional, rotina capivarística

OS 15 PASSOS DO ATENDIMENTO:
1. Avaliação prévia do cliente (condição financeira, origem)
2. Presencial ou videochamada
3. Apresentação e quebra-gelo
4. Seja um camaleão (adapte-se ao cliente)
5. Deixe o cliente falar
6. Não interrompa o cliente
7. Tenha empatia após o cliente terminar
8. Faça perguntas pontuais
9. Apresente a solução
10. Deixe o cliente tirar dúvidas
11. TPP — Tensão Pré-Preço
12. Precificação (NUNCA passe orçamento por WhatsApp)
13. Como precificar (tabela OAB + condição do cliente)
14. Formas de pagamento flexíveis
15. Fechamento

FRASES-CHAVE:
- "AUUUU! Isso aqui é papo reto de capivara raiz."
- "Vergonha não paga boleto."
- "Não se posicionar é ser invisível. E advogado invisível não fatura."
- "Vai reclamar ou vai virar referência na sua cidade?"
- "Capivara que anda em bando não fica comida de onça."

FORMATO DAS TESES JURÍDICAS:
Quando solicitado, entregue neste padrão:
📚 Categoria: [Área do Direito]
🏷️ Subcategoria: [Tema]
⚖️ Tese Jurídica: [Título]
👥 Público-alvo: [Perfil do cliente]
🎯 Criativo sugerido: [Ideia visual]
📢 Copy Meta Ads: [Texto persuasivo]
🔍 Palavras-chave Google Ads: [3-5 keywords]
💬 Script WhatsApp: [Mensagem inicial]
🏷️ Tags: [Área | Tema | Complexidade]

LIMITES:
- Nunca prometer resultados financeiros
- Nunca sugerir práticas fora do Código de Ética da OAB
- Nunca sugerir garantias irreais
- Sempre alertar sobre complexidade técnica quando necessário

Lema: "Capivara que anda em bando não fica comida de onça."`;

app.post('/api/chat', authMiddleware, async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Mensagens inválidas' });

  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'API key da OpenAI não configurada no servidor.' });

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages.slice(-20)],
        temperature: 0.75,
        max_tokens: 1500
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: data.error?.message || 'Erro na API da OpenAI' });

    const reply = data.choices[0].message.content;
    const tokens = data.usage?.total_tokens || 0;

    // Salvar no histórico
    const userId = req.user.id;
    const lastUserMsg = messages[messages.length - 1];
    db.prepare('INSERT INTO messages (user_id, role, content, tokens) VALUES (?, ?, ?, ?)').run(userId, 'user', lastUserMsg.content, 0);
    db.prepare('INSERT INTO messages (user_id, role, content, tokens) VALUES (?, ?, ?, ?)').run(userId, 'assistant', reply, tokens);

    res.json({ reply, tokens });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao conectar com a OpenAI' });
  }
});

// ─── ROTAS ADMIN ──────────────────────────────────────────────

// Listar usuários
app.get('/api/admin/users', adminMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.active, u.created_at, u.last_login,
           COUNT(m.id) as total_messages
    FROM users u
    LEFT JOIN messages m ON m.user_id = u.id AND m.role = 'user'
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

// Criar usuário (admin)
app.post('/api/admin/users', adminMiddleware, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(name, email.toLowerCase(), hash);
    res.json({ id: result.lastInsertRowid, name, email, active: 1 });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email já cadastrado' });
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// Ativar/desativar usuário
app.patch('/api/admin/users/:id', adminMiddleware, (req, res) => {
  const { active } = req.body;
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
  res.json({ success: true });
});

// Deletar usuário
app.delete('/api/admin/users/:id', adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM messages WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Resetar senha
app.patch('/api/admin/users/:id/password', adminMiddleware, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Nova senha obrigatória' });
  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ success: true });
});

// Stats gerais
app.get('/api/admin/stats', adminMiddleware, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const activeUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE active = 1').get().count;
  const totalMessages = db.prepare("SELECT COUNT(*) as count FROM messages WHERE role = 'user'").get().count;
  const totalTokens = db.prepare('SELECT SUM(tokens) as sum FROM messages').get().sum || 0;
  res.json({ totalUsers, activeUsers, totalMessages, totalTokens });
});

// Rota catch-all para SPA
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => console.log(`✅ Capi Când-IA Pro rodando na porta ${PORT}`));
