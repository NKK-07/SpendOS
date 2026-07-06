// Node native fetch used

const BASE_URL = "http://localhost:3000";

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== Starting Vertical Slice Verification ===\n");

  const timestamp = Date.now();
  const aliceEmail = `alice${timestamp}@acme.com`;
  const bobEmail = `bob${timestamp}@acme.com`;

  // 1. Register Company
  console.log("1. Registering Company...");
  let res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: `Acme Corp ${timestamp}`, name: "Alice", email: aliceEmail, password: "password123" })
  });
  let json = await res.json() as any;
  if (!res.ok) throw new Error("Register failed: " + JSON.stringify(json));
  const { companyId, userId } = json;
  console.log(`✅ Company Created: ${companyId}`);
  console.log(`✅ Admin User Created: ${userId}\n`);

  // 2. Login
  console.log("2. Logging In...");
  res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: aliceEmail, password: "password123" })
  });
  json = await res.json() as any;
  if (!res.ok) throw new Error("Login failed: " + JSON.stringify(json));
  const { token } = json;
  console.log(`✅ Authenticated, Token Received\n`);

  // 3. Create User
  console.log("3. Creating User Bob...");
  res = await fetch(`${BASE_URL}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, name: "Bob", email: bobEmail, password: "password123" })
  });
  const bob = await res.json() as any;
  if (!res.ok) throw new Error("Create User failed: " + JSON.stringify(bob));
  console.log(`✅ User Created: ${bob.id}\n`);

  // 4. Create Wallet
  console.log("4. Creating Wallet for Bob...");
  res = await fetch(`${BASE_URL}/wallets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, userId: bob.id, name: `Bob's Travel Card ${timestamp}` })
  });
  const wallet = await res.json() as any;
  if (!res.ok) throw new Error("Create Wallet failed: " + JSON.stringify(wallet));
  console.log(`✅ Wallet Created: ${wallet.id} (Linked Account: ${wallet.account_id})\n`);

  // 5. Allocate Funds (10,000)
  console.log("5. Allocating ₹10,000 to Bob's Wallet...");
  res = await fetch(`${BASE_URL}/transactions/allocate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, walletId: wallet.id, amountPaise: 1000000, idempotencyKey: `alloc-${timestamp}` })
  });
  const allocRes = await res.json() as any;
  if (!res.ok) throw new Error("Allocate failed: " + JSON.stringify(allocRes));
  console.log(`✅ Allocation Successful (JournalGroup: ${allocRes.journalGroup.id})\n`);

  // 6. Spend Funds (1,000)
  console.log("6. Spending ₹1,000 at Demo Merchant...");
  res = await fetch(`${BASE_URL}/transactions/spend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, walletId: wallet.id, amountPaise: 100000, merchant: "Demo Merchant", idempotencyKey: `spend-${timestamp}` })
  });
  const spendRes = await res.json() as any;
  if (!res.ok) throw new Error("Spend failed: " + JSON.stringify(spendRes));
  console.log(`✅ Spend Successful (JournalGroup: ${spendRes.journalGroup.id})\n`);

  // 7. Verify Journal Group
  console.log("7. Verifying Spend Journal Group Balance...");
  res = await fetch(`${BASE_URL}/journal-groups/${spendRes.journalGroup.id}`);
  const jg = await res.json() as any;
  const debits = jg.entries.filter((e: any) => e.entry_type === "DEBIT").reduce((acc: bigint, e: any) => acc + BigInt(e.amount_paise), 0n);
  const credits = jg.entries.filter((e: any) => e.entry_type === "CREDIT").reduce((acc: bigint, e: any) => acc + BigInt(e.amount_paise), 0n);
  console.log(`   Debits: ${debits}, Credits: ${credits}`);
  if (debits === credits && debits === 200000n) console.log(`✅ Journal Group is Perfectly Balanced\n`);
  else console.error(`❌ Journal Group Imbalance!`);

  // 8. Verify Ledger Entries & Running Balance
  console.log("8. Verifying Wallet Ledger & Running Balance...");
  res = await fetch(`${BASE_URL}/accounts/${wallet.account_id}/ledger`);
  const ledger = await res.json() as any;
  console.log(`   Ledger Chain:`);
  ledger.forEach((e: any) => console.log(`   - ${e.entry_type} ${e.amount_paise} -> Running Balance: ${e.running_balance}`));
  
  res = await fetch(`${BASE_URL}/wallets/${wallet.id}/balance`);
  const { balancePaise } = await res.json() as any;
  console.log(`   Current Wallet API Balance: ${balancePaise}`);
  if (Number(balancePaise) === 900000) console.log(`✅ Running Balance verified intact (₹9,000 available)\n`);
  else console.error(`❌ Running Balance verification failed!`);

  // 9. Verify Corporate Expense Account
  console.log("9. Verifying Corporate Expense Account...");
  const companiesRes = await fetch(`${BASE_URL}/companies`);
  const companies = await companiesRes.json() as any;
  const company = companies.find((c: any) => c.id === companyId);
  const expenseAccount = company.accounts.find((a: any) => a.name === "Corporate Expense");

  const expenseLedgerRes = await fetch(`${BASE_URL}/accounts/${expenseAccount.id}/ledger`);
  const expenseLedger = await expenseLedgerRes.json() as any;
  
  const expenseBalance = expenseLedger.length > 0 ? Number(expenseLedger[expenseLedger.length - 1].running_balance) : 0;
  console.log(`   Current Expense Account Balance: ${expenseBalance}`);
  if (expenseBalance === 100000) console.log(`✅ Expense Account increased by ₹1,000\n`);
  else console.error(`❌ Expense Account verification failed! Expected 100000, got ${expenseBalance}`);

  console.log("=== Vertical Slice Verification Complete ===");
}

run().catch(console.error);

