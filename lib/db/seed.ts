import { stripe } from '../payments/stripe';
import { db } from './drizzle';
import { users, teams, teamMembers, roles } from './schema';
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

async function seed() {
  await seedRoles();

  const email = 'test@test.com';
  const password = 'admin123';
  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values([
      {
        email: email,
        passwordHash: passwordHash,
        role: "owner",
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
