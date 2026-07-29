const fs = require('fs'); 
const lines = fs.readFileSync('e:/Ahmed_VB/My-Stats-main/My-Stats-main/src/modules/transactions/medical-tickets/MedicalTicketsPage.jsx', 'utf8').split('\n'); 
let openCount = 0; 
let closeCount = 0; 
for(let i=0; i<lines.length; i++) { 
  const l = lines[i]; 
  const opens = (l.match(/<div/g) || []).length; 
  const closes = (l.match(/<\/div>/g) || []).length; 
  openCount += opens; 
  closeCount += closes; 
}
console.log('Total opens: ' + openCount + ', Total closes: ' + closeCount);
