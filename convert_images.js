const fs = require('fs');
const logo = fs.readFileSync('src/assets/logo.png').toString('base64');
const ahmed = fs.readFileSync('src/assets/Ahmed.jpeg').toString('base64');
fs.writeFileSync('src/assets/imageConstants.js', 
  `export const LOGO_BASE64 = "data:image/png;base64,${logo}";\nexport const DESIGNER_BASE64 = "data:image/jpeg;base64,${ahmed}";\n`
);
