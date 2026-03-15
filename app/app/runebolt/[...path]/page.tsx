import { redirect } from 'next/navigation';

/**
 * RuneBolt Redirect Handler
 * All /runebolt/* routes redirect to the dedicated RuneBolt subdomain
 */

export default async function RuneBoltPage({ 
  params 
}: { 
  params: Promise<{ path?: string[] }> 
}) {
  const { path } = await params;
  const subPath = path?.join('/') || '';
  const target = subPath 
    ? `https://runebolt.blockgenomics.io/${subPath}`
    : 'https://runebolt.blockgenomics.io';
  
  redirect(target);
}
