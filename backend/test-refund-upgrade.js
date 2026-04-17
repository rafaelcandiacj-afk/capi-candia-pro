/**
 * Unit tests: Refund automático no upgrade mensal→anual
 *
 * Testa 3 cenários (com mock de fetch):
 * 1. Pagamento há 2 dias → refund chamado
 * 2. Pagamento há 10 dias → refund NÃO chamado
 * 3. Refund retorna 422 → webhook não quebra
 *
 * Run: node backend/test-refund-upgrade.js
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

// ── Replica da lógica attemptRefundRecentMonthly com fetchFn injetável ──
// Isso espelha EXATAMENTE o código em server.js, mas aceita fetchFn e dbRun
// pra permitir testes unitários sem subir o servidor.

async function attemptRefundRecentMonthly(oldMonthlySubId, userId, { fetchFn, dbRun, token }) {
  try {
    // 1. Pegar a assinatura mensal pra extrair current_invoice
    const subResp = await fetchFn(
      `https://digitalmanager.guru/api/v2/subscriptions/${oldMonthlySubId}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );
    const sub = await subResp.json();

    const invoiceId = sub?.current_invoice?.id;
    if (!invoiceId) {
      console.log('[refund] sem current_invoice, pulando');
      return { refunded: false, reason: 'no_current_invoice' };
    }

    // 2. Buscar transação paga dessa invoice
    const txResp = await fetchFn(
      `https://digitalmanager.guru/api/v2/transactions?invoice_id=${invoiceId}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );
    const txData = await txResp.json();
    const paidTx = (txData?.data || []).find(t => t?.invoice?.status === 'paid');

    if (!paidTx) {
      console.log('[refund] nenhuma transação paga, pulando');
      return { refunded: false, reason: 'no_paid_transaction' };
    }

    // 3. Checar is_refundable
    if (paidTx.is_refundable === false) {
      console.log(`[refund] tx=${paidTx.id} já não é refundable, pulando`);
      return { refunded: false, reason: 'not_refundable' };
    }

    // 4. Checar janela de 7 dias
    const confirmedAt = paidTx.dates?.confirmed_at;
    if (!confirmedAt) {
      console.log('[refund] sem confirmed_at na transação, pulando');
      return { refunded: false, reason: 'no_confirmed_at' };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const daysSince = (nowSec - confirmedAt) / 86400;

    if (daysSince > 7) {
      console.log(`[refund] fora da janela (${daysSince.toFixed(1)}d), pulando`);
      return { refunded: false, reason: 'outside_7day_window' };
    }

    // 5. Emitir refund
    const refundResp = await fetchFn(
      `https://digitalmanager.guru/api/v2/transactions/${paidTx.id}/refund`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: 'Upgrade automático mensal→anual dentro de 7 dias — garantia de satisfação'
        }),
      }
    );
    const refundResult = await refundResp.json();
    console.log(`[refund] tx=${paidTx.id} status=${refundResp.status} result=`, refundResult);

    if (refundResp.ok) {
      const valueCents = paidTx.value || 0;
      try {
        dbRun(valueCents, userId);
        console.log(`[refund] auditoria salva: user=${userId} cents=${valueCents}`);
      } catch (dbErr) {
        console.error('[refund] erro ao salvar auditoria no DB:', dbErr.message);
      }
      return { refunded: true, reason: 'success', transactionId: paidTx.id, valueCents };
    }

    console.log(`[refund] API retornou ${refundResp.status}, não estornado`);
    return { refunded: false, reason: `api_error_${refundResp.status}` };
  } catch (err) {
    console.error('[refund] erro ao tentar estornar mensal antiga:', err);
    return { refunded: false, reason: 'exception' };
  }
}

// ── Helpers de mock ──

function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function daysAgoUnix(days) {
  return Math.floor(Date.now() / 1000) - (days * 86400);
}

function buildMockFetch(confirmedAtUnix, refundStatus = 200, refundBody = { marketplace_refund: 1, status: 'success' }) {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push({ url, opts });

    // GET /subscriptions/{id} → retorna assinatura com current_invoice
    if (url.includes('/subscriptions/') && !url.includes('?')) {
      return mockResponse({
        id: 'sub-mock-123',
        current_invoice: { id: 'inv-mock-456' },
      });
    }

    // GET /transactions?invoice_id= → retorna transação paga
    if (url.includes('/transactions?invoice_id=')) {
      return mockResponse({
        data: [{
          id: 'tx-mock-789',
          value: 9700,
          is_refundable: true,
          invoice: { status: 'paid' },
          dates: { confirmed_at: confirmedAtUnix },
        }],
      });
    }

    // POST /transactions/{id}/refund → resultado do refund
    if (url.includes('/refund')) {
      return mockResponse(refundBody, refundStatus);
    }

    return mockResponse({ error: 'unexpected call' }, 404);
  };

  return { fetchFn, calls };
}

// ── Tests ──

(async () => {
  console.log('='.repeat(70));
  console.log('Unit Tests: Refund automático no upgrade mensal→anual');
  console.log('='.repeat(70));

  // ── TEST 1: Pagamento há 2 dias → refund chamado ──
  console.log('\n📋 Test 1: Pagamento há 2 dias → refund chamado');
  {
    const confirmedAt = daysAgoUnix(2);
    const { fetchFn, calls } = buildMockFetch(confirmedAt);
    const dbCalls = [];
    const dbRun = (cents, uid) => dbCalls.push({ cents, uid });

    const result = await attemptRefundRecentMonthly('sub-old-123', 42, {
      fetchFn,
      dbRun,
      token: 'test-token',
    });

    assert(result.refunded === true, 'refunded = true');
    assert(result.reason === 'success', `reason = success (got: ${result.reason})`);
    assert(result.transactionId === 'tx-mock-789', `transactionId = tx-mock-789 (got: ${result.transactionId})`);
    assert(result.valueCents === 9700, `valueCents = 9700 (got: ${result.valueCents})`);

    const refundCall = calls.find(c => c.url.includes('/refund'));
    assert(!!refundCall, 'POST /refund foi chamado');
    assert(refundCall.opts.method === 'POST', 'method = POST');
    const body = JSON.parse(refundCall.opts.body);
    assert(body.comment.includes('Upgrade automático'), 'comment contém "Upgrade automático"');

    assert(dbCalls.length === 1, 'auditoria DB chamada 1x');
    assert(dbCalls[0].cents === 9700, `DB cents = 9700 (got: ${dbCalls[0]?.cents})`);
    assert(dbCalls[0].uid === 42, `DB userId = 42 (got: ${dbCalls[0]?.uid})`);
  }

  // ── TEST 2: Pagamento há 10 dias → refund NÃO chamado ──
  console.log('\n📋 Test 2: Pagamento há 10 dias → refund NÃO chamado');
  {
    const confirmedAt = daysAgoUnix(10);
    const { fetchFn, calls } = buildMockFetch(confirmedAt);
    const dbCalls = [];
    const dbRun = (cents, uid) => dbCalls.push({ cents, uid });

    const result = await attemptRefundRecentMonthly('sub-old-456', 99, {
      fetchFn,
      dbRun,
      token: 'test-token',
    });

    assert(result.refunded === false, 'refunded = false');
    assert(result.reason === 'outside_7day_window', `reason = outside_7day_window (got: ${result.reason})`);

    const refundCall = calls.find(c => c.url.includes('/refund'));
    assert(!refundCall, 'POST /refund NÃO foi chamado');
    assert(dbCalls.length === 0, 'auditoria DB NÃO chamada');
  }

  // ── TEST 3: Refund retorna 422 → webhook não quebra ──
  console.log('\n📋 Test 3: Refund retorna HTTP 422 → não quebra');
  {
    const confirmedAt = daysAgoUnix(1);
    const { fetchFn, calls } = buildMockFetch(
      confirmedAt,
      422,
      { error: 'Transaction already refunded' }
    );
    const dbCalls = [];
    const dbRun = (cents, uid) => dbCalls.push({ cents, uid });

    const result = await attemptRefundRecentMonthly('sub-old-789', 77, {
      fetchFn,
      dbRun,
      token: 'test-token',
    });

    assert(result.refunded === false, 'refunded = false (422 não é sucesso)');
    assert(result.reason === 'api_error_422', `reason = api_error_422 (got: ${result.reason})`);

    const refundCall = calls.find(c => c.url.includes('/refund'));
    assert(!!refundCall, 'POST /refund foi chamado (tentou)');
    assert(dbCalls.length === 0, 'auditoria DB NÃO chamada (refund falhou)');
  }

  // ── TEST 4 (bonus): fetch lança exceção → não quebra ──
  console.log('\n📋 Test 4: fetch lança exceção → não quebra');
  {
    const fetchFn = async () => { throw new Error('network timeout'); };
    const dbCalls = [];
    const dbRun = (cents, uid) => dbCalls.push({ cents, uid });

    const result = await attemptRefundRecentMonthly('sub-broken', 55, {
      fetchFn,
      dbRun,
      token: 'test-token',
    });

    assert(result.refunded === false, 'refunded = false');
    assert(result.reason === 'exception', `reason = exception (got: ${result.reason})`);
    assert(dbCalls.length === 0, 'auditoria DB NÃO chamada');
  }

  // ── TEST 5 (bonus): transação com is_refundable=false → pula ──
  console.log('\n📋 Test 5: is_refundable=false → não tenta refund');
  {
    const calls = [];
    const fetchFn = async (url, opts) => {
      calls.push({ url, opts });
      if (url.includes('/subscriptions/') && !url.includes('?')) {
        return mockResponse({ current_invoice: { id: 'inv-x' } });
      }
      if (url.includes('/transactions?invoice_id=')) {
        return mockResponse({
          data: [{
            id: 'tx-already-refunded',
            value: 4700,
            is_refundable: false,
            invoice: { status: 'paid' },
            dates: { confirmed_at: daysAgoUnix(1) },
          }],
        });
      }
      return mockResponse({}, 404);
    };
    const dbCalls = [];
    const dbRun = (cents, uid) => dbCalls.push({ cents, uid });

    const result = await attemptRefundRecentMonthly('sub-refunded', 33, {
      fetchFn,
      dbRun,
      token: 'test-token',
    });

    assert(result.refunded === false, 'refunded = false');
    assert(result.reason === 'not_refundable', `reason = not_refundable (got: ${result.reason})`);
    const refundCall = calls.find(c => c.url.includes('/refund'));
    assert(!refundCall, 'POST /refund NÃO foi chamado');
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
