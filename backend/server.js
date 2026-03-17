const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'capi-candia-secret-2026';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'capiAdmin2026';

// ─── UPLOAD CONFIG ────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '_' + safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.pdf', '.md', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Tipo de arquivo não suportado. Use .txt, .pdf, .md ou .docx'));
  }
});

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

  CREATE TABLE IF NOT EXISTS knowledge_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    chunk_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'processing',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (file_id) REFERENCES knowledge_files(id)
  );
`);

// Inserir prompt padrão se não existir
const existingPrompt = db.prepare("SELECT value FROM settings WHERE key = 'system_prompt'").get();
if (!existingPrompt) {
  const DEFAULT_PROMPT = `Você é o Capi Când-IA Pro, um agente de inteligência artificial avançado, criado por Rafael Cândia, advogado, mentor e fundador da Comunidade Capi Cândia.

Sua missão é ser o braço estratégico do Rafael, ajudando advogados aprovados no CapVeste ou convidados pessoais dele a se posicionarem, prospectarem clientes e aplicarem teses jurídicas lucrativas com ética e consistência.

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

// ─── RAG: FUNÇÕES AUXILIARES ──────────────────────────────────

// Divide texto em chunks de ~800 tokens (~3200 chars) com overlap de 200 chars
function splitIntoChunks(text, chunkSize = 3200, overlap = 300) {
  const chunks = [];
  let start = 0;
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  while (start < cleanText.length) {
    let end = start + chunkSize;
    if (end < cleanText.length) {
      // Tenta quebrar em ponto, newline ou espaço
      const breakAt = cleanText.lastIndexOf('. ', end) || cleanText.lastIndexOf('\n', end) || cleanText.lastIndexOf(' ', end);
      if (breakAt > start + chunkSize * 0.5) end = breakAt + 1;
    }
    const chunk = cleanText.slice(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk);
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
}

// Extrai texto de arquivos
async function extractText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  
  if (ext === '.txt' || ext === '.md') {
    return fs.readFileSync(filePath, 'utf8');
  }
  
  if (ext === '.pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return data.text;
    } catch (e) {
      console.error('Erro ao parsear PDF:', e.message);
      return '';
    }
  }
  
  // .docx — extrai texto básico
  if (ext === '.docx') {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } catch {
      return '';
    }
  }
  
  return '';
}

// Gera embedding via OpenAI
async function getEmbedding(text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000) // máx 8k chars por chunk
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Erro ao gerar embedding');
  return data.data[0].embedding;
}

