/**
 * Testes para o suporte à nova oferta R$97/mês + R$804/ano
 *
 * Testa a lógica de detecção de tier (standard vs pro) no webhook da Guru,
 * sem precisar subir o servidor completo.
 *
 * Executar: node backend/test-webhook-r97.js
 */

const assert = require('assert');

// ── Reproduz a lógica de detecção de tier do webhook Guru ──
function detectTier({ productCode, productName, proProductCodes }) {
  const name = (productName || '').toLowerCase();
  const isProTier = proProductCodes.includes(productCode) ||
                    name.includes('pro') ||
                    name.includes('r$ 97') || name.includes('r$97') ||
                    name.includes('r$ 804') || name.includes('r$804');
  return isProTier ? 'pro' : 'standard';
}

// ── Reproduz a lógica de filtragem de produto ──
function isIAProduct({ productCode, productName, allProductCodes }) {
  const name = (productName || '').toLowerCase();
  return allProductCodes.includes(productCode) ||
         name.includes('capi când') ||
         name.includes('capi cand') ||
         name.includes('capi-ia') ||
         name.includes('capi ia') ||
         name.includes('capi candia pro');
}

// ── Reproduz a lógica de detecção anual ──
function detectIsAnnual({ offerName, intervalType, interval, chargedEveryDays }) {
  const name = (offerName || '').toLowerCase();
  const iType = (intervalType || '').toLowerCase();
  const iVal = parseInt(interval || 1);
  const days = parseInt(chargedEveryDays || 0);
  return name.includes('anual') || name.includes('annual') ||
         iType === 'year' || iType === 'years' ||
         (iType === 'month' && iVal >= 12) ||
         days >= 360;
}

// ── Reproduz a lógica de label do plano ──
function getPlanoLabel(tier, isAnnual) {
  if (tier === 'pro') {
    return isAnnual ? 'PRO Anual — R$ 804' : 'PRO Mensal — R$ 97';
  }
  return isAnnual ? 'Anual — R$ 397' : 'Mensal — R$ 47';
}

// ── Configuração de teste ──
const STANDARD_MONTHLY_CODE = '1773774908';
const STANDARD_ANNUAL_CODE = '1773783918';
const PRO_MONTHLY_CODE = '9999990097';
const PRO_ANNUAL_CODE = '9999990804';

const proProductCodes = [PRO_MONTHLY_CODE, PRO_ANNUAL_CODE];
const allProductCodes = [STANDARD_MONTHLY_CODE, STANDARD_ANNUAL_CODE, ...proProductCodes];

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

// ════════════════════════════════════════════
console.log('\n📋 TESTE: Detecção de tier (standard vs pro)\n');

test('Produto standard mensal por código', () => {
  const tier = detectTier({ productCode: STANDARD_MONTHLY_CODE, productName: 'Capi Când-IA Mensal', proProductCodes });
  assert.strictEqual(tier, 'standard');
});

test('Produto standard anual por código', () => {
  const tier = detectTier({ productCode: STANDARD_ANNUAL_CODE, productName: 'Capi Când-IA Anual', proProductCodes });
  assert.strictEqual(tier, 'standard');
});

test('Produto PRO mensal por código', () => {
  const tier = detectTier({ productCode: PRO_MONTHLY_CODE, productName: 'Capi Când-IA Pro Mensal', proProductCodes });
  assert.strictEqual(tier, 'pro');
});

test('Produto PRO anual por código', () => {
  const tier = detectTier({ productCode: PRO_ANNUAL_CODE, productName: 'Capi Când-IA Pro Anual', proProductCodes });
  assert.strictEqual(tier, 'pro');
});

test('Produto PRO detectado pelo nome (contém "pro")', () => {
  const tier = detectTier({ productCode: 'desconhecido', productName: 'Capi Cand-IA Pro - Mensal', proProductCodes });
  assert.strictEqual(tier, 'pro');
});

test('Produto PRO detectado pelo nome (contém "R$ 97")', () => {
  const tier = detectTier({ productCode: 'desconhecido', productName: 'Plano R$ 97 mensal', proProductCodes });
  assert.strictEqual(tier, 'pro');
});

test('Produto PRO detectado pelo nome (contém "R$804")', () => {
  const tier = detectTier({ productCode: 'desconhecido', productName: 'Plano R$804 anual', proProductCodes });
  assert.strictEqual(tier, 'pro');
});

