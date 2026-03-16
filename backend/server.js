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

// ─── BANCO DE DADOS ───────────────────────────────────────────
const db = new Database(path.join(__dirname, 'capi.db'));

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

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT DEFAULT 'Nova conversa',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tokens INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Inserir prompt padrão se não existir
const existingPrompt = db.prepare("SELECT value FROM settings WHERE key = 'system_prompt'").get();
if (!existingPrompt) {
  const DEFAULT_PROMPT = `Você é o Capi Când-IA Pro, um agente de inteligência artificial avançado, criado por Rafael Cândia, advogado, mentor e fundador da Comunidade Capi Cândia.

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
  db.prepare("INSERT INTO settings (key, value) VALUES ('system_prompt', ?)").run(DEFAULT_PROMPT);
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── MIDDLEWARE ───────────────────────────────────────────────
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

// ─── AUTH ─────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(name, email.toLowerCase(), hash);
    const token = jwt.sign({ id: result.lastInsertRowid, email, name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: result.lastInsertRowid, name, email } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email já cadastrado' });
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

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

// ─── CONVERSAS ────────────────────────────────────────────────

// Listar conversas do usuário
app.get('/api/conversations', authMiddleware, (req, res) => {
  const convs = db.prepare(`
    SELECT c.id, c.title, c.created_at, c.updated_at,
           COUNT(m.id) as message_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.user_id = ?
    GROUP BY c.id
    ORDER BY c.updated_at DESC
    LIMIT 50
  `).all(req.user.id);
  res.json(convs);
});

// Criar nova conversa
app.post('/api/conversations', authMiddleware, (req, res) => {
  const { title } = req.body;
  const result = db.prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)').run(req.user.id, title || 'Nova conversa');
  res.json({ id: result.lastInsertRowid, title: title || 'Nova conversa' });
});

// Buscar mensagens de uma conversa
app.get('/api/conversations/:id/messages', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
  const messages = db.prepare('SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(req.params.id);
  res.json({ conversation: conv, messages });
});

// Deletar conversa
app.delete('/api/conversations/:id', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── CHAT ─────────────────────────────────────────────────────
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { messages, conversation_id } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Mensagens inválidas' });
  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'API key não configurada' });

  const systemPrompt = db.prepare("SELECT value FROM settings WHERE key = 'system_prompt'").get()?.value || '';

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: systemPrompt }, ...messages.slice(-20)],
        temperature: 0.75,
        max_tokens: 1500
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: data.error?.message || 'Erro na OpenAI' });

    const reply = data.choices[0].message.content;
    const tokens = data.usage?.total_tokens || 0;
    const userId = req.user.id;

    // Gerenciar conversa
    let convId = conversation_id;
    if (!convId) {
      // Gerar título automático a partir da primeira mensagem do usuário
      const firstUserMsg = messages.find(m => m.role === 'user');
      const title = firstUserMsg ? firstUserMsg.content.substring(0, 60) : 'Nova conversa';
      const conv = db.prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)').run(userId, title);
      convId = conv.lastInsertRowid;
    } else {
      db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(convId);
    }

    // Salvar mensagens
    const lastUserMsg = messages[messages.length - 1];
    db.prepare('INSERT INTO messages (conversation_id, user_id, role, content, tokens) VALUES (?, ?, ?, ?, ?)').run(convId, userId, 'user', lastUserMsg.content, 0);
    db.prepare('INSERT INTO messages (conversation_id, user_id, role, content, tokens) VALUES (?, ?, ?, ?, ?)').run(convId, userId, 'assistant', reply, tokens);

    res.json({ reply, tokens, conversation_id: convId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao conectar com a OpenAI' });
  }
});

// ─── ADMIN ────────────────────────────────────────────────────

// Stats
app.get('/api/admin/stats', adminMiddleware, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const activeUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE active = 1').get().c;
  const totalMessages = db.prepare("SELECT COUNT(*) as c FROM messages WHERE role = 'user'").get().c;
  const totalTokens = db.prepare('SELECT SUM(tokens) as s FROM messages').get().s || 0;
  const totalConversations = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
  const todayMessages = db.prepare("SELECT COUNT(*) as c FROM messages WHERE role='user' AND date(created_at) = date('now')").get().c;
  res.json({ totalUsers, activeUsers, totalMessages, totalTokens, totalConversations, todayMessages });
});

// Listar usuários
app.get('/api/admin/users', adminMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.active, u.created_at, u.last_login,
           COUNT(DISTINCT c.id) as total_conversations,
           COUNT(m.id) as total_messages
    FROM users u
    LEFT JOIN conversations c ON c.user_id = u.id
    LEFT JOIN messages m ON m.user_id = u.id AND m.role = 'user'
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

// Criar usuário
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
  db.prepare('DELETE FROM conversations WHERE user_id = ?').run(req.params.id);
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

// Ver conversas de um usuário (admin)
app.get('/api/admin/users/:id/conversations', adminMiddleware, (req, res) => {
  const convs = db.prepare(`
    SELECT c.id, c.title, c.created_at, c.updated_at, COUNT(m.id) as msg_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.user_id = ?
    GROUP BY c.id ORDER BY c.updated_at DESC
  `).all(req.params.id);
  res.json(convs);
});

// Ler/editar prompt
app.get('/api/admin/prompt', adminMiddleware, (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'system_prompt'").get();
  res.json({ prompt: row?.value || '' });
});

app.put('/api/admin/prompt', adminMiddleware, (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt inválido' });
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('system_prompt', ?, datetime('now'))").run(prompt);
  res.json({ success: true });
});

// Catch-all SPA
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => console.log(`✅ Capi Când-IA Pro rodando na porta ${PORT}`));
