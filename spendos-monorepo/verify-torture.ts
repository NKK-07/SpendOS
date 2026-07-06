import crypto from 'crypto';
const BASE_URL = 'http://localhost:3000';

async function fetchJSON(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  return res.json();
}

async function fetchJSONCatch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  return { status: res.status, ok: res.ok, body: await res.json().catch(() => null) };
}

async function runTortureTests() {
  console.log("=== Phase 5: Ledger Validation (Torture Tests) ===\n");

  // 1. Setup: Create Company, User, Wallet
  console.log("Setting up test environment...");
  const registerRes = await fetchJSON(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: `TortureTest Co ${Date.now()}`,
      name: 'Test Admin',
      email: `admin-${Date.now()}@torture.com`,
      password: 'password123'
    })
  });
  const token = registerRes.token;
  const companyId = registerRes.companyId;

  const empRes = await fetchJSON(`${BASE_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ companyId, name: 'Stress Tester', email: `stress-${Date.now()}@test.com`, password: 'pw' })
  });
  const userId = empRes.id;

  const walletRes = await fetchJSON(`${BASE_URL}/wallets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, userId, name: 'Stress Wallet' })
  });
  const wallet = walletRes;

  await fetchJSON(`${BASE_URL}/transactions/allocate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, walletId: wallet.id, amountPaise: 1000000, idempotencyKey: crypto.randomUUID() })
  });
  console.log(`✅ Setup complete. Wallet ${wallet.id} funded with ₹10,000.\n`);

  // --- TEST 1: Concurrency Torture Test ---
  console.log("=== TEST 1: Concurrency Torture Test ===");
  console.log("Launching 20 concurrent spend requests of ₹1,000...");
  
  const spendRequests = Array.from({ length: 20 }).map((_, i) => 
    fetchJSONCatch(`${BASE_URL}/transactions/spend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        walletId: wallet.id,
        merchant: `Concurrency Merchant ${i}`,
        amountPaise: 100000,
        idempotencyKey: crypto.randomUUID()
      })
    })
  );

  const results = await Promise.all(spendRequests);
  const successes = results.filter(r => r.ok).length;
  const failures = results.filter(r => !r.ok).length;
  const insufficientFundsCount = results.filter(r => r.status === 400 && JSON.stringify(r.body).includes('Insufficient Funds')).length;

  console.log(`Results: ${successes} Success, ${failures} Failures.`);
  
  const walletBalanceRes = await fetchJSON(`${BASE_URL}/wallets/${wallet.id}/balance`);
  console.log(`Final Wallet Balance: ${walletBalanceRes.balancePaise} paise`);

  if (successes === 10 && insufficientFundsCount === 10 && Number(walletBalanceRes.balancePaise) === 0) {
    console.log("✅ Concurrency Torture Test PASSED\n");
  } else {
    console.error(`❌ Concurrency Torture Test FAILED. Successes: ${successes}, Insufficient Funds: ${insufficientFundsCount}, Balance: ${walletBalanceRes.balancePaise}\n`);
    process.exit(1);
  }

  // --- TEST 2: Idempotency Torture Test ---
  console.log("=== TEST 2: Idempotency Torture Test ===");
  console.log("Allocating ₹10,000 again to test idempotency...");
  await fetchJSON(`${BASE_URL}/transactions/allocate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, walletId: wallet.id, amountPaise: 1000000, idempotencyKey: crypto.randomUUID() })
  });

  const idempotencyKey = crypto.randomUUID();
  console.log("Launching 100 concurrent/repeated spend requests with the SAME idempotency key...");
  
  const idempRequests = Array.from({ length: 100 }).map(() => 
    fetchJSONCatch(`${BASE_URL}/transactions/spend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        walletId: wallet.id,
        merchant: `Idempotency Merchant`,
        amountPaise: 100000,
        idempotencyKey
      })
    })
  );

  const idempResults = await Promise.all(idempRequests);
  const idempSuccesses = idempResults.filter(r => r.ok).length;
  
  console.log(`API returned OK for ${idempSuccesses} out of 100 requests.`);

  // Verify DB state
  const journalGroupsRes = await fetchJSON(`${BASE_URL}/journal-groups`);
  const jgWithKey = journalGroupsRes.filter((g: any) => g.description === 'Spend at Idempotency Merchant');
  
  console.log(`Journal Groups created with key: ${jgWithKey.length}`);
  
  if (idempSuccesses === 100 && jgWithKey.length === 1) {
    console.log("✅ Idempotency Torture Test PASSED\n");
  } else {
    console.error(`❌ Idempotency Torture Test FAILED. Journal Groups: ${jgWithKey.length}, Successes: ${idempSuccesses}\n`);
    process.exit(1);
  }


  // --- TEST 3: Ledger Reconstruction Test ---
  console.log("=== TEST 3: Ledger Reconstruction Test ===");
  console.log("Rebuilding balances from raw journal history...");

  const companiesRes = await fetchJSON(`${BASE_URL}/companies`);
  const company = companiesRes.find((c: any) => c.id === companyId);
  
  let allMatched = true;
  for (const account of company.accounts) {
    const ledger = await fetchJSON(`${BASE_URL}/accounts/${account.id}/ledger`);
    
    // Calculate reconstructed balance
    let reconstructedBalance = 0n;
    for (const entry of ledger) {
      const amount = BigInt(entry.amount_paise);
      if (account.normal_balance === 'DEBIT') {
        reconstructedBalance += (entry.entry_type === 'DEBIT' ? amount : -amount);
      } else {
        reconstructedBalance += (entry.entry_type === 'CREDIT' ? amount : -amount);
      }
    }

    const latestRunningBalance = ledger.length > 0 ? BigInt(ledger[ledger.length - 1].running_balance) : 0n;
    
    if (reconstructedBalance !== latestRunningBalance) {
      console.error(`❌ Mismatch for Account ${account.name} (${account.id}): Reconstructed=${reconstructedBalance}, Running=${latestRunningBalance}`);
      allMatched = false;
    }
  }

  if (allMatched) {
    console.log("✅ Ledger Reconstruction Test PASSED. All running balances match pure journal sums 100%.\n");
  } else {
    console.error("❌ Ledger Reconstruction Test FAILED.\n");
    process.exit(1);
  }

  console.log("=== All Torture Tests Passed Successfully! ===");
}

runTortureTests().catch(console.error);

