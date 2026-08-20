/**
 * Tests for the SSRF-safe health probe. Mocks global fetch + dns.lookup so the
 * probe's DNS guard, manual redirect guard, and status mapping are exercised
 * without any real network I/O.
 */

jest.mock('dns/promises', () => {
  const lookup = jest.fn();
  return { __esModule: true, default: { lookup }, lookup };
});

import dns from 'dns/promises';
import { probeExperienceUrl } from '@/lib/experience-probe';

const lookupMock = (dns as unknown as { lookup: jest.Mock }).lookup;
const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function resp(status: number, headers: Record<string, string> = {}): Response {
  return {
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  lookupMock.mockReset();
  lookupMock.mockResolvedValue([{ address: '93.184.216.34' }]); // public by default
});

describe('probeExperienceUrl', () => {
  it('reachable + fast + 2xx → live', async () => {
    fetchMock.mockResolvedValue(resp(200));
    const r = await probeExperienceUrl('https://world.example.com/health');
    expect(r.status).toBe('live');
    expect(r.reachable).toBe(true);
    expect(r.httpStatus).toBe(200);
  });

  it('5xx response → degraded (server up but erroring)', async () => {
    fetchMock.mockResolvedValue(resp(503));
    const r = await probeExperienceUrl('https://world.example.com/health');
    expect(r.status).toBe('degraded');
    expect(r.reachable).toBe(true);
  });

  it('wss:// health target is probed over https://', async () => {
    fetchMock.mockResolvedValue(resp(200));
    await probeExperienceUrl('wss://world.example.com/socket');
    const calledUrl = fetchMock.mock.calls[0][0] as URL;
    expect(calledUrl.protocol).toBe('https:');
    expect(calledUrl.hostname).toBe('world.example.com');
  });

  it('hostname that resolves to a private IP → unreachable, never fetched', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.5' }]);
    const r = await probeExperienceUrl('https://internal.example.com');
    expect(r.status).toBe('unreachable');
    expect(r.reason).toMatch(/private/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redirect that downgrades to http is blocked → unreachable', async () => {
    fetchMock.mockResolvedValueOnce(resp(301, { location: 'http://world.example.com/downgrade' }));
    const r = await probeExperienceUrl('https://world.example.com/health');
    expect(r.status).toBe('unreachable');
    expect(r.reason).toMatch(/blocked hop/);
  });

  it('redirect to a private IP literal is blocked → unreachable', async () => {
    fetchMock.mockResolvedValueOnce(resp(302, { location: 'https://169.254.169.254/latest/meta-data' }));
    const r = await probeExperienceUrl('https://world.example.com/health');
    expect(r.status).toBe('unreachable');
    expect(r.reason).toMatch(/blocked hop/);
  });

  it('follows one safe redirect to a public host then maps status', async () => {
    fetchMock
      .mockResolvedValueOnce(resp(302, { location: 'https://cdn.example.com/health' }))
      .mockResolvedValueOnce(resp(200));
    const r = await probeExperienceUrl('https://world.example.com/health');
    expect(r.status).toBe('live');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('connection failure (HEAD + GET retry both throw) → unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const r = await probeExperienceUrl('https://world.example.com/health');
    expect(r.status).toBe('unreachable');
    expect(r.reason).toMatch(/connection failed/);
  });

  it('an unsafe input URL fails pre-flight without any fetch', async () => {
    const r = await probeExperienceUrl('http://127.0.0.1');
    expect(r.status).toBe('unreachable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
