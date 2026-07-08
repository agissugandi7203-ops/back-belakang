import { reportSchema } from './controllers/chatController';
import { supabase } from './services/supabaseService';
import * as fs from 'fs';
import * as path from 'path';

async function runVerification() {
  console.log('=== KOMUNITAS Backend & Frontend Verification ===\n');

  let success = true;

  // 1. Verify reportSchema Validation Logic
  console.log('1. Verifying reportSchema:');
  const validPayload = {
    reporterName: 'Budi Santoso',
    reporterContact: '081234567890',
    category: 'Sosial',
    description: 'Ada kemacetan di jalan utama.',
    latitude: -6.2088,
    longitude: 106.8456
  };

  const missingCoordsPayload = {
    reporterName: 'Budi Santoso',
    reporterContact: '081234567890',
    category: 'Sosial',
    description: 'Ada kemacetan di jalan utama.'
  };

  const stringCoordsPayload = {
    ...validPayload,
    latitude: '-6.2088',
    longitude: '106.8456'
  };

  // Test Valid Payload
  const parseValid = reportSchema.safeParse(validPayload);
  if (parseValid.success) {
    console.log('  [PASS] Valid payload parsed successfully.');
  } else {
    console.error('  [FAIL] Valid payload failed to parse:', parseValid.error.format());
    success = false;
  }

  // Test Missing Coordinates
  const parseMissing = reportSchema.safeParse(missingCoordsPayload);
  if (!parseMissing.success) {
    console.log('  [PASS] Missing coordinates rejected as expected.');
    const errors = parseMissing.error.flatten().fieldErrors;
    console.log('         Errors:', JSON.stringify(errors));
  } else {
    console.error('  [FAIL] Missing coordinates payload was incorrectly accepted!');
    success = false;
  }

  // Test String Coordinates (Zod requires number, should reject strings)
  const parseStringCoords = reportSchema.safeParse(stringCoordsPayload);
  if (!parseStringCoords.success) {
    console.log('  [PASS] String coordinates rejected as expected.');
    const errors = parseStringCoords.error.flatten().fieldErrors;
    console.log('         Errors:', JSON.stringify(errors));
  } else {
    console.error('  [FAIL] String coordinates payload was incorrectly accepted!');
    success = false;
  }
  console.log('');

  // 2. Test Category and Image Regex Filtering Rules
  console.log('2. Verifying Custom filtering logic:');
  
  // Custom category input field replace rule: /[^a-zA-Z\s]/g
  const categoryReplaceRule = /[^a-zA-Z\s]/g;
  const inputCategory = 'Kerusakan Fasilitas Jalan 123!@#';
  const expectedCategory = 'Kerusakan Fasilitas Jalan    '; // spaces kept, non-letters removed
  const processedCategory = inputCategory.replace(categoryReplaceRule, '');
  if (processedCategory === 'Kerusakan Fasilitas Jalan ') {
    console.log(`  [PASS] Category filtering successfully kept only letters and spaces: "${inputCategory}" -> "${processedCategory}"`);
  } else {
    console.error(`  [FAIL] Category filtering failed. Expected "Kerusakan Fasilitas Jalan ", got "${processedCategory}"`);
    success = false;
  }

  // Custom base64 regex rule: /^data:image\/[a-z]+;base64,/
  const base64Regex = /^data:image\/[a-z]+;base64,/;
  const inputBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const processedBase64 = inputBase64.replace(base64Regex, '');
  const expectedBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  if (processedBase64 === expectedBase64) {
    console.log('  [PASS] Base64 prefix stripping matches the regex replacement rule.');
  } else {
    console.error(`  [FAIL] Base64 prefix stripping failed. Got: "${processedBase64}"`);
    success = false;
  }
  console.log('');

  // 3. Verify database connectivity by checking if a query to citizen_reports succeeds
  console.log('3. Verifying database connectivity:');
  try {
    const { data, error } = await supabase
      .from('citizen_reports')
      .select('id, created_at')
      .limit(1);

    if (error) {
      throw error;
    }

    console.log('  [PASS] Connection to Supabase database successful.');
    console.log('         Test query returned:', JSON.stringify(data));
  } catch (err: any) {
    console.error('  [FAIL] Supabase database connectivity check failed:', err.message || err);
    success = false;
  }
  console.log('');

  // 4. Verify no Emojis in newly added components: CitizenReportModal.tsx, AdminDashboard.tsx, AboutPage.tsx, ChatSidebar.tsx
  console.log('4. Performing Emoji Audit in UI components:');
  const filesToAudit = [
    '../../frontend/src/components/chat/CitizenReportModal.tsx',
    '../../frontend/src/pages/AdminDashboard.tsx',
    '../../frontend/src/pages/AboutPage.tsx',
    '../../frontend/src/components/chat/ChatSidebar.tsx'
  ];

  // Regex to match emojis
  const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/gu;

  for (const relativePath of filesToAudit) {
    const absolutePath = path.resolve(__dirname, relativePath);
    if (!fs.existsSync(absolutePath)) {
      console.warn(`  [WARN] File not found: ${relativePath}`);
      continue;
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    
    // We only care about emojis in UI markup.
    // Let's search line by line.
    const lines = content.split('\n');
    let emojisFoundInFile = 0;
    
    lines.forEach((line, idx) => {
      // Exclude comments to avoid false positives (e.g. commented-out emojis)
      const cleanLine = line.split('//')[0].split('/*')[0];
      const matches = cleanLine.match(emojiRegex);
      if (matches) {
        emojisFoundInFile += matches.length;
        console.error(`  [FAIL] Emoji "${matches.join(', ')}" found on line ${idx + 1} of ${relativePath}: "${line.trim()}"`);
        success = false;
      }
    });

    if (emojisFoundInFile === 0) {
      console.log(`  [PASS] No emojis found in UI markup of ${relativePath}`);
    }
  }
  console.log('');

  if (success) {
    console.log('=== All Verifications PASSED Successfully ===');
    process.exit(0);
  } else {
    console.error('=== Verification FAILED ===');
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
