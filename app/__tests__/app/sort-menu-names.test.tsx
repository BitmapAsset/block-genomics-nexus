/** @jest-environment jsdom */
/**
 * The sort menus on /rentals and /directory have a name that says what they do, so a screen reader announces
 * "Sort listings" / "Sort agents" instead of an unnamed menu. Both pages render with an empty list (fetch answers
 * with no rows); the menu is there before any data arrives.
 */
import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// The wallet context pulls in the wallet SDKs (ESM); the pages only need the hook.
jest.mock('@/context/GlobalWalletContext', () => ({ useGlobalWallet: () => ({ isConnected: false, walletAddress: null }) }));
jest.mock('@/components/BitmapBlocksBg', () => () => null);
jest.mock('@/components/BitmapThumbnail', () => () => null);
jest.mock('@/components/LightningPayModal', () => () => null);
jest.mock('@/components/CrownShield', () => () => null);

import RentalsPage from '@/app/(site)/rentals/page';
import DirectoryPage from '@/app/(site)/directory/page';

beforeEach(() => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ data: { listings: [], users: [], total: 0 } }),
  })) as unknown as typeof fetch;
});

describe('sort menus have a name', () => {
  it('/rentals: the sort menu is named "Sort listings" and keeps its three orders', async () => {
    render(<RentalsPage />);
    const menu = screen.getByRole('combobox', { name: 'Sort listings' });
    expect(Array.from((menu as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['Newest', 'Cheapest', 'Most Popular']);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it('/directory: the sort menu is named "Sort agents" and keeps its three orders', async () => {
    render(<DirectoryPage />);
    const menu = screen.getByRole('combobox', { name: 'Sort agents' });
    expect(Array.from((menu as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['Sort: Name', 'Sort: Block #', 'Sort: Newest']);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });
});
