# What we built tonight, and how it works

Written to be read aloud to another AI, or pasted into one, so it understands
this system without having been here. Plain language on purpose. No secrets in
it — every key is named but never written down.

---

## The one-sentence version

It's a print shop's whole operation as software: artwork goes in one end, a
boxed order comes out the other — and it's built so the same engine can be
handed to any number of other shops, each seeing their own name, their own
colours and their own customers.

---

## The idea that holds it together

**Everything is a part on one line.**

Not sections, not rooms, not separate apps. One line of production, and every
tool is a block on it. A locker where artwork lives. A studio that puts a logo
on a shirt. A gang sheet packer. A sticker builder. An orders console. A
shipping sheet. Each block is a part, and you snap in as many or as few as you
need.

This matters because it keeps the thing learnable. Somebody who has understood
one block has understood all of them — same drag, same "look inside", same
wiring screen. Adding the tenth part doesn't make it harder to use than the
third. That's what lets it be handed to a hundred different people and still be
the same thing.

**The second idea: the platform is not a shop.**

Every shop on the system is a tenant, including our own. DEATH CORPS is a
customer of this platform, not the platform itself. Nothing about any one shop —
its web address, its product IDs, its branding — lives in the code. It lives on
that shop's record. A shop hard-coded anywhere is a bug, because it means
somebody else's customer ends up in the wrong checkout.

---

## What a person sees, in order

### 1. They arrive and someone explains it

A guide appears and talks for about twenty seconds. Typed on screen, or spoken
out loud — the visitor picks which, and the speech uses the voice already built
into their phone, so it costs nothing.

She says six things, and every one of them is true of the software:

> Alright — this'll take twenty seconds.
> Everything you make runs down one line. Art in one end, a boxed order out the other.
> It's all open. Every tool, right now. Nothing locked, nothing to unlock.
> You choose the way through — gang sheets, shirts, stickers, or just the orders.
> Any of them. They all come out the same end.
> And it's never stuck. Add a part, move one, throw one out. The line is yours.

Then she gets out of the way.

### 2. They pick a road

Four choices — gang sheets, shirts and merch, stickers, or just taking orders —
with **ORDER OUT THE DOOR** written underneath all four, because the point is
that every road ends in the same place. Choose your own adventure, one exit.

### 3. Their line is already built

One tap and they land on a board with their production line laid out and
already wired. Nobody ever meets a blank canvas. They can drag blocks, add
parts, throw parts out, and save an arrangement they like by name to come back
to later.

Open any block and you see the real tool running inside it, with a glowing
marker on each of its actual buttons. Tap a marker and you say what runs that
button — which service, what you tell it to do, what it costs you per run. A
marker glows orange until it's set and green once it is.

---

## The tools themselves

**Client Locker** — a private space per person. Their logos, their shirts, their
sheets. Opened by a link; that link only opens their space and nobody else's.

**Shirts Studio** — a logo dropped onto a photo of a real blank, dragged and
sized, saved as the listing picture.

**Gang Sheet Builder** — packs artwork onto a 22" or 24" roll and exports a
print-ready file at 300 dots per inch.

**UV Sticker Sheets** — the customer builds their own. Pick a sheet size, drop
art on, drag each sticker where they want it, and it tells them how much of the
sheet they've used and whether anything is hanging off the edge. Then they can
order it, and we'll come back to what happens next.

**Blanks Picker** — a supplier catalogue is ten thousand styles and a shop
prints maybe ten of them. Browse by brand and by line — Bella tanks, Gildan
fleece — tick what you'd actually print, and those become your shop's blanks.
Everything downstream works from your ten instead of the supplier's ten
thousand.

**Blank Normalizer** — takes a garment photo, cuts it out, trims the empty
space, and centres it on a standard canvas with a real border. More on why
below, because it's the part most people get wrong.

**Logo Maker, Logo Vault, Deploy Panel, OmniFlow Orders, Wholesale Form, Ship
Manifest, Customer Tracking** — the rest of the line.

**Live Overlay, Backdrop, Stage Control** — the streaming set. Also below.

---

## How an order actually flows

This is the part that makes it a business rather than a toolbox.

1. A customer opens the sticker builder and lays out a sheet.
2. They press order. The layout is rendered into a real print file at 300 dots
   per inch and stored.
