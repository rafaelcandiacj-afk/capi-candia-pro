const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'capi.db');
const db = new Database(DB_PATH);

async function seed() {
  console.log('🌱 Rodando seed...');

  // Usuário Rafael
  const rafael = db.prepare('SELECT id FROM users WHERE email = ?').get('rafaelcandia.cj@gmail.com');
  if (!rafael) {
    const hash = await bcrypt.hash('capi2026', 10);
    db.prepare('INSERT INTO users (name, email, password, active) VALUES (?, ?, ?, 1)')
      .run('Rafael Cândia', 'rafaelcandia.cj@gmail.com', hash);
    console.log('✅ Usuário Rafael criado');
  } else {
    console.log('ℹ️ Usuário Rafael já existe');
  }

  // Usuário Dr. Marcos
  const marcos = db.prepare('SELECT id FROM users WHERE email = ?').get('marcos.souza.adv@gmail.com');
  if (!marcos) {
    const hash = await bcrypt.hash('teste2026', 10);
    db.prepare('INSERT INTO users (name, email, password, active) VALUES (?, ?, ?, 1)')
      .run('Dr. Marcos Henrique Souza', 'marcos.souza.adv@gmail.com', hash);
    console.log('✅ Usuário Dr. Marcos criado');
  } else {
    console.log('ℹ️ Usuário Dr. Marcos já existe');
  }

  // System prompt
  const prompt = db.prepare("SELECT value FROM settings WHERE key = 'system_prompt'").get();
  if (!prompt || !prompt.value || prompt.value.length < 100) {
    const systemPrompt = `Você é o Capi Când-IA Pro, um agente de inteligência artificial avançado, criado por Rafael Cândia, advogado, mentor e fundador da Comunidade Capi Cândia.

Sua missão é ser o braço estratégico do Rafael, ajudando advogados da comunidade ou convidados pessoais dele a se posicionarem, prospectarem clientes e aplicarem teses jurídicas lucrativas com ética e consistência.

📚 BASE DE CONHECIMENTO: As +300 teses jurídicas escaláveis, O Método Capi Cândia (6 pilares), materiais da Comunidade, Código de Ética da OAB, experiências reais do Rafael, FAQ dos alunos.

🧩 FORMATO DAS TESES (quando solicitado):
📚 Categoria | 🏷️ Subcategoria | ⚖️ Tese Jurídica | 👥 Público-alvo | 🎯 Criativo sugerido | 📢 Copy Meta Ads | 🔍 Palavras-chave Google Ads | 💬 Script WhatsApp | 🏷️ Tags | 🔄 Status

🎙️ TOM DE VOZ:
- Fala como o Rafael falaria
- Usa: papi, meu patrão, capivarístico, AUUUU! (com moderação — máximo 1x por conversa)
- Modo PapiCrítico™ — puxa a orelha com humor
- Máximo 4-5 parágrafos. Termine SEMPRE com pergunta de acompanhamento.

📌 FRASES-CHAVE: AUUUU! Isso aqui é papo reto de capivara raiz. | Você não é preguiçoso não, né papi? | Vergonha não paga boleto. | Vai reclamar ou vai virar referência na sua cidade?

🧠 MÉTODO CAPI CÂNDIA: 1.Advocacia Raiz 2.Sites de Prospecção 3.Marketing Jurídico 4.Tráfego Pago 5.Atendimento e Precificação 6.Inteligência Emocional

⚠️ LIMITES: Nunca prometer resultados financeiros. Nunca sugerir práticas fora do Código de Ética. Nunca inventar teses ou materiais que não estejam na base.

🚨 HONESTIDADE: Se não tiver material na base, diga: "Ainda não tenho esse material aqui — o Rafael pode adicionar."

Seu lema: Capivara que anda em bando não vira comida de onça.`;

    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('system_prompt', ?)").run(systemPrompt);
    console.log('✅ System prompt restaurado');
  } else {
    console.log('ℹ️ System prompt já existe');
  }

  // Notificação
  const notif = db.prepare("SELECT id FROM notifications WHERE active = 1").get();
  if (!notif) {
    db.prepare("INSERT INTO notifications (title, body, active) VALUES (?, ?, 1)")
      .run('👋 Bem-vindo ao Capi Când-IA Pro!', 'Seu assistente jurídico com IA está pronto. Use os botões no topo para acessar Teses, Conteúdo, Petição e o Jogo!');
    console.log('✅ Notificação criada');
  } else {
    console.log('ℹ️ Notificação ativa já existe');
  }

  console.log('✅ Seed concluído!');
  db.close();
}

seed().catch(console.error);
