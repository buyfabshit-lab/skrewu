# How it snapped together — the wiring

The companion to `TONIGHT.md`. That one is what the system *is*. This one is how
the pieces actually connect: the board, the nodes, every door between parts, and
every connection that has to be made for a thing to come alive.

Written to be read to an AI so it can hold the whole shape at once. **No secret
is written down anywhere in here** — every key is named, never given.

---

## 1. The shape of the whole thing

Three layers, and only three:

**Pages** — plain HTML and JavaScript. No build step, no framework, no compiler.
A page is a file; open it and it runs. This is deliberate: anything can be
opened, read and changed without a toolchain, by a person or by an AI.

**Doors** — a small number of server-side functions. The browser never touches
the database directly. It asks a door, the door checks who's asking, and the
door answers with only that caller's things.

**Store** — one database and one file store behind those doors.

```
   a page  ──asks──▶  a door  ──checks who you are──▶  the store
                        │
                        └── and only ever answers with your own things
```

Everything else in this document is detail hanging off that picture.

---

## 2. The board, and what a node really is

The board is the blank canvas where the production line is drawn. It is the
mental model for the whole system, so it's worth understanding precisely.

### The pieces

**A node** is one part of the line drawn as a block. It has a kind (locker, gang
sheet, orders console…), a position, and optionally a label you give it.

**A port** is the little connector on each side of a block. Left is *in*, right
is *out*. You tap an out port, then tap an in port, and that draws a wire.

**A wire** is a hand-off: "what comes out of this goes into that". Tap a wire to
cut it.

**Inside** a node is the second screen. Open one and the real tool loads inside
it, live, with a glowing marker on each of its actual buttons. Orange means that
button isn't wired to anything yet. Green means it is. Tap a marker and you say
three things: which service runs it, what you tell that service to do, and what
it costs you per run.

There is also a **map view** — the same node with every one of its connections
fanned out around it in a ring — for parts that have no page of their own.

### The three catalogs

Everything on the board comes from three plain lists. This is the part that
makes it extensible without touching any of the drawing code.

**Parts — 23 of them.** Each entry is a name, a one-line description, where it
opens, and whether it's wired, needs a key, is gated, or is done by hand:

> locker · logomaker · vault · shirts · gangsheet · sticker · blanks · deploy ·
> shopify · tiktok · drive · live · omniflow · wholesale · ticket · press ·
> manifest · tracking · aiimage · aivideo · fusion · custom · folder

Three of those deserve a note. **`folder`** is a real folder on your computer —
on a desktop browser it asks for a directory and remembers it, so exported files
land where you actually keep them. **`press`** and **`ticket`** are hands-on
steps: they're on the line because the line is the *whole* process, including
the parts a machine doesn't do. **`fusion`, `aiimage`, `aivideo`** are AI parts
with no endpoint yet — sockets waiting for a service.

**Services — 17 of them.** What can run a button:

> supabase · drive · shopify · tiktok · ss · anthropic · bgremove · upscale ·
> vector · n8n · mine · hedra · photoshop · photoroom · browser · folder · hands

Two of those are honest non-services: **`browser`** means it runs on the device
and needs nothing, and **`hands`** means a person does it. A part that says
"hands" isn't unfinished — it's accurately described.

**Capabilities** — for each part, the list of things it can do, and which
service runs each by default. The gang sheet's list, for instance, is: pack the
sheet · export at 300 DPI · save to folder · keep a copy.

### Where the board's state lives

On the device, in the browser's own storage, under one key. It holds: the nodes
and their positions, the wires, which service each button is wired to, the
prompts, and the costs.

**Two rules about that state, both learned the hard way:**

Arranging blocks is *layout*. Wiring them up is *work*. They must not share a
delete button. "Reset line" puts the blocks back and keeps every service,
prompt and rate you set — because the original version threw all of it away and
that was a genuine bug hiding behind an innocent-looking button.

**Saved setups** store the blocks and the hand-offs but never the wiring. So
loading a different arrangement rearranges the line without disturbing the
services behind it.

### Adding a part

One entry in the parts list, one entry in the capabilities list. That's it — no
drawing code, no layout code. If a part is a page in this project, the board
loads that page live inside the node and finds its buttons on its own, by
looking for buttons that have an identifier and readable text.

---

