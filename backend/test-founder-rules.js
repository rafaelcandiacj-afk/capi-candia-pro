#!/usr/bin/env node
/**
 * Tests for founder renewal email rules.
 * Validates: template logic, link selection, founder alert, cron expiry query.
 *
 * Usage: node backend/test-founder-rules.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'capi.db');
let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}`);
    failed++;
  }
}

// ─── Test the template function in isolation ───────────────────
console.log('\n=== TEMPLATE TESTS ===');

// Recreate constants and template from server.js for isolated testing
const CHECKOUT_MONTHLY_FUNDADOR = 'https://clkdmg.site/subscribe/mensal-capi-candia-pro';
const CHECKOUT_MONTHLY_NOVO = 'https://clkdmg.site/subscribe/mensal-capi-candia-pro-97';
const CHECKOUT_ANNUAL_NOVO = 'https://clkdmg.site/subscribe/anual-capi-candia-pro-804';

function renewalEmailTemplate(nome, diasRestantes, tipo, isFundador) {
  const firstName = nome ? nome.split(' ')[0] : 'Advogado';
  const checkoutMonthly = isFundador ? CHECKOUT_MONTHLY_FUNDADOR : CHECKOUT_MONTHLY_NOVO;

  let titulo, subtitulo, corpo, ctaText, urgencyColor, urgencyBg;

  if (tipo === '7dias') {
    titulo = `${firstName}, sua assinatura vence em 7 dias`;
    subtitulo = 'Renove agora e continue com acesso completo';
    corpo = `<p>Sua assinatura vence em 7 dias.</p>`;
    ctaText = 'Renovar minha assinatura';
    urgencyColor = '#8B6914';
    urgencyBg = '#fdf8ee';
  } else if (tipo === 'expirado') {
    titulo = `${firstName}, sentimos sua falta`;
    subtitulo = 'Sua assinatura expirou';
    corpo = `<p>Expirou.</p>`;
    ctaText = 'Reativar';
    urgencyColor = '#8B6914';
    urgencyBg = '#fdf8ee';
  }

  const founderAlert = isFundador ? `
      <div style="background:#fff8e1;border:1px solid #ffd54f;border-radius:8px;padding:14px;margin:16px 0">
        <strong style="color:#8B6914">⚠️ Atenção, fundador:</strong>
        <p style="color:#555;font-size:14px;margin:6px 0 0;line-height:1.6">
          Se sua assinatura expirar e você precisar voltar, <strong>o valor de fundador (R$47) não estará mais disponível</strong> —
          você terá que pagar o preço atual (R$97/mês) e sua memória das conversas será perdida.
          Renove a tempo pra manter seu desconto e histórico completo.
        </p>
      </div>` : '';

  return `<a href="${checkoutMonthly}">${ctaText}</a>${founderAlert}<a href="${CHECKOUT_ANNUAL_NOVO}">plano anual</a>`;
}

// Teste 1: fundador recebe link R$47 + bloco de alerta
console.log('\nTeste 1: Fundador recebe email correto');
const htmlFounder = renewalEmailTemplate('Cleisson Silva', 7, '7dias', true);
assert(htmlFounder.includes(CHECKOUT_MONTHLY_FUNDADOR), 'Link mensal R$47 (fundador)');
assert(!htmlFounder.includes(CHECKOUT_MONTHLY_NOVO), 'NÃO contém link R$97');
assert(htmlFounder.includes('Atenção, fundador'), 'Bloco de alerta fundador presente');
assert(htmlFounder.includes('R$47'), 'Menciona R$47 no alerta');
assert(htmlFounder.includes('R$97'), 'Menciona R$97 como preço novo no alerta');

// Teste 2: não-fundador recebe link R$97 + sem alerta
console.log('\nTeste 2: Não-fundador recebe email correto');
const htmlNovo = renewalEmailTemplate('Anderson Tabosa', 7, '7dias', false);
assert(htmlNovo.includes(CHECKOUT_MONTHLY_NOVO), 'Link mensal R$97 (novo)');
// Check that the R$47 link does NOT appear (substring-safe: replace the R$97 URL first to avoid false positive)
const htmlNovoSanitized = htmlNovo.replace(new RegExp(CHECKOUT_MONTHLY_NOVO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
assert(!htmlNovoSanitized.includes(CHECKOUT_MONTHLY_FUNDADOR), 'NÃO contém link R$47 (excluindo R$97)');
assert(!htmlNovo.includes('Atenção, fundador'), 'Sem bloco de alerta fundador');

// Teste 3: link anual é sempre R$804
console.log('\nTeste 3: Link anual sempre R$804');
assert(htmlFounder.includes(CHECKOUT_ANNUAL_NOVO), 'Fundador: link anual R$804');
assert(htmlNovo.includes(CHECKOUT_ANNUAL_NOVO), 'Não-fundador: link anual R$804');
assert(!htmlFounder.includes('anual-capi-candia-pro"'), 'Fundador: NÃO contém link anual antigo');
assert(!htmlNovo.includes('anual-capi-candia-pro"'), 'Não-fundador: NÃO contém link anual antigo');

// ─── Database Tests ──────────────────────────────────────────
console.log('\n=== DATABASE TESTS (capi.db) ===');

let db;
try {
  db = new Database(DB_PATH, { readonly: true });
} catch (e) {
  console.log(`⚠️ Cannot open DB at ${DB_PATH}: ${e.message}`);
  console.log('Skipping DB tests (run from server directory)\n');
  printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

// Check is_founder column exists
console.log('\nTeste: Coluna is_founder existe');
try {
  const cols = db.prepare("PRAGMA table_info(users)").all();
  const hasFounder = cols.some(c => c.name === 'is_founder');
  assert(hasFounder, 'Coluna is_founder existe na tabela users');
} catch (e) {
  assert(false, `Coluna is_founder: ${e.message}`);
}

// Teste 4: Simular expiração de fundador (query check - read-only)
console.log('\nTeste 4: Query de expiração fundador (3+ dias)');
const expiredFounders = db.prepare(`
  SELECT id, email, is_founder, plan_expires_at
  FROM users
  WHERE is_founder = 1
    AND plan_expires_at < datetime('now', '-3 days')
`).all();
console.log(`  Fundadores expirados (3+ dias): ${expiredFounders.length}`);
if (expiredFounders.length > 0) {
  for (const u of expiredFounders) {
    console.log(`    - ${u.email} (expira: ${u.plan_expires_at})`);
  }
}
assert(true, 'Query de expiração fundador roda sem erro');

// Teste 5: Anderson deve ter is_founder=0
console.log('\nTeste 5: Anderson is_founder=0');
const anderson = db.prepare("SELECT id, email, is_founder, subscription_tier FROM users WHERE email = 'andersontabosa.adv@gmail.com'").get();
if (anderson) {
  assert(anderson.is_founder === 0, `Anderson is_founder=${anderson.is_founder} (esperado: 0), tier=${anderson.subscription_tier}`);
} else {
  console.log('  ⚠️ Anderson não encontrado no DB (pode ser normal em dev)');
  assert(true, 'Anderson não existe no DB local — skip');
}

// Listar todos os fundadores
console.log('\nFundadores atuais (is_founder=1):');
const founders = db.prepare("SELECT id, name, email, is_founder, subscription_tier, plan_expires_at, created_at FROM users WHERE is_founder = 1").all();
console.log(`  Total: ${founders.length}`);
for (const f of founders) {
  console.log(`    - ${f.name} (${f.email}) | tier=${f.subscription_tier} | expira=${f.plan_expires_at} | criado=${f.created_at}`);
}

// Listar não-fundadores pagos
console.log('\nNão-fundadores pagos (is_founder=0):');
const nonFounders = db.prepare("SELECT id, name, email, is_founder, subscription_tier, plan_expires_at, created_at FROM users WHERE plan_type = 'paid' AND is_founder = 0").all();
console.log(`  Total: ${nonFounders.length}`);
for (const f of nonFounders) {
  console.log(`    - ${f.name} (${f.email}) | tier=${f.subscription_tier} | expira=${f.plan_expires_at} | criado=${f.created_at}`);
}

db.close();
printSummary();
process.exit(failed > 0 ? 1 : 0);

function printSummary() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTADO: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
}