test('Produto sem nome e código desconhecido = standard', () => {
  const tier = detectTier({ productCode: 'xyz', productName: '', proProductCodes });
  assert.strictEqual(tier, 'standard');
});

// ════════════════════════════════════════════
console.log('\n📋 TESTE: Filtro de produto (é IA ou não)\n');

test('Produto standard mensal é IA', () => {
  assert.strictEqual(isIAProduct({ productCode: STANDARD_MONTHLY_CODE, productName: '', allProductCodes }), true);
});

test('Produto PRO mensal é IA', () => {
  assert.strictEqual(isIAProduct({ productCode: PRO_MONTHLY_CODE, productName: '', allProductCodes }), true);
});

test('Produto PRO anual é IA', () => {
  assert.strictEqual(isIAProduct({ productCode: PRO_ANNUAL_CODE, productName: '', allProductCodes }), true);
});

test('Produto com nome "Capi Când-IA" é IA', () => {
  assert.strictEqual(isIAProduct({ productCode: 'xxx', productName: 'Capi Când-IA Pro Mensal', allProductCodes }), true);
});

test('Produto com nome "capi candia pro" é IA', () => {
  assert.strictEqual(isIAProduct({ productCode: 'xxx', productName: 'capi candia pro mensal', allProductCodes }), true);
});

test('Produto aleatório NÃO é IA', () => {
  assert.strictEqual(isIAProduct({ productCode: 'xyz', productName: 'Outro produto qualquer', allProductCodes }), false);
});

// ════════════════════════════════════════════
console.log('\n📋 TESTE: Detecção mensal vs anual\n');

test('Oferta com nome "anual" é anual', () => {
  assert.strictEqual(detectIsAnnual({ offerName: 'Plano Anual Pro', intervalType: '', interval: 1, chargedEveryDays: 0 }), true);
});

test('Oferta com intervalType "year" é anual', () => {
  assert.strictEqual(detectIsAnnual({ offerName: '', intervalType: 'year', interval: 1, chargedEveryDays: 0 }), true);
});

test('Oferta com 12 meses é anual', () => {
  assert.strictEqual(detectIsAnnual({ offerName: '', intervalType: 'month', interval: 12, chargedEveryDays: 0 }), true);
});

test('Oferta com 365 dias é anual', () => {
  assert.strictEqual(detectIsAnnual({ offerName: '', intervalType: '', interval: 1, chargedEveryDays: 365 }), true);
});

test('Oferta com 30 dias é mensal', () => {
  assert.strictEqual(detectIsAnnual({ offerName: '', intervalType: '', interval: 1, chargedEveryDays: 30 }), false);
});

test('Oferta com nome "mensal" é mensal', () => {
  assert.strictEqual(detectIsAnnual({ offerName: 'Mensal Pro', intervalType: '', interval: 1, chargedEveryDays: 0 }), false);
});

// ════════════════════════════════════════════
console.log('\n📋 TESTE: Labels de notificação\n');

test('Standard mensal = "Mensal — R$ 47"', () => {
  assert.strictEqual(getPlanoLabel('standard', false), 'Mensal — R$ 47');
});

test('Standard anual = "Anual — R$ 397"', () => {
  assert.strictEqual(getPlanoLabel('standard', true), 'Anual — R$ 397');
});

test('Pro mensal = "PRO Mensal — R$ 97"', () => {
  assert.strictEqual(getPlanoLabel('pro', false), 'PRO Mensal — R$ 97');
});

test('Pro anual = "PRO Anual — R$ 804"', () => {
  assert.strictEqual(getPlanoLabel('pro', true), 'PRO Anual — R$ 804');
});

// ════════════════════════════════════════════
console.log('\n📋 TESTE: Cenários de webhook completos (simulação)\n');

