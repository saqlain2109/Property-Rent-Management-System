const fs = require('fs');
const path = require('path');

const xmlPath = path.join(__dirname, 'reference_files/docx_extracted/word/document.xml');
if (fs.existsSync(xmlPath)) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  // strip all XML tags
  const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  fs.writeFileSync(path.join(__dirname, 'reference_files/extracted_prompt.txt'), text);
  console.log('Extracted length:', text.length);
  console.log('First 500 chars:', text.substring(0, 500));
} else {
  console.log('xmlPath not found:', xmlPath);
}
