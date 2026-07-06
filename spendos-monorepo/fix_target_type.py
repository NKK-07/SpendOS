import re

with open('apps/api/src/server.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace('targetType: "company"', 'targetType: "Company"')
code = code.replace('targetType: "user"', 'targetType: "User"')
code = code.replace('targetType: "expense"', 'targetType: "Expense"')
code = code.replace('targetType: "ticket"', 'targetType: "Ticket"')

with open('apps/api/src/server.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("Target types fixed.")
