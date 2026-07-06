const fs = require('fs');
const content = fs.readFileSync('apps/api/src/server.ts', 'utf8');
const startMatch = content.match(/\/\/\s*AUTH ROUTES/);
const endMatch = content.match(/\/\/\s*START SERVER/);

if (startMatch && endMatch) {
  // Go backwards to the line boundary for start
  const startIdx = content.lastIndexOf('\n', startMatch.index);
  const endIdx = endMatch.index;

  const before = content.substring(0, startIdx);
  const after = content.substring(endIdx);
  const newContent = before + `
import { authRoutes } from "./routes/auth.routes";
import { adminRoutes } from "./routes/admin.routes";
import { expensesRoutes } from "./routes/expenses.routes";
import { ledgerRoutes } from "./routes/ledger.routes";

fastify.register(authRoutes, { prefix: "/api/v1" });
fastify.register(adminRoutes, { prefix: "/api/v1" });
fastify.register(expensesRoutes, { prefix: "/api/v1" });
fastify.register(ledgerRoutes, { prefix: "/api/v1" });

` + after;
  fs.writeFileSync('apps/api/src/server.ts', newContent);
  console.log('Successfully pruned server.ts');
} else {
  console.log('Could not find start/end markers', !!startMatch, !!endMatch);
}
