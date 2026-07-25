import { count, eq } from 'drizzle-orm';
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
  bookings,
  reviews,
} from './schema';
import { hashPassword } from '@/lib/auth/session';
import { BILLING_ENABLED } from '@/lib/core/flags';
import { createSupabaseAdmin } from '@/lib/auth/supabase';

let authUsersByEmail: Map<string, string> | null = null;

/**
 * Demo rows obey the same auth.users -> public.users relationship as real
 * signups. This keeps db:seed compatible with the NOT NULL cascading auth FK.
 */
async function ensureAuthIdentity(
  email: string,
  password: string,
  displayName?: string
): Promise<string> {
  const admin = createSupabaseAdmin();
  if (!authUsersByEmail) {
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw error;
    authUsersByEmail = new Map(
      data.users.map((user) => [user.email?.toLowerCase() ?? '', user.id])
    );
  }

  const key = email.toLowerCase();
  const existing = authUsersByEmail.get(key);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: displayName ? { display_name: displayName } : undefined,
  });
  if (error || !data.user) {
    throw error ?? new Error(`Impossibile creare l'identità Auth per ${email}`);
  }
  authUsersByEmail.set(key, data.user.id);
  return data.user.id;
}

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
  const authId = await ensureAuthIdentity(email, 'admin1234', 'KaiPai Admin');
  const [user] = await db
    .insert(users)
    .values({ authId, name: 'KaiPai Admin', email, passwordHash, role: 'owner' })
    .returning();
  await db
    .insert(profiles)
    .values({ userId: user.id, displayName: 'KaiPai Admin' });
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
  videoUrl?: string;
  yearsExperience?: number;
  languages?: string[];
  certifications?: string[];
  athleteLevels?: string[];
  identityVerified?: boolean;
  certificationsVerified?: boolean;
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
    avatarUrl: '/atleta.png',
    certified: true,
    videoUrl: 'https://www.youtube.com/watch?v=ScMzIvxBSi4',
    yearsExperience: 8,
    languages: ['Italiano', 'Inglese'],
    certifications: ['Albo Psicologi', 'Mental Coach certificato'],
    athleteLevels: ['youth', 'semi_pro', 'pro'],
    identityVerified: true,
    certificationsVerified: true,
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
    avatarUrl: '/atleta.png',
    certified: true,
    videoUrl: 'https://www.youtube.com/watch?v=ScMzIvxBSi4',
    yearsExperience: 6,
    languages: ['Italiano'],
    certifications: ['Coach federale FIN'],
    athleteLevels: ['amateur', 'pro'],
    identityVerified: true,
    certificationsVerified: true,
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
    avatarUrl: '/atleta.png',
    certified: false,
    yearsExperience: 10,
    languages: ['Italiano', 'Spagnolo'],
    certifications: ['UEFA Mental Skills'],
    athleteLevels: ['youth', 'pro'],
    identityVerified: true,
    certificationsVerified: false,
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
    avatarUrl: '/atleta.png',
    certified: false,
    status: 'pending',
    yearsExperience: 4,
    languages: ['Italiano', 'Inglese'],
    athleteLevels: ['amateur', 'youth'],
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
        .set({
          isKaipaiCertified: demo.certified,
          videoUrl: demo.videoUrl ?? null,
          yearsExperience: demo.yearsExperience ?? null,
          languages: demo.languages ?? [],
          certifications: demo.certifications ?? [],
          athleteLevels: demo.athleteLevels ?? [],
          identityVerified: demo.identityVerified ?? false,
          certificationsVerified: demo.certificationsVerified ?? false,
        })
        .where(eq(providerProfiles.userId, existing.id));
      console.log(`Demo coach ${demo.email} exists — synced profile fields.`);
      continue;
    }

    const authId = await ensureAuthIdentity(
      demo.email,
      'demo1234',
      demo.displayName
    );
    const [user] = await db
      .insert(users)
      .values({
        authId,
        name: demo.displayName,
        email: demo.email,
        passwordHash,
        role: 'member',
      })
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
        videoUrl: demo.videoUrl ?? null,
        yearsExperience: demo.yearsExperience ?? null,
        languages: demo.languages ?? [],
        certifications: demo.certifications ?? [],
        athleteLevels: demo.athleteLevels ?? [],
        identityVerified: demo.identityVerified ?? false,
        certificationsVerified: demo.certificationsVerified ?? false,
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

// Verified demo reviews: each tied to a completed booking from a demo athlete.
async function seedDemoReviews() {
  const passwordHash = await hashPassword('demo1234');
  const reviewers = [
    { email: 'andrea@demo.smc', name: 'Andrea M.' },
    { email: 'sara.reviewer@demo.smc', name: 'Sara T.' },
  ];
  const reviewerIds: number[] = [];
  for (const r of reviewers) {
    let row = await db.query.users.findFirst({ where: eq(users.email, r.email) });
    if (!row) {
      const authId = await ensureAuthIdentity(r.email, 'demo1234', r.name);
      const [created] = await db
        .insert(users)
        .values({
          authId,
          name: r.name,
          email: r.email,
          passwordHash,
          role: 'member',
        })
        .returning();
      await db
        .insert(profiles)
        .values({ userId: created.id, displayName: r.name })
        .onConflictDoNothing();
      await db
        .insert(userRoles)
        .values({ userId: created.id, roleKey: 'athlete' })
        .onConflictDoNothing();
      row = created;
    }
    reviewerIds.push(row.id);
  }

  const texts = [
    {
      rating: 5,
      body: 'Professionale ed empatico. Mi ha aiutato a gestire l’ansia pre-gara.',
    },
    {
      rating: 5,
      body: 'Sessioni concrete, ho visto risultati dopo poche settimane.',
    },
  ];

  for (const demo of DEMO_COACHES) {
    const [provider] = await db
      .select({ id: providerProfiles.id })
      .from(providerProfiles)
      .where(eq(providerProfiles.slug, demo.slug))
      .limit(1);
    if (!provider) continue;

    const [{ value: existing }] = await db
      .select({ value: count() })
      .from(reviews)
      .where(eq(reviews.providerId, provider.id));
    if (existing > 0) continue; // idempotent

    for (let i = 0; i < reviewerIds.length; i++) {
      const [bk] = await db
        .insert(bookings)
        .values({
          clientId: reviewerIds[i],
          providerId: provider.id,
          status: 'completed',
          decidedAt: new Date(),
          completedAt: new Date(),
        })
        .returning({ id: bookings.id });
      await db.insert(reviews).values({
        providerId: provider.id,
        bookingId: bk.id,
        authorId: reviewerIds[i],
        rating: texts[i].rating,
        body: texts[i].body,
        // Demo: the coach has replied to the first review.
        reply: i === 0 ? 'Grazie! È stato un piacere lavorare insieme.' : null,
        replyAt: i === 0 ? new Date() : null,
      });
    }
  }
  console.log('Demo reviews seeded.');
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
    const authId = await ensureAuthIdentity(email, password);

    const [user] = await db
      .insert(users)
      .values([
        {
          authId,
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
  await seedDemoReviews();

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
