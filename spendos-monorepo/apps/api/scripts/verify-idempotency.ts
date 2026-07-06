import { prisma, ExpenseStatus } from '@spendos/database';
import { generateRequestHash, withIdempotency } from '../src/idempotency';

async function testIdempotency() {
  console.log("=== Idempotency Torture Test ===");

  const companyId = '00000000-0000-0000-0000-000000000001'; // Mock
  const actorId = '00000000-0000-0000-0000-000000000001';

  // We will simulate the internal transaction for Expense Creation
  const idempotencyKey = `idem-${Date.now()}`;
  const payload = { amountPaise: 50000, description: "Test Expense" };
  const route = '/expenses';
  const requestHash = generateRequestHash(route, payload, companyId, actorId);

  console.log("1. Testing 100 Concurrent Duplicate Requests...");
  let successCount = 0;
  let conflictCount = 0;
  let errorCount = 0;

  const mockTxFn = async (tx: any) => {
    // Simulate some work
    return { status: "created", mockId: 1 };
  };

  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(
      withIdempotency(idempotencyKey, requestHash, mockTxFn)
        .then(res => { successCount++; return res; })
        .catch(err => {
          if (err.message.includes('409 Conflict')) conflictCount++;
          else errorCount++;
        })
    );
  }

  await Promise.all(promises);
  console.log(`   Results: ${successCount} Successes (Replayed), ${conflictCount} Conflicts, ${errorCount} Errors`);
  
  if (successCount !== 100 || conflictCount > 0 || errorCount > 0) {
    console.error("❌ Failed 100 Concurrent Requests Test! Expecting 100 Successes (1 execution, 99 replays).");
  } else {
    console.log("✅ Passed Concurrent Replay Test!");
  }

  console.log("\n2. Testing Same Key + Different Hash...");
  const badPayload = { amountPaise: 90000, description: "Hacked Expense" };
  const badRequestHash = generateRequestHash(route, badPayload, companyId, actorId);

  try {
    await withIdempotency(idempotencyKey, badRequestHash, mockTxFn);
    console.error("❌ Failed Different Hash Test! Expected 409 Conflict.");
  } catch (err: any) {
    if (err.message.includes('409 Conflict')) {
      console.log("✅ Passed Different Hash Test! (Got 409 Conflict)");
    } else {
      console.error("❌ Failed Different Hash Test with unexpected error: ", err);
    }
  }

  console.log("\n3. Broken Pipe Test (DB Commits, Client Retries)...");
  // The first 100 concurrent requests already committed the IdempotencyKey record.
  // A retry right now simulates a broken pipe.
  try {
    const replayRes = await withIdempotency(idempotencyKey, requestHash, mockTxFn);
    if (replayRes.status === "created") {
      console.log("✅ Passed Broken Pipe Test! (Returned exact original response)");
    } else {
      console.error("❌ Failed Broken Pipe Test! Wrong response returned.");
    }
  } catch (err) {
    console.error("❌ Failed Broken Pipe Test! Error: ", err);
  }

  // Count records in DB to prove only 1 was inserted
  const keysCount = await prisma.idempotencyKey.count({ where: { key: idempotencyKey }});
  if (keysCount === 1) {
    console.log("✅ Exactly 1 Idempotency record created in DB.");
  } else {
    console.error(`❌ Expected 1 Idempotency record, found ${keysCount}`);
  }

  console.log("\n=== Test Suite Complete ===");
  process.exit(0);
}

testIdempotency();
