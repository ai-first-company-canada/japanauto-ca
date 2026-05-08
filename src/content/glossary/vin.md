---
term: VIN
slug: vin
group: marketplace
priority: 1
canonical_definition: "A Vehicle Identification Number (VIN) is a 17-character alphanumeric code assigned to every motor vehicle since 1981 under ISO 3779, uniquely identifying that specific vehicle's manufacturer, attributes, and serial number."
tldr_draft: "VIN is the global vehicle ID standard. Since 1981, every road vehicle carries a unique 17-character VIN that excludes the letters I, O, and Q to avoid digit confusion. Characters 1–3 identify the World Manufacturer Identifier (WMI), 4–9 the vehicle attributes (with position 9 a check digit), and 10–17 the serial section including model year (position 10) and assembly plant (position 11)."
why_it_matters_in_canada: "In Canada the VIN is the primary key for CarFax Canada history reports, provincial registration (Service Ontario, SAAQ Quebec, ICBC British Columbia), Transport Canada recall lookups, and the Ontario UVIP. Buyers should always physically verify the dashboard VIN matches the door-jamb VIN and the registration document before purchase, since VIN tampering is the foundation of most title fraud."
related_questions:
  - "Where do I find the VIN on a Japanese car?"
  - "What does each character in a VIN mean?"
  - "How do I check a VIN for recalls in Canada?"
  - "Can a VIN tell me if a car is JDM?"
related_terms:
  - "/glossary/carfax/"
  - "/glossary/uvip/"
  - "/glossary/jdm/"
  - "/glossary/salvage-title/"
sources:
  - "https://www.iso.org/standard/52200.html"
  - "https://tc.canada.ca/en/road-transportation/defects-recalls"
  - "https://en.wikipedia.org/wiki/Vehicle_identification_number"
author: japanauto.ca editorial team
body_status: published
---

## What is a VIN?

A Vehicle Identification Number is the 17-character alphanumeric code assigned to every motor vehicle built or sold for road use since 1981. The standard is ISO 3779. The code is unique to a single vehicle, never reused, and acts as the primary key for every record that vehicle generates over its lifetime — registration, insurance, recalls, accident history, lien encumbrance, service work at any dealer or independent shop.

The 17 characters are not random. They split into three logical sections. Characters one through three are the World Manufacturer Identifier — they tell you who built the vehicle and where. A WMI starting with "J" indicates Japanese assembly. "1" or "4" or "5" indicates United States. "2" indicates Canada. Characters four through nine describe the vehicle: model line, body style, engine, transmission, restraint system, with position nine reserved as a mathematical check digit that flags transcription errors. Characters ten through seventeen are the serial portion: position ten encodes model year (a letter or number that follows a 30-year rotating cycle), position eleven identifies the specific assembly plant, and the final six are the unique sequential build number for that vehicle.

Letters I, O, and Q are excluded from the alphabet used in VIN encoding to prevent confusion with the digits 1 and 0. That is why a VIN has 17 characters but does not use all 26 letters.

## Why it matters in Canada

Every Canadian vehicle record is keyed by VIN. [CarFax Canada](/glossary/carfax/) accident and lien reports query against the VIN. Service Ontario, SAAQ in Quebec, ICBC in British Columbia, and Service Alberta all index registration history by VIN. Transport Canada's recall database at defects.tc.gc.ca accepts VIN as the primary search input. The Ontario [UVIP](/glossary/uvip/) — the document an Ontario private seller is legally required to provide — is generated from the VIN. There is no parallel system that bypasses it.

Which is exactly why VIN tampering remains the foundation of most Canadian used-vehicle title fraud. The dashboard VIN visible through the windshield is one of three or four physical locations where the VIN is stamped on a Japanese vehicle. The door-jamb sticker, the engine block, and the firewall are the others. A buyer should physically verify that all four match each other and match the seller's registration before any money changes hands. A vehicle where the dashboard plate looks freshly seated, or where the door-jamb sticker has been replaced, or where the engine VIN has been ground off, is a vehicle to walk away from.

## Common questions

### Where do I find the VIN on a Japanese car?

The most reliable location is the lower driver-side corner of the windshield, visible from outside the vehicle through the dash. The second is the door-jamb sticker on the driver's side, visible when you open the driver's door. Japanese-market and JDM vehicles often have a third stamping on the firewall in the engine bay — usually on a metal plate or directly on the bulkhead. The engine block carries an engine number, but that is technically separate from the chassis VIN and is used for engine matching rather than vehicle identification. All three of the chassis VIN locations should match each other and match the registration document.

### What does each character in a VIN mean?

Position 1 through 3 identify the manufacturer and country of origin. Position 4 through 8 describe the vehicle: model, body style, engine, transmission, and restraint system. Position 9 is a mathematical check digit calculated from the other 16 characters that flags transcription errors. Position 10 encodes the model year on a rotating 30-year cycle of letters and digits — for example, "M" was 2021 in the current cycle and will be 2051 in the next. Position 11 identifies the assembly plant. Positions 12 through 17 are the unique sequential build number for that specific vehicle within that plant for that model year.

### How do I check a VIN for recalls in Canada?

Transport Canada operates a free public recall lookup at defects.tc.gc.ca. Enter the 17-character VIN and the database returns any open or completed recalls applicable to that specific vehicle, plus the description of the defect and the dealer remedy. Manufacturers are legally obligated under the Motor Vehicle Safety Act to repair safety recalls at no charge to the owner regardless of vehicle age or current ownership, so an open recall on a used car you are considering is repairable for free at any same-brand Canadian dealer. The result also appears on every [CarFax Canada](/glossary/carfax/) report and on the Ontario UVIP.

### Can a VIN tell me if a car is JDM?

The first character is the strongest signal. A VIN starting with "J" indicates Japanese assembly — but that alone does not tell you whether the vehicle was built for Japan or for export. A 2009 Toyota Camry built in Japan for the Canadian market also has a "J" prefix. The fuller test is the combination of WMI, model code in positions 4 through 8, and the absence of a Canadian or US-spec dealer record on a [CarFax Canada](/glossary/carfax/) report. A genuine [JDM](/glossary/jdm/) import will typically show no Canadian service history before its [RIV](/glossary/riv-program/) registration date and may carry a Japanese-format chassis number on the firewall plate.