3. They're handed to that shop's checkout with the print file attached to the
   order line.
4. They pay. The shop takes the money — not us.
5. The shop's system tells ours, within seconds, that an order happened.
6. It lands in the orders console **with the artwork already attached**.
7. From there: pull sheet, print, ship, and the customer can track it.

Nobody emails anybody a file. The person pulling the order sees the print file
right on it.

Three things about that step 5 that shouldn't be changed:

- **Every message is checked to be genuinely from the shop platform.** Without
  that check the endpoint is refused entirely, because an unchecked order
  endpoint means anyone on the internet can write orders into your list.
- **Repeat deliveries can't duplicate an order.** Each order maps to one
  identifier, so it can be delivered ten times and still be one order.
- **A failure is reported as a failure**, so the platform retries. An order
  quietly disappearing is the one thing that must never happen.

And it doesn't guess: twelve or more units is treated as wholesale, express
shipping as expedited, and anything missing an address or an email goes to
"needs review" rather than being filed into the wrong bucket.

---

## Selling on a livestream

**The overlay** goes over the video. The shop name, the day's count, and every
order sliding in the second it's paid — because by then it's already in the
system. Plus what to buy and where.

It lays itself out for a phone-shaped live automatically. TikTok's own furniture
covers the top, the bottom quarter and the right edge, so everything sits in the
band that stays clear and the text is sized up for a phone. In setup mode it
draws those covered areas in so you can see what TikTok will hide before you go
live.

**The backdrop** goes behind you — the shop's colours as the room you're
standing in. Nothing animates in code, because the machine is already encoding
video and an animation loop competing with an encoder drops frames.

**Stage control** is on your phone. Swap the logo, change the headline, put up a
picture or a clip, turn panels on and off — mid-stream, and the overlay picks it
up within seconds. No restarting anything.

Two hard limits worth being honest about:

- **A livestream is video. Nobody watching can tap it.** There is no way to put
  a working button into a live for viewers. Viewers reach a tool by a link —
  bio, pinned comment, or a shop product card. Any design that assumes otherwise
  will fail.
- **The overlay stays silent when broken.** A bad key or a dropped connection
  shows nothing over a live stream and explains itself only in setup mode. An
  error message in front of an audience is worse than a blank corner.

It also banks whatever orders already exist when it starts, so it doesn't open
by announcing yesterday's business as if it just happened.

---

## Five faces, one engine

The same tools wear different clothes:

| Face | For |
|---|---|
| SKREW U | our own people — underground, shop floor |
| Studio | corporate and professional accounts |
| Team | schools, clubs and teams |
| Island | Hawaiian and resort shops |
| Critters | pet and people shops |

A face is a palette, a typeface, and a set of words. Nothing about the tools
changes. The guide even says the same six true things in a different voice for
each — "It's all open, nothing locked" reads differently to a school than it
does to us, and it should.

Adding a sixth face is a block of settings and no code at all.

No page owns the brand any more. Every place a name appears is filled in by
whichever face is on. That's why a client can be handed this without ever seeing
our name on it.

---

## Setting somebody up

Fifteen seconds. Type their name, pick their face, tick which tools they get,
press the button, send the link. No signup, no password, no email.

The same page works for a partner. A reseller opens their own copy, sets up
their own clients, sees only their own, and hands each one a link — because the
system filters by who owns whom, not by a role flag.

The rules underneath are built so the bad case is impossible rather than merely
forbidden: a new space is always a client and always belongs to whoever created
it, and neither of those comes from the request. A partner asking to create an
owner gets a client belonging to them. Tested by trying it.

One honest warning is printed on screen every time a link is made: **that link
is the password. Anyone who has it is in.** That's the trade for having no
signup, and the person handing it out should see it said plainly.

---

## The part about measurements, which sounds boring and isn't

For a mockup to be right, the software has to know how big the garment in the
photo really is.

**The house rule:** a women's style is shown on a women's medium, a men's or
unisex style on a men's large. That's the garment in the picture, so that's what
sets the scale.

