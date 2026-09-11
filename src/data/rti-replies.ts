// Structured data behind /india/rti-replies. Source: AVI's own consolidated
// RTI response table (Google Drive, "RTI.docx") — the same file the old
// vapeindia.org site embedded as a single, unexplained Google Drive PDF
// preview (a continuous, ~2000px-tall scroll with no context). That table
// asked a set of near-duplicate questions to several government bodies
// between 2018-2019; this file groups the ~40 raw rows by the actual
// authority that replied and de-duplicates the redundant question wording.
//
// `localFile` points under /public/archive/rti — downloaded directly from
// the source Drive files. Five of the eleven underlying reply documents
// could not be retrieved (Drive returned "no content" for their current
// revision); those fall back to `driveUrl`, the original share link, noted
// as external rather than silently omitted.

export type RtiReply = {
  authority: string;
  jurisdiction: string; // one-line description of the body's role
  questions: string[];  // paraphrased, de-duplicated questions actually put to them
  findings: string[];   // the substantive answers given
  localFile?: string;   // path under /public/archive/rti
  driveUrl?: string;    // fallback external link where no local copy exists
};

export const rtiReplies: RtiReply[] = [
  {
    authority: 'Indian Council of Medical Research (ICMR)',
    jurisdiction: "India's apex medical research body",
    questions: [
      'Has ICMR conducted or funded any research into electronic cigarettes / ENDS, and if so, where is it published?',
      'Is ICMR currently working on, or has it sanctioned, any research into the benefits or harms of vaping?',
      'How much has ICMR spent on smoking-cessation-related research, and who is working on it?',
    ],
    findings: [
      'No research conducted into electronic cigarettes or ENDS.',
      'No study currently sanctioned or funded on the subject.',
      'Nil spend, no researchers assigned — "None" on every count.',
    ],
    localFile: '/archive/rti/rti-1-icmr.jpg',
  },
  {
    authority: 'Ministry of Health & Family Welfare — Tobacco Control Division',
    jurisdiction: 'The ministry that went on to advise a nationwide ENDS ban in Aug 2018',
    questions: [
      'Has the Division conducted or funded any research into e-cigarettes / ENDS?',
      "What is the Division's budget for smoking-cessation activities?",
      'Has any state informed the Division of a ban or restriction on ENDS, and under what law would ENDS be prohibited?',
    ],
    findings: [
      '"The Division has not conducted any such studies/survey."',
      'Cessation budget answered only for the general National Tobacco Quit-line service (₹49.6 lakh in 2014-15, rising to ₹1.63 crore by 2019-20) — no ENDS-specific allocation.',
      'On the legal basis for a ban: pointed only to a 2014 internal committee process still "under consideration," and to the Drugs and Cosmetics Act, 1940 generally — not to any ENDS-specific prohibition then in force.',
    ],
    driveUrl: 'https://drive.google.com/open?id=1mSjkSBTqth_mHLcZUi4gLfggM6fAt27m',
  },
  {
    authority: 'Central Drugs Standard Control Organisation (CDSCO)',
    jurisdiction: "India's central drug regulator",
    questions: [
      'Is an e-cigarette, or any part of one, covered under the Drugs & Cosmetics Act, 1940 and its Rules?',
      'Are electronic cigarettes banned for import, including into Maharashtra specifically, or for personal use?',
    ],
    findings: [
      '"E-cigarettes are not regulated under the provisions of Drugs and Cosmetics Act, 1940 and Rules 1945 there under" — stated identically across all three questions.',
    ],
    localFile: '/archive/rti/rti-6-cdsco-import.png',
  },
  {
    authority: 'Drugs Controller General of India (DCGI)',
    jurisdiction: "India's national drug licensing authority, under the Directorate General of Health Services",
    questions: ['Are e-cigarettes for smoking covered under the Drugs & Cosmetics Act, 1940 and its Rules?'],
    findings: ['"E-Cigarettes for smoking are not covered under the provisions of Drugs & Cosmetics Act, 1940 and Rules, 1945 there under."'],
    localFile: '/archive/rti/rti-7-dcgi.jpg',
  },
  {
    authority: 'JIPMER, Department of Preventive & Social Medicine, Pondicherry',
    jurisdiction: 'A central government medical institute and research hospital',
    questions: [
      'Has the department researched electronic cigarettes / ENDS, its cessation potential, or its use versus traditional cigarettes?',
    ],
    findings: ['"Not worked in E-Cigarettes/ENDS aspects" — on every research, funding and personnel question asked.'],
    localFile: '/archive/rti/rti-8-jipmer.jpg',
  },
  {
    authority: 'National Institute of Cancer Prevention & Research (NICPR)',
    jurisdiction: "ICMR's dedicated cancer-prevention research institute",
    questions: [
      'Has NICPR researched electronic cigarettes / ENDS, and what has it spent on smoking-cessation research?',
    ],
    findings: ['No research conducted; nil spend; no researchers or projects assigned to the subject.'],
    driveUrl: 'https://drive.google.com/open?id=1Q32jjS-4frFX2W-l6LP1p-WGCLE7hXpJ',
  },
  {
    authority: 'Principal Commissioner of Customs (ACC-Import), New Customs House, New Delhi',
    jurisdiction: "India's primary air-cargo customs import authority",
    questions: [
      'Are non-tobacco, non-nicotine vaping hardware, e-liquids, and nicotine liquids of various strengths banned or restricted from import?',
      'Has any circular been issued restricting import of e-cigarette or vaping hardware?',
    ],
    findings: [
      'Import of non-tobacco, non-nicotine e-cigarette devices "alone are not banned or restricted."',
      'Nicotine e-liquids at every strength tested (0.3mg/ml through 18mg/ml) were "not banned and not on the restricted import list."',
      'No circular banning import of e-cigarette or vaping accessories had been issued — import was governed only by the general EXIM policy, DGFT circulars and Ministry of Health advisories then in force.',
    ],
    localFile: '/archive/rti/rti-11-customs-delhi.pdf',
  },
  {
    authority: 'Principal Commissioner of Customs (Airport & Admin), Kolkata',
    jurisdiction: "India's Eastern-region air-cargo customs authority",
    questions: [
      'Are non-tobacco, non-nicotine vaping hardware, e-liquids and nicotine liquids restricted from import?',
      'Has any state asked Customs to stop e-cigarette or vaping imports?',
      'Does Customs have authority to independently restrict import of a product not on the official restricted list?',
    ],
    findings: [
      'Confirmed — in near-identical language to the Delhi office — that none of these products featured on the restricted import list at the time.',
      '"This office has not received any information to stop imports of electronics cigarettes and vaping devices from any state."',
      'Import of items outside the restricted list "is allowed subject to compliance with customs act and rules" — Customs could not independently ban a category the government had not restricted.',
    ],
    driveUrl: 'https://drive.google.com/open?id=1McJEL6_s-KoWvB8tFkYAzNS9CoA0_6Tr',
  },
];