## 3. Every page, and what it's for

| Page | What it is |
|---|---|
| `intro.html` | The guide. Talks for twenty seconds, then offers four roads. |
| `start.html` | The same four roads, plain, for anyone who'd rather not be talked to. |
| `board.html` | The line itself. Drag, wire, look inside, save setups. |
| `hub.html` | Every tool at once, in work order. |
| `setup.html` | The owner's side: make a space for someone, hand them a link. |
| `locker.html` | One person's private space — logos, shirts, gang sheets. |
| `sticker.html` | The customer builds their own UV sticker sheet and orders it. |
| `blanks.html` | Pick which blanks your shop actually prints. |
| `normalize.html` | Cut out a garment photo, trim it, centre it at true scale. |
| `deploy.html` | Push a finished product to the sales channels. |
| `store.html` | Sells the tools and the art packs — the plain grid. |
| `showcase.html` | The same catalogue as a full show: one tool per screen, with an action shot built from that tool's own shapes. |
| `aiimage.html` | Make artwork from a prompt. Aspect, resolution, batch. |
| `aivideo.html` | Make a clip from a prompt. Aspect, length. |
| `credits.html` | What a shop has to spend, what a run costs, and topping up. |
| `live.html` | The stream overlay — orders landing as they're paid. |
| `backdrop.html` | The layer behind you on a stream. |
| `stage.html` | Phone control for what's on the overlay, mid-stream. |
| `order-manifest.html` | Pull and pack sheet. |
| `order-confirmation.html` | What the buyer sees afterwards. |
| `index.html` | The public community site. |

---

## 4. The doors, and their exact contracts

Thirteen functions. Every one of them lives at `/api/<name>`.

### The tenant wall — `/api/locker`

**The only way to a shop's artwork.** The browser never reaches those tables.

```jsonc
POST /api/locker
{ "action": "...", "who": "<slug>", "key": "<their access key>", ... }
```

| action | you send | you get |
|---|---|---|
| `whoami` | — | their name, branding, tools; a partner also gets their own clients |
| `list` | `{ table }` | their rows |
| `insert` | `{ table, row }` | new row, ownership stamped by the server |
| `update` | `{ table, id, patch }` | updated row — only if it's theirs |
| `remove` | `{ table, id }` | deleted row — same |

`table` is one of `logos` · `shirts` · `garments` · `gangsheets`.

**The guarantees, which must not be removed:**
- wrong or missing key → refused; unknown shop → not found
- every query filtered to that shop — **no request shape returns another shop's rows**
- ownership fields are stripped from anything a caller sends, then set by the server
- a partner's `whoami` returns only clients whose parent is that partner

### Public shop config — `/api/shop`

```
GET /api/shop?shop=<slug>
→ { slug, name, accent, domain, sheets, theme }
```

No key needed, on purpose — this is a shop's web address and the IDs of products
already listed publicly on it. **It is a separate function from the locker
specifically so the locker's rule stays absolute: no key, no data.** It reads
named columns only, so nothing secret can leak through it even as the table
grows new fields.

### The stream — `/api/live`

```
GET  /api/live?shop=<slug>&k=<key>   → the day's numbers, recent orders, the stage
POST /api/live?shop=<slug>&k=<key>   { stage: {...} }  → change what's on screen
```

Two constraints built into the function itself:

- **It needs the key.** An overlay URL lives in streaming software, but URLs
  leak — pasted in chat, caught in a screen recording. Orders aren't public.
- **It returns a first name and a city. Nothing else.** No surname, email,
  street or phone. That data is going on a public livestream and the buyer never
  agreed to it. If a field isn't on the allowed list it does not leave the
  database.

The stage — logo, headline, sub-line, a picture or a clip, and which panels show
— is checked before it's stored: only known fields, and any image or video link
must be a normal web address. A script-flavoured link has no business on a page
we render.

### Setting people up — `/api/tenants`

```jsonc
POST /api/tenants
{ "action": "list" | "create" | "update", "who": "<you>", "key": "<your key>", ... }
```

**The most sensitive door, because it mints access.** Four rules hold it:

1. The caller proves themselves with their own key.
2. Only an owner or a partner may set anyone up. A client cannot.
3. A new space is **always** a client and **always** belongs to the caller.
   Neither of those comes from the request — so escalation is *impossible*, not
   merely forbidden. Ask for an owner and you get a client belonging to you.
