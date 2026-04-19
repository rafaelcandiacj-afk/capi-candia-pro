/**
 * Unit tests: Fix DEFINITIVO do upgrade mensal→anual
 *
 * Testa:
 * 1. findActiveMonthlySubscription detecta mensal R$47 (marketplace_id)
 * 2. findActiveMonthlySubscription detecta mensal R$97 (nome contém "mensal")
 * 3. Paginação funciona (simula 3 páginas de subs)
 * 4. cancelMonthlyWithRetry pega após primeira falha
 * 5. reconcileDuplicateSubscriptions encontra duplicidade e cancela
 * 6. Filtragem client-side rejeita emails diferentes
 * 7. Filtragem client-side rejeita subs não-ativas
 *
 * Run: node backend/test-upgrade-fix.js
 */

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

// ── Testable replica of findActiveMonthlySubscription (injectable fetch) ──
async function findActiveMonthlySubscription(email, { fetchFn }) {
  const lowerEmail = (email || '').toLowerCase().trim();
  if (!lowerEmail) return null;

  let cursor = null;
  const allSubs = [];
  for (let page = 0; page < 50; page++) {
    const url = new URL('https://digitalmanager.guru/api/v2/subscriptions');
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const r = await fetchFn(url.toString(), {
      headers: { Authorization: 'Bearer test-token', Accept: 'application/json' },
    });
    if (!r.ok) break;
    const d = await r.json();
    const data = d.data || [];
    if (!Array.isArray(data) || !data.length) break;
    allSubs.push(...data);
    cursor = d.next_cursor;
    if (!cursor) break;
  }

  const monthly = allSubs.find(s => {
    const contactEmail = (s.contact?.email || s.subscriber?.email || '').toLowerCase().trim();
    if (contactEmail !== lowerEmail) return false;
    if (s.last_status !== 'active') return false;
    if (!s.charged_every_days || parseInt(s.charged_every_days) > 60) return false;
    const pname = (s.product?.name || '').toLowerCase();
    const mid = String(s.product?.marketplace_id || s.product?.code || '');
    return pname.includes('mensal') || mid === '1773774908';
  });

  return monthly || null;
}

// ── Testable replica of cancelMonthlyWithRetry (injectable deps) ──
async function cancelMonthlyWithRetry(email, userId, { findFn, cancelFn, dbRun }) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const monthly = await findFn(email);
      if (monthly) {
        const result = await cancelFn(monthly.id);
        if (result.ok) {
          return { cancelled: true, sub: monthly };
        }
      }
    } catch (e) {
      // continue to next attempt
    }
    if (attempt < 3) {
      // In tests we don't actually wait
      await new Promise(r => setTimeout(r, 10));
    }
  }
  try { dbRun(userId); } catch (e) {}
  return { cancelled: false };
}

// ── Testable replica of reconcileDuplicateSubscriptions ──
async function reconcileDuplicateSubscriptions({ dbAll, findFn, cancelFn, refundFn, dbRun }) {
  const stats = { users_checked: 0, duplicates_found: 0, cancelled: 0, refunded: 0, errors: 0 };

  const proUsers = dbAll();
  stats.users_checked = proUsers.length;

  for (const user of proUsers) {
    try {
      const monthly = await findFn(user.email);
      if (monthly) {
        stats.duplicates_found++;
        const cancelResult = await cancelFn(monthly.id);
        if (cancelResult.ok) {
          stats.cancelled++;
          try {
            const refundResult = await refundFn(monthly.id, user.id);
            if (refundResult.refunded) stats.refunded++;
          } catch (e) {}
          dbRun(user.id);
        } else {
          stats.errors++;
        }
      }
    } catch (e) {
      stats.errors++;
    }
  }

  return stats;
}

// ── Helpers: subscription fixtures ──

function makeSub(overrides = {}) {
  return {
    id: overrides.id || 'sub-default',
    last_status: overrides.last_status || 'active',
    charged_every_days: overrides.charged_every_days || 30,
    contact: { email: overrides.email || 'test@example.com' },
    product: {
      name: overrides.product_name || 'Capi Când-IA Pro',
      marketplace_id: overrides.marketplace_id || '1773774908',
      code: overrides.code || '1773774908',
    },
    ...overrides,
  };
}

// ── Tests ──

