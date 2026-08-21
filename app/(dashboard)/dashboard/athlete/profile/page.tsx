import { requireRole } from '@/lib/core/auth';
import { getAvatarUrl, getClientProfile } from '@/lib/core/profiles';
import { AccountInfoCard } from '@/components/account-info-card';
import { PhotoForm } from '../../photo-form';
import { AthleteProfileEditor } from '../athlete-profile-editor';

export default async function AthleteProfilePage() {
  const user = await requireRole('athlete');
  const [avatarUrl, profile] = await Promise.all([
    getAvatarUrl(user.id),
    getClientProfile(user.id),
  ]);

  return (
    <section className="flex flex-col gap-6 p-6">
      <fieldset
        disabled={user.isDemo}
        data-demo-profile-readonly={user.isDemo ? 'true' : undefined}
        className="contents"
      >
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-600">
            Il tuo profilo
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
            Racconta chi sei come atleta.
          </h1>
          <p className="mt-3 text-base leading-7 text-gray-600">
            Foto, dati personali e profilo sportivo: aiutano i coach a capire il
            tuo momento e a prepararsi meglio alle sessioni.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <PhotoForm
            name={[user.name, user.lastName].filter(Boolean).join(' ') || null}
            avatarUrl={avatarUrl}
          />
          <AccountInfoCard />
        </div>

        <div className="max-w-2xl">
          <AthleteProfileEditor profile={profile} />
        </div>
      </fieldset>
    </section>
  );
}