// Similaridade por cosseno
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Busca os chunks mais relevantes para uma query
async function searchKnowledge(query, topK = 5) {
  const chunks = db.prepare('SELECT kc.id, kc.content, kc.embedding, kf.original_name FROM knowledge_chunks kc JOIN knowledge_files kf ON kf.id = kc.file_id WHERE kf.status = ? AND kc.embedding IS NOT NULL').all('ready');
  
  if (chunks.length === 0) return [];
  
  try {
    const queryEmbedding = await getEmbedding(query);
    
    const scored = chunks.map(chunk => {
      const emb = JSON.parse(chunk.embedding);
      const score = cosineSimilarity(queryEmbedding, emb);
      return { ...chunk, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).filter(c => c.score > 0.3);
  } catch (e) {
    console.error('Erro na busca semântica:', e.message);
    return [];
  }
}

// Processa arquivo em background (gera embeddings)
async function processFile(fileId) {
  const file = db.prepare('SELECT * FROM knowledge_files WHERE id = ?').get(fileId);
  if (!file) return;
  
  try {
    const text = await extractText(file.file_path, file.original_name);
    if (!text || text.length < 10) {
      db.prepare("UPDATE knowledge_files SET status = 'error' WHERE id = ?").run(fileId);
      return;
    }
    
    const chunks = splitIntoChunks(text);
    console.log(`📚 Processando ${file.original_name}: ${chunks.length} chunks`);
    
    // Insere chunks
    const insertChunk = db.prepare('INSERT INTO knowledge_chunks (file_id, chunk_index, content) VALUES (?, ?, ?)');
    for (let i = 0; i < chunks.length; i++) {
      insertChunk.run(fileId, i, chunks[i]);
    }
    
    // Gera embeddings em lotes de 5 para não throttlar a API
    const allChunks = db.prepare('SELECT id, content FROM knowledge_chunks WHERE file_id = ?').all(fileId);
    let processed = 0;
    
    for (let i = 0; i < allChunks.length; i += 5) {
      const batch = allChunks.slice(i, i + 5);
      await Promise.all(batch.map(async (chunk) => {
        try {
          const emb = await getEmbedding(chunk.content);
          db.prepare('UPDATE knowledge_chunks SET embedding = ? WHERE id = ?').run(JSON.stringify(emb), chunk.id);
          processed++;
        } catch (e) {
          console.error(`Erro no embedding chunk ${chunk.id}:`, e.message);
        }
      }));
      // Pequena pausa para respeitar rate limit
      if (i + 5 < allChunks.length) await new Promise(r => setTimeout(r, 200));
    }
    
    db.prepare("UPDATE knowledge_files SET status = 'ready', chunk_count = ? WHERE id = ?").run(processed, fileId);
    console.log(`✅ ${file.original_name} pronto — ${processed} embeddings gerados`);
    
  } catch (e) {
    console.error(`Erro ao processar arquivo ${fileId}:`, e.message);
    db.prepare("UPDATE knowledge_files SET status = 'error' WHERE id = ?").run(fileId);
  }
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

app.post('/api/conversations', authMiddleware, (req, res) => {
  const { title } = req.body;
  const result = db.prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)').run(req.user.id, title || 'Nova conversa');
  res.json({ id: result.lastInsertRowid, title: title || 'Nova conversa' });
});

app.get('/api/conversations/:id/messages', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
  const messages = db.prepare('SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(req.params.id);
  res.json({ conversation: conv, messages });
});

app.delete('/api/conversations/:id', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── CHAT COM RAG ─────────────────────────────────────────────
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { messages, conversation_id } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Mensagens inválidas' });
  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'API key não configurada' });

  const systemPrompt = db.prepare("SELECT value FROM settings WHERE key = 'system_prompt'").get()?.value || '';
  
  // Pega a última mensagem do usuário para busca semântica
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  
  let ragContext = '';
  if (lastUserMsg) {
    try {
      const relevantChunks = await searchKnowledge(lastUserMsg.content, 5);
      if (relevantChunks.length > 0) {
        ragContext = '\n\n━━━ CONHECIMENTO DO RAFAEL CÂNDIA (use isto para responder) ━━━\n';
        relevantChunks.forEach((chunk, i) => {
          ragContext += `\n[${i+1}] Fonte: ${chunk.original_name}\n${chunk.content}\n`;
        });
        ragContext += '\n━━━ FIM DO CONHECIMENTO ━━━\n';
        ragContext += '\nIMPORTANTE: Use os trechos acima como base para a resposta. Seja específico, cite exemplos e metodologias do Rafael quando relevante.';
      }
    } catch (e) {
      console.error('Erro RAG (continuando sem contexto):', e.message);
    }
  }

  // Detecta se é a primeira mensagem da conversa (sem histórico de assistant)
  const hasAssistantHistory = messages.some(m => m.role === 'assistant');
  const isFirstMessage = !hasAssistantHistory;
  
  // Contexto de personalização: injeta instrução para perguntar nome/área APENAS na primeira mensagem
  let personalizationCtx = '';
  if (isFirstMessage) {
    personalizationCtx = '\n\nINSTRUÇÃO ESPECIAL (APENAS NESTA RESPOSTA): O usuário acabou de iniciar a conversa. OBRIGATORIAMENTE, ao final da sua resposta, faça UMA pergunta curta e amigável perguntando o nome do advogado e em qual área do Direito ele atua (ex: Família, Previdenciário, Trabalhista, Criminal, etc). Isso é fundamental para você personalizar as próximas respostas. Exemplo: \'Antes de continuar, me conta: qual é o seu nome e em qual área você atua?\'';
  }

  const fullSystemPrompt = systemPrompt + ragContext + personalizationCtx;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: fullSystemPrompt }, ...messages.slice(-20)],
        temperature: 0.75,
        max_tokens: 1500
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: data.error?.message || 'Erro na OpenAI' });

    const reply = data.choices[0].message.content;
    const tokens = data.usage?.total_tokens || 0;
    const userId = req.user.id;

    let convId = conversation_id;
    if (!convId) {
      const firstUserMsg = messages.find(m => m.role === 'user');
      const title = firstUserMsg ? firstUserMsg.content.substring(0, 60) : 'Nova conversa';
      const conv = db.prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)').run(userId, title);
      convId = conv.lastInsertRowid;
    } else {
      db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(convId);
    }

    const lastMsg = messages[messages.length - 1];
    db.prepare('INSERT INTO messages (conversation_id, user_id, role, content, tokens) VALUES (?, ?, ?, ?, ?)').run(convId, userId, 'user', lastMsg.content, 0);
    db.prepare('INSERT INTO messages (conversation_id, user_id, role, content, tokens) VALUES (?, ?, ?, ?, ?)').run(convId, userId, 'assistant', reply, tokens);

    res.json({ reply, tokens, conversation_id: convId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao conectar com a OpenAI' });
  }
});

// ─── ADMIN ────────────────────────────────────────────────────