4. Every read and write is filtered by who owns whom, so a partner sees only
   their own people. Not a role check — a data filter.

A child's key **is** returned, because handing somebody their link is the entire
job. The caller's own key never is.

### Order intake — `/api/shopify-order`

The shop platform calls this the moment an order is paid.

- **Every message is verified as genuinely from the shop platform**, by signature
  over the exact bytes received. With no signing secret configured the endpoint
  refuses everything — an unverified order endpoint lets anyone write into your
  order list.
- **Redelivery cannot duplicate.** Each order maps to one identifier, and the
  write is an upsert on it.
- **A failed write returns a failure**, so the platform retries. An order
  vanishing quietly is the one unacceptable outcome.
- It pulls the print file out of the order line and puts it in the order's notes,
  so whoever pulls the order sees the artwork.
- Classification is honest: 12+ units → wholesale; express shipping → expedited;
  missing address or email → *needs review*, never a guess.

### The rest

| Door | What it does |
|---|---|
| `/api/blanks` | The supplier catalogue, filtered by brand and line. Without keys it returns stand-ins **and says so in the response**, so the page can tell the truth. |
| `/api/deploy-shopify` | Creates a product on the shop. Draft by default. |
| `/api/generate-description` | Product copy. Falls back to a template with no key. |
| `/api/checkout` | Card checkout for the tool store. Prices come from files in the project, never from the browser, so an amount can't be tampered with. |
| `/api/orders` | A shop's own orders, and nobody else's. Proves the shop the way the locker does, then filters to that shop. Only status, classification, notes and tags can be changed — not the money, not the customer, not the owner. |
| `/api/generate` | Makes an image or a clip. Requires the shop's key, charges credits before the work, refunds if it fails. |
| `/api/credits` | Balance, what a run costs, the packs, and starting a top-up checkout. |
| `/api/stripe-order` | Stripe's side of the till: a paid checkout becomes either an order in the console or credits in a wallet. Signature checked, replay window five minutes, idempotent on the session id. |

---

## 5. The store behind the doors

**`tenants`** — every shop and every person. Holds: their slug, name, who their
parent is, what kind they are (owner / partner / client), their access key, their
branding, which tools they get, their shop config, their stage, and whether
they're active.

**The four locker tables** — `locker_logos`, `locker_shirts`, `locker_garments`,
`locker_gang_sheets`. Every row carries which shop it belongs to. **All four
refuse the public key outright.** They are reachable only through the locker
door.

**`omniflow_orders`** — every order from every channel, in one shape. Every row
carries **`tenant_slug`**: which shop the order belongs to. That column was
missing at first, and while it was missing a second shop taking orders would
have seen the first shop's buyers in its console — and on its livestream, where
the overlay reads these same rows and puts names and cities in front of an
audience. Everything that reads orders filters by it.

The same table was also **readable by anyone**. Row-level security was switched
on, which looks right, but its three policies granted the public role SELECT,
INSERT and UPDATE with the condition `true`. The console read the table straight
from the browser using the publishable key, and a publishable key is printed
inside the page. Every customer name, email and street address was one request
away. The policies are gone; orders travel through `/api/orders` and the signed
webhook, both of which use the service role. Checked as the public role: it saw
every row before, and none after.

**The wallet** — `ms_users`, `ms_credit_ledger`, `ms_credit_packs`, `ms_plans`,
`ms_generations`. This existed before the platform did, built around an email
account. A wallet can now belong to a **tenant** instead, so credits work with no
signup. See section 5b.

**File storage** — buckets for artwork, mockups, sheets and finished print files.

**`tenant_integrations`** — where a shop's authorisation to another platform
lives: one row per shop per provider, holding the tokens, the provider's own ID
for that shop, and when the grant expires. **It refuses the public key
outright**, like the locker tables, and nothing serves it through a door.

There was an obvious-looking place to put these instead — the shop record
below — and it is a trap. `/api/shop` hands that record to anybody who asks,
with **no key at all**, because a storefront has to read its own theme and
prices before it knows who the visitor is. A token parked there would have been
published. The rule is short: **a credential never goes in `tenants.shop`.**

### The shop record

