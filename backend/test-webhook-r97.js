/**
 * Testes para o suporte à nova oferta R$97/mês + R$804/ano
 *
 * Testa a lógica de detecção de tier (standard vs pro) no webhook da Guru,
 * agora baseada em OFFER_ID (não mais product_id ou nome do produto).
 *
 * Executar: node backend/test-webhook-r97.js
 */

const assert = require('assert');

// ── Reproduz a lógica de detecção de tier do webhook Guru (v2 — offer_id) ──
// NOTA: product_id e nome do produto NÃO diferenciam tier
//       (oferta R$47 e R$97 estão no MESMO produto)
function detectTier({ offerId, transactionValue, proOfferIds }) {
  let tier = 'standard';
  let source = 'default';

  // 1) Detecção por offer_id (fonte principal)
  if (proOfferIds.length > 0 && proOfferIds.includes(offerId)) {
    tier = 'pro';
    source = 'offer_id';
  }
  // 2) Fallback por valor da transação (rede de segurança)
  //    Faixas: R$97 mensal pro = 9700, R$397 anual standard = 39700, R$804 anual pro = 80400
  else if (transactionValue >= 80400) { // R$804,00+ → pro anual
    tier = 'pro';
    source = 'value_fallback';
  } else if (transactionValue >= 9700 && transactionValue < 39700) { // R$97-R$396 → pro mensal
    tier = 'pro';
    source = 'value_fallback';
  }
  // 3) Demais → standard

  return { tier, source };
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

// ── Reproduz a lógica de label do plano (agora com valor real) ──
function getPlanoLabel(tier, isAnnual, transactionValue) {
  const valorReais = transactionValue > 0 ? (transactionValue / 100).toFixed(2).replace('.', ',') : null;
  if (tier === 'pro') {
    return isAnnual ? `PRO Anual — R$ ${valorReais || '804'}` : `PRO Mensal — R$ ${valorReais || '97'}`;
  }
  return isAnnual ? `Anual — R$ ${valorReais || '397'}` : `Mensal — R$ ${valorReais || '47'}`;
}

// ── Configuração de teste ──
const STANDARD_MONTHLY_CODE = '1773774908'; // Produto mensal (contém oferta R$47 E R$97)
const STANDARD_ANNUAL_CODE = '1773783918';  // Produto anual (contém oferta R$397 E R$804)

// Offer IDs simulados (na prod virão das env vars)
const PRO_OFFER_MONTHLY_97 = 'offer_monthly_97_test';
const PRO_OFFER_ANNUAL_804 = 'offer_annual_804_test';
const proOfferIds = [PRO_OFFER_MONTHLY_97, PRO_OFFER_ANNUAL_804];

const allProductCodes = [STANDARD_MONTHLY_CODE, STANDARD_ANNUAL_CODE];

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
console.log('\n📋 TESTE: Detecção de tier por OFFER_ID (cenários críticos)\n');

test('1. R$47 com product_id Pro mas offer_id DIFERENTE → standard (NÃO virar pro!)', () => {
  // CENÁRIO CRÍTICO: o produto se chama "Capi Când-IA Pro — Mensal" mas a oferta é R$47
  const { tier } = detectTier({
    offerId: 'offer_standard_47',
    transactionValue: 4700,
    proOfferIds
  });
  assert.strictEqual(tier, 'standard', 'Deveria ser standard! Oferta R$47 no mesmo produto Pro');
});

test('2. R$97 com offer_id match → pro', () => {
  const { tier, source } = detectTier({
    offerId: PRO_OFFER_MONTHLY_97,
    transactionValue: 9700,
    proOfferIds
  });
  assert.strictEqual(tier, 'pro');
  assert.strictEqual(source, 'offer_id');
});

test('3. R$397 com product_id Pro Anual mas offer_id DIFERENTE → standard', () => {
  // CENÁRIO CRÍTICO: produto "Capi Când-IA Pro — Anual" mas oferta é R$397
  const { tier } = detectTier({
    offerId: 'offer_standard_397',
    transactionValue: 39700,
    proOfferIds
  });
  assert.strictEqual(tier, 'standard', 'Deveria ser standard! Oferta R$397 no mesmo produto Pro Anual');
});

test('4. R$804 com offer_id match → pro', () => {
  const { tier, source } = detectTier({
    offerId: PRO_OFFER_ANNUAL_804,
    transactionValue: 80400,
    proOfferIds
  });
  assert.strictEqual(tier, 'pro');
  assert.strictEqual(source, 'offer_id');
});

test('5. Fallback por valor: sem offer_id mas valor = 9700 centavos → pro + warning', () => {
  const { tier, source } = detectTier({
    offerId: '',
    transactionValue: 9700,
    proOfferIds
  });
  assert.strictEqual(tier, 'pro');
  assert.strictEqual(source, 'value_fallback');
});

test('6. Fallback por valor: sem offer_id valor = 4700 → standard', () => {
  const { tier, source } = detectTier({
    offerId: '',
    transactionValue: 4700,
    proOfferIds
  });
  assert.strictEqual(tier, 'standard');
  assert.strictEqual(source, 'default');
});

// ════════════════════════════════════════════
console.log('\n📋 TESTE: Detecção de tier — casos adicionais\n');

test('Offer_id pro sem valor → pro (offer_id tem prioridade)', () => {
  const { tier, source } = detectTier({
    offerId: PRO_OFFER_MONTHLY_97,
    transactionValue: 0,
    proOfferIds
  });
  assert.strictEqual(tier, 'pro');
  assert.strictEqual(source, 'offer_id');
});

test('Fallback por valor R$804 sem offer_id → pro', () => {
  const { tier, source } = detectTier({
    offerId: '',
    transactionValue: 80400,
    proOfferIds
  });
  assert.strictEqual(tier, 'pro');
  assert.strictEqual(source, 'value_fallback');
});

test('Sem offer_id e sem valor → standard', () => {
  const { tier } = detectTier({
    offerId: '',
    transactionValue: 0,
    proOfferIds
  });
  assert.strictEqual(tier, 'standard');
});

test('Offer_id desconhecido com valor baixo → standard', () => {
  const { tier } = detectTier({
    offerId: 'offer_qualquer_xyz',
    transactionValue: 2900,
    proOfferIds
  });
  assert.strictEqual(tier, 'standard');
});

test('Sem env vars de offer (lista vazia) + valor R$97 → pro via fallback', () => {
  const { tier, source } = detectTier({
    offerId: PRO_OFFER_MONTHLY_97,
    transactionValue: 9700,
    proOfferIds: [] // simula env vars não configuradas
  });
  assert.strictEqual(tier, 'pro');
  assert.strictEqual(source, 'value_fallback');
});

// ════════════════════════════════════════════
console.log('\n📋 TESTE: Filtro de produto (é IA ou não)\n');

test('Produto mensal standard é IA', () => {
  assert.strictEqual(isIAProduct({ productCode: STANDARD_MONTHLY_CODE, productName: '', allProductCodes }), true);
});

test('Produto anual standard é IA', () => {
  assert.strictEqual(isIAProduct({ productCode: STANDARD_ANNUAL_CODE, productName: '', allProductCodes }), true);
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
console.log('\n📋 TESTE: Labels de notificação (com valor real)\n');

test('Standard mensal sem valor = "Mensal — R$ 47"', () => {
  assert.strictEqual(getPlanoLabel('standard', false, 0), 'Mensal — R$ 47');
});

test('Standard anual sem valor = "Anual — R$ 397"', () => {
  assert.strictEqual(getPlanoLabel('standard', true, 0), 'Anual — R$ 397');
});

test('Pro mensal sem valor = "PRO Mensal — R$ 97"', () => {
  assert.strictEqual(getPlanoLabel('pro', false, 0), 'PRO Mensal — R$ 97');
});

test('Pro anual sem valor = "PRO Anual — R$ 804"', () => {
  assert.strictEqual(getPlanoLabel('pro', true, 0), 'PRO Anual — R$ 804');
});

test('Pro mensal com valor real 9700 = "PRO Mensal — R$ 97,00"', () => {
  assert.strictEqual(getPlanoLabel('pro', false, 9700), 'PRO Mensal — R$ 97,00');
});

test('Standard mensal com valor real 4700 = "Mensal — R$ 47,00"', () => {
  assert.strictEqual(getPlanoLabel('standard', false, 4700), 'Mensal — R$ 47,00');
});

// ════════════════════════════════════════════
console.log('\n📋 TESTE: Cenários de webhook completos (simulação)\n');

function simulateWebhook(body) {
  const productCode = String(body?.product?.code || body?.product?.id || '');
  const productName = (body?.product?.name || body?.product?.offer?.name || '').toLowerCase();

  const iaProduct = isIAProduct({ productCode, productName, allProductCodes });
  if (!iaProduct) return { skipped: true };

  const offerId = String(body?.product?.offer?.id || body?.offer_id || '');
  const transactionValue = parseInt(body?.last_transaction?.value || 0);
  const { tier, source } = detectTier({ offerId, transactionValue, proOfferIds });

  const offerName = (body?.product?.offer?.name || '').toLowerCase();
  const intervalType = (body?.product?.offer?.plan?.interval_type || '').toLowerCase();
  const interval = parseInt(body?.product?.offer?.plan?.interval || 1);
  const chargedEveryDays = parseInt(body?.charged_every_days || 0);
  const isAnnual = detectIsAnnual({ offerName, intervalType, interval, chargedEveryDays });

  const planoLabel = getPlanoLabel(tier, isAnnual, transactionValue);

  return { tier, source, isAnnual, planoLabel, skipped: false };
}

test('Webhook: R$47 no produto "Pro Mensal" → standard (offer_id não bate)', () => {
  const result = simulateWebhook({
    last_status: 'active',
    subscriber: { email: 'user47@teste.com', name: 'User47' },
    product: {
      code: STANDARD_MONTHLY_CODE,
      name: 'Capi Când-IA Pro — Mensal',
      offer: { id: 'offer_standard_47', name: 'Mensal' }
    },
    last_transaction: { value: 4700 },
    charged_every_days: 30
  });
  assert.strictEqual(result.skipped, false);
  assert.strictEqual(result.tier, 'standard');
  assert.strictEqual(result.isAnnual, false);
});

test('Webhook: R$97 no produto "Pro Mensal" → pro (offer_id bate)', () => {
  const result = simulateWebhook({
    last_status: 'active',
    subscriber: { email: 'user97@teste.com', name: 'User97' },
    product: {
      code: STANDARD_MONTHLY_CODE,
      name: 'Capi Când-IA Pro — Mensal',
      offer: { id: PRO_OFFER_MONTHLY_97, name: 'Mensal Pro R$97' }
    },
    last_transaction: { value: 9700 },
    charged_every_days: 30
  });
  assert.strictEqual(result.skipped, false);
  assert.strictEqual(result.tier, 'pro');
  assert.strictEqual(result.source, 'offer_id');
  assert.strictEqual(result.isAnnual, false);
  assert.strictEqual(result.planoLabel, 'PRO Mensal — R$ 97,00');
});

test('Webhook: R$397 no produto "Pro Anual" → standard (offer_id não bate)', () => {
  const result = simulateWebhook({
    last_status: 'active',
    subscriber: { email: 'user397@teste.com', name: 'User397' },
    product: {
      code: STANDARD_ANNUAL_CODE,
      name: 'Capi Când-IA Pro — Anual',
      offer: { id: 'offer_standard_397', name: 'Anual', plan: { interval_type: 'year', interval: 1 } }
    },
    last_transaction: { value: 39700 },
    charged_every_days: 365
  });
  assert.strictEqual(result.skipped, false);
  assert.strictEqual(result.tier, 'standard');
  assert.strictEqual(result.isAnnual, true);
});

test('Webhook: R$804 no produto "Pro Anual" → pro (offer_id bate)', () => {
  const result = simulateWebhook({
    last_status: 'active',
    subscriber: { email: 'user804@teste.com', name: 'User804' },
    product: {
      code: STANDARD_ANNUAL_CODE,
      name: 'Capi Când-IA Pro — Anual',
      offer: { id: PRO_OFFER_ANNUAL_804, name: 'Anual Pro R$804', plan: { interval_type: 'year', interval: 1 } }
    },
    last_transaction: { value: 80400 },
    charged_every_days: 365
  });
  assert.strictEqual(result.skipped, false);
  assert.strictEqual(result.tier, 'pro');
  assert.strictEqual(result.source, 'offer_id');
  assert.strictEqual(result.isAnnual, true);
  assert.strictEqual(result.planoLabel, 'PRO Anual — R$ 804,00');
});

test('Webhook: produto não-IA é ignorado', () => {
  const result = simulateWebhook({
    last_status: 'active',
    subscriber: { email: 'outro@teste.com' },
    product: { code: '9999999999', name: 'Curso de Fotografia' }
  });
  assert.strictEqual(result.skipped, true);
});

test('Webhook: fallback por valor sem offer_id configurado → pro + value_fallback', () => {
  const result = simulateWebhook({
    last_status: 'active',
    subscriber: { email: 'fallback@teste.com', name: 'Fallback' },
    product: {
      code: STANDARD_MONTHLY_CODE,
      name: 'Capi Când-IA Pro — Mensal',
      offer: { name: 'Mensal' } // sem offer.id!
    },
    last_transaction: { value: 9700 },
    charged_every_days: 30
  });
  assert.strictEqual(result.skipped, false);
  assert.strictEqual(result.tier, 'pro');
  assert.strictEqual(result.source, 'value_fallback');
});

// ════════════════════════════════════════════
console.log('\n' + '═'.repeat(50));
console.log(`\n  Total: ${passed + failed} | ✅ Passou: ${passed} | ❌ Falhou: ${failed}\n`);

if (failed > 0) {
  process.exit(1);
}
console.log('  Todos os testes passaram!\n');
