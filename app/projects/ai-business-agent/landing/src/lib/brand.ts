export const brand = {
  name: 'Naxora',
  tagline: 'Your business, autonomously.',
  description: 'The autonomous AI brain that runs your business — calls, messages, bookings, support — 24/7.',
  domain: 'naxora.ai',

  colors: {
    cyan: '#00CFFF',
    purple: '#8B5CF6',
    black: '#000000',
    darkBg: '#0A0A0B',
    darkCard: '#111113',
    darkBorder: '#1C1C1F',
    white: '#FFFFFF',
    grey100: '#F4F4F5',
    grey400: '#A1A1AA',
    grey600: '#52525B',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
  },

  gradients: {
    primary: 'linear-gradient(135deg, #00CFFF 0%, #8B5CF6 100%)',
    primaryHover: 'linear-gradient(135deg, #00E5FF 0%, #A78BFA 100%)',
    subtle: 'linear-gradient(135deg, rgba(0,207,255,0.1) 0%, rgba(139,92,246,0.1) 100%)',
    text: 'linear-gradient(135deg, #00CFFF 0%, #8B5CF6 100%)',
  },

  fonts: {
    heading: "'Satoshi', 'Inter', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
} as const;
