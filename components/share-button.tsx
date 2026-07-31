'use client';

import { useState } from 'react';
import {
  Copy,
  Link as LinkIcon,
  Loader2,
  Mail,
  Share2,
  UserPlus,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createGuestInviteLink } from '@/app/(dashboard)/dashboard/video/actions';

export function ShareButton({ bookingId }: { bookingId: number }) {
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generateLink() {
    setLoading(true);
    setInviteUrl(null);
    setCopied(false);
    try {
      const result = await createGuestInviteLink(bookingId);
      if (result.ok) {
        setInviteUrl(result.url);
      } else {
        alert(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const whatsAppUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
    `Ciao, puoi unirti alla videochiamata da questo link: ${inviteUrl}`
  )}`;

  const mailUrl = `mailto:?subject=${encodeURIComponent(
    'Invito alla videochiamata'
  )}&body=${encodeURIComponent(
    `Ciao, puoi unirti alla videochiamata da questo link:\n\n${inviteUrl}`
  )}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20">
        <UserPlus className="h-4 w-4" />
        Invita
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="flex flex-col gap-1 p-2">
        {!inviteUrl && (
          <DropdownMenuItem onClick={generateLink} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LinkIcon className="mr-2 h-4 w-4" />
            )}
            Genera link d'invito
          </DropdownMenuItem>
        )}
        {inviteUrl && (
          <>
            <DropdownMenuItem onClick={copyToClipboard}>
              <Copy className="mr-2 h-4 w-4" /> {copied ? 'Copiato!' : 'Copia link'}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={whatsAppUrl} target="_blank" rel="noopener noreferrer">
                <Share2 className="mr-2 h-4 w-4" /> Condividi su WhatsApp
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={mailUrl}>
                <Mail className="mr-2 h-4 w-4" /> Invia via email
              </a>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}