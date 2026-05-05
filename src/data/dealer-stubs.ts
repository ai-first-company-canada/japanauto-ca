/**
 * src/data/dealer-stubs.ts — Phase 1.4 placeholder dealer profiles.
 *
 * 12 dealer profiles matching the names used in catalog-stubs.ts DEALERS list.
 * Phase 2 replaces with /api/dealers/[slug] D1 query.
 */

import type { CatalogListing } from './catalog-stubs';

export interface ExtendedListing extends CatalogListing {
  drivetrain: 'AWD' | 'FWD' | 'RWD';
  fuel: string;
  bodyType: string;
  doors: number;
  seats: number;
  engine: string;
  exteriorColor: string;
  interiorColor: string;
  vin: string;
  vinVerified: boolean;
  condition: string;
  description: string[];
}

export interface DealerHours {
  d: string;
  h: string;
  dow: number[];
}

export interface DealerProfile {
  name: string;
  slug: string;
  type: 'dealer' | 'salvage_yard';
  badge: string;
  city: string;
  province: string;
  address: string;
  phone: string;
  phoneTel: string;
  email: string;
  web: string;
  webHref: string;
  amvic: string | null;
  hours: DealerHours[];
  listingsCount: number;
}

const STANDARD_HOURS: DealerHours[] = [
  { d: 'Mon–Fri',  h: '9:00 – 18:00',  dow: [1, 2, 3, 4, 5] },
  { d: 'Saturday', h: '10:00 – 16:00', dow: [6] },
  { d: 'Sunday',   h: 'Closed',        dow: [0] },
];

const EXTENDED_HOURS: DealerHours[] = [
  { d: 'Mon–Thu',  h: '9:00 – 19:00',  dow: [1, 2, 3, 4] },
  { d: 'Friday',   h: '9:00 – 17:00',  dow: [5] },
  { d: 'Saturday', h: '10:00 – 16:00', dow: [6] },
  { d: 'Sunday',   h: 'Closed',        dow: [0] },
];

