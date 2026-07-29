const https = require('https');
const fs = require('fs');

https.get('https://cdn.jsdelivr.net/gh/alimosavi/Fonts@master/Amiri-Regular.ttf', (res) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const b64 = buffer.toString('base64');
    fs.writeFileSync('src/utils/amiriFont.js', `export const amiriFontBase64 = "${b64}";`);
    console.log('Font saved!');
  });
}).on('error', (e) => {
  console.error(e);
});
