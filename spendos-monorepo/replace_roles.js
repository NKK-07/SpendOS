const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === 'dist' || file === '.next') continue;
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceInDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const original = content;
      
      // Specifically target role comparisons and arrays
      content = content.replace(/['"]admin['"]/g, "'ADMIN'");
      content = content.replace(/['"]manager['"]/g, "'MANAGER'");
      content = content.replace(/['"]employee['"]/g, "'EMPLOYEE'");
      content = content.replace(/['"]black_card['"]/g, "'PRINCIPAL'"); 
      
      if (content !== original) {
        fs.writeFileSync(fullPath, content);
        console.log('Updated', fullPath);
      }
    }
  }
}

replaceInDir('e:/SpendOS/spendos-monorepo/apps');
