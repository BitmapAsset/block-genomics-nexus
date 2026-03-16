/**
 * GET /api/v1/lightning/status/[invoiceId] — Check payment status
 * 
 * Returns: { paid: boolean, state: string }
 */
import { NextResponse } from 'next/server';
import { checkInvoiceStatus } from '@/lib/lightning';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const { invoiceId } = await params;
    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 });
    }

    const result = await checkInvoiceStatus(invoiceId);
    return NextResponse.json(result);
  } catch (e: unknown) {
    console.error('[Lightning status error]', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: 'Failed to check payment status' },
      { status: 500 }
    );
  }
}
