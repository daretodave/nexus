// The grill-me demo's fixtures (0.5.1): fieldday's open plan questions for the Oversight panel and Grill me, the
// briefs Grill me shows beside each spec, and the choices the wand gives in the demo (no model runs here).
//
//   spec 11 Sharing           4 questions: two that name a recommendation, one long one in several paragraphs, one plain
//   spec 14 Fixture clashes   3 questions, one with no recommendation
//   plan/AUDIT.md             one [needs-user-call] row outside any spec
//   (the vault's own secret request, server/demo/vault.mjs, rides along: Grill me counts it and leaves it to the Vault)
//
// GRILL_CHOICES: one question has no entry (the wand finds nothing and the row names nothing: write your own), and one
// fails on its first ask and answers on the next (FLAKY), to show the error state and Try again.

const SHARING = 'plan/11-sharing.md';
const CLASHES = 'plan/14-fixture-clashes.md';
const AUDIT = 'plan/AUDIT.md';

const spec11 = { n: '11', title: 'Sharing and referrals' };
const spec14 = { n: '14', title: 'Fixture clashes' };

const q = (file, line, text, spec, source = 'plan') => ({ id: `${file}:${line}`, file, line, text, source, ...(spec ? { spec } : {}) });

export const GRILL_DURABLE = [
  q(SHARING, 119, 'Referral reward vs P11 (pending): what, if anything, does either side get when a club invites another club? Recommendation: no credit at all, just a "a friend sent you this" note on the invite.', spec11),
  q(SHARING, 124, 'Gifted month: what is it called on the receipt and in the welcome email? Recommendation: "A month from <club name>".', spec11),
  q(SHARING, 128, [
    'Shared fixture lists: whose colours does a shared list wear?',
    '',
    'A coach shares the under-12s fixtures with parents. Today the page uses the league\'s colours, so every club\'s list looks the same, and two parents in the beta asked whether the link was a scam.',
    'The club\'s own colours fix that, but a third of clubs never set any, and some set colours that fail contrast on the white fixture cards.',
  ].join(' '), spec11),
  q(SHARING, 135, 'How long does a share link live before it needs renewing?', spec11),
  q(CLASHES, 88, 'When two fixtures share a pitch at the same time, warn the organiser or block the save? Recommendation: warn, and let the organiser confirm with a reason.', spec14),
  q(CLASHES, 92, 'Do training sessions count as clashes with fixtures? Recommendation: only sessions booked through fieldday, not ones typed into the notes.', spec14),
  q(CLASHES, 96, 'What does the clash email to the other team\'s coach say, and who is it from?', spec14),
  q(AUDIT, 41, 'Show mode\'s demo season: use made-up team names, or the real 2025 league with permission?', null, 'needs-user-call'),
];

export const FLAKY = `${SHARING}:135`;

/** The wand's choices in the demo, by question id ("Example choices (demo)"). */
export const GRILL_CHOICES = {
  [`${SHARING}:119`]: [
    { label: 'No credit at all, just "a friend sent you this" on the invite', why: 'Rewards for inviting pull toward growth hacks, which P11 rules out.', rec: true },
    { label: 'A free month for the club that joins, nothing for the one that invited', why: 'One-sided keeps it a gift, not a scheme.' },
    { label: 'A month for both clubs, once the new club plays its first fixture', why: 'Ties the reward to real use, not sign-ups.' },
  ],
  [`${SHARING}:124`]: [
    { label: '"A month from <club name>"', why: 'Says who gave it, which is the point of a gift.', rec: true },
    { label: '"Gifted month" with the club named underneath', why: 'Reads cleanly on a receipt line that has little room.' },
  ],
  [`${SHARING}:128`]: [
    { label: "The club's colours, falling back to the league's when unset or low contrast", why: 'Fixes the scam worry for most clubs without breaking unreadable ones.' },
    { label: "The league's colours, with the club's crest at the top", why: 'Always readable; the crest does the "this is us" work.' },
    { label: "The club's colours always, with a contrast fix applied", why: 'Most recognisable, at the cost of some odd-looking adjustments.' },
  ],
  [FLAKY]: [
    { label: '90 days, renewable by the person who shared it', why: 'Long enough for a season half, short enough that old links die.' },
    { label: 'Until the season ends', why: 'Matches how coaches think about a fixture list.' },
    { label: 'Forever, until someone turns it off', why: 'Simplest, but stale links keep working.' },
  ],
  [`${CLASHES}:88`]: [
    { label: 'Warn, and let the organiser confirm with a reason', why: 'Pitches get shared on purpose; a block would stop real bookings.', rec: true },
    { label: 'Block, unless the venue marks the pitch as shareable', why: 'Safer for venues that never double-book.' },
  ],
  [`${CLASHES}:92`]: [
    { label: 'Only sessions booked through fieldday, not ones typed into the notes', why: 'Notes are free text; guessing from them would cry wolf.', rec: true },
    { label: 'Every session with a pitch and a time, wherever it came from', why: 'Catches more, at the cost of false alarms.' },
    { label: 'No: clashes are fixtures only', why: 'Keeps the detector simple for this spec; training can come later.' },
  ],
  [`${AUDIT}:41`]: [
    { label: 'Made-up team names', why: 'No permission to chase and nothing to take down later.' },
    { label: 'The real 2025 league, with written permission', why: 'Feels real in a demo, but ties show mode to one league.' },
  ],
  // `${CLASHES}:96` has none on purpose: the wand finds nothing and the question names nothing.
};

/** Grill me's briefs, as GET /api/oversight/specs serves them. */
export const BRIEFS = {
  [SHARING]: {
    n: '11', title: 'Sharing and referrals',
    lede: 'Clubs grow by word of mouth: a coach shares the fixture list with parents, a league secretary tells the next league over. This spec makes that sharing first-class, with links that look like the club and invites that carry a little goodwill.',
    why: 'Half of new clubs in the beta came from another club, but the links they shared looked like the league\'s and two were reported as phishing. Getting sharing right is cheaper than any campaign.',
  },
  [CLASHES]: {
    n: '14', title: 'Fixture clashes',
    lede: 'Two fixtures on one pitch at once is the most common complaint organisers send. This spec finds clashes as the fixtures are made, says which pitch and which teams, and lets the organiser decide.',
    why: null,
  },
  [AUDIT]: { n: null, title: AUDIT, lede: 'Show mode', why: null },
};
