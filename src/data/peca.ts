// Single source of truth for what the Prohibition of Electronic Cigarettes
// Act, 2019 (PECA) actually says — the homepage card, every FAQ answer and
// /india/law/ all render their banned/not-banned lists and section
// citations from this file instead of maintaining their own copies, which
// is how the site ended up with three different, each-slightly-wrong lists
// in the first place (see the content/legal-authority branch).
//
// Section text below is transcribed verbatim from the Gazette notification
// — The Gazette of India, Extraordinary, Part II—Section 1, No. 66, New
// Delhi, Thursday, December 5, 2019, Act No. 42 of 2019 — a copy of which
// is hosted at /documents/peca-act-2019-gazette.pdf. Cross-reference:
// India Code (https://www.indiacode.nic.in/handle/123456789/13078).
// Do not paraphrase these fields; if a page needs shorter wording, write
// that separately and link back to the verbatim text, don't edit it here.

export const PECA_ACT = {
  shortTitle:
    'Prohibition of Electronic Cigarettes (Production, Manufacture, Import, Export, Transport, Sale, Distribution, Storage and Advertisement) Act, 2019',
  commonName: 'Prohibition of Electronic Cigarettes Act, 2019 (PECA)',
  actNumber: '42 of 2019',
  assentDate: '2019-12-05',
  // Section 1(2): "deemed to have come into force" retroactively to this date.
  commencementDate: '2019-09-18',
  gazetteCitation: 'The Gazette of India, Extraordinary, Part II—Section 1, No. 66, New Delhi, Thursday, December 5, 2019',
  gazettePdf: '/documents/peca-act-2019-gazette.pdf',
  indiaCodeUrl: 'https://www.indiacode.nic.in/handle/123456789/13078',
};

export type PecaSection = {
  number: string;
  heading: string;
  /** Verbatim Gazette text. Sub-clause markers (i), (ii), (a), (b) kept as
   * printed; line breaks are paragraph breaks in the original. */
  text: string;
};

export const PECA_SECTIONS: Record<'definition' | 's4' | 's5' | 's7' | 's8', PecaSection> = {
  definition: {
    number: '3(d)',
    heading: 'Definitions — "electronic cigarette"',
    text: `"electronic cigarette" means an electronic device that heats a substance, with or without nicotine and flavours, to create an aerosol for inhalation and includes all forms of Electronic Nicotine Delivery Systems, Heat Not Burn Products, e-Hookah and the like devices, by whatever name called and whatever shape, size or form it may have, but does not include any product licensed under the Drugs and Cosmetics Act, 1940.

Explanation.—For the purposes of this clause, the expression "substance" includes any natural or artificial substance or other matter, whether it is in a solid state or in liquid form or in the form of gas or vapour.`,
  },
  s4: {
    number: '4',
    heading:
      'Prohibition on production, manufacturing, import, export, transport, sale, distribution, advertisement of electronic cigarettes',
    text: `On and from the date of commencement of this Act, no person shall, directly or indirectly,—

(i) produce or manufacture or import or export or transport or sell or distribute electronic cigarettes, whether as a complete product or any part thereof; and

(ii) advertise electronic cigarettes or take part in any advertisement that directly or indirectly promotes the use of electronic cigarettes.`,
  },
  s5: {
    number: '5',
    heading: 'Prohibition on storage of electronic cigarettes',
    text: `On and from the date of commencement of this Act, no person, being the owner or occupier or having the control or use of any place shall, knowingly permit it to be used for storage of any stock of electronic cigarettes:

Provided that any existing stock of electronic cigarettes as on the date of the commencement of this Act kept for sale, distribution, transport, export or advertisement shall be disposed of in the manner hereinafter specified—

(a) the owner or occupier of the place with respect to the existing stock of electronic cigarettes shall, suo motu, prepare a list of such stock of electronic cigarettes in his possession and without unnecessary delay submit the stock as specified in the list to the nearest office of the authorised officer; and

(b) the authorised officer to whom any stock of electronic cigarettes is forwarded under clause (a) shall, with all convenient despatch, take such measures as may be necessary for the disposal according to the law for the time being in force.`,
  },
  s7: {
    number: '7',
    heading: 'Punishment for contravention of section 4',
    text: `Whoever contravenes the provisions of section 4, shall be punishable with imprisonment for a term which may extend to one year or with fine which may extend to one lakh rupees, or with both, and, for the second or subsequent offence, with imprisonment for a term which may extend to three years and with fine which may extend to five lakh rupees.`,
  },
  s8: {
    number: '8',
    heading: 'Punishment for contravention of section 5',
    text: `Whoever contravenes the provisions of section 5, shall be punishable with imprisonment for a term which may extend to six months or with fine which may extend to fifty thousand rupees or with both.`,
  },
};

