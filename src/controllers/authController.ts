import { Context } from 'hono';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseAdmin } from '../services/supabaseService';
import { logger } from '../utils/logger';

// ─── VALIDATION SCHEMAS ──────────────────────────────────────────────────────

const phoneRegex = /^\+62\d{10,13}$/;

export const registerSchema = z.object({
  email: z.string()
    .email('Format email tidak valid')
    .refine(v => /@gmail\.com$/i.test(v), {
      message: 'Anda harus menggunakan akun Gmail (@gmail.com)',
    }),
  password: z.string().min(8, 'Password minimal harus 8 karakter'),
  nama_lengkap: z.string().min(1, 'Nama lengkap wajib diisi sesuai KTP'),
  nama_panggilan: z.string().min(1, 'Nama panggilan wajib diisi'),
  tanggal_lahir: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal lahir harus YYYY-MM-DD'),
  nomor_telepon: z.string().regex(phoneRegex, 'Format nomor telepon harus diawali +62 dan diikuti 10-13 digit angka (Contoh: +6281234567890)'),
});

const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

// ─── CONTROLLERS ─────────────────────────────────────────────────────────────

/**
 * Register Controller
 * POST /api/auth/register
 */
export const registerController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = registerSchema.parse(body);

    logger.info('👤 Registration request for email:', validated.email);

    const isKomunitasEmail = validated.email.toLowerCase().endsWith('@komunitas.id');
    const assignedRole = isKomunitasEmail ? 'superadmin' : 'user';

    // 2. Daftar ke Supabase Auth
    // emailRedirectTo: URL yang dituju Supabase setelah user klik "Confirm email"
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: validated.email,
      password: validated.password,
      options: {
        emailRedirectTo: `${frontendUrl}/auth/callback`,
        data: {
          role: assignedRole,
          nama_lengkap: validated.nama_lengkap,
        }
      }
    });

    if (authError || !authData.user) {
      logger.error('❌ Supabase Auth registration error:', authError);
      return c.json({ 
        error: 'Registration failed', 
        message: authError?.message || 'Gagal mendaftarkan akun di sistem autentikasi' 
      }, 400);
    }

    const userId = authData.user.id;

    // 3. Masukkan profil tambahan ke tabel profiles
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        email: validated.email,
        nama_lengkap: validated.nama_lengkap,
        nama_panggilan: validated.nama_panggilan,
        tanggal_lahir: validated.tanggal_lahir,
        nomor_telepon: validated.nomor_telepon,
        role: assignedRole,
      });

    if (profileError) {
      logger.error('❌ Profiles table insertion error:', profileError);
      
      // Cleanup: Delete auth user if profile insertion fails to keep database integrity
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        logger.info(`🧹 Cleaned up orphan auth user ${userId} due to profile creation failure`);
      } catch (cleanErr: any) {
        logger.error('⚠️ Failed to delete orphan auth user:', cleanErr.message || cleanErr);
      }

      return c.json({ 
        error: 'Profile creation failed', 
        message: 'Akun autentikasi dibuat, namun pembuatan profil gagal. ' + profileError.message 
      }, 500);
    }

    logger.info('✅ Account & profile created successfully for:', validated.email);

    return c.json({
      success: true,
      message: 'Registrasi berhasil! Silakan periksa email Anda jika konfirmasi email diaktifkan, atau langsung masuk.',
      user: {
        id: userId,
        email: validated.email,
        nama_lengkap: validated.nama_lengkap,
        nama_panggilan: validated.nama_panggilan,
        role: assignedRole
      }
    }, 201);

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0]?.message || 'Validasi masukan gagal';
      return c.json({ error: 'ValidationError', message: firstError }, 400);
    }

    logger.error('🔥 Registration unhandled error:', error);
    return c.json({ error: 'InternalServerError', message: error.message || 'Terjadi kesalahan internal server' }, 500);
  }
};

/**
 * Login Controller
 * POST /api/auth/login
 */