```jsonc
{
  "domain": "theirshop.com",
  "theme": "pro",
  "sheets": { "ltr": { "variant": "<their product ID>", "price": 18 } },
  "sizes":  { "mens": { "ref_size": "L", "length_in": 28.5 } }
}
```

Everything shop-specific lives here. **Nothing shop-specific belongs in code.**
A shop hard-coded anywhere is a bug — it means somebody else's customer ends up
in the wrong checkout. That was a real bug, found and fixed.

---

## 5b. Credits — the fuel

Making an image or a clip costs real money at the provider, so runs are metered.

**What a run costs** lives in one module on the server (`_credits.js`) and
nowhere else, so the number a tool quotes and the number the server charges are
the same by construction. Today: 20 credits for an image at 1K, 30 at 2K, 200
for a five-second clip, 400 for ten.

**A wallet belongs to a tenant.** It's made the first time it's needed, so
nobody signs up for one. The older email accounts keep their own wallets; a
constraint says a wallet belongs to an email account or a tenant and never to
neither. There is deliberately no synthesised email address — something
eventually tries to send mail to one.

**Four rules hold the money together:**

1. **Spending is one statement in the database.** Two tabs generating at the
   same moment cannot both pass a balance check and overdraw. Not enough credits
   is refused before any work is done.
2. **A purchase is idempotent on the payment event.** The same webhook delivered
   ten times adds credits once.
3. **The pack's size is read from the database, never from the checkout
   session.** A tampered checkout cannot mint credits.
4. **A failed run is refunded, and says so.** Nobody pays for something they
   didn't get.

**Every movement is written down** — bought, spent, put back — each with the
balance after it. That ledger is the record, not the console.

**No identity, no run.** Every generation must say which shop it's for, proved
the same way a locker is. Without that the endpoint spends real money for
anyone who finds the URL, which is exactly what it did before this was added.

---

## 6. Every connection, and what it turns on

All of these are settings on the hosting platform, under the site's environment
variables. **Never in the project, never in a chat, never in a screenshot.**

### The one that matters most

| Name | What it is | Turns on |
|---|---|---|
| `SUPABASE_URL` | the database address | — |
| `SUPABASE_SERVICE_ROLE_KEY` | the database master key, server-side only | **lockers, setup, shop config, the stream overlay — all at once** |

Nothing that touches a shop's own data works until those two exist. Set them for
all deploy contexts, mark the second as a secret, and redeploy — environment
values only reach the functions on a fresh build.

### The shop

| Name | Turns on |
|---|---|
| `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` | pushing products to the shop |
| `SHOPIFY_WEBHOOK_SECRET` | **live order intake** |

Token: shop admin → Apps → develop apps → create → allow product read/write →
install → reveal once.

Order intake: shop admin → Notifications → Webhooks → create → event *order
creation*, format JSON, pointed at `/api/shopify-order`. Copy the signing secret
it shows into `SHOPIFY_WEBHOOK_SECRET`. Orders then land within seconds.

### The rest

| Name | Turns on |
|---|---|
| `SS_ACCOUNT_NUMBER` + `SS_API_KEY` | the real blanks catalogue instead of stand-ins |
| `STRIPE_SECRET_KEY` | card checkout — the tool store **and** buying credits |
| `STRIPE_WEBHOOK_SECRET` | **the money arriving**: a paid checkout becoming an order, or credits landing in a wallet |
| `FAL_KEY` | the AI image and video tools. One key covers both — that's why it's one provider and not one account per model |
| `GEN_IMAGE_MODEL` / `GEN_VIDEO_MODEL` | optional. Which model does the work. Swapping models is a setting, not a code change |
| `ANTHROPIC_API_KEY` | AI product descriptions (template without it) |
| `DEPLOY_SHARED_KEY` | optional password on the deploy endpoint |

Card payments: the payment platform's dashboard → developers → API keys for the
secret one. Then developers → webhooks → add an endpoint pointed at
`/api/stripe-order`, subscribed to the completed-checkout event, and copy the
signing secret it shows. Without that second secret the endpoint refuses
everything, because an unsigned money endpoint lets anyone write sales and
credits into your system.

**Not an environment value:** cloud artwork backup is a credential inside the
automation runner, on the upload step of the sync workflow.