app.get('/api/admin/stats', adminMiddleware, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const activeUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE active = 1').get().c;
  const totalMessages = db.prepare("SELECT COUNT(*) as c FROM messages WHERE role = 'user'").get().c;
  const totalTokens = db.prepare('SELECT SUM(tokens) as s FROM messages').get().s || 0;
  const totalConversations = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
  const todayMessages = db.prepare("SELECT COUNT(*) as c FROM messages WHERE role='user' AND date(created_at) = date('now')").get().c;
  const knowledgeFiles = db.prepare("SELECT COUNT(*) as c FROM knowledge_files WHERE status = 'ready'").get().c;
  const totalChunks = db.prepare('SELECT COUNT(*) as c FROM knowledge_chunks WHERE embedding IS NOT NULL').get().c;
  res.json({ totalUsers, activeUsers, totalMessages, totalTokens, totalConversations, todayMessages, knowledgeFiles, totalChunks });
});

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

app.patch('/api/admin/users/:id', adminMiddleware, (req, res) => {
  const { active } = req.body;
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM messages WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM conversations WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.patch('/api/admin/users/:id/password', adminMiddleware, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Nova senha obrigatória' });
  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ success: true });
});

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

// ─── ADMIN: KNOWLEDGE / RAG ───────────────────────────────────

// Listar arquivos de conhecimento
app.get('/api/admin/knowledge', adminMiddleware, (req, res) => {
  const files = db.prepare('SELECT id, original_name, file_size, chunk_count, status, created_at FROM knowledge_files ORDER BY created_at DESC').all();
  res.json(files);
});

// Upload de arquivo
app.post('/api/admin/knowledge/upload', adminMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  
  const fileId = db.prepare(
    'INSERT INTO knowledge_files (filename, original_name, file_path, file_size, status) VALUES (?, ?, ?, ?, ?)'
  ).run(req.file.filename, req.file.originalname, req.file.path, req.file.size, 'processing').lastInsertRowid;
  
  // Processa em background
  processFile(fileId).catch(e => console.error('Erro processamento background:', e.message));
  
  res.json({ 
    id: fileId, 
    original_name: req.file.originalname, 
    file_size: req.file.size,
    status: 'processing',
    message: 'Arquivo recebido! Gerando embeddings em background...'
  });
});

// Status de processamento de um arquivo
app.get('/api/admin/knowledge/:id/status', adminMiddleware, (req, res) => {
  const file = db.prepare('SELECT id, original_name, chunk_count, status FROM knowledge_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });
  res.json(file);
});

// Deletar arquivo de conhecimento
app.delete('/api/admin/knowledge/:id', adminMiddleware, (req, res) => {
  const file = db.prepare('SELECT * FROM knowledge_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });
  
  // Remove arquivo físico
  try { fs.unlinkSync(file.file_path); } catch {}
  
  // Remove chunks e embeddings
  db.prepare('DELETE FROM knowledge_chunks WHERE file_id = ?').run(req.params.id);
  db.prepare('DELETE FROM knowledge_files WHERE id = ?').run(req.params.id);
  
  res.json({ success: true });
});

// ─── INGESTÃO DOS ARQUIVOS EXISTENTES ─────────────────────────
// Endpoint especial para processar arquivos que já estão no servidor
app.post('/api/admin/knowledge/ingest-server-files', adminMiddleware, async (req, res) => {
  const { files } = req.body; // array de { path, name }
  if (!files || !Array.isArray(files)) return res.status(400).json({ error: 'Lista de arquivos inválida' });
  
  const results = [];
  for (const f of files) {
    if (!fs.existsSync(f.path)) {
      results.push({ name: f.name, error: 'Arquivo não encontrado' });
      continue;
    }
    
    // Verifica se já foi processado
    const existing = db.prepare('SELECT id FROM knowledge_files WHERE file_path = ?').get(f.path);
    if (existing) {
      results.push({ name: f.name, id: existing.id, status: 'já existe' });
      continue;
    }
    
    const stat = fs.statSync(f.path);
    const fileId = db.prepare(
      'INSERT INTO knowledge_files (filename, original_name, file_path, file_size, status) VALUES (?, ?, ?, ?, ?)'
    ).run(path.basename(f.path), f.name, f.path, stat.size, 'processing').lastInsertRowid;
    
    results.push({ name: f.name, id: fileId, status: 'queued' });
    
    // Processa em background com delay para não sobrecarregar
    setTimeout(() => {
      processFile(fileId).catch(e => console.error(`Erro ${f.name}:`, e.message));
    }, results.length * 2000);
  }
  
  res.json({ message: `${results.length} arquivos enfileirados para processamento`, results });
});

// Catch-all SPA
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => console.log(`✅ Capi Când-IA Pro rodando na porta ${PORT}`));
