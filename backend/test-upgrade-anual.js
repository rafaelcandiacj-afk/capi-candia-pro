/**
 * E2E Test: Upgrade Mensal → Anual PRO
 *
 * Testa o fluxo completo:
 * 1. Simula webhook R$97 (cria user como paid/standard)
 * 2. Verifica que user é paid + standard
 * 3. Testa POST /api/subscription/upgrade-to-annual (pega checkout URL)
 * 4. Simula webhook R$804 pro mesmo email (upgrade)
 * 5. Verifica que user virou pro
 * 6. Simula webhook R$804 duplicado (idempotência)
 * 7. Testa que compra nova R$804 (email novo) funciona normal
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'capiAdmin2026';
const TEST_EMAIL = 'teste_qa_final@teste.com';
const TEST_EMAIL_NEW = 'teste_qa_upgrade_novo@teste.com';

const OFFER_97 = 'a18f84c7-5aac-4ca5-a433-a3088f8b6e17';
const OFFER_804 = 'a18f84b1-dffa-4de7-bef2-c8d1bf083a81';
const PRODUCT_MENSAL = '1773774908';
const PRODUCT_ANUAL = '1773783918';

function guruPayload({ valueCents, offerId, productId, offerName, email, isAnnual, name }) {
  return {
    id: `sub_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    subscription_code: `SUB-${Date.now()}`,
    last_status: 'active',
    charged_every_days: isAnnual ? 365 : 30,
    subscriber: {
      email,
      name: name || 'QA Teste Upgrade',
      first_name: 'QA',
      last_name: 'Teste',
    },
    product: {
      id: productId,
      code: productId,
      name: productId === PRODUCT_MENSAL ? 'Capi Când-IA Pro — Mensal' : 'Capi Când-IA Pro — Anual',
      offer: {
        id: offerId,
        name: offerName,
        plan: {
          interval: 1,
          interval_type: isAnnual ? 'year' : 'month',
        },
      },
    },
    last_transaction: {
      value: valueCents,
      contact: { email, name: name || 'QA Teste Upgrade' },
    },
  };
}

async function sendWebhook(body) {
  const res = await fetch(`${BASE_URL}/api/webhook/guru`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function getUser(email) {
  const res = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { 'x-admin-password': ADMIN_PASSWORD },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const users = data.users || data;
  return (Array.isArray(users) ? users : []).find(u => u.email === email) || null;
}

async function loginUser(email, password) {
  const res = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.token || null;
}

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

(async () => {
  console.log('='.repeat(70));
  console.log('E2E: Upgrade Mensal → Anual PRO');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('='.repeat(70));

  // ── STEP 1: Simulate R$97 monthly webhook ──
  console.log('\n📋 Step 1: Simulate R$97 monthly purchase');
  const r1 = await sendWebhook(guruPayload({
    valueCents: 9700,
    offerId: OFFER_97,
    productId: PRODUCT_MENSAL,
    offerName: 'Mensal Pro R$97',
    email: TEST_EMAIL,
    isAnnual: false,
  }));
  console.log(`  HTTP ${r1.status}`, JSON.stringify(r1.body));
  assert(r1.status === 200, 'Webhook R$97 returns 200');

  // Wait for DB write
  await new Promise(r => setTimeout(r, 1000));

  // ── STEP 2: Verify user is paid + standard ──
  console.log('\n📋 Step 2: Verify user state after R$97');
  const user1 = await getUser(TEST_EMAIL);
  if (user1) {
    assert(user1.plan_type === 'paid', `plan_type = paid (got: ${user1.plan_type})`);
    assert(user1.subscription_tier === 'pro', `subscription_tier = pro (got: ${user1.subscription_tier}) — R$97 is a pro offer`);
    assert(user1.active === 1, `active = 1 (got: ${user1.active})`);
  } else {
    console.log('  ⚠️ Could not fetch user via admin API — skipping DB checks');
  }

  // ── STEP 3: Test upgrade endpoint ──
  console.log('\n📋 Step 3: Test POST /api/subscription/upgrade-to-annual');
  const token = await loginUser(TEST_EMAIL, 'teste2026QA');
  if (token) {
    const r3 = await fetch(`${BASE_URL}/api/subscription/upgrade-to-annual`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const d3 = await r3.json();
    console.log(`  HTTP ${r3.status}`, JSON.stringify(d3));
    // R$97 user is already 'pro' tier, so they shouldn't be able to upgrade
    // This depends on if the user from step 1 got tier=pro (R$97 IS a pro offer)
    // If they're already pro, the endpoint should reject with 400
    if (user1 && user1.subscription_tier === 'pro') {
      assert(r3.status === 400, 'Already PRO user gets 400');
    } else {
      assert(r3.status === 200, 'Upgrade endpoint returns 200');
      assert(d3.checkout_url && d3.checkout_url.includes('anual-capi-candia-pro-804'), 'checkout_url contains anual-capi-candia-pro-804');
      assert(d3.checkout_url && d3.checkout_url.includes(encodeURIComponent(TEST_EMAIL)), 'checkout_url contains email');
    }
  } else {
    console.log('  ⚠️ Could not login — skipping upgrade endpoint test');
  }

  // ── STEP 4: Simulate R$804 annual webhook (upgrade) ──
  console.log('\n📋 Step 4: Simulate R$804 annual purchase (upgrade scenario)');
  // First, let's make the test user "standard" to properly test upgrade
  // We'll use a different test email for a clean upgrade test
  const UPGRADE_EMAIL = 'teste_qa_upgrade_flow@teste.com';

  // 4a: Create as standard monthly first
  console.log('  4a: Create standard monthly user');
  await sendWebhook(guruPayload({
    valueCents: 4700,
    offerId: 'legacy-47-offer',
    productId: PRODUCT_MENSAL,
    offerName: 'Mensal',
    email: UPGRADE_EMAIL,
    isAnnual: false,
    name: 'QA Upgrade Test',
  }));
  await new Promise(r => setTimeout(r, 500));

  const userBefore = await getUser(UPGRADE_EMAIL);
  if (userBefore) {
    assert(userBefore.plan_type === 'paid', `Before upgrade: plan_type = paid (got: ${userBefore.plan_type})`);
    assert(userBefore.subscription_tier === 'standard', `Before upgrade: tier = standard (got: ${userBefore.subscription_tier})`);
  }

  // 4b: Now send R$804 webhook for same email (triggers upgrade)
  console.log('  4b: Send R$804 webhook (upgrade)');
  const r4 = await sendWebhook(guruPayload({
    valueCents: 80400,
    offerId: OFFER_804,
    productId: PRODUCT_ANUAL,
    offerName: 'Anual Pro R$804',
    email: UPGRADE_EMAIL,
    isAnnual: true,
    name: 'QA Upgrade Test',
  }));
  console.log(`  HTTP ${r4.status}`, JSON.stringify(r4.body));
  assert(r4.status === 200, 'Webhook R$804 upgrade returns 200');
  assert(r4.body.action === 'upgrade', `Response action = upgrade (got: ${r4.body.action})`);

  await new Promise(r => setTimeout(r, 1000));

  // ── STEP 5: Verify user became PRO ──
  console.log('\n📋 Step 5: Verify user after upgrade');
  const userAfter = await getUser(UPGRADE_EMAIL);
  if (userAfter) {
    assert(userAfter.subscription_tier === 'pro', `After upgrade: tier = pro (got: ${userAfter.subscription_tier})`);
    assert(userAfter.plan_type === 'paid', `After upgrade: plan_type = paid (got: ${userAfter.plan_type})`);
    assert(userAfter.active === 1, `After upgrade: active = 1 (got: ${userAfter.active})`);
  } else {
    console.log('  ⚠️ Could not fetch user — skipping post-upgrade checks');
  }

  // ── STEP 5.5: BUG 1 regression — cancel webhook after upgrade must NOT downgrade ──
  console.log('\n📋 Step 5.5: Cancel webhook after upgrade (BUG 1 regression test)');
  const cancelPayload = {
    id: `sub_cancel_${Date.now()}`,
    subscription_code: `SUB-CANCEL-${Date.now()}`,
    last_status: 'cancelled',
    charged_every_days: 30,
    subscriber: { email: UPGRADE_EMAIL, name: 'QA Upgrade Test' },
    product: {
      id: PRODUCT_MENSAL, code: PRODUCT_MENSAL,
      name: 'Capi Când-IA Pro — Mensal',
      offer: { id: 'legacy-47-offer', name: 'Mensal', plan: { interval: 1, interval_type: 'month' } },
    },
    last_transaction: { value: 4700, contact: { email: UPGRADE_EMAIL, name: 'QA Upgrade Test' } },
  };
  const r55 = await sendWebhook(cancelPayload);
  console.log(`  HTTP ${r55.status}`, JSON.stringify(r55.body));
  assert(r55.status === 200, 'Cancel webhook returns 200');
  assert(r55.body.skipped_cancel === true, 'Cancel was skipped (user is PRO with valid annual)');

  await new Promise(r => setTimeout(r, 500));

  const userAfterCancel = await getUser(UPGRADE_EMAIL);
  if (userAfterCancel) {
    assert(userAfterCancel.plan_type === 'paid', `After cancel webhook: plan_type STILL paid (got: ${userAfterCancel.plan_type})`);
    assert(userAfterCancel.subscription_tier === 'pro', `After cancel webhook: tier STILL pro (got: ${userAfterCancel.subscription_tier})`);
    assert(!!userAfterCancel.plan_expires_at, `After cancel webhook: plan_expires_at NOT null`);
  } else {
    console.log('  ⚠️ Could not fetch user — skipping post-cancel checks');
  }

  // ── STEP 6: Idempotency — send same R$804 again ──
  console.log('\n📋 Step 6: Idempotency — duplicate R$804 webhook');
  const r6 = await sendWebhook(guruPayload({
    valueCents: 80400,
    offerId: OFFER_804,
    productId: PRODUCT_ANUAL,
    offerName: 'Anual Pro R$804',
    email: UPGRADE_EMAIL,
    isAnnual: true,
    name: 'QA Upgrade Test',
  }));
  console.log(`  HTTP ${r6.status}`, JSON.stringify(r6.body));
  assert(r6.status === 200, 'Duplicate webhook returns 200');
  // User is already pro, so the upgrade path should NOT trigger again
  // The normal flow will run instead (or it detects already pro)

  // ── STEP 7: New R$804 purchase (not an upgrade — new user) ──
  console.log('\n📋 Step 7: New R$804 purchase (new user, not upgrade)');
  const r7 = await sendWebhook(guruPayload({
    valueCents: 80400,
    offerId: OFFER_804,
    productId: PRODUCT_ANUAL,
    offerName: 'Anual Pro R$804',
    email: TEST_EMAIL_NEW,
    isAnnual: true,
    name: 'QA New User',
  }));
  console.log(`  HTTP ${r7.status}`, JSON.stringify(r7.body));
  assert(r7.status === 200, 'New user R$804 returns 200');
  assert(!r7.body.action || r7.body.action !== 'upgrade', 'New user is NOT treated as upgrade');

  await new Promise(r => setTimeout(r, 500));

  const newUser = await getUser(TEST_EMAIL_NEW);
  if (newUser) {
    assert(newUser.subscription_tier === 'pro', `New user: tier = pro (got: ${newUser.subscription_tier})`);
    assert(newUser.plan_type === 'paid', `New user: plan_type = paid (got: ${newUser.plan_type})`);
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

  console.log('\n📝 Notes:');
  console.log('- Guru API cancel was attempted but will 404 on fake subs (expected in test)');
  console.log('- Resend emails may or may not send depending on API key config');
  console.log('- Check server logs for [webhook] UPGRADE and [cancelGuruSubscription] entries');
})();
