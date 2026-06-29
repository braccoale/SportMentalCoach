import { eq } from 'drizzle-orm';
import { stripe } from '../payments/stripe';
import { db } from './drizzle';
import {
  users,
  teams,
  teamMembers,
  roles,
  profiles,
  userRoles,
  providerProfiles,
  services,
  coachAvailability,
} from './schema';
import { hashPassword } from '@/lib/auth/session';
import { BILLING_ENABLED } from '@/lib/core/flags';

// Basic marketplace roles (Phase 1). Catalog is seeded, not user-editable.
const BASE_ROLES: { key: string; label: string }[] = [
  { key: 'athlete', label: 'Athlete' },
  { key: 'coach', label: 'Coach' },
  { key: 'club', label: 'Club' },
  { key: 'admin', label: 'Admin' },
];

async function seedRoles() {
  await db.insert(roles).values(BASE_ROLES).onConflictDoNothing();
  console.log('Roles seeded:', BASE_ROLES.map((r) => r.key).join(', '));
}

// Admin account for the approval queue (local/dev). Idempotent by email.
async function seedAdmin() {
  const email = 'admin@kaipai.com';
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    await db
      .insert(userRoles)
      .values({ userId: existing.id, roleKey: 'admin' })
      .onConflictDoNothing();
    console.log(`Admin ${email} already exists, ensured admin role.`);
    return;
  }

  const passwordHash = await hashPassword('admin1234');
  const [user] = await db
    .insert(users)
    .values({ name: 'Kai Pai Admin', email, passwordHash, role: 'owner' })
    .returning();
  await db
    .insert(profiles)
    .values({ userId: user.id, displayName: 'Kai Pai Admin' });
  await db.insert(userRoles).values({ userId: user.id, roleKey: 'admin' });
  console.log(`Admin seeded: ${email} (password: admin1234)`);
}

// --- Demo data: 3 approved coaches for local/dev testing of /coaches -------
// Taxonomy keys must match lib/verticals/sport-mental-coach/taxonomies.ts.
type DemoCoach = {
  email: string;
  displayName: string;
  slug: string;
  headline: string;
  description: string;
  avatarUrl: string;
  certified: boolean;
  status?: 'draft' | 'pending' | 'approved' | 'rejected';
  categories: string[];
  specialties: string[];
  hourlyRate: number; // cents
  services: { title: string; description: string; durationMin: number; price: number }[];
};

const DEMO_COACHES: DemoCoach[] = [
  {
    email: 'marco.rossi@demo.smc',
    displayName: 'Marco Rossi',
    slug: 'marco-rossi',
    headline: 'Mental coach per atleti di squadra e individuali',
    description:
      'Aiuto gli atleti a gestire l’ansia da prestazione e a ritrovare lucidità nei momenti decisivi.',
    avatarUrl: 'https://i.pravatar.cc/300?img=12',
    certified: true,
    categories: ['football', 'tennis'],
    specialties: ['performance_anxiety', 'focus_concentration', 'pre_competition_routine'],
    hourlyRate: 6000,
    services: [
      {
        title: 'Sessione individuale',
        description: 'Un’ora di lavoro mirato su obiettivi e gestione dello stress.',
        durationMin: 60,
        price: 6000,
      },
      {
        title: 'Percorso pre-gara',
        description: 'Costruzione di una routine mentale per il giorno della competizione.',
        durationMin: 45,
        price: 5000,
      },
    ],
  },
  {
    email: 'giulia.bianchi@demo.smc',
    displayName: 'Giulia Bianchi',
    slug: 'giulia-bianchi',
    headline: 'Motivazione e resilienza per sport individuali',
    description:
      'Specializzata in nuoto e atletica: lavoro su motivazione, obiettivi e recupero dagli ostacoli.',
    avatarUrl: 'https://i.pravatar.cc/300?img=5',
    certified: true,
    categories: ['swimming', 'athletics'],
    specialties: ['motivation', 'goal_setting', 'resilience'],
    hourlyRate: 7000,
    services: [
      {
        title: 'Sessione di motivazione',
        description: 'Definizione di obiettivi misurabili e piano di azione.',
        durationMin: 60,
        price: 7000,
      },
    ],
  },
  {
    email: 'luca.verdi@demo.smc',
    displayName: 'Luca Verdi',
    slug: 'luca-verdi',
    headline: 'Dinamiche di squadra e fiducia per sport di gruppo',
    description:
      'Lavoro con squadre di basket e pallavolo su coesione, comunicazione e fiducia individuale.',
    avatarUrl: 'https://i.pravatar.cc/300?img=13',
    certified: false,
    categories: ['basketball', 'volleyball'],
    specialties: ['team_dynamics', 'confidence'],
    hourlyRate: 5500,
    services: [
      {
        title: 'Sessione di squadra',
        description: 'Lavoro di gruppo su ruoli, comunicazione e coesione.',
        durationMin: 90,
        price: 9000,
      },
      {
        title: 'Colloquio individuale',
        description: 'Rafforzamento della fiducia e gestione della pressione.',
        durationMin: 60,
        price: 5500,
      },
    ],
  },
  {
    email: 'sara.neri@demo.smc',
    displayName: 'Sara Neri',
    slug: 'sara-neri',
    headline: 'In attesa di approvazione — demo coda admin',
    description:
      'Profilo demo in stato "pending" per testare la coda di revisione admin.',
    avatarUrl: 'https://i.pravatar.cc/300?img=32',
    certified: false,
    status: 'pending',
    categories: ['tennis', 'golf'],
    specialties: ['focus_concentration', 'confidence'],
    hourlyRate: 6500,
    services: [
      {
        title: 'Sessione individuale',
        description: 'Lavoro su concentrazione e fiducia.',
        durationMin: 60,
        price: 6500,
      },
    ],
  },
];