(async () => {
  console.log('='.repeat(70));
  console.log('Unit Tests: Fix DEFINITIVO upgrade mensal→anual');
  console.log('='.repeat(70));

  // ── TEST 1: Detecta mensal R$47 por marketplace_id ──
  console.log('\n📋 Test 1: Detecta mensal R$47 por marketplace_id 1773774908');
  {
    const sub47 = makeSub({
      id: 'sub-r47',
      email: 'nicholas@test.com',
      marketplace_id: '1773774908',
      product_name: 'Capi Când-IA Pro', // Sem "mensal" no nome
    });

    const fetchFn = async (url) => {
      return mockResponse({ data: [sub47], next_cursor: null });
    };

    const result = await findActiveMonthlySubscription('nicholas@test.com', { fetchFn });
    assert(result !== null, 'Encontrou subscription');
    assert(result.id === 'sub-r47', `ID correto: ${result?.id}`);
  }

  // ── TEST 2: Detecta mensal R$97 por nome do produto (contém "mensal") ──
  console.log('\n📋 Test 2: Detecta mensal R$97 por nome contendo "mensal"');
  {
    const sub97 = makeSub({
      id: 'sub-r97',
      email: 'beatriz@test.com',
      marketplace_id: '9999999', // Diferente do ID padrão
      product_name: 'Capi Când-IA Pro Mensal', // Nome contém "mensal"
    });

    const fetchFn = async (url) => {
      return mockResponse({ data: [sub97], next_cursor: null });
    };

    const result = await findActiveMonthlySubscription('beatriz@test.com', { fetchFn });
    assert(result !== null, 'Encontrou subscription');
    assert(result.id === 'sub-r97', `ID correto: ${result?.id}`);
  }

  // ── TEST 3: Paginação funciona (simula 3 páginas) ──
  console.log('\n📋 Test 3: Paginação funciona (3 páginas, sub na última)');
  {
    const targetSub = makeSub({
      id: 'sub-page3',
      email: 'maria@test.com',
      marketplace_id: '1773774908',
    });

    // Subs irrelevantes para preencher páginas
    const irrelevantSub1 = makeSub({ id: 'sub-other-1', email: 'other@other.com' });
    const irrelevantSub2 = makeSub({ id: 'sub-other-2', email: 'other2@other.com' });

    let pageCount = 0;
    const fetchFn = async (url) => {
      pageCount++;
      if (pageCount === 1) {
        return mockResponse({ data: [irrelevantSub1], next_cursor: 'cursor-2' });
      } else if (pageCount === 2) {
        return mockResponse({ data: [irrelevantSub2], next_cursor: 'cursor-3' });
      } else {
        return mockResponse({ data: [targetSub], next_cursor: null });
      }
    };

    const result = await findActiveMonthlySubscription('maria@test.com', { fetchFn });
    assert(result !== null, 'Encontrou subscription na 3a página');
    assert(result.id === 'sub-page3', `ID correto: ${result?.id}`);
    assert(pageCount === 3, `Fez 3 requisições (fez ${pageCount})`);
  }

  // ── TEST 4: Retry pega após primeira falha ──
  console.log('\n📋 Test 4: cancelMonthlyWithRetry pega após primeira falha');
  {
    let findCallCount = 0;
    const findFn = async (email) => {
      findCallCount++;
      if (findCallCount === 1) return null; // Primeira tentativa: não encontra
      return { id: 'sub-retry', contact: { email } }; // Segunda: encontra
    };

    const cancelFn = async (id) => ({ ok: true });
    const dbCalls = [];
    const dbRun = (uid) => dbCalls.push(uid);

    const result = await cancelMonthlyWithRetry('test@test.com', 42, { findFn, cancelFn, dbRun });
    assert(result.cancelled === true, 'Cancelou com sucesso');
    assert(result.sub.id === 'sub-retry', `Sub correta: ${result.sub?.id}`);
    assert(findCallCount === 2, `Tentou 2x (tentou ${findCallCount}x)`);
    assert(dbCalls.length === 0, 'DB upgrade_cancel_pending NÃO marcado (sucesso)');
  }

  // ── TEST 5: Retry falha 3x → marca pending ──
  console.log('\n📋 Test 5: cancelMonthlyWithRetry falha 3x → marca upgrade_cancel_pending');
  {
    let findCallCount = 0;
    const findFn = async () => {
      findCallCount++;
      return null; // Nunca encontra
    };
    const cancelFn = async () => ({ ok: false });
    const dbCalls = [];
    const dbRun = (uid) => dbCalls.push(uid);

    const result = await cancelMonthlyWithRetry('fail@test.com', 99, { findFn, cancelFn, dbRun });
    assert(result.cancelled === false, 'Não cancelou');
    assert(findCallCount === 3, `Tentou 3x (tentou ${findCallCount}x)`);
    assert(dbCalls.length === 1, 'DB upgrade_cancel_pending marcado');
    assert(dbCalls[0] === 99, `userId correto: ${dbCalls[0]}`);
  }

  // ── TEST 6: Reconcile encontra duplicidade e cancela+refund ──
  console.log('\n📋 Test 6: reconcileDuplicateSubscriptions encontra e cancela');
  {
    const dbAll = () => [
      { id: 1, email: 'dup@test.com', name: 'Test User' },
      { id: 2, email: 'clean@test.com', name: 'Clean User' },
    ];

    const findFn = async (email) => {
      if (email === 'dup@test.com') return { id: 'sub-dup-mensal' };
      return null; // clean user tem nada
    };

    const cancelFn = async (id) => ({ ok: true });
    const refundFn = async (subId, userId) => ({ refunded: true, transactionId: 'tx-123' });
    const dbCalls = [];
    const dbRun = (uid) => dbCalls.push(uid);

    const stats = await reconcileDuplicateSubscriptions({ dbAll, findFn, cancelFn, refundFn, dbRun });
    assert(stats.users_checked === 2, `Checou 2 users (checou ${stats.users_checked})`);
    assert(stats.duplicates_found === 1, `1 duplicata (encontrou ${stats.duplicates_found})`);
    assert(stats.cancelled === 1, `1 cancelado (cancelou ${stats.cancelled})`);
    assert(stats.refunded === 1, `1 refund (refundou ${stats.refunded})`);
    assert(stats.errors === 0, `0 erros (erros: ${stats.errors})`);
    assert(dbCalls.includes(1), 'upgrade_cancel_pending limpo para user 1');
  }

  // ── TEST 7: Filtragem client-side rejeita email diferente ──
  console.log('\n📋 Test 7: Filtragem client-side rejeita email diferente');
  {
    const wrongEmailSub = makeSub({
      id: 'sub-wrong-email',
      email: 'outro@test.com',
      marketplace_id: '1773774908',
    });

    const fetchFn = async () => mockResponse({ data: [wrongEmailSub], next_cursor: null });

    const result = await findActiveMonthlySubscription('meu@test.com', { fetchFn });
    assert(result === null, 'Não encontrou (email diferente)');
  }

  // ── TEST 8: Filtragem client-side rejeita subs não-ativas ──
  console.log('\n📋 Test 8: Filtragem client-side rejeita subs não-ativas');
  {
    const cancelledSub = makeSub({
      id: 'sub-cancelled',
      email: 'test@test.com',
      last_status: 'canceled',
      marketplace_id: '1773774908',
    });

    const fetchFn = async () => mockResponse({ data: [cancelledSub], next_cursor: null });

    const result = await findActiveMonthlySubscription('test@test.com', { fetchFn });
    assert(result === null, 'Não encontrou (sub cancelada)');
  }

  // ── TEST 9: Filtragem rejeita sub anual (charged_every_days > 60) ──
  console.log('\n📋 Test 9: Filtragem rejeita sub anual (charged_every_days=365)');
  {
    const annualSub = makeSub({
      id: 'sub-annual',
      email: 'test@test.com',
      charged_every_days: 365,
      marketplace_id: '1773774908',
    });

    const fetchFn = async () => mockResponse({ data: [annualSub], next_cursor: null });

    const result = await findActiveMonthlySubscription('test@test.com', { fetchFn });
    assert(result === null, 'Não encontrou (sub anual, charged_every_days=365)');
  }

  // ── TEST 10: Reconcile com cancel API falhando ──
  console.log('\n📋 Test 10: Reconcile com cancel API falhando conta como erro');
  {
    const dbAll = () => [{ id: 5, email: 'fail@test.com', name: 'Fail' }];
    const findFn = async () => ({ id: 'sub-fail' });
    const cancelFn = async () => ({ ok: false });
    const refundFn = async () => ({ refunded: false });
    const dbCalls = [];
    const dbRun = (uid) => dbCalls.push(uid);

    const stats = await reconcileDuplicateSubscriptions({ dbAll, findFn, cancelFn, refundFn, dbRun });
    assert(stats.duplicates_found === 1, 'Encontrou duplicata');
    assert(stats.cancelled === 0, 'Não cancelou');
    assert(stats.errors === 1, `1 erro (erros: ${stats.errors})`);
  }

  // ── SUMMARY ──
  console.log('\n' + '='.repeat(70));
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    console.log('⚠️ SOME TESTS FAILED — check output above');
    process.exit(1);
  } else {
    console.log('✅ ALL TESTS PASSED');
  }
  console.log('='.repeat(70));
})();
