#!/usr/bin/env node
/**
 * Backfill subscription_tier for existing paid users.
 *
 * 1. Fixes Anderson's record (plan_type='paid', tier='pro', expires +365d)
 * 2. For all paid users with subscription_tier=NULL, queries Guru API to determine tier
 * 3. Updates DB with correct tier ('pro' or 'standard')
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   node backend/scripts/backfill_subscription_tier.js
 *
 * Env vars required:
 *   GURU_API_TOKEN — Guru API v2 token
 *   DB_PATH (optional) — path to SQLite DB (default: ./backend/capi.db)
 *
 * Can also be triggered via admin endpoint POST /api/admin/backfill-tier
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'capi.db');
const GURU_API_TOKEN = process.env.GURU_API_TOKEN || '';
const GURU_OFFER_ID_MONTHLY_97 = process.env.GURU_OFFER_ID_MONTHLY_97 || 'a18f84c7-5aac-4ca5-a433-a3088f8b6e17';
const GURU_OFFER_ID_ANNUAL_804 = process.env.GURU_OFFER_ID_ANNUAL_804 || 'a18f84b1-dffa-4de7-bef2-c8d1bf083a81';
const PRO_OFFER_IDS = [GURU_OFFER_ID_MONTHLY_97, GURU_OFFER_ID_ANNUAL_804].filter(Boolean);

async function run(db) {
  const results = { fixed_anderson: false, total_null_tier: 0, updated_pro: 0, updated_standard: 0, errors: 0, skipped: 0 };

  // ── STEP 1: Fix Anderson ──────────────────────────────────
  console.log('\n=== STEP 1: Fix Anderson ===');
  const anderson = db.prepare("SELECT id, email, plan_type, subscription_tier, plan_expires_at FROM users WHERE email = 'andersontabosa.adv@gmail.com'").get();
  if (anderson) {
    console.log('  Current state:', JSON.stringify(anderson));
    if (anderson.plan_type !== 'paid' || anderson.subscription_tier !== 'pro' || !anderson.plan_expires_at) {
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      db.prepare(`
        UPDATE users SET
          plan_type = 'paid',
          subscription_tier = 'pro',
          plan_expires_at = ?,
          active = 1
        WHERE id = ?
      `).run(expiresAt.toISOString(), anderson.id);
      console.log(`  FIXED: plan_type=paid, tier=pro, expires=${expiresAt.toISOString()}`);
      results.fixed_anderson = true;
    } else {
      console.log('  Already correct — skipping');
    }
  } else {
    console.log('  Anderson not found in DB');
  }

  // ── STEP 2: Find all paid users with NULL tier ────────────
  console.log('\n=== STEP 2: Backfill NULL subscription_tier ===');
  const nullTierUsers = db.prepare(`
    SELECT id, email, plan_type, plan_expires_at, pagarme_subscription_id, subscription_tier
    FROM users
    WHERE plan_type = 'paid' AND (subscription_tier IS NULL OR subscription_tier = '')
  `).all();

  results.total_null_tier = nullTierUsers.length;
  console.log(`  Found ${nullTierUsers.length} paid users with NULL tier`);

  if (nullTierUsers.length === 0) {
    console.log('  Nothing to backfill!');
    return results;
  }

  if (!GURU_API_TOKEN) {
    console.error('  ERROR: GURU_API_TOKEN not set — cannot query Guru API');
    console.log('  Falling back to heuristic: all NULL tier → standard');
    const stmt = db.prepare("UPDATE users SET subscription_tier = 'standard' WHERE id = ?");
    for (const u of nullTierUsers) {
      stmt.run(u.id);
      results.updated_standard++;
    }
    return results;
  }

  // ── STEP 3: For each user, query Guru API ─────────────────
  const updateStmt = db.prepare("UPDATE users SET subscription_tier = ? WHERE id = ?");

  for (let i = 0; i < nullTierUsers.length; i++) {
    const u = nullTierUsers[i];
    const progress = `[${i + 1}/${nullTierUsers.length}]`;

    try {
      // Query Guru subscriptions for this email
      const tier = await determineUserTier(u.email);
      updateStmt.run(tier, u.id);
      if (tier === 'pro') results.updated_pro++;
      else results.updated_standard++;
      console.log(`  ${progress} ${u.email} → ${tier}`);
    } catch (e) {
      console.error(`  ${progress} ${u.email} → ERROR: ${e.message}`);
      // Fallback: set to standard on error
      updateStmt.run('standard', u.id);
      results.updated_standard++;
      results.errors++;
    }

    // Rate limit: 100ms between API calls
    if (i < nullTierUsers.length - 1) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return results;
}

async function determineUserTier(email) {
  // Try subscriptions endpoint first
  try {
    const subsRes = await fetch(
      `https://digitalmanager.guru/api/v2/subscriptions?contact_email=${encodeURIComponent(email)}&limit=20`,
      { headers: { 'Authorization': `Bearer ${GURU_API_TOKEN}` } }
    );
    if (subsRes.ok) {
      const subsData = await subsRes.json();
      const subs = subsData.data || subsData || [];
      if (Array.isArray(subs) && subs.length > 0) {
        // Check if any subscription has a PRO offer
        for (const sub of subs) {
          const offerId = sub.offer?.id || sub.product?.offer?.id || '';
          if (PRO_OFFER_IDS.includes(offerId)) {
            return 'pro';
          }
          // Check by transaction value if available
          const value = parseInt(sub.last_transaction?.value || sub.amount || 0);
          if (value >= 80400 || (value >= 9700 && value < 39700)) {
            return 'pro';
          }
        }
      }
    }
  } catch (e) {
    console.warn(`    [subscriptions] ${email}: ${e.message}`);
  }

  // Try transactions endpoint as fallback
  try {
    const txRes = await fetch(
      `https://digitalmanager.guru/api/v2/transactions?contact_email=${encodeURIComponent(email)}&limit=10`,
      { headers: { 'Authorization': `Bearer ${GURU_API_TOKEN}` } }
    );
    if (txRes.ok) {
      const txData = await txRes.json();
      const txs = txData.data || txData || [];
      if (Array.isArray(txs) && txs.length > 0) {
        for (const tx of txs) {
          const offerId = tx.offer?.id || tx.product?.offer?.id || '';
          if (PRO_OFFER_IDS.includes(offerId)) {
            return 'pro';
          }
          const value = parseInt(tx.value || tx.amount || 0);
          if (value >= 80400 || (value >= 9700 && value < 39700)) {
            return 'pro';
          }
        }
      }
    }
  } catch (e) {
    console.warn(`    [transactions] ${email}: ${e.message}`);
  }

  // Default: most old users were on R$47/R$397 (standard)
  return 'standard';
}

// ── Main ─────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    console.log('=' .repeat(60));
    console.log('Backfill subscription_tier');
    console.log(`DB: ${DB_PATH}`);
    console.log(`Guru token: ${GURU_API_TOKEN ? 'set (' + GURU_API_TOKEN.substring(0, 10) + '...)' : 'NOT SET'}`);
    console.log('='.repeat(60));

    let db;
    try {
      db = new Database(DB_PATH);
    } catch (e) {
      console.error(`Cannot open DB at ${DB_PATH}: ${e.message}`);
      process.exit(1);
    }

    try {
      const results = await run(db);
      console.log('\n=== RESULTS ===');
      console.log(JSON.stringify(results, null, 2));
      console.log('='.repeat(60));
      if (results.errors > 0) {
        console.log(`⚠️ ${results.errors} errors occurred — those users defaulted to 'standard'`);
      }
      console.log('Done!');
    } catch (e) {
      console.error('Fatal error:', e);
      process.exit(1);
    } finally {
      db.close();
    }
  })();
}

module.exports = { run, determineUserTier };