async function seedDemoCoaches() {
  const passwordHash = await hashPassword('demo1234');

  for (const demo of DEMO_COACHES) {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, demo.email),
    });
    if (existing) {
      // Keep idempotent, but sync the visual fields onto existing rows so
      // re-seeding applies new avatars / certification flags.
      await db
        .update(profiles)
        .set({ avatarUrl: demo.avatarUrl })
        .where(eq(profiles.userId, existing.id));
      await db
        .update(providerProfiles)
        .set({ isKaipaiCertified: demo.certified })
        .where(eq(providerProfiles.userId, existing.id));
      console.log(`Demo coach ${demo.email} exists — synced photo & certification.`);
      continue;
    }

    const [user] = await db
      .insert(users)
      .values({ name: demo.displayName, email: demo.email, passwordHash, role: 'member' })
      .returning();

    await db.insert(profiles).values({
      userId: user.id,
      displayName: demo.displayName,
      bio: demo.description,
      avatarUrl: demo.avatarUrl,
    });

    await db.insert(userRoles).values({ userId: user.id, roleKey: 'coach' });

    const [provider] = await db
      .insert(providerProfiles)
      .values({
        userId: user.id,
        slug: demo.slug,
        headline: demo.headline,
        description: demo.description,
        categories: demo.categories,
        specialties: demo.specialties,
        hourlyRate: demo.hourlyRate,
        status: demo.status ?? 'approved',
        isKaipaiCertified: demo.certified,
      })
      .returning();

    await db.insert(services).values(
      demo.services.map((s) => ({
        providerId: provider.id,
        title: s.title,
        description: s.description,
        durationMin: s.durationMin,
        price: s.price,
      }))
    );

    console.log(`Demo coach seeded: ${demo.displayName} (/coaches/${demo.slug})`);
  }
}

async function createStripeProducts() {
  console.log('Creating Stripe products and prices...');

  const baseProduct = await stripe.products.create({
    name: 'Base',
    description: 'Base subscription plan',
  });

  await stripe.prices.create({
    product: baseProduct.id,
    unit_amount: 800, // $8 in cents
    currency: 'usd',
    recurring: {
      interval: 'month',
      trial_period_days: 7,
    },
  });

  const plusProduct = await stripe.products.create({
    name: 'Plus',
    description: 'Plus subscription plan',
  });

  await stripe.prices.create({
    product: plusProduct.id,
    unit_amount: 1200, // $12 in cents
    currency: 'usd',
    recurring: {
      interval: 'month',
      trial_period_days: 7,
    },
  });

  console.log('Stripe products and prices created successfully.');
}

// Weekly availability for the demo coaches (idempotent via the unique index).
async function seedDemoAvailability() {
  const slots = [
    { weekday: 1, startMinute: 1020, endMinute: 1200 }, // Lun 17:00–20:00
    { weekday: 3, startMinute: 1020, endMinute: 1200 }, // Mer 17:00–20:00
    { weekday: 6, startMinute: 600, endMinute: 780 }, // Sab 10:00–13:00
  ];
  for (const demo of DEMO_COACHES) {
    const [provider] = await db
      .select({ id: providerProfiles.id })
      .from(providerProfiles)
      .where(eq(providerProfiles.slug, demo.slug))
      .limit(1);
    if (!provider) continue;
    await db
      .insert(coachAvailability)
      .values(slots.map((s) => ({ providerId: provider.id, ...s })))
      .onConflictDoNothing();
  }
  console.log('Demo availability seeded.');
}

async function seed() {
  await seedRoles();

  const email = 'test@test.com';
  const password = 'admin123';

  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existingUser) {
    console.log(`User ${email} already exists, skipping user/team seed.`);
  } else {
    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(users)
      .values([
        {
          email: email,
          passwordHash: passwordHash,
          role: 'owner',
        },
      ])
      .returning();

    console.log('Initial user created.');

    const [team] = await db
      .insert(teams)
      .values({
        name: 'Test Team',
      })
      .returning();

    await db.insert(teamMembers).values({
      teamId: team.id,
      userId: user.id,
      role: 'owner',
    });
  }

  await seedAdmin();
  await seedDemoCoaches();
  await seedDemoAvailability();

  if (BILLING_ENABLED) {
    await createStripeProducts();
  } else {
    console.log('Skipping Stripe seed (BILLING_ENABLED=false).');
  }
}

seed()
  .catch((error) => {
    console.error('Seed process failed:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('Seed process finished. Exiting...');
    process.exit(0);
  });