**Length is what sets it — not width.** On a cut-out shirt the height of the
image is exactly shoulder to hem, so dividing pixels by real inches gives you a
scale. The width can't be used, because in a product photo the sleeves hang
naturally while a shirt measured on the floor has its sleeves spread flat. Those
are different widths of the same shirt.

With that one number recorded, an eleven-inch chest print placed once lands
correctly on a tank, a tee and a hoodie. Without it, every mockup is positioned
by eye and the same design sits slightly differently on every blank — which
customers notice and can't name.

**Every blank gets two versions from one cut-out:** a thumbnail that only has to
look good in the picker, and a base whose scale matches every other blank, for
placing art on.

**And the border is structural, not decoration.** If the shirt touches the edge
of the frame, the soft cut-out edge gets clipped flat and art near a collar or
sleeve has nowhere to go.

One rule about the measuring itself: **measure every blank the same way.** Mixing
hand measurements with published spec sheets puts about an inch between them, and
that inch bends every mockup.

---

## Rules that shouldn't be broken

1. **No real key ever goes in a chat, a screenshot, or the code.** Keys live in
   the host's environment settings and nowhere else.
2. **A shop's data is reachable only through the guarded door**, which checks
   who's asking and answers only with their own things. When something doesn't
   work, the fix is never "open up the database".
3. **Fail closed.** Missing key means the feature stays dark and says so. Never
   a quiet fallback to unguarded access.
4. **Products publish as drafts.** Nothing appears on a live storefront by
   accident.
5. **The platform is not a shop.** Covered above; it's the one that took a real
   bug to learn.
6. **Never dress up fake data as real.** Where the supplier catalogue isn't
   connected, the page shows stand-ins and says on screen that they're
   stand-ins.
7. **Only show a buyer's first name and city on a livestream.** Never a surname,
   an email, a street or a phone. That data is going in front of an audience the
   buyer never agreed to.

---

## What's real, and what's waiting

**Working now:** the guide and the intro, the five faces, the board with saved
setups and a wiring map that explains itself, client lockers, shirts studio,
gang sheets, the sticker builder, the blanks picker, the normalizer, the orders
console with real orders in it, the ship manifest, customer tracking, the live
overlay, the backdrop, stage control, the setup console, the two AI studios, the
full show, and the credits page.

**Built and waiting on one key each:** the lockers and everything else that
touches shop data (one database key), card checkout and credit top-ups (two
payment keys), the AI studios actually generating (one provider key), pushing
products to the shop, the real supplier catalogue, and artwork backup to cloud
storage.

**Not started:** the short-video shop and the auction listing site, and routing
a partner's orders back with credit to that partner.

**Known gaps worth naming out loud:**

- There's no QR code on the stream yet. It's the right way to get a viewer off
  the video and into the builder, but it needs a barcode generator written in
  and there was no way to verify the output was correct. A QR that scans wrong
  is worse than none, so it waits.
- The same idea has been built more than once across old work — five different
  gang sheet tools exist in the archive. Worth consolidating rather than adding
  a sixth.
- Supplier product photos are shirts on white, not cut-outs. Anything saved from
  the catalogue is recorded honestly as "not transparent" until something has
  actually removed the background.
- Supplier photography is licensed for selling that supplier's goods, not for
  reselling as an image pack. The thing to sell is the structure around the
  images, not the images.

---

## How to think about it, if you're picking this up

It is not a website with features. It's a line, and everything is a part on the
line. Ask of any new idea: *is this a part, or is it a new room?* If it's a
room, it probably shouldn't exist — make it a part instead, and the whole thing
stays as simple on the day it has forty tools as it was with four.

And the customer is never the platform's customer. They belong to the shop.
Every design decision here follows from that.

---

# The day after

Everything above still holds. This is what changed since, and two of them are
corrections rather than additions — worth reading as such.

## The orders table was open to the world

Orders had no idea which shop they belonged to, so every shop's orders sat in
one pile. A second shop taking orders would have seen the first shop's buyers in
its console, and on its livestream, where the overlay reads those same rows and
puts names and cities in front of an audience.

Worse, the table was readable by anyone. Its access rules were switched on —
which looks right at a glance — but they granted the public *everything*, with
no condition. The orders console read the table straight from the browser using
the publishable key, and a publishable key is printed inside the page. Every
customer name, email and street address was one request away from anyone who
viewed source.

