/**
 * @jest-environment jsdom
 */

/**
 * The wallet library loads on first use. Opening the connect dialog starts that
 * load, so the first click on a wallet does not wait for it; the header button
 * alone, and the account menu of a connected wallet, start nothing.
 */
const mockPreload = jest.fn(() => Promise.resolve({}));
const mockClearError = jest.fn();
let mockConnected = false;

jest.mock('@/lib/wallet-utils', () => ({ preloadWalletLibrary: () => mockPreload() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
jest.mock('@/context/GlobalWalletContext', () => ({
  useGlobalWallet: () => ({
    isConnected: mockConnected,
    isConnecting: false,
    walletAddress: mockConnected ? 'bc1pconnectdialog000000000000000000000000000000000000000000000' : null,
    walletType: mockConnected ? 'unisat' : null,
    profile: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    availableWallets: [],
    error: null,
    clearError: mockClearError,
  }),
}));

import { act, fireEvent, render, screen } from '@testing-library/react';
import WalletConnect from '@/components/auth/WalletConnect';

beforeEach(() => {
  mockPreload.mockClear();
  mockConnected = false;
});

describe('connect dialog starts the wallet library load', () => {
  it('rendering the header button loads nothing', () => {
    render(<WalletConnect />);
    expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy();
    expect(mockPreload).not.toHaveBeenCalled();
  });

  it('opening the dialog from the header button calls preloadWalletLibrary', () => {
    render(<WalletConnect />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByText('Connect Wallet')).toBeTruthy();
    expect(mockPreload).toHaveBeenCalledTimes(1);
  });

  it('opening the dialog from elsewhere (open-wallet-modal) calls preloadWalletLibrary', () => {
    render(<WalletConnect />);
    act(() => { window.dispatchEvent(new CustomEvent('open-wallet-modal', { detail: { next: '/my-bitmaps' } })); });
    expect(screen.getByText('Connect Wallet')).toBeTruthy();
    expect(mockPreload).toHaveBeenCalledTimes(1);
  });

  it('the account menu of a connected wallet does not call it', () => {
    mockConnected = true;
    render(<WalletConnect />);
    fireEvent.click(screen.getByRole('button', { name: /bc1p/ }));
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(mockPreload).not.toHaveBeenCalled();
  });
});
