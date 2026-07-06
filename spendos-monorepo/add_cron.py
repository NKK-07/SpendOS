import re

with open('apps/api/src/server.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    'import { generateUploadUrl } from "./services/s3";',
    'import { generateUploadUrl } from "./services/s3";\nimport { startCronJobs } from "./services/cron";'
)

code = code.replace(
    'const start = async () => {\n  try {\n    await fastify.listen({ port: 3000, host: "0.0.0.0" });',
    'const start = async () => {\n  try {\n    startCronJobs();\n    await fastify.listen({ port: 3000, host: "0.0.0.0" });'
)

with open('apps/api/src/server.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("Cron integrated.")
