import { SecuritySettings } from '@/components/security-settings';

// Kept for non-coach roles and old bookmarks; coaches reach the same settings
// from the "Sicurezza" tab in the coach area (/dashboard/coach/security).
export default function SecurityPage() {
  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium text-gray-900 mb-6">
        Security Settings
      </h1>
      <SecuritySettings />
    </section>
  );
}