export const loginController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = loginSchema.parse(body);

    logger.info('🔐 Login request for email:', validated.email);

    // 1. Autentikasi dengan Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: validated.email,
      password: validated.password,
    });

    if (authError || !authData.user || !authData.session) {
      logger.warn('⚠️ Invalid login credentials for:', validated.email, authError?.message);
      
      let friendlyMessage = 'Email atau password salah. Periksa kembali kredensial Anda.';
      if (authError) {
        const errorMsgLower = authError.message.toLowerCase();
        if (errorMsgLower.includes('confirm') || errorMsgLower.includes('verif') || errorMsgLower.includes('not confirmed')) {
          friendlyMessage = 'Email belum dikonfirmasi. Silakan periksa inbox email Anda untuk memverifikasi akun sebelum masuk.';
        } else if (errorMsgLower.includes('invalid login credentials') || errorMsgLower.includes('invalid credentials')) {
          friendlyMessage = 'Email atau password salah. Periksa kembali kredensial Anda.';
        } else if (errorMsgLower.includes('too many requests')) {
          friendlyMessage = 'Terlalu banyak percobaan masuk yang gagal. Silakan coba lagi beberapa saat lagi.';
        } else {
          friendlyMessage = authError.message;
        }
      }

      return c.json({ 
        error: 'Login failed', 
        message: friendlyMessage 
      }, 401);
    }

    const userId = authData.user.id;

    // Inisialisasi client Supabase dengan kredensial user saat ini (untuk mematuhi kebijakan RLS)
    const userClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${authData.session.access_token}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );

    // 2. Ambil profil user dari database profiles menggunakan client system-level (supabaseAdmin)
    // untuk bypass RLS recursion
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      logger.error('❌ Error fetching user profile:', profileError);
      
      // Handle missing table error specifically (PGRST205)
      if (profileError.code === 'PGRST205') {
        return c.json({ 
          error: 'Database error', 
          message: 'Tabel "profiles" tidak ditemukan di database. Pastikan Anda telah menjalankan script database.sql di dashboard Supabase.' 
        }, 500);
      }
      
      return c.json({ error: 'Database error', message: 'Gagal mengambil data profil pengguna' }, 500);
    }

    // Jika profiles belum ada (misal akun dibuat langsung via dashboard Supabase), buat profil default otomatis
    let userRole = 'user';
    let userProfile = profile;

    if (!profile) {
      logger.warn(`⚠️ Profile for user ${userId} not found in database. Creating basic profile.`);
      
      const isKomunitasEmail = authData.user.email?.toLowerCase().endsWith('@komunitas.id');
      const defaultRole = isKomunitasEmail ? 'superadmin' : 'user';
      userRole = defaultRole;
      
      const { data: newProfile, error: createError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: userId,
          email: authData.user.email!,
          nama_lengkap: authData.user.user_metadata?.nama_lengkap || (isKomunitasEmail ? 'Superadmin KOMUNITAS' : 'Pengguna KOMUNITAS'),
          nama_panggilan: authData.user.user_metadata?.nama_panggilan || (isKomunitasEmail ? 'Superadmin' : 'User'),
          nomor_telepon: '+628000000000', // placeholder
          role: defaultRole,
        })
        .select()
        .single();
 
      if (createError) {
        logger.error('❌ Failed to create auto-profile:', createError);
        // Fallback profile in memory so login succeeds
        userProfile = {
          id: userId,
          email: authData.user.email!,
          nama_lengkap: isKomunitasEmail ? 'Superadmin KOMUNITAS' : 'Pengguna KOMUNITAS',
          nama_panggilan: isKomunitasEmail ? 'Superadmin' : 'User',
          nomor_telepon: '+628000000000',
          role: defaultRole,
        };
      } else {
        userProfile = newProfile;
        userRole = newProfile.role;
      }
    } else {
      userRole = profile.role;
      
      // Auto-heal: Jika email berakhiran @komunitas.id tetapi role-nya masih 'user', update otomatis ke 'superadmin'
      if (profile.email?.toLowerCase().endsWith('@komunitas.id')) {
        userRole = 'superadmin';
        if (userProfile) {
          userProfile.role = 'superadmin';
        }
        
        if (profile.role !== 'superadmin') {
          logger.info(`🔧 Auto-healing role to 'superadmin' for existing staff profile: ${profile.email}`);
          supabaseAdmin
            .from('profiles')
            .update({ role: 'superadmin' })
            .eq('id', userId)
            .then(({ error }) => {
              if (error) {
                logger.error('❌ Failed to auto-heal profile role in DB-async:', error);
              } else {
                logger.info('✅ Successfully auto-healed profile role in DB to superadmin');
              }
            });
        }
      }
    }

    logger.info(`✅ Login successful for ${validated.email} with role [${userRole}]`);

    return c.json({
      success: true,
      message: 'Login berhasil!',
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at,
      },
      user: {
        id: userId,
        email: authData.user.email,
        nama_lengkap: userProfile?.nama_lengkap || 'Pengguna KOMUNITAS',
        nama_panggilan: userProfile?.nama_panggilan || 'User',
        nomor_telepon: userProfile?.nomor_telepon || '',
        tanggal_lahir: userProfile?.tanggal_lahir || '',
        role: userRole,
      }
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0]?.message || 'Format login salah';
      return c.json({ error: 'ValidationError', message: firstError }, 400);
    }

    logger.error('🔥 Login unhandled error:', error);
    return c.json({ error: 'InternalServerError', message: error.message || 'Terjadi kesalahan internal server' }, 500);
  }
};

