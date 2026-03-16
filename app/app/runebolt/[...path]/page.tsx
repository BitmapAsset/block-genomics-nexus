import { redirect } from 'next/navigation';

/**
 * RuneBolt Redirect Handler
 * Redirects all /runebolt/* routes to the RuneBolt subdomain
 */
export default async function RuneBoltPage() {
  redirect('https://runebolt.blockgenomics.io');
}