export type PecaListItem = {
  /** Short label for a card/list UI. */
  label: string;
  /** Section(s) this item is drawn from, for inline citation. */
  section: string;
};

// Section 4(i)'s seven verbs plus Section 4(ii)'s advertisement clause,
// plus Section 5's separate storage prohibition — six list items, not
// five, because storage (s.5, its own punishment under s.8) and transport
// (s.4(i), punishment under s.7) are different offences under different
// sections and shouldn't be collapsed into one bullet the way the site
// used to. Nothing here carries a "for sale" qualifier: that phrase only
// appears in Section 5's proviso, about disposing of pre-Act stock — it
// is not a condition on the general bans in Section 4 or Section 5.
export const PECA_BANNED: PecaListItem[] = [
  { label: 'Production & manufacture', section: '4(i)' },
  { label: 'Import & export', section: '4(i)' },
  { label: 'Transport', section: '4(i)' },
  { label: 'Sale & distribution', section: '4(i)' },
  { label: 'Storage of stock', section: '5' },
  { label: 'Advertisement', section: '4(ii)' },
];

// Not named, qualified or prohibited anywhere in PECA — this is the
// Act's silence, not a clause of it, so these carry no section citation.
// See PECA_TRANSPORT_DRAFT below for the one place this gets genuinely
// complicated (carrying your own device, given Section 4(i)'s unqualified
// "transport").
export const PECA_NOT_BANNED: string[] = ['Personal use (vaping)', 'Personal possession', 'Carrying a device for your own use'];

// Natural-language renderings of PECA_BANNED/PECA_NOT_BANNED for prose
// contexts (FAQ answers, JSON-LD text) that can't easily interleave JSX —
// still generated from the one list above rather than typed out separately.
export function pecaBannedSentence(): string {
  return PECA_BANNED.map((item) => item.label.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' and $1');
}
export function pecaNotBannedSentence(): string {
  return PECA_NOT_BANNED.map((s) => s.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' or $1');
}

// DRAFT — NOT PUBLISHED ANYWHERE ON THE SITE. Written per the
// content/legal-authority task to deal with "transport" head-on: Section
// 4(i) bans transport with no textual carve-out for personal carrying,
// unlike the "for sale" qualifier the site used to (wrongly) attach to it.
// This paragraph is AVI's reasoning for why that still shouldn't be read
// to cover a vaper carrying their own device, using only sources already
// cited elsewhere on /india/law/ — it is NOT legal advice, has NOT been
// reviewed by Samrat or counsel, and must not be rendered on any live
// page until that review happens. Needs Samrat: sign-off (or edits) from
// Samrat and counsel before this ships anywhere.
export const PECA_TRANSPORT_DRAFT = `Section 4(i) bans "transport" of e-cigarettes without the word "for sale" attached to it — that qualifier only appears in Section 5's proviso, about disposing of stock that already existed when the Act commenced, not as a condition on Section 4 itself. Read in isolation, "transport" could describe a vaper carrying their own device from one room to another. AVI's view is that it shouldn't be read that way, for reasons grounded in how the Act itself and the government have described its purpose, not in the word "transport" alone. First, "transport" sits in Section 4(i) alongside produce, manufacture, import, export, sell and distribute — six verbs describing the movement of goods through a commercial supply chain, and the Act's own Section 2 declares its purpose as bringing "the electronic cigarettes industry" under control, not regulating personal conduct. Second, every government statement on record addressing personal use points the same way: the Health Ministry's own account said use and possession were not banned before the Act was even passed; the Home Ministry's circular (point C) says personal use and possession is not an offence; and the Health Minister told Parliament directly, during the bill's debate, that use and possession would not be banned because doing so would violate personal liberties. None of those three statements carves out an exception for "but carrying it is different" — they describe the Act as reaching the business of e-cigarettes, full stop. Read together with Section 4(i)'s company — commercial verbs, aimed at a declared industry-control purpose — AVI reads "transport" the same way: a link in the commercial chain, not a vaper's own pocket or bag. That is an interpretation, not settled law; no court has ruled on this specific word, and the Act's text does not itself distinguish commercial from personal transport the way it's silent on personal use elsewhere. This paragraph needs Samrat's and counsel's sign-off before it goes anywhere public.`;
