/* ============ SKREW U · THE WAYS THROUGH ============ */
/* One definition of the routes, shared by the intro and the setup screen, so  */
/* what the character promises and what gets built can never drift apart.      */
/* Every route is different in the middle and identical at the end: an order   */
/* out the door.                                                              */

const BOARD_KEY = 'skrewu_board_v3';

const STARTERS = [
  {
    id: 'gangsheets',
    name: 'Gang sheets',
    say: 'Somebody sends me art, I pack a sheet and print it.',
    steps: ['Art comes in', 'Pack the sheet', 'Save the file'],
    nodes: [
      { id: 'n1', type: 'locker',    x: 60,  y: 180 },
      { id: 'n2', type: 'gangsheet', x: 340, y: 180 },
      { id: 'n3', type: 'folder',    x: 620, y: 180, label: null },
      { id: 'n4', type: 'ticket',    x: 620, y: 380 },
    ],
    wires: [['n1', 'n2'], ['n2', 'n3'], ['n2', 'n4']],
  },
  {
    id: 'merch',
    name: 'Shirts & merch',
    say: 'I put art on shirts and sell them online.',
    steps: ['Art comes in', 'Make the mockup', 'Push to the store', 'Orders back'],
    nodes: [
      { id: 'n1', type: 'locker',   x: 60,   y: 200 },
      { id: 'n2', type: 'shirts',   x: 340,  y: 200 },
      { id: 'n3', type: 'deploy',   x: 620,  y: 200 },
      { id: 'n4', type: 'shopify',  x: 900,  y: 120 },
      { id: 'n5', type: 'omniflow', x: 1180, y: 200 },
      { id: 'n6', type: 'manifest', x: 1460, y: 200 },
      { id: 'n7', type: 'gangsheet',x: 340,  y: 400 },
    ],
    wires: [['n1','n2'], ['n2','n3'], ['n3','n4'], ['n4','n5'], ['n5','n6'], ['n1','n7']],
  },
  {
    id: 'stickers',
    name: 'Stickers',
    say: 'People design their own sheets and I print them.',
    steps: ['They build a sheet', 'They pay', 'It lands on my list', 'I print & ship'],
    nodes: [
      { id: 'n1', type: 'sticker',  x: 60,   y: 200 },
      { id: 'n2', type: 'shopify',  x: 340,  y: 200 },
      { id: 'n3', type: 'omniflow', x: 620,  y: 200 },
      { id: 'n4', type: 'manifest', x: 900,  y: 130 },
      { id: 'n5', type: 'tracking', x: 900,  y: 320 },
    ],
    wires: [['n1','n2'], ['n2','n3'], ['n3','n4'], ['n3','n5']],
  },
  {
    id: 'orders',
    name: 'Taking orders',
    say: 'I sell in a few places and want it all on one screen.',
    steps: ['Every channel', 'One list', 'Pull & pack', 'Customer knows'],
    nodes: [
      { id: 'n1', type: 'shopify',   x: 60,  y: 120 },
      { id: 'n2', type: 'tiktok',    x: 60,  y: 300 },
      { id: 'n3', type: 'wholesale', x: 60,  y: 480 },
      { id: 'n4', type: 'omniflow',  x: 400, y: 300 },
      { id: 'n5', type: 'manifest',  x: 740, y: 210 },
      { id: 'n6', type: 'tracking',  x: 740, y: 400 },
    ],
    wires: [['n1','n4'], ['n2','n4'], ['n3','n4'], ['n4','n5'], ['n4','n6']],
  },
];

/* Lay a route down without throwing away anything they already set up —
   wiring, prompts and rates are theirs and survive changing their mind. */
function useStarter(s) {
  if (!s) return;
  let prev = {};
  try { prev = JSON.parse(localStorage.getItem(BOARD_KEY)) || {}; } catch {}
  const next = {
    nodes: s.nodes.map(n => ({ ...n })),
    wires: s.wires.map(w => [...w]),
    links: prev.links || {},
    notes: prev.notes || {},
    prompts: prev.prompts || {},
    costs: prev.costs || {},
    starter: s.id,
  };
  try { localStorage.setItem(BOARD_KEY, JSON.stringify(next)); } catch {}
  location.href = 'board.html?new=' + encodeURIComponent(s.id);
}

/* "Everything" clears the saved layout so the Board lays out its own full
   line — one definition of it, not two. */
function useEverything() {
  let prev = {};
  try { prev = JSON.parse(localStorage.getItem(BOARD_KEY)) || {}; } catch {}
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify({
      links: prev.links || {}, notes: prev.notes || {},
      prompts: prev.prompts || {}, costs: prev.costs || {},
    }));
  } catch {}
  location.href = 'board.html?new=all';
}
