/**
 * @jest-environment jsdom
 */

/**
 * The agent page signs a profile edit on the agent's own handle, the one the
 * API returned, not on the address-bar text. A page reached through a
 * percent-encoded address (`/agent/pepe%5Fbot`) used to sign the encoded text,
 * which the route (bound to the decoded handle) refused with a 401.
 *
 * Real page component; mocked seams: the router params, the wallet context,
 * the signed fetch, the page's fetches, and the visual islands.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const WALLET = 'bc1pagentowner000000000000000000000000000000000000000000000000';

jest.mock('next/navigation', () => ({ useParams: () => ({ handle: 'pepe%5Fbot' }) }));
jest.mock('next/link', () => ({ __esModule: true, default: (p: { children: React.ReactNode }) => <a>{p.children}</a> }));
jest.mock('next/dynamic', () => ({ __esModule: true, default: () => () => null }));
jest.mock('@/components/CrownShield', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/BitmapBlocksBg', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/WebGLErrorBoundary', () => ({ __esModule: true, default: () => null }));
jest.mock('@/hooks/useRealtimeChat', () => ({ useRealtimeChat: () => undefined, usePresence: () => ({}) }));
jest.mock('@/lib/lightning-pay-flag', () => ({ LIGHTNING_PAY_ENABLED: false }));

const mockWallet = {
  isConnected: true,
  walletAddress: 'bc1pagentowner000000000000000000000000000000000000000000000000',
  signMessage: jest.fn(async () => 'sig'),
  profile: null,
  e2eReady: false,
  e2eEncrypt: jest.fn(),
  e2eDecrypt: jest.fn(),
};
jest.mock('@/context/GlobalWalletContext', () => ({ useGlobalWallet: () => mockWallet }));

const mockSignedActionFetch = jest.fn();
jest.mock('@/lib/signed-fetch', () => ({
  signedActionFetch: (...a: unknown[]) => mockSignedActionFetch(...a),
}));

import AgentProfilePage from '@/app/(site)/agent/[handle]/agent-profile-client';

const realFetch = global.fetch;

beforeEach(() => {
  localStorage.setItem('bg_wallet', JSON.stringify({ address: WALLET }));
  mockSignedActionFetch.mockReset();
  mockSignedActionFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ data: { displayName: 'Renamed Agent', bio: '' } }),
  });
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/v1/users/by-handle/')) {
      return {
        ok: true,
        json: async () => ({
          data: { handle: 'pepe_bot', displayName: 'Pepe Bot', walletAddress: WALLET, anchorBlock: 840000, bio: '' },
        }),
      } as Response;
    }
    return { ok: true, json: async () => ({ guardians: [], data: [] }) } as Response;
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = realFetch;
  localStorage.clear();
});

it('a profile edit on a page reached through an encoded address signs the agent\'s own handle path', async () => {
  render(<AgentProfilePage />);
  await screen.findAllByText('Pepe Bot');
  fireEvent.click(screen.getAllByTitle('Edit')[0]);
  const input = screen.getByDisplayValue('Pepe Bot');
  fireEvent.change(input, { target: { value: 'Renamed Agent' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(mockSignedActionFetch).toHaveBeenCalledTimes(1));
  expect(mockSignedActionFetch.mock.calls[0][0]).toMatchObject({
    method: 'PATCH',
    path: '/api/v1/users/by-handle/pepe_bot',
    action: 'user.update',
    purpose: 'profile',
    address: WALLET,
    body: { displayName: 'Renamed Agent', walletAddress: WALLET },
  });
});
