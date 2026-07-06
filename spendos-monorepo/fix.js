const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}
const files = walk('e:/SpendOS/spendos-monorepo/apps/dashboard/src/app');
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let modified = content
    .replace(/from\s+['"]\.\.\/auth['"]/g, "from '@/lib/auth'")
    .replace(/from\s+['"]\.\.\/\.\.\/auth['"]/g, "from '@/lib/auth'")
    .replace(/from\s+['"]\.\.\/\.\.\/\.\.\/auth['"]/g, "from '@/lib/auth'");
  if (content !== modified) {
    fs.writeFileSync(f, modified, 'utf8');
    console.log('Fixed:', f);
  }
});
