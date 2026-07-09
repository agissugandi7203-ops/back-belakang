import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment/.env file');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

async function main() {
  console.log('🧹 Starting database cleanup (deleting all dummy seed data)...');

  // 1. Fetch dummy reports to delete associated chat messages first
  // Dummy reports are identified by reporter_contact starting with '08123456'
  const { data: dummyReports, error: reportsFetchError } = await supabaseAdmin
    .from('citizen_reports')
    .select('id')
    .like('reporter_contact', '08123456%');

  if (reportsFetchError) {
    console.error('❌ Failed to fetch dummy reports:', reportsFetchError.message);
    process.exit(1);
  }

  const dummyReportIds = dummyReports?.map(r => r.id) || [];
  console.log(`Found ${dummyReportIds.length} dummy reports.`);

  if (dummyReportIds.length > 0) {
    // Delete chat messages associated with dummy reports
    const { error: messagesDeleteError } = await supabaseAdmin
      .from('chat_messages')
      .delete()
      .in('report_id', dummyReportIds);

    if (messagesDeleteError) {
      console.error('❌ Failed to delete dummy chat messages:', messagesDeleteError.message);
    } else {
      console.log('✅ Deleted dummy chat messages successfully.');
    }

    // Delete dummy reports
    const { error: reportsDeleteError } = await supabaseAdmin
      .from('citizen_reports')
      .delete()
      .in('id', dummyReportIds);

    if (reportsDeleteError) {
      console.error('❌ Failed to delete dummy reports:', reportsDeleteError.message);
    } else {
      console.log('✅ Deleted dummy reports successfully.');
    }
  }

  // 2. Delete dummy claim verifications
  const dummyClaims = [
    'Vaksin COVID-19 menyebabkan autism pada anak-anak',
    'Pemerintah Indonesia akan menghapus subsidi BBM per 1 Agustus 2026',
    'Gempa bumi berkekuatan 7.8 SR akan mengguncang Jawa pada bulan Agustus',
    'Suhu udara di Indonesia meningkat rata-rata 0.5 derajat per dekade sejak 1990',
    'Dana BLT akan dihentikan pemerintah mulai September 2026'
  ];

  const { error: claimsDeleteError } = await supabaseAdmin
    .from('claim_verifications')
    .delete()
    .in('claim_text', dummyClaims);

  if (claimsDeleteError) {
    console.error('❌ Failed to delete dummy claim verifications:', claimsDeleteError.message);
  } else {
    console.log('✅ Deleted dummy claim verifications successfully.');
  }

  // 3. Delete dummy public services
  const dummyInstitutions = [
    'Dinas Kependudukan dan Catatan Sipil',
    'BPJS Kesehatan',
    'Dinas Penanaman Modal dan PTSP',
    'Kementerian Sosial RI'
  ];

  const { error: servicesDeleteError } = await supabaseAdmin
    .from('public_services')
    .delete()
    .in('institution', dummyInstitutions);

  if (servicesDeleteError) {
    console.error('❌ Failed to delete dummy public services:', servicesDeleteError.message);
  } else {
    console.log('✅ Deleted dummy public services successfully.');
  }

  // 4. Delete dummy hoax database keywords
  const dummyHoaxKeywords = [
    'vaksin autism',
    'bbm naik agustus',
    'gempa besar jawa',
    'blt dihentikan',
    'air minum microchip',
    'matahari terbit barat 2026'
  ];

  const { error: hoaxDeleteError } = await supabaseAdmin
    .from('hoax_database')
    .delete()
    .in('keyword', dummyHoaxKeywords);

  if (hoaxDeleteError) {
    console.error('❌ Failed to delete dummy hoax keywords:', hoaxDeleteError.message);
  } else {
    console.log('✅ Deleted dummy hoax keywords successfully.');
  }

  console.log('🎉 Database cleanup complete!');
}

main().catch(err => {
  console.error('🔥 Cleanup failed with unhandled error:', err);
  process.exit(1);
});