**Blocked on someone else:** the short-video shop platform. Partner approval
came through, so the two settings it needs — `TIKTOK_APP_KEY` and
`TIKTOK_APP_SECRET`, both from the partner console's app page — can be filled in
now. What still can't be finished blind is the token exchange: it uses one
specific non-obvious grant type, the token then travels in a custom header, and
every call afterwards is signed. That has to be proved against a sandbox shop
before a real seller touches it, so `/api/tiktok-auth` stands at its address,
refuses anything that isn't a genuine callback, and says plainly that it isn't
finished rather than writing a half-authorised shop into the database. When it
is finished, what it writes goes in `tenant_integrations` — never the shop
record.

---

## 7. How a person snaps in

```
owner  (the platform)
 ├── partner            ← gives their own clients tools
 │      └── client, client, client…
 └── client
```

Each has an access key. Their link carries it:

```
locker.html?who=<slug>&k=<their key>
```

**The link is the credential.** No login, no password, no email — and it opens
only that one space. This is a deliberate trade, and the warning is printed on
screen every single time a link is created: *anyone who has this link is in.*

The setup page does the whole thing in fifteen seconds: name, face, tools,
button, link.

---

## 8. Faces

A face is a palette, a typeface, and a set of words — held in one settings file,
applied before the page paints. Five exist: ours, corporate, schools and clubs,
island, pet shops.

Which face, in order of precedence: named in the link → the shop's own setting →
what this device chose last → the default.

**No page owns the brand.** Every place a name appears is a slot filled in by
whichever face is on, tab titles included. A face pinned in a link is carried
onto every link you click, so somebody looking at the corporate face never gets
dropped back into ours.

Adding a sixth face is a block of settings and no code.

Each face also carries its own version of the guide's six lines, and can carry a
video of a real presenter instead of the drawn one — in which case the same
lines still type underneath, so it works on mute and still reads right if the
video never loads.

---

## 9. How to add a new part, end to end

1. **Make the page.** Plain HTML and JavaScript. Give its buttons identifiers
   and readable text, and the board will find them by itself.
2. **Add it to the parts list** — name, description, where it opens, status.
3. **Add its capabilities** — what it can do, and which service runs each.
4. **If it needs shop data,** call the locker door. Never the database.
5. **If it needs a new service,** add it to the services list; it becomes
   choosable on every button everywhere.
6. **If it needs a key,** read it from the environment on the server side, and
   make the feature say so plainly when it's missing.

That's the whole recipe. There is no registry to update, no build to run, no
framework to satisfy.

---

## 10. The rules that make it hold together

1. **No real key in a chat, a screenshot, or the project.** Environment only.
2. **A shop's data only through the guarded door.** When something doesn't work,
   the fix is never "open up the database".
3. **Fail closed.** Missing key means the feature stays dark and says so — never
   a quiet fallback to unguarded access.
4. **Products publish as drafts.**
5. **The platform is not a shop.** Every shop is a tenant, ours included.
6. **Never dress fake data as real.** Stand-ins say they're stand-ins, on screen.
7. **On a livestream: first name and city only.**
8. **Layout and work don't share a delete button.**
9. **Don't ship what you can't verify.** There's no QR code on the stream yet for
   exactly this reason — no way to test that the output scans correctly, and a QR
   that scans wrong is worse than none.
10. **Anything that spends money must say who's paying.** An endpoint that runs
    a paid model without checking identity spends real money for anyone who
    finds the URL. It's the same rule as the tenant wall, applied to a bill.
11. **A price lives in one place.** The moment a number exists in both the page
    and the server, they eventually disagree, and the customer finds it first.
12. **Never cache a failure.** A cached error makes a correct fix look broken
    for as long as the cache lasts, and the next move is usually to undo the
    fix. Only good answers get cached.
13. **Name the missing piece.** "Set one of these two" reads the same whether
    one is missing or both, so half-finished setup looks identical to untouched.
    A setting's *name* is not a secret; its value is.

---

## 11. The one-paragraph summary, if only one thing is remembered

Pages ask doors; doors check who you are and answer only with your own things.
Every tool is a part on one line, described by three plain lists, so adding the
fortieth is no harder than the fourth. Every shop is a tenant including our own,
so nothing about any shop lives in code. Anything that costs money — a run, a
sale, a top-up — is metered, written down, and refunded when it fails. And every
feature either has its key and works, or has no key and says so — it never
pretends.
