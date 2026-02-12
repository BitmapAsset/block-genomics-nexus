import { redirect } from 'next/navigation';

export default async function BlockPage({ params }: { params: Promise<{ height: string }> }) {
  const { height } = await params;
  redirect(`/nexus?block=${height}`);
}
