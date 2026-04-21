// Mock Google Contacts + Google Calendar data for the Tether prototype.
// In a real build this would come from the People API + Calendar API.
// Exposes `window.TETHER_MOCK` for the React app.

(function () {
  const today = new Date();
  const d = (daysAgo) => {
    const x = new Date(today);
    x.setDate(x.getDate() - daysAgo);
    return x.toISOString();
  };
  const dFuture = (daysAhead) => {
    const x = new Date(today);
    x.setDate(x.getDate() + daysAhead);
    return x.toISOString();
  };

  // Avatar helper — deterministic colorful circles with initials
  const avatar = (name, hue) => {
    const initials = name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
    return { initials, hue };
  };

  // --- CONTACTS ---------------------------------------------------------
  // googleLabels: what Google Contacts actually has on the user's account pre-onboarding.
  // After onboarding, `CRM:` labels are appended via the mapping flow.
  const contacts = [
    {
      id: 'c1', name: 'Priya Shah', email: 'priya.shah@example.com', phone: '+1 415 555 0142',
      googleLabels: ['Friends', 'Gym'],
      location: { city: 'San Francisco', country: 'USA', lat: 37.7749, lng: -122.4194 },
      linkedin: 'linkedin.com/in/priyashah', instagram: '@priyashah',
      notes: 'Climbing partner since 2021. Runs product at a climate startup. Loves Ethiopian food. Mentioned wanting to co-author a piece on belonging.',
      custom: { company: 'Tallus', title: 'Head of Product', howWeMet: 'Boulder gym — Mission Cliffs' },
      skills: ['Climbing', 'Product management', 'Writing'],
      lastContactedDaysAgo: 41,
      avatar: avatar('Priya Shah', 320),
    },
    {
      id: 'c2', name: 'Alex Novak', email: 'alex.novak@example.com', phone: '+1 212 555 0188',
      googleLabels: ['Friends'],
      location: { city: 'Brooklyn', country: 'USA', lat: 40.6782, lng: -73.9442 },
      notes: 'College roommate. Bartender turned sommelier. Opinionated about natural wine. Currently dating Maya.',
      custom: { company: 'Wildair', title: 'Sommelier', howWeMet: 'Dartmouth' },
      skills: ['Wine', 'Hosting'],
      lastContactedDaysAgo: 12,
      avatar: avatar('Alex Novak', 15),
    },
    {
      id: 'c3', name: 'Jordan Reeves', email: 'jordan@reeves.dev', phone: '+1 512 555 0134',
      googleLabels: ['Friends'],
      location: { city: 'Austin', country: 'USA', lat: 30.2672, lng: -97.7431 },
      notes: 'Climbing buddy from the Red River Gorge trip. Self-taught climber, very psyched. Just had a kid — expect slower responses.',
      custom: { howWeMet: 'Red River Gorge 2022' },
      skills: ['Climbing', 'Bouldering'],
      lastContactedDaysAgo: 78,
      avatar: avatar('Jordan Reeves', 200),
    },
    {
      id: 'c4', name: 'Maya Okafor', email: 'maya.okafor@example.com', phone: '+44 20 7946 0018',
      googleLabels: ['Friends', 'Book Club'],
      location: { city: 'London', country: 'UK', lat: 51.5074, lng: -0.1278 },
      notes: 'Book club co-founder. Reads everything. Novelist — first book out next spring. Great at honest feedback.',
      custom: { company: 'Faber & Faber', title: 'Novelist' },
      skills: ['Writing', 'Editing', 'Reading'],
      lastContactedDaysAgo: 9,
      avatar: avatar('Maya Okafor', 280),
    },
    {
      id: 'c5', name: 'Theo Laurent', email: 'theo.laurent@example.com', phone: '+33 6 12 34 56 78',
      googleLabels: ['Work'],
      location: { city: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522 },
      notes: 'Former manager. Generous mentor. Moved back to Paris after Series B. Great on pricing strategy.',
      custom: { company: 'Heuristic', title: 'CEO', howWeMet: 'First job — Boston, 2018' },
      skills: ['Leadership', 'Pricing', 'B2B SaaS'],
      lastContactedDaysAgo: 63,
      avatar: avatar('Theo Laurent', 45),
    },
    {
      id: 'c6', name: 'Sara Bergström', email: 'sara.bergstrom@example.com', phone: '+46 70 555 0134',
      googleLabels: ['Work'],
      location: { city: 'Stockholm', country: 'Sweden', lat: 59.3293, lng: 18.0686 },
      notes: 'Design lead I worked with on the onboarding redesign. Talented, warm, direct. Interested in mentoring.',
      custom: { company: 'Klarna', title: 'Design Lead' },
      skills: ['Design systems', 'UX research', 'Mentoring'],
      lastContactedDaysAgo: 120,
      avatar: avatar('Sara Bergström', 180),
    },
    {
      id: 'c7', name: 'Luis Fernández', email: 'luis.f@example.com', phone: '+34 91 555 0012',
      googleLabels: ['Work'],
      location: { city: 'Madrid', country: 'Spain', lat: 40.4168, lng: -3.7038 },
      notes: 'Partnered with on an open-source CRDT lib. Deep systems knowledge. Loves ultra-running.',
      custom: { title: 'Principal Engineer', company: 'Glovo' },
      skills: ['Distributed systems', 'Rust', 'CRDTs'],
      lastContactedDaysAgo: 34,
      avatar: avatar('Luis Fernández', 130),
    },
    {
      id: 'c8', name: 'Chen Wei', email: 'chen.wei@example.com', phone: '+65 9123 4567',
      googleLabels: [],
      location: { city: 'Singapore', country: 'Singapore', lat: 1.3521, lng: 103.8198 },
      notes: 'Met at the DevDay after-party. Builds dev tools at a hedge fund. Asia-Pacific climbing scene is his thing.',
      custom: { howWeMet: 'DevDay 2025 after-party' },
      skills: ['Finance tech', 'Climbing'],
      lastContactedDaysAgo: 180,
      avatar: avatar('Chen Wei', 10),
    },
    {
      id: 'c9', name: 'Aisha Rahman', email: 'aisha.rahman@example.com', phone: '+1 646 555 0191',
      googleLabels: ['Friends'],
      location: { city: 'New York', country: 'USA', lat: 40.7128, lng: -74.006 },
      notes: 'Poet and engineer. Introduced me to Maya. Hosts the best dinners. Slow texter, warm in person.',
      custom: { company: 'NYT', title: 'Staff Engineer', howWeMet: 'Via Maya — 2019' },
      skills: ['Poetry', 'Hosting', 'Engineering'],
      lastContactedDaysAgo: 24,
      avatar: avatar('Aisha Rahman', 340),
    },
    {
      id: 'c10', name: 'Mom (Elena Vasquez)', email: 'elena.v@example.com', phone: '+1 305 555 0112',
      googleLabels: ['Family'],
      location: { city: 'Miami', country: 'USA', lat: 25.7617, lng: -80.1918 },
      notes: 'Call at least weekly. Prefers phone over text.',
      custom: { relationship: 'Mother' },
      lastContactedDaysAgo: 3,
      avatar: avatar('Elena Vasquez', 0),
    },
    {
      id: 'c11', name: 'Dad (Miguel Vasquez)', email: '', phone: '+1 305 555 0144',
      googleLabels: ['Family'],
      location: { city: 'Miami', country: 'USA', lat: 25.7717, lng: -80.1818 },
      notes: 'Text back and forth about soccer. Birthday in July.',
      custom: { relationship: 'Father' },
      lastContactedDaysAgo: 6,
      avatar: avatar('Miguel Vasquez', 25),
    },
    {
      id: 'c12', name: 'Hanna Lund', email: 'hanna.lund@example.com', phone: '+47 912 34 567',
      googleLabels: ['Friends', 'Book Club'],
      location: { city: 'Oslo', country: 'Norway', lat: 59.9139, lng: 10.7522 },
      notes: 'Met on a fjord hiking trip. Runs a small publishing imprint. Book club via video since she moved.',
      custom: { company: 'Pelikanen', title: 'Editor-in-Chief' },
      skills: ['Editing', 'Publishing', 'Hiking'],
      lastContactedDaysAgo: 45,
      avatar: avatar('Hanna Lund', 160),
    },
    {
      id: 'c13', name: 'Marcus Doyle', email: 'mdoyle@example.com', phone: '+353 1 555 0122',
      googleLabels: ['Work'],
      location: { city: 'Dublin', country: 'Ireland', lat: 53.3498, lng: -6.2603 },
      notes: 'Product manager who always has the right book rec. Helped me think about pricing tiers last year.',
      custom: { company: 'Stripe', title: 'PM' },
      skills: ['Product management', 'Pricing', 'Reading'],
      lastContactedDaysAgo: 55,
      avatar: avatar('Marcus Doyle', 100),
    },
    {
      id: 'c14', name: 'Noa Gershon', email: 'noa@example.com', phone: '+972 50 555 0133',
      googleLabels: ['Friends'],
      location: { city: 'Tel Aviv', country: 'Israel', lat: 32.0853, lng: 34.7818 },
      notes: 'Climbing, surfing. Hosted me for a week in 2023. Owed her a long email.',
      skills: ['Climbing', 'Surfing'],
      custom: { howWeMet: 'Kalymnos climbing trip' },
      lastContactedDaysAgo: 210,
      avatar: avatar('Noa Gershon', 60),
    },
    {
      id: 'c15', name: 'Ravi Subramanian', email: 'ravi.s@example.com', phone: '+91 98 555 01 66',
      googleLabels: [],
      location: { city: 'Bangalore', country: 'India', lat: 12.9716, lng: 77.5946 },
      notes: 'Met at an ML conference. Works on embedding search. Thoughtful, generous with time.',
      custom: { company: 'Fractal', title: 'ML Engineer' },
      skills: ['Machine learning', 'Search', 'Embeddings'],
      lastContactedDaysAgo: 95,
      avatar: avatar('Ravi Subramanian', 260),
    },
    {
      id: 'c16', name: 'Lila Moreau', email: 'lila.moreau@example.com', phone: '+33 6 98 11 22 33',
      googleLabels: ['Friends'],
      location: { city: 'Lisbon', country: 'Portugal', lat: 38.7223, lng: -9.1393 },
      notes: 'Photographer. Moved to Lisbon in 2024. Great surf spots. Throws the best casual dinners.',
      custom: { company: 'Freelance', title: 'Photographer' },
      skills: ['Photography', 'Surfing', 'Hosting'],
      lastContactedDaysAgo: 32,
      avatar: avatar('Lila Moreau', 35),
    },
    {
      id: 'c17', name: 'Diego Costa', email: 'diego.costa@example.com', phone: '+351 91 555 0199',
      googleLabels: [],
      location: { city: 'Lisbon', country: 'Portugal', lat: 38.7323, lng: -9.1493 },
      notes: 'Lila introduced us. Designer turned coffee roaster. Tram 28 stories are top tier.',
      custom: { company: 'Copenhagen Coffee Lab', title: 'Roaster' },
      skills: ['Coffee', 'Design', 'Hosting'],
      lastContactedDaysAgo: 140,
      avatar: avatar('Diego Costa', 20),
    },
    {
      id: 'c18', name: 'Emma Chen', email: 'emma.chen@example.com', phone: '+1 510 555 0132',
      googleLabels: ['Friends', 'Gym'],
      location: { city: 'Oakland', country: 'USA', lat: 37.8044, lng: -122.2711 },
      notes: 'Weekly climbing partner. Doctor — pediatrics. Walked the Camino last year.',
      custom: { company: 'UCSF', title: 'Pediatrician' },
      skills: ['Medicine', 'Climbing', 'Hiking'],
      lastContactedDaysAgo: 7,
      avatar: avatar('Emma Chen', 310),
    },
    {
      id: 'c19', name: 'Olu Adeyemi', email: 'olu.a@example.com', phone: '+234 81 555 0101',
      googleLabels: ['Work'],
      location: { city: 'Lagos', country: 'Nigeria', lat: 6.5244, lng: 3.3792 },
      notes: 'Product person I cold-emailed. Said yes. Runs a fintech for creators. Candid, sharp.',
      custom: { company: 'Kippa', title: 'Head of Product' },
      skills: ['Product management', 'Fintech', 'Emerging markets'],
      lastContactedDaysAgo: 67,
      avatar: avatar('Olu Adeyemi', 210),
    },
    {
      id: 'c20', name: 'Kenji Watanabe', email: 'k.watanabe@example.com', phone: '+81 90 5555 0122',
      googleLabels: [],
      location: { city: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503 },
      notes: 'Met via Hiroshi at a mutual dinner. Tea ceremony practitioner. Would love to visit.',
      skills: ['Tea ceremony', 'Calligraphy'],
      custom: { howWeMet: 'Dinner via Hiroshi — 2024' },
      lastContactedDaysAgo: 150,
      avatar: avatar('Kenji Watanabe', 200),
    },
    {
      id: 'c21', name: 'Ines Vidal', email: 'ines.vidal@example.com', phone: '+55 11 9 5555 0133',
      googleLabels: ['Friends'],
      location: { city: 'São Paulo', country: 'Brazil', lat: -23.5505, lng: -46.6333 },
      notes: 'Designer, painter. Met in a residency in Mexico City. Owes me a letter.',
      custom: { company: 'Freelance', title: 'Designer' },
      skills: ['Design', 'Painting'],
      lastContactedDaysAgo: 225,
      avatar: avatar('Ines Vidal', 330),
    },
    {
      id: 'c22', name: 'Oscar Nieminen', email: 'oscar.n@example.com', phone: '+358 40 555 0144',
      googleLabels: ['Work'],
      location: { city: 'Helsinki', country: 'Finland', lat: 60.1699, lng: 24.9384 },
      notes: 'Did our SOC2 audit. Extremely patient. Into sauna architecture.',
      custom: { company: 'Nixu', title: 'Security Auditor' },
      skills: ['Security', 'Compliance'],
      lastContactedDaysAgo: 180,
      avatar: avatar('Oscar Nieminen', 190),
    },
    {
      id: 'c23', name: 'Priscilla Owen', email: 'priscilla.owen@example.com', phone: '+1 206 555 0155',
      googleLabels: ['Book Club', 'Friends'],
      location: { city: 'Seattle', country: 'USA', lat: 47.6062, lng: -122.3321 },
      notes: 'Book club regular. Academic — comparative lit. Dry sense of humor.',
      custom: { company: 'UW', title: 'Professor' },
      skills: ['Literature', 'Teaching'],
      lastContactedDaysAgo: 28,
      avatar: avatar('Priscilla Owen', 295),
    },
    {
      id: 'c24', name: 'Dario Ferri', email: 'dario.ferri@example.com', phone: '+39 02 555 0122',
      googleLabels: [],
      location: { city: 'Milan', country: 'Italy', lat: 45.4642, lng: 9.19 },
      notes: 'Met at a startup dinner. Owns a small Barolo vineyard on the side.',
      skills: ['Wine', 'Startups'],
      lastContactedDaysAgo: 320,
      avatar: avatar('Dario Ferri', 5),
    },
    {
      id: 'c25', name: 'Sophie Tremblay', email: 'sophie.t@example.com', phone: '+1 514 555 0189',
      googleLabels: ['Friends'],
      location: { city: 'Montreal', country: 'Canada', lat: 45.5019, lng: -73.5674 },
      notes: 'Grad school friend. Economist. Two kids now. Does an annual ice-skating party.',
      custom: { company: 'Bank of Canada', title: 'Economist' },
      skills: ['Economics', 'Policy'],
      lastContactedDaysAgo: 85,
      avatar: avatar('Sophie Tremblay', 250),
    },
    {
      id: 'c26', name: 'Rahul Mehta', email: 'rahul.mehta@example.com', phone: '+1 647 555 0122',
      googleLabels: [],
      location: { city: 'Toronto', country: 'Canada', lat: 43.6532, lng: -79.3832 },
      notes: 'Angel investor. Met through Theo. Very direct; would back a climate idea.',
      custom: { company: 'Prototype VC', title: 'Partner' },
      skills: ['Venture capital', 'Climate tech'],
      lastContactedDaysAgo: 52,
      avatar: avatar('Rahul Mehta', 115),
    },
    {
      id: 'c27', name: 'Yuki Tanaka', email: 'yuki.tanaka@example.com', phone: '+81 90 1234 5678',
      googleLabels: ['Friends'],
      location: { city: 'Kyoto', country: 'Japan', lat: 35.0116, lng: 135.7681 },
      notes: 'Poet, translator. Hosted the most memorable week of my life. Send letters by post.',
      skills: ['Poetry', 'Translation', 'Hosting'],
      custom: { howWeMet: 'Residency — Kyoto 2022' },
      lastContactedDaysAgo: 165,
      avatar: avatar('Yuki Tanaka', 350),
    },
    {
      id: 'c28', name: 'Hiroshi Sato', email: 'hiroshi.sato@example.com', phone: '+81 90 2222 3333',
      googleLabels: ['Friends'],
      location: { city: 'Tokyo', country: 'Japan', lat: 35.6895, lng: 139.6917 },
      notes: 'Made the intro to Kenji. Runs a product studio. Kid just started school.',
      custom: { company: 'Goodpatch', title: 'Studio Director' },
      skills: ['Design', 'Product', 'Hosting'],
      lastContactedDaysAgo: 110,
      avatar: avatar('Hiroshi Sato', 240),
    },
    {
      id: 'c29', name: 'Mei Lin', email: 'mei.lin@example.com', phone: '+852 9876 5432',
      googleLabels: [],
      location: { city: 'Hong Kong', country: 'China', lat: 22.3193, lng: 114.1694 },
      notes: 'Trading desk friend from the London days. Runs triathlons. Always in a time zone away.',
      custom: { company: 'HSBC', title: 'Trader' },
      skills: ['Finance', 'Triathlon'],
      lastContactedDaysAgo: 275,
      avatar: avatar('Mei Lin', 170),
    },
    {
      id: 'c30', name: 'Tom Breckenridge', email: 'tom.b@example.com', phone: '+1 303 555 0177',
      googleLabels: ['Friends', 'Gym'],
      location: { city: 'Denver', country: 'USA', lat: 39.7392, lng: -104.9903 },
      notes: 'Climbing guide. Boulders V8 like it\'s nothing. Went to Patagonia with him in 2023.',
      custom: { company: 'Freelance Guide', title: 'Climbing Guide' },
      skills: ['Climbing', 'Alpine', 'Guiding'],
      lastContactedDaysAgo: 48,
      avatar: avatar('Tom Breckenridge', 85),
    },
    {
      id: 'c31', name: 'Aunt Rosa', email: '', phone: '+1 305 555 0121',
      googleLabels: ['Family'],
      location: { city: 'Miami', country: 'USA', lat: 25.7517, lng: -80.2018 },
      notes: 'Weekly pastelitos recipe debate. Takes things personally when I miss her calls.',
      custom: { relationship: 'Aunt' },
      lastContactedDaysAgo: 14,
      avatar: avatar('Rosa', 330),
    },
    {
      id: 'c32', name: 'Sam Oduya', email: 'sam.o@example.com', phone: '+254 722 555 012',
      googleLabels: [],
      location: { city: 'Nairobi', country: 'Kenya', lat: -1.2921, lng: 36.8219 },
      notes: 'Engineer. Building mobile money tooling. Asked good questions about offline sync.',
      custom: { company: 'Twiga Foods', title: 'Engineering Lead' },
      skills: ['Mobile', 'Offline sync', 'Fintech'],
      lastContactedDaysAgo: 175,
      avatar: avatar('Sam Oduya', 290),
    },
    {
      id: 'c33', name: 'Nadia Kowalski', email: 'nadia.k@example.com', phone: '+48 22 555 01 55',
      googleLabels: ['Work'],
      location: { city: 'Warsaw', country: 'Poland', lat: 52.2297, lng: 21.0122 },
      notes: 'Recruiter who consistently sends good candidates. Horseback rider on weekends.',
      custom: { company: 'Talent Collective', title: 'Partner' },
      skills: ['Recruiting', 'Hiring'],
      lastContactedDaysAgo: 72,
      avatar: avatar('Nadia Kowalski', 145),
    },
    {
      id: 'c34', name: 'Berlin Climbing Crew', email: 'crew@example.com', phone: '',
      googleLabels: [],
      location: { city: 'Berlin', country: 'Germany', lat: 52.52, lng: 13.405 },
      notes: 'Group chat from my Berlin climbing trip — Sofia, Mattias, Léa. Consider breaking into individual contacts later.',
      skills: ['Climbing'],
      lastContactedDaysAgo: 420,
      avatar: avatar('Berlin Crew', 80),
    },
    {
      id: 'c35', name: 'Sofia Braun', email: 'sofia.braun@example.com', phone: '+49 151 2345 6789',
      googleLabels: ['Friends'],
      location: { city: 'Berlin', country: 'Germany', lat: 52.52, lng: 13.405 },
      notes: 'Met in Berlin — part of that climbing crew. Designer, thoughtful, owes me a call back.',
      custom: { company: 'SoundCloud', title: 'Senior Designer' },
      skills: ['Climbing', 'Design'],
      lastContactedDaysAgo: 130,
      avatar: avatar('Sofia Braun', 270),
    },
  ];

  // Attach derived fields
  contacts.forEach((c) => {
    c.lastContactedAt = d(c.lastContactedDaysAgo);
    c.interactions = [
      {
        id: c.id + '-i1',
        date: d(c.lastContactedDaysAgo),
        type: ['hangout', 'call', 'text', 'email'][Math.floor(Math.random() * 4)],
        note: '',
      },
    ];
    c.crmLabels = []; // will be populated after onboarding
    c.nudgeFrequencyDays = null; // e.g. 30 for close friends
  });

  // --- CALENDAR EVENTS --------------------------------------------------
  // Mix: formal invites with contact emails AS guests, plus "Dinner with Priya" type titles
  // that require attendee resolution.
  const events = [
    {
      id: 'e1',
      title: 'Climbing @ Mission Cliffs',
      start: d(6), end: d(6), location: 'Mission Cliffs, SF',
      guestEmails: ['priya.shah@example.com', 'emma.chen@example.com'],
      description: 'Weekly session',
    },
    {
      id: 'e2',
      title: 'Dinner with Alex',
      start: d(12), end: d(12), location: 'Wildair, NYC',
      guestEmails: [], // Alex is in the TITLE — unresolved flow
      description: 'Catch up + try the new menu',
    },
    {
      id: 'e3',
      title: 'Book Club — Catton',
      start: d(16), end: d(16), location: 'Café Zoetrope',
      guestEmails: ['maya.okafor@example.com', 'priscilla.owen@example.com', 'hanna.lund@example.com'],
      description: 'Discussing Birnam Wood',
    },
    {
      id: 'e4',
      title: 'Coffee w/ Jordan',
      start: d(21), end: d(21), location: 'Blue Bottle',
      guestEmails: [],
      description: 'Check in after the kid was born',
    },
    {
      id: 'e5',
      title: 'Quarterly 1:1',
      start: d(28), end: d(28), location: 'Zoom',
      guestEmails: ['theo.laurent@example.com'],
      description: '',
    },
    {
      id: 'e6',
      title: 'Climbing — Castle Rock',
      start: d(33), end: d(33), location: 'Castle Rock State Park',
      guestEmails: ['priya.shah@example.com', 'tom.b@example.com', 'emma.chen@example.com'],
      description: 'Full day trip',
    },
    {
      id: 'e7',
      title: 'Dinner with Aisha & Maya',
      start: d(41), end: d(41), location: 'Superiority Burger, NYC',
      guestEmails: [],
      description: '',
    },
    {
      id: 'e8',
      title: 'Thanksgiving dinner',
      start: d(50), end: d(50), location: 'Mom\'s place',
      guestEmails: ['elena.v@example.com'],
      description: 'Aunt Rosa and dad also there',
    },
    {
      id: 'e9',
      title: 'Design review',
      start: d(58), end: d(58), location: 'Zoom',
      guestEmails: ['sara.bergstrom@example.com'],
      description: 'Onboarding redesign wrap-up',
    },
    {
      id: 'e10',
      title: 'Call with Olu',
      start: d(67), end: d(67), location: 'Phone',
      guestEmails: [],
      description: 'Fintech market in West Africa',
    },
    {
      id: 'e11',
      title: 'Coffee with Marcus',
      start: d(55), end: d(55), location: 'Bewley\'s, Dublin',
      guestEmails: [],
      description: '',
    },
    {
      id: 'e12',
      title: 'Gym session',
      start: d(2), end: d(2), location: 'Mission Cliffs',
      guestEmails: ['emma.chen@example.com'],
      description: '',
    },
    // Upcoming
    {
      id: 'e13',
      title: 'Lisbon trip — Lila dinner',
      start: dFuture(21), end: dFuture(21), location: 'Lisbon',
      guestEmails: ['lila.moreau@example.com'],
      description: '',
    },
    {
      id: 'e14',
      title: 'Book Club — April pick',
      start: dFuture(11), end: dFuture(11), location: 'Maya\'s place',
      guestEmails: ['maya.okafor@example.com', 'priscilla.owen@example.com'],
      description: '',
    },
    {
      id: 'e15',
      title: 'Coffee with Jordan',
      start: dFuture(4), end: dFuture(4), location: 'Ritual, SF',
      guestEmails: [],
      description: '',
    },
    {
      id: 'e16',
      title: 'Weekly call with Mom',
      start: dFuture(2), end: dFuture(2), location: 'Phone',
      guestEmails: ['elena.v@example.com'],
      description: '',
    },
  ];

  // --- USER + GOOGLE PROFILE -------------------------------------------
  const googleProfile = {
    name: 'Julia Rivera',
    email: 'julia.rivera@gmail.com',
    picture: { initials: 'JR', hue: 140 },
  };

  // --- Reserved CRM categories -----------------------------------------
  const reservedCategories = [
    { key: 'close', label: 'CRM: Close Friends', color: '#c86b3a' }, // terracotta
    { key: 'casual', label: 'CRM: Casual Friends', color: '#d9a441' }, // mustard
    { key: 'professional', label: 'CRM: Professional', color: '#4b7a8c' }, // slate teal
    { key: 'family', label: 'CRM: Family', color: '#7a9b64' }, // sage
    { key: 'other', label: 'CRM: Other', color: '#8d7a9b' }, // muted lavender
  ];
  // Multi-category color
  const MULTI_COLOR = '#5b3a8c'; // deep purple

  window.TETHER_MOCK = {
    contacts, events, googleProfile, reservedCategories, MULTI_COLOR,
  };
})();