export const DEALER_PROFILES: Record<string, DealerProfile> = {
  'maple-auto-group': {
    name: 'Maple Auto Group', slug: 'maple-auto-group',
    type: 'dealer', badge: 'AMVIC-licensed',
    city: 'Calgary', province: 'AB',
    address: '1234 16 Ave NE, Calgary, AB T2E 1J5',
    phone: '(403) 555-1234', phoneTel: '+14035551234',
    email: 'sales@mapleauto.ca',
    web: 'mapleauto.ca', webHref: 'https://mapleauto.ca',
    amvic: '1234567', hours: STANDARD_HOURS, listingsCount: 47,
  },
  'north-star-motors': {
    name: 'North Star Motors', slug: 'north-star-motors',
    type: 'dealer', badge: 'AMVIC-licensed',
    city: 'Edmonton', province: 'AB',
    address: '5678 Stony Plain Rd, Edmonton, AB T5N 3K5',
    phone: '(780) 555-6789', phoneTel: '+17805556789',
    email: 'info@northstarmotors.ca',
    web: 'northstarmotors.ca', webHref: 'https://northstarmotors.ca',
    amvic: '7654321', hours: EXTENDED_HOURS, listingsCount: 32,
  },
  'cypress-imports': {
    name: 'Cypress Imports', slug: 'cypress-imports',
    type: 'dealer', badge: 'Verified seller',
    city: 'Vancouver', province: 'BC',
    address: '910 Boundary Rd, Vancouver, BC V5K 4T6',
    phone: '(604) 555-2468', phoneTel: '+16045552468',
    email: 'contact@cypressimports.ca',
    web: 'cypressimports.ca', webHref: 'https://cypressimports.ca',
    amvic: null, hours: STANDARD_HOURS, listingsCount: 28,
  },
  'eastside-pre-owned': {
    name: 'Eastside Pre-Owned', slug: 'eastside-pre-owned',
    type: 'dealer', badge: 'OMVIC-registered',
    city: 'Toronto', province: 'ON',
    address: '4321 Eastern Ave, Toronto, ON M4M 1B8',
    phone: '(416) 555-1357', phoneTel: '+14165551357',
    email: 'sales@eastsidepreowned.ca',
    web: 'eastsidepreowned.ca', webHref: 'https://eastsidepreowned.ca',
    amvic: null, hours: STANDARD_HOURS, listingsCount: 64,
  },
  'summit-japanese-auto': {
    name: 'Summit Japanese Auto', slug: 'summit-japanese-auto',
    type: 'dealer', badge: 'AMVIC-licensed',
    city: 'Calgary', province: 'AB',
    address: '7890 MacLeod Trail SW, Calgary, AB T2H 2T5',
    phone: '(403) 555-9876', phoneTel: '+14035559876',
    email: 'sales@summitjapaneseauto.ca',
    web: 'summitjapaneseauto.ca', webHref: 'https://summitjapaneseauto.ca',
    amvic: '2468135', hours: STANDARD_HOURS, listingsCount: 41,
  },
  'westview-cars': {
    name: 'Westview Cars', slug: 'westview-cars',
    type: 'dealer', badge: 'Verified seller',
    city: 'Vancouver', province: 'BC',
    address: '2580 Kingsway, Vancouver, BC V5R 5H1',
    phone: '(604) 555-3691', phoneTel: '+16045553691',
    email: 'info@westviewcars.ca',
    web: 'westviewcars.ca', webHref: 'https://westviewcars.ca',
    amvic: null, hours: EXTENDED_HOURS, listingsCount: 22,
  },
  'granite-motors': {
    name: 'Granite Motors', slug: 'granite-motors',
    type: 'dealer', badge: 'OMVIC-registered',
    city: 'Ottawa', province: 'ON',
    address: '1467 Carling Ave, Ottawa, ON K1Z 7L9',
    phone: '(613) 555-7531', phoneTel: '+16135557531',
    email: 'sales@granitemotors.ca',
    web: 'granitemotors.ca', webHref: 'https://granitemotors.ca',
    amvic: null, hours: STANDARD_HOURS, listingsCount: 18,
  },
  'riverbend-auto': {
    name: 'Riverbend Auto', slug: 'riverbend-auto',
    type: 'dealer', badge: 'AMVIC-licensed',
    city: 'Edmonton', province: 'AB',
    address: '3210 Whitemud Dr, Edmonton, AB T6K 1M3',
    phone: '(780) 555-1593', phoneTel: '+17805551593',
    email: 'contact@riverbendauto.ca',
    web: 'riverbendauto.ca', webHref: 'https://riverbendauto.ca',
    amvic: '1357924', hours: EXTENDED_HOURS, listingsCount: 35,
  },
  'pacific-heights-auto': {
    name: 'Pacific Heights Auto', slug: 'pacific-heights-auto',
    type: 'dealer', badge: 'Verified seller',
    city: 'Vancouver', province: 'BC',
    address: '1840 Marine Dr, North Vancouver, BC V7P 1V4',
    phone: '(604) 555-7894', phoneTel: '+16045557894',
    email: 'sales@pacificheightsauto.ca',
    web: 'pacificheightsauto.ca', webHref: 'https://pacificheightsauto.ca',
    amvic: null, hours: STANDARD_HOURS, listingsCount: 19,
  },
  'crescent-imports': {
    name: 'Crescent Imports', slug: 'crescent-imports',
    type: 'dealer', badge: 'OMVIC-registered',
    city: 'Toronto', province: 'ON',
    address: '950 Don Mills Rd, Toronto, ON M3C 1V2',
    phone: '(416) 555-4682', phoneTel: '+14165554682',
    email: 'info@crescentimports.ca',
    web: 'crescentimports.ca', webHref: 'https://crescentimports.ca',
    amvic: null, hours: EXTENDED_HOURS, listingsCount: 53,
  },
  'northgate-pre-owned': {
    name: 'Northgate Pre-Owned', slug: 'northgate-pre-owned',
    type: 'dealer', badge: 'Quebec-licensed',
    city: 'Montreal', province: 'QC',
    address: '7800 Boul. Métropolitain Est, Montréal, QC H1K 1A1',
    phone: '(514) 555-9512', phoneTel: '+15145559512',
    email: 'ventes@northgatepreowned.ca',
    web: 'northgatepreowned.ca', webHref: 'https://northgatepreowned.ca',
    amvic: null, hours: STANDARD_HOURS, listingsCount: 38,
  },
  'highland-motors': {
    name: 'Highland Motors', slug: 'highland-motors',
    type: 'dealer', badge: 'OMVIC-registered',
    city: 'Toronto', province: 'ON',
    address: '2900 Highway 7, Concord, ON L4K 3R4',
    phone: '(416) 555-6347', phoneTel: '+14165556347',
    email: 'sales@highlandmotors.ca',
    web: 'highlandmotors.ca', webHref: 'https://highlandmotors.ca',
    amvic: null, hours: STANDARD_HOURS, listingsCount: 29,
  },
};

const FALLBACK_DEALER = DEALER_PROFILES['maple-auto-group']!;

export function getDealerByName(name: string): DealerProfile {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return DEALER_PROFILES[slug] ?? FALLBACK_DEALER;
}