function simulateWebhook(body) {
  const productCode = String(body?.product?.code || body?.product?.id || '');
  const productName = (body?.product?.name || body?.product?.offer?.name || '').toLowerCase();

  const iaProduct = isIAProduct({ productCode, productName, allProductCodes });
  if (!iaProduct) return { skipped: true };

  const tier = detectTier({ productCode, productName, proProductCodes });

  const offerName = (body?.product?.offer?.name || '').toLowerCase();
  const intervalType = (body?.product?.offer?.plan?.interval_type || '').toLowerCase();
  const interval = parseInt(body?.product?.offer?.plan?.interval || 1);
  const chargedEveryDays = parseInt(body?.charged_every_days || 0);
  const isAnnual = detectIsAnnual({ offerName, intervalType, interval, chargedEveryDays });

  const planoLabel = getPlanoLabel(tier, isAnnual);

  return { tier, isAnnual, planoLabel, skipped: false };
}

test('Webhook: compra PRO mensal via código de produto', () => {
  const result = simulateWebhook({
    last_status: 'active',
    subscriber: { email: 'teste@teste.com', name: 'Teste' },
    product: { code: PRO_MONTHLY_CODE, name: 'Capi Cand-IA Pro - Mensal', offer: { name: 'Mensal Pro' } },
    charged_every_days: 30
  });
  assert.strictEqual(result.skipped, false);
  assert.strictEqual(result.tier, 'pro');
  assert.strictEqual(result.isAnnual, false);
  assert.strictEqual(result.planoLabel, 'PRO Mensal — R$ 97');
});

test('Webhook: compra PRO anual via código de produto', () => {
  const result = simulateWebhook({
    last_status: 'active',
    subscriber: { email: 'teste@teste.com', name: 'Teste' },
    product: { code: PRO_ANNUAL_CODE, name: 'Capi Cand-IA Pro - Anual', offer: { name: 'Anual Pro', plan: { interval_type: 'year', interval: 1 } } },
    charged_every_days: 365
  });
  assert.strictEqual(result.skipped, false);
  assert.strictEqual(result.tier, 'pro');
  assert.strictEqual(result.isAnnual, true);
  assert.strictEqual(result.planoLabel, 'PRO Anual — R$ 804');
});

test('Webhook: compra STANDARD mensal (legado) continua funcionando', () => {
  const result = simulateWebhook({
    last_status: 'paid',
    subscriber: { email: 'legado@teste.com', name: 'Legado' },
    product: { code: STANDARD_MONTHLY_CODE, name: 'Capi Când-IA Mensal', offer: { name: 'Mensal' } },
    charged_every_days: 30
  });
  assert.strictEqual(result.skipped, false);
  assert.strictEqual(result.tier, 'standard');
  assert.strictEqual(result.isAnnual, false);
  assert.strictEqual(result.planoLabel, 'Mensal — R$ 47');
});

test('Webhook: compra STANDARD anual (legado) continua funcionando', () => {
  const result = simulateWebhook({
    last_status: 'active',
    subscriber: { email: 'legado@teste.com', name: 'Legado' },
    product: { code: STANDARD_ANNUAL_CODE, name: 'Capi Când-IA Anual', offer: { name: 'Anual', plan: { interval_type: 'year' } } },
    charged_every_days: 365
  });
  assert.strictEqual(result.skipped, false);
  assert.strictEqual(result.tier, 'standard');
  assert.strictEqual(result.isAnnual, true);
  assert.strictEqual(result.planoLabel, 'Anual — R$ 397');
});

test('Webhook: produto não-IA é ignorado', () => {
  const result = simulateWebhook({
    last_status: 'active',
    subscriber: { email: 'outro@teste.com' },
    product: { code: '9999999999', name: 'Curso de Fotografia' }
  });
  assert.strictEqual(result.skipped, true);
});

test('Webhook: PRO detectado pelo nome mesmo sem código configurado', () => {
  const result = simulateWebhook({
    last_status: 'active',
    subscriber: { email: 'teste@teste.com', name: 'Teste' },
    product: { code: 'codigo_novo_desconhecido', name: 'Capi Cand-IA Pro - Mensal', offer: { name: 'Mensal Pro' } },
    charged_every_days: 30
  });
  // Detecta como IA pelo nome "capi cand"
  assert.strictEqual(result.skipped, false);
  // Detecta como PRO pelo nome "pro"
  assert.strictEqual(result.tier, 'pro');
});

// ════════════════════════════════════════════
console.log('\n' + '═'.repeat(50));
console.log(`\n  Total: ${passed + failed} | ✅ Passou: ${passed} | ❌ Falhou: ${failed}\n`);

if (failed > 0) {
  process.exit(1);
}
console.log('  Todos os testes passaram!\n');
