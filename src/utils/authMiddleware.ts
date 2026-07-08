import { Context, Next } from 'hono';
import { supabase, supabaseAdmin } from '../services/supabaseService';
import { logger } from './logger';

/**
 * Middleware untuk memverifikasi JWT Supabase Auth dan melampirkan data user & profil ke context Hono.
 * Mengharuskan token Bearer yang valid di header Authorization.
 */
export const authMiddleware = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ 
        error: 'Unauthorized', 
        message: 'Akses ditolak. Token autentikasi tidak ditemukan.' 
      }, 401);
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return c.json({ 
        error: 'Unauthorized', 
        message: 'Akses ditolak. Token tidak valid.' 
      }, 401);
    }

    // Create a request-specific userClient with the token
    const { createClient } = await import('@supabase/supabase-js');
    const userClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );

    // 1. Verifikasi token menggunakan userClient
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);

    if (authError || !user) {
      logger.warn('⚠️ Verification of JWT failed:', authError?.message || 'No user returned');
      return c.json({ 
        error: 'Unauthorized', 
        message: 'Sesi kedaluwarsa atau tidak valid. Silakan login kembali.' 
      }, 401);
    }

    // 2. Ambil profil user untuk mendapatkan role dan data lengkapnya (menggunakan system-level client to bypass RLS recursion)
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      logger.error('❌ Failed to retrieve user profile inside authMiddleware:', profileError);
      return c.json({ 
        error: 'InternalServerError', 
        message: 'Gagal mengambil data profil otentikasi' 
      }, 500);
    }

    // Auto-create profile if it doesn't exist (e.g. for Google OAuth logins)
    if (!profile) {
      logger.info(`⚠️ Profile for user ${user.id} not found in database. Auto-creating basic profile from token metadata...`);
      const isKomunitasEmail = user.email?.toLowerCase().endsWith('@komunitas.id');
      const defaultRole = isKomunitasEmail ? 'superadmin' : 'user';
      
      const { data: newProfile, error: createError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email!,
          nama_lengkap: user.user_metadata?.full_name || user.user_metadata?.nama_lengkap || (isKomunitasEmail ? 'Superadmin KOMUNITAS' : 'Pengguna KOMUNITAS'),
          nama_panggilan: user.user_metadata?.name || user.user_metadata?.nama_panggilan || (isKomunitasEmail ? 'Superadmin' : 'User'),
          nomor_telepon: user.user_metadata?.phone || '+628000000000', // placeholder
          role: defaultRole,
        })
        .select()
        .maybeSingle();

      if (createError) {
        logger.error('❌ Failed to auto-create profile in authMiddleware:', createError);
      } else if (newProfile) {
        profile = newProfile;
        logger.info(`✅ Successfully auto-created profile for OAuth user: ${user.email}`);
      }
    }

    // Auto-heal: Jika email berakhiran @komunitas.id tetapi role-nya masih 'user', ubah otomatis di memori dan coba update DB
    if (profile && (profile.role === 'user' || !profile.role) && user.email?.toLowerCase().endsWith('@komunitas.id')) {
      logger.info(`🔧 Auto-healing role to 'superadmin' in memory for: ${user.email}`);
      profile.role = 'superadmin';

      supabaseAdmin
        .from('profiles')
        .update({ role: 'superadmin' })
        .eq('id', user.id)
        .then(({ error }) => {
          if (error) logger.error('❌ Failed to auto-heal profile role in DB-async:', error);
          else logger.info('✅ Asynchronously auto-healed profile role in DB to superadmin');
        });
    }

    // 3. Simpan data di Hono State agar bisa diakses oleh controller
    c.set('user', user);
    c.set('profile', profile);
    c.set('supabase', userClient);

    await next();
  } catch (error: any) {
    logger.error('🔥 Error in authMiddleware:', error);
    return c.json({ 
      error: 'InternalServerError', 
      message: error.message || 'Terjadi kesalahan pada modul keamanan' 
    }, 500);
  }
};

/**
 * Middleware opsional untuk otentikasi.
 * Jika token dikirim, validasi dan lampirkan ke context. Jika tidak, abaikan dan lanjut tanpa mengembalikan 401.
 */
export const optionalAuthMiddleware = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header('Authorization');

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token) {
        // Create a request-specific userClient with the token
        const { createClient } = await import('@supabase/supabase-js');
        const userClient = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_ANON_KEY!,
          {
            global: {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false
            }
          }
        );

        const { data: { user } } = await userClient.auth.getUser(token);
        if (user) {
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
            
          if (profile) {
            if ((profile.role === 'user' || !profile.role) && user.email?.toLowerCase().endsWith('@komunitas.id')) {
              profile.role = 'superadmin';
              supabaseAdmin.from('profiles').update({ role: 'superadmin' }).eq('id', user.id).then(({ error }) => {
                if (error) logger.error('❌ Failed to auto-heal in optionalAuthMiddleware:', error);
              });
            }
          }
          c.set('user', user);
          c.set('profile', profile);
          c.set('supabase', userClient);
        }
      }
    }
  } catch (error) {
    logger.warn('⚠️ Optional auth middleware encountered error (continuing as guest):', error);
  }
  await next();
};

/**
 * Middleware untuk membatasi akses berdasarkan peran (Role).
 * Digunakan setelah authMiddleware dijalankan.
 * @param allowedRoles - Daftar role yang diizinkan (contoh: ['admin', 'superadmin'])
 */
export const requireRoles = (allowedRoles: string[]) => {
  return async (c: Context, next: Next) => {
    const profile = c.get('profile');

    if (!profile) {
      return c.json({ 
        error: 'Forbidden', 
        message: 'Akses ditolak. Profil pengguna tidak ditemukan.' 
      }, 403);
    }

    const userRole = profile.role || 'user';

    if (!allowedRoles.includes(userRole)) {
      logger.warn(`⚠️ User with role [${userRole}] tried to access forbidden route with requirements [${allowedRoles.join(', ')}]`);
      return c.json({ 
        error: 'Forbidden', 
        message: 'Akses ditolak. Anda tidak memiliki izin untuk mengakses fitur ini.' 
      }, 403);
    }

    await next();
  };
};
