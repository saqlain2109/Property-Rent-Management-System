const fs = require('fs');
const path = require('path');

const xmlPath = path.join(__dirname, 'reference_files/docx_master_dev/word/document.xml');
if (fs.existsSync(xmlPath)) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  fs.writeFileSync(path.join(__dirname, 'reference_files/master_dev_prompt.txt'), text);
  console.log('Extracted length:', text.length);
  console.log('First 600 chars:', text.substring(0, 600));
}
