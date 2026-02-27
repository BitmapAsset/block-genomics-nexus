import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'avatars');

function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/**
 * POST /api/v1/profiles/avatar
 * Upload avatar image. Accepts multipart form data.
 * Fields: walletAddress (required), file (required), blockHeight (optional — if set, updates BlockProfile)
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const walletAddress = formData.get('walletAddress') as string | null;
    const file = formData.get('file') as File | null;
    const blockHeightStr = formData.get('blockHeight') as string | null;

    if (!walletAddress) return err('walletAddress is required');
    if (!file) return err('file is required');

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return err(`Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`);
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      return err('File too large. Maximum 2MB.');
    }

    // Check user exists
    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user) return err('User not found', 404);

    // Generate filename from wallet hash
    const hash = crypto.createHash('sha256').update(walletAddress).digest('hex').slice(0, 16);
    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    const filename = `${hash}-${Date.now()}.${ext}`;

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    // Delete old avatar file if it exists and is a local file
    if (user.avatar?.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(process.cwd(), 'public', user.avatar);
      try { await unlink(oldPath); } catch { /* ignore */ }
    }

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(UPLOAD_DIR, filename);
    await writeFile(filePath, buffer);

    const avatarUrl = `/uploads/avatars/${filename}`;

    // Update User avatar
    await prisma.user.update({
      where: { walletAddress },
      data: { avatar: avatarUrl },
    });

    // Also update BlockProfile if blockHeight specified
    if (blockHeightStr) {
      const blockHeight = parseInt(blockHeightStr, 10);
      if (!isNaN(blockHeight)) {
        await prisma.blockProfile.updateMany({
          where: { walletAddress, blockHeight },
          data: { avatar: avatarUrl },
        });
      }
    }

    // Update all BlockProfiles for this wallet (sync avatar across all)
    await prisma.blockProfile.updateMany({
      where: { walletAddress },
      data: { avatar: avatarUrl },
    });

    return NextResponse.json({ success: true, data: { avatarUrl } });
  } catch (e: any) {
    console.error('Avatar upload error:', e);
    return err(e.message || 'Failed to upload avatar', 500);
  }
}

/**
 * DELETE /api/v1/profiles/avatar
 * Remove avatar, revert to default.
 * Body: { walletAddress }
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress } = body;

    if (!walletAddress) return err('walletAddress is required');

    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user) return err('User not found', 404);

    // Delete old file
    if (user.avatar?.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(process.cwd(), 'public', user.avatar);
      try { await unlink(oldPath); } catch { /* ignore */ }
    }

    // Clear avatar on User and all BlockProfiles
    await prisma.user.update({
      where: { walletAddress },
      data: { avatar: null },
    });
    await prisma.blockProfile.updateMany({
      where: { walletAddress },
      data: { avatar: null },
    });

    return NextResponse.json({ success: true, data: { avatarUrl: null } });
  } catch (e: any) {
    console.error('Avatar delete error:', e);
    return err(e.message || 'Failed to delete avatar', 500);
  }
}