Both fixed. Orders now carry which shop owns them, and travel through a guarded
door that proves who's asking and answers with that shop's rows only. Checked by
asking as the public: it could see every order before, and none after.

The lesson generalises. Every other table was already correct — locked, reachable
only through a guarded door. This one was the exception, and exceptions are where
it goes wrong. When you find one table that works differently from all the
others, that difference is the bug.

## Money, in three parts

**Selling the tools.** The store sends people to a real card checkout. What was
missing was everything around the payment: the buyer paid and landed back on the
store with no acknowledgement at all, and the sale never reached the orders
console. The worst moment to go quiet is right after somebody hands you money.
Now the return says what they bought and what happens next, and the sale lands in
the same console as everything else, with a note saying how to deliver it.

**Two ways to buy the whole line.** Two hundred a month for everything including
whatever gets added later, or eight hundred and ninety-nine once. The copy says
the comparison out loud — four and a half months of the subscription and it's
bought — because pricing them side by side is what makes each one make sense.

**Credits, for the things that cost per use.** Making an image or a clip costs
real money at the provider, so those runs are metered. A credit system already
existed here, built for an email account: packs, plans, a ledger, a record of
what each run cost. Rather than build a second one, a wallet can now belong to a
shop, so it works with no signup like everything else.

Four rules hold the money together, and none of them should be relaxed:

- **Spending is a single step in the database.** Two tabs generating at once
  cannot both pass a balance check and overdraw.
- **A purchase counts once**, however many times the payment platform tells us
  about it.
- **How big a pack is comes from our own records, never from the checkout.**
  Otherwise a tampered checkout mints credits.
- **A failed run is refunded and says so.** Nobody pays for something they
  didn't get.

And the rule that made all of it necessary: **anything that spends money has to
say who's paying.** The generating tools shipped without that for a few hours,
which meant they'd have spent real money for anyone who found the address. It's
the same wall as everywhere else, applied to a bill instead of to data.

## Two new tools, and a nicer way to show all of them

**Make an image, and make a clip** — both from a written description. The
settings are copied deliberately from the best phone interface we'd seen for it:
a sheet that slides up, aspect ratios in two columns each wearing a little box
shaped like the ratio it stands for, then resolution and how many. If a layout
already reads perfectly on a phone there's no prize for inventing a worse one.

They're one engine wearing two faces — the difference between them is a single
attribute and a list of settings — so a third studio later is a page, not a
project. Each tool shows what a run will cost before you press the button, and
if you're short it offers to sell you credits instead of failing at you.

**The full show.** The store's grid answers *what is there*; nothing answered
*why would I want this*. Now every tool gets a whole screen: its name, one true
sentence, the price, and an action shot. The shots aren't photographs — every
tool here is made of shapes, so each one is that tool's own shapes performing,
drawn live. Nothing to screenshot, nothing to go stale, and they re-colour
themselves when a face changes.

## The wiring map says what it means now

A connection showing a service's name in orange read as broken. It wasn't —
orange meant *chosen, but nobody has connected the account yet*. The colour was
carrying that whole distinction alone, and a colour can't. Every connection now
states its condition in words: working, needs key, needs approval, you do this.
The colour only helps you find the unfinished ones.

That's a general point about status: **if a colour is the only thing saying it,
it isn't said.**

## Four smaller lessons, kept because each cost real time

- **Never cache a failure.** Two endpoints cached every reply including their
  errors, so after a setting was fixed the browser kept serving the old failure
  for five more minutes — making a correct fix look broken. The natural next
  move is to undo the fix, which is exactly wrong.
- **Name the missing setting.** Every guarded feature reported both required
  settings whether one was absent or both, so a half-finished setup read
  identically to an untouched one. A setting's name is not a secret; its value
  is.
- **A link that knows who you are should pass it on.** Pages that need identity
  were being opened from a page that already had it, and asking again. They
  inherit it now — and only the ones that need it.
- **Let the database correct you.** Getting the wallet working took three
  refusals from Postgres in a row, each one right: a partial index needs its
  condition repeated, a column had no default, and an email address was
  mandatory where none exists. The fix for the last one was to make email
  optional — not to invent an address, because something eventually tries to
  send mail to it.
