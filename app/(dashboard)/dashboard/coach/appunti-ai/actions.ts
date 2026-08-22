'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import {
  AI_LITERACY_KEY,
  recordDocumentRead,
} from '@/lib/core/legal/acceptance';

/**
 * La presa visione della nota sugli Appunti AI.
 *
 * Registra chi ha letto e quando, nella tabella append-only delle accettazioni.
 * È la metà dimostrabile dell'obbligo di alfabetizzazione: l'altra metà è che
 * la nota sia scritta in modo da essere davvero letta, e quella non la certifica
 * nessun database.
 */
export const acknowledgeAiLiteracy = validatedActionWithUser(
  z.object({}),
  async (_data, _formData, user) => {
    const requestHeaders = await headers();

    await recordDocumentRead(user.id, AI_LITERACY_KEY, {
      ipAddress:
        requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        requestHeaders.get('x-real-ip') ||
        null,
      userAgent: requestHeaders.get('user-agent'),
    });

    revalidatePath('/dashboard/coach/appunti-ai');
    revalidatePath('/dashboard/coach');
    return {};
  }
);
