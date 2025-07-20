import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Create the test file before pdf-parse is imported anywhere
function ensureTestFile() {
  try {
    // Get absolute path using ESM approach
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Create path exactly where pdf-parse looks for it
    const testDir = path.join(__dirname, '..', 'test', 'data');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    const testFile = path.join(testDir, '05-versions-space.pdf');
    if (!fs.existsSync(testFile)) {
      fs.writeFileSync(testFile, Buffer.from([
        '%PDF-1.3',
        '1 0 obj<</Type/Catalog>>endobj',
        'trailer<</Root 1 0 R>>',
        '%%EOF'
      ].join('\n')));
      console.log(`Created test PDF at ${testFile}`);
    }
    return true;
  } catch (error) {
    console.error('Failed to create test PDF file:', error);
    return false;
  }
}

// Run immediately
ensureTestFile();