import AdPlaceholder from './AdPlaceholder';

interface Props {
  title: string;
  description: string;
  children: React.ReactNode;
}

export default function ToolLayout({ title, description, children }: Props) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="flex-1 max-w-4xl mx-auto px-4 py-8 w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">{title}</h1>
          <p className="text-slate-600 dark:text-slate-400">{description}</p>
        </div>
        {/* AdSense */}
        <AdPlaceholder className="mb-6" />
        {children}
      </div>
      <aside className="hidden lg:block w-64 p-4 space-y-4 shrink-0">
        {/* AdSense */}
        <AdPlaceholder className="sticky top-20" />
      </aside>
    </div>
  );
}
