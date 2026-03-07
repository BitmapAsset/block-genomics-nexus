export interface Tool {
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  category: 'core' | 'ai';
}

export const tools: Tool[] = [
  { name: 'Merge PDF', slug: 'merge', description: 'Combine multiple PDFs into one file', icon: '📎', color: 'from-blue-500 to-blue-600', category: 'core' },
  { name: 'Split PDF', slug: 'split', description: 'Extract pages or split into chunks', icon: '✂️', color: 'from-orange-500 to-orange-600', category: 'core' },
  { name: 'Compress PDF', slug: 'compress', description: 'Reduce PDF file size', icon: '🗜️', color: 'from-green-500 to-green-600', category: 'core' },
  { name: 'PDF to Image', slug: 'pdf-to-image', description: 'Convert PDF pages to JPG or PNG', icon: '🖼️', color: 'from-purple-500 to-purple-600', category: 'core' },
  { name: 'Image to PDF', slug: 'image-to-pdf', description: 'Convert images to a PDF document', icon: '📄', color: 'from-pink-500 to-pink-600', category: 'core' },
  { name: 'Rotate PDF', slug: 'rotate', description: 'Rotate PDF pages to any angle', icon: '🔄', color: 'from-teal-500 to-teal-600', category: 'core' },
  { name: 'Page Numbers', slug: 'page-numbers', description: 'Add page numbers to your PDF', icon: '🔢', color: 'from-amber-500 to-amber-600', category: 'core' },
  { name: 'Watermark', slug: 'watermark', description: 'Add text or image watermark', icon: '💧', color: 'from-cyan-500 to-cyan-600', category: 'core' },
  { name: 'AI Summarize', slug: 'ai-summarize', description: 'Get an AI-powered summary of any PDF', icon: '🤖', color: 'from-indigo-500 to-violet-600', category: 'ai' },
  { name: 'Ask Your PDF', slug: 'ask-pdf', description: 'Chat with your PDF using AI', icon: '💬', color: 'from-violet-500 to-purple-600', category: 'ai' },
];