/**
 * Me Controller (Ambil data user saat ini berdasarkan JWT)
 * GET /api/auth/me
 */
export const meController = async (c: Context) => {
  try {
    const user = c.get('user');
    const profile = c.get('profile');

    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Sesi tidak aktif atau tidak valid' }, 401);
    }

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nama_lengkap: profile?.nama_lengkap || 'Pengguna KOMUNITAS',
        nama_panggilan: profile?.nama_panggilan || 'User',
        nomor_telepon: profile?.nomor_telepon || '',
        tanggal_lahir: profile?.tanggal_lahir || '',
        role: profile?.role || 'user',
      }
    });
  } catch (error: any) {
    logger.error('🔥 Get current user error:', error);
    return c.json({ error: 'InternalServerError', message: error.message || 'Gagal mengambil informasi sesi' }, 500);
  }
};

export const createStaffSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(8, 'Password minimal harus 8 karakter'),
  nama_lengkap: z.string().min(1, 'Nama lengkap wajib diisi sesuai KTP'),
  nama_panggilan: z.string().min(1, 'Nama panggilan wajib diisi'),
  tanggal_lahir: z.string().optional(),
  nomor_telepon: z.string().optional(),
  no_telepon: z.string().optional(),
  no_hp: z.string().optional(),
  role: z.enum(['admin', 'petugas', 'superadmin'], { message: 'Peran harus berupa admin, petugas atau superadmin' }),
});

/**
 * Create Staff User Controller
 * POST /api/admin/create-user
 * Khusus untuk Admin & Superadmin membuat akun staf baru (Admin/Petugas Pelayanan)
 */
export const createStaffUserController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const validated = createStaffSchema.parse(body);

    logger.info(`👤 Staff creation request by Admin. New user: ${validated.email} with role [${validated.role}]`);

    // 1. Process phone number to satisfy NOT NULL constraints
    let rawPhone = validated.nomor_telepon || validated.no_telepon || validated.no_hp || '';
    let resolvedPhone = '+628000000000'; // Default fallback

    if (rawPhone.trim()) {
      let cleaned = rawPhone.replace(/\D/g, ''); // Remove non-digits
      if (cleaned.startsWith('0')) {
        resolvedPhone = '+62' + cleaned.slice(1);
      } else if (cleaned.startsWith('62')) {
        resolvedPhone = '+' + cleaned;
      } else {
        resolvedPhone = '+62' + cleaned;
      }
    }

    // 2. Daftar ke Supabase Auth menggunakan admin client (bypass confirmation)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: validated.email,
      password: validated.password,
      email_confirm: true, // Auto-confirm email so they can log in immediately!
      user_metadata: {
        role: validated.role,
        nama_lengkap: validated.nama_lengkap,
      }
    });

    if (authError || !authData.user) {
      logger.error('❌ Supabase Auth admin registration error for staff:', authError);
      return c.json({ 
        error: 'Staff creation failed', 
        message: authError?.message || 'Gagal mendaftarkan staf di sistem autentikasi' 
      }, 400);
    }

    const userId = authData.user.id;

    // 3. Masukkan profil tambahan ke tabel profiles (menggunakan system-level client 'supabaseAdmin' untuk bypass RLS)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        email: validated.email,
        nama_lengkap: validated.nama_lengkap,
        nama_panggilan: validated.nama_panggilan,
        tanggal_lahir: validated.tanggal_lahir || null,
        nomor_telepon: resolvedPhone,
        role: validated.role,
      });

    if (profileError) {
      logger.error('❌ Profiles table insertion error for staff:', profileError);
      // Clean up the created auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return c.json({ 
        error: 'Profile creation failed', 
        message: 'Akun staf dibuat, namun pengisian profil database gagal: ' + profileError.message 
      }, 500);
    }

    logger.info('✅ Staff account & profile created successfully:', validated.email);

    return c.json({
      success: true,
      message: `Akun staf baru dengan peran "${validated.role}" berhasil dibuat!`,
      user: {
        id: userId,
        email: validated.email,
        nama_lengkap: validated.nama_lengkap,
        nama_panggilan: validated.nama_panggilan,
        role: validated.role
      }
    }, 201);

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0]?.message || 'Validasi staf gagal';
      return c.json({ error: 'ValidationError', message: firstError }, 400);
    }

    logger.error('🔥 Staff creation unhandled error:', error);
    return c.json({ error: 'InternalServerError', message: error.message || 'Terjadi kesalahan internal server' }, 500);
  }
};


/**
 * Get Staff Users Controller - Mengambil daftar akun staf (admin/petugas/superadmin)
 * GET /api/admin/staff
 */
export const getStaffUsersController = async (c: Context) => {
  try {
    logger.info('👥 Admin: Get staff users list');
    const { data: staffList, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .in('role', ['superadmin', 'admin', 'petugas'])
      .order('nama_lengkap', { ascending: true });

    if (error) throw error;

    return c.json({
      success: true,
      data: staffList || [],
    });
  } catch (error: any) {
    logger.error('❌ Get staff users list error:', error);
    return c.json({ error: 'Gagal mengambil daftar staf', message: error.message }, 500);
  }
};

const updateProfileSchema = z.object({
  nama_panggilan: z.string().min(1, 'Nama panggilan tidak boleh kosong').optional(),
  nomor_telepon: z.string().regex(/^\+62\d{10,13}$/, 'Format nomor telepon harus diawali dengan +62 dan diikuti 10-13 digit angka').optional(),
});

/**
 * Update Profile Controller
 * PATCH /api/auth/profile
 */
export const updateProfileController = async (c: Context) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Sesi tidak aktif atau tidak valid' }, 401);
    }

    const body = await c.req.json();
    const validated = updateProfileSchema.parse(body);

    logger.info('👤 Profile update request for user:', user.id);

    const updateData: any = {};
    if (validated.nama_panggilan !== undefined) {
      updateData.nama_panggilan = validated.nama_panggilan;
    }
    if (validated.nomor_telepon !== undefined) {
      updateData.nomor_telepon = validated.nomor_telepon;
    }

    if (Object.keys(updateData).length === 0) {
      return c.json({ error: 'BadRequest', message: 'Tidak ada data profil yang diupdate' }, 400);
    }

    // Update in profiles table using supabaseAdmin to bypass direct edit policies or restrict updates safely
    const { data: updatedProfile, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      logger.error('❌ Failed to update profile in DB:', error);
      return c.json({ error: 'DatabaseError', message: 'Gagal memperbarui data profil: ' + error.message }, 500);
    }

    logger.info('✅ Profile updated successfully for user:', user.id);

    return c.json({
      success: true,
      message: 'Profil berhasil diperbarui',
      profile: updatedProfile,
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0]?.message || 'Validasi pembaruan gagal';
      return c.json({ error: 'ValidationError', message: firstError }, 400);
    }

    logger.error('🔥 Profile update unhandled error:', error);
    return c.json({ error: 'InternalServerError', message: error.message || 'Terjadi kesalahan internal server' }, 500);
  }
};

