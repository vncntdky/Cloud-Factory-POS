// Help: the app handbook and the shop's standard operating procedures (SOPs), shown on /help.
// Kept in step with the "Cloud Factory POS — Standard Operating Procedures" doc. Change both together.
import type { StaffRole } from "@/lib/auth";

/** A step, optionally with sub-points. */
export type Step = string | { text: string; sub: string[] };

export type Sop = {
  no: number;
  title: string;
  who: string;
  when: string;
  /** Roles that do this task; staff only see the SOPs they do. */
  roles: StaffRole[];
  parts: { title?: string; steps: Step[] }[];
  notes?: { label: string; text: string }[];
  check: string;
};

const ALL: StaffRole[] = ["owner", "manager", "cashier"];
const MGR: StaffRole[] = ["owner", "manager"];

export const GOLDEN_RULES = [
  "Every piece that comes in is recorded in a batch. Never fix the shelf with a Count when a delivery arrived; record it as a restock in its batch.",
  "Every count and loss names the batch the pieces came from.",
  "Ring up every sale in the app at the moment it happens, even when the buyer pays later.",
  "Wrong entry? Use Fix or Void. Don't enter an opposite entry to cancel it out.",
  "Money only leaves the fund through Release profits (owner) or as an expense entered in the app.",
];

export const WHO_DOES_WHAT: { task: string; owner: boolean; manager: boolean; staff: boolean }[] = [
  { task: "Sell, reserve, collect what's owed", owner: true, manager: true, staff: true },
  { task: "Add products, change prices and costs", owner: true, manager: true, staff: false },
  { task: "Receive batches, count, record losses, fix stock", owner: true, manager: true, staff: false },
  { task: "Void a sale, see past days", owner: true, manager: true, staff: false },
  { task: "Expenses, dashboard, P&L, funds (view)", owner: true, manager: true, staff: false },
  { task: "Decide what the fund keeps for the next restock", owner: true, manager: true, staff: false },
  { task: "Release profit, set the profit split", owner: true, manager: false, staff: false },
  { task: "Delete test sales or products, settings, staff", owner: true, manager: false, staff: false },
];

export const SOPS: Sop[] = [
  {
    no: 1,
    title: "Log in and staff accounts",
    who: "Everyone. Adding staff: owner.",
    when: "Start of every shift; when someone joins.",
    roles: ALL,
    parts: [
      {
        title: "Log in",
        steps: [
          "Open the shop app on the shop phone or your own phone.",
          "Enter your email and password, then tap Log in.",
          "Check your name and role at the bottom of the menu (Settings on a phone).",
          "Never log in as someone else. Every sale, void and stock change is recorded under the person who made it.",
        ],
      },
      {
        title: "Add a new staff member (owner)",
        steps: [
          "The new person signs up on the Sign up page with their own email.",
          "They see “waiting for the owner” until you turn the account on.",
          "Go to Settings & staff, find them, pick their role (Staff or Manager), and turn the account on.",
          "When someone leaves, turn their account off in the same place. Their past sales stay in the records.",
        ],
      },
    ],
    check: "Staff do not see the Restock tab, costs or the P&L. If they do, their role is wrong.",
  },
  {
    no: 2,
    title: "Add a new product",
    who: "Owner or manager.",
    when: "Before a new flavour or item is first sold.",
    roles: MGR,
    parts: [
      {
        steps: [
          "Go to Inventory and tap Add product.",
          "Add a photo (optional) so staff can spot it on the Sell screen.",
          "Fill in Brand, Product and Flavour / variant. Each flavour is its own product, for example Black TEO · Very Chill.",
          "Scan the box into Barcode, or leave it empty.",
          "Pick the Category, or choose + New category.",
          "Enter the Selling price and the Cost per piece (what the supplier charges).",
          "Set Low-stock alert at, the number of pieces that should trigger a reorder.",
          {
            text: "Pieces on the shelf now:",
            sub: [
              "Arriving with a delivery? Leave it at 0, then receive the pieces with SOP 3.",
              "Already on the shelf? Enter the pieces and pick the Batch they came in.",
            ],
          },
          "Tap Add product, or Add and enter another to keep the same brand, category, price, cost and batch for the next flavour.",
        ],
      },
    ],
    check: "The product shows in Inventory under its category with the right price and pieces.",
  },
  {
    no: 3,
    title: "Receive a batch (supplier delivery)",
    who: "Owner or manager.",
    when: "The day a supplier delivery arrives, before any of it is sold.",
    roles: MGR,
    parts: [
      {
        steps: [
          "Count the pieces in the delivery against the supplier's receipt. Set aside damaged pieces.",
          "Go to Restock and tap Receive batch.",
          "Enter the Supplier, the date it arrived and a note (for example the receipt number).",
          "Leave Paid from company funds ticked, unless the owners paid for this stock with their own money.",
          "For each product that came in, enter the pieces and the cost per piece. Use the category chips to find products faster. A product that isn't listed yet: add it first with SOP 2 (0 pieces).",
          "Under Restock costs, tap Add and enter shipping, tax, MOOE and any other fee for this delivery.",
          "Check the total at the bottom (pieces, and the cost with fees), then tap Receive batch.",
          "Record any damaged pieces from step 1 with SOP 6, in this batch.",
          "Go to Sales → P&L → Next restock and decide what the fund keeps for the next order (SOP 14).",
        ],
      },
    ],
    check: "The batch page shows every product with the right pieces, and the shelf count of each product went up by that number.",
  },
  {
    no: 4,
    title: "Fix a batch entry or add a missed product",
    who: "Owner or manager.",
    when: "A batch has the wrong pieces or cost, a product was left off, or shipping was missed.",
    roles: MGR,
    parts: [
      {
        title: "Wrong pieces or cost",
        steps: [
          "Go to Restock, tap Batches, and open the batch.",
          "Under By product, find the product and its line, for example “Received: 3 pcs at ₱165 each”.",
          "Tap Fix, enter the right pieces and cost per piece, then tap Save fix.",
          "If the line should not exist at all (the product never came), tap Fix, then Remove it.",
        ],
      },
      {
        title: "A product left off the batch",
        steps: [
          "On the batch page, under By product, tap Add a product to this batch.",
          "Pick the product, enter the pieces and cost per piece, then tap Add to batch.",
        ],
      },
      { title: "Missed shipping, tax or MOOE", steps: ["On the batch page, open the P&L card and edit the Restock costs."] },
    ],
    check: "The batch's received pieces match the supplier's receipt, and the product's shelf count is right. Later counts stay as they were counted.",
  },
  {
    no: 5,
    title: "Shelf count",
    who: "Owner or manager.",
    when: "Once a week, and whenever the app's number looks wrong.",
    roles: MGR,
    parts: [
      {
        steps: [
          "Count the pieces on the shelf for one product, including reserved pieces set aside for customers.",
          "In Inventory, open the product.",
          "Under Change stock, tap Count.",
          "Pick the Batch these pieces are from. It starts on the batch the product last came in with.",
          "Enter the number on the shelf now and add a note if something explains the difference.",
          "Tap Save count.",
        ],
      },
    ],
    notes: [
      {
        label: "If the count is higher than the app",
        text: "Check first whether a delivery was never received. If it was, record it with SOP 3 or SOP 4 instead of a count.",
      },
    ],
    check: "On the shelf matches your count, and the batch page shows the line “Counted N on the shelf”.",
  },
  {
    no: 6,
    title: "Damaged or lost pieces",
    who: "Owner or manager. Staff report it to them the same day.",
    when: "A piece leaks, breaks, expires or goes missing.",
    roles: MGR,
    parts: [
      {
        steps: [
          "Set the damaged piece aside. Don't sell it and don't throw it away until it is recorded.",
          "In Inventory, open the product.",
          "Under Change stock, tap Damaged / lost.",
          "Pick the Batch the piece came from.",
          "Enter the pieces lost and a note with the reason (leaking, broken, expired, missing).",
          "Tap Save loss.",
          "If the supplier will replace it, keep the piece and the note for the claim.",
        ],
      },
    ],
    check: "On the shelf dropped by the pieces lost, and the batch's pieces left dropped too. The company funds do not change, because those pieces were already paid for.",
  },
  {
    no: 7,
    title: "Reserve pieces for a customer",
    who: "Anyone.",
    when: "A customer asks you to hold a flavour, for example Lychee Ice, for pickup later.",
    roles: ALL,
    parts: [
      {
        title: "Reserve",
        steps: [
          "In Inventory, open the product and check Free to sell.",
          "Under Reserved, tap Reserve.",
          "Enter the Customer's name, the Pieces, and Hold until (the pickup date, optional). Add a note such as their number or a deposit.",
          "Tap Reserve. Put the pieces aside with a tag showing the customer's name.",
        ],
      },
      {
        title: "When they pick up",
        steps: [
          "On the product page, under Reserved, tap Sell next to their name.",
          "The Sell screen opens with their pieces and name in the cart. Finish the sale with SOP 8. The reservation closes by itself.",
        ],
      },
      {
        title: "When they don't come",
        steps: [
          "After the Hold until date, call them once.",
          "If they cancel or don't answer, tap the cancel button next to their reservation. The pieces are free to sell again.",
        ],
      },
    ],
    check: "Reserved pieces can't be sold to anyone else, so cancel reservations that are no longer needed.",
  },
  {
    no: 8,
    title: "Make a sale",
    who: "Anyone.",
    when: "Every sale, at the counter, before the customer leaves.",
    roles: ALL,
    parts: [
      {
        steps: [
          "Check the customer's age. Ask for a valid ID unless they clearly look well over the minimum age.",
          "On Sell, scan the barcode or tap the product. Tap again or use + / − in the cart to change the quantity.",
          "Tap Charge.",
          "Add the Buyer's name (optional for paid sales) and any Discount. Staff discounts above the shop limit need an owner or manager.",
          {
            text: "Pick how they paid:",
            sub: [
              "Cash: enter Cash received or tap a quick amount, and give the change shown.",
              "GCash, Maya, card or bank: check the payment went through on your phone or terminal, then enter the Reference no.",
              "Not paid yet: the Buyer's name is required. Use SOP 9.",
            ],
          },
          "Tick Customer is 18 or older.",
          "Tap Charge (or Save · owes for Not paid yet). Wait for the sale number before handing over the goods.",
        ],
      },
    ],
    notes: [
      {
        label: "If it says Not charged",
        text: "Read the reason. “Only N left” means the shelf count is wrong: sell what's there and ask a manager to count it (SOP 5).",
      },
    ],
    check: "The sale shows on Sales for today, and the product's shelf count went down.",
  },
  {
    no: 9,
    title: "Not paid yet sales and collecting payment",
    who: "Anyone. The owner or manager decides who may buy on credit.",
    when: "A trusted buyer takes goods now and pays later.",
    roles: ALL,
    parts: [
      {
        title: "Sell on credit",
        steps: [
          "Ring up the sale with SOP 8 and pick Not paid yet.",
          "Enter the Buyer's full name, spelled the same way every time. The app suggests names of people who already owe.",
          "Tap Save · owes. The pieces leave stock now; the money comes in when collected.",
        ],
      },
      {
        title: "Collect a payment",
        steps: [
          "Go to Collectibles (Owed on a phone) and find the buyer.",
          "Tap Collect.",
          "Enter the amount paid. A part payment is fine; the rest stays owed.",
          "Pick how they paid and enter the Reference no. for GCash, Maya, card or bank.",
          "Tap Record payment.",
        ],
      },
    ],
    check: "The buyer's balance went down, and paid-in-full sales leave the list. Follow up on anyone who owes for more than 7 days.",
  },
  {
    no: 10,
    title: "Void or delete a sale",
    who: "Void: owner or manager. Delete: owner only.",
    when: "A sale was rung up wrong, or the customer returned the goods unopened.",
    roles: MGR,
    parts: [
      {
        title: "Void (real sales rung up wrong)",
        steps: [
          "Go to Sales, find the sale and open it.",
          "Tap Void sale, enter the Reason (for example “wrong flavour”), and confirm.",
          "Give back the money the same way it was paid, then ring up the correct sale with SOP 8.",
          "The pieces go back on the shelf and the sale leaves every total. A voided sale stays on record, marked voided.",
        ],
      },
      {
        title: "Delete (test sales only)",
        steps: [
          "Open the sale and tap Delete sale. Use this only for practice or test sales that never happened.",
          "The sale disappears from every report and its pieces go back on the shelf.",
        ],
      },
    ],
    check: "Never delete a real sale. If unsure, void it.",
  },
  {
    no: 11,
    title: "Record an expense",
    who: "Owner or manager.",
    when: "The day money is paid out of the business for anything other than stock.",
    roles: MGR,
    parts: [
      {
        steps: [
          "Keep the receipt or take a photo of it.",
          "Go to Restock → Expenses (or Add expense on a batch page or on Sales → P&L).",
          {
            text: "Pick Charge to:",
            sub: [
              "A batch: costs for that delivery, such as the salary for the weeks it sells.",
              "General: shop costs not tied to one batch, such as rent.",
            ],
          },
          "Pick the category: Salaries, Rent, Utilities, Supplies or Other expenses.",
          "Enter the amount, the date it was paid, and a note (who or what, for example “Cara, Nov 1–15”).",
          "Tap Add expense.",
        ],
      },
    ],
    notes: [
      {
        label: "Not an expense",
        text: "A supplier's goods, shipping, tax and MOOE for a delivery. Enter those on the batch (SOP 3 or SOP 4).",
      },
    ],
    check: "The expense shows in the list, and Expenses in the company funds went up by the amount.",
  },
  {
    no: 12,
    title: "End of day check",
    who: "The person closing; a manager reviews.",
    when: "At closing, every day.",
    roles: ALL,
    parts: [
      {
        steps: [
          "Go to Sales and look at today: total sales, and the amounts by payment method.",
          "Count the cash drawer. It should equal the starting cash plus today's cash sales plus cash collected from buyers who owed.",
          "Check GCash, Maya, card and bank against today's amounts in the app.",
          "If something doesn't match, look through today's sales for a missing or wrong entry. Fix it with SOP 10, or tell a manager before you leave.",
          "Make sure every damaged piece from today is recorded (SOP 6).",
          "Check that no reservation for today was missed (SOP 7).",
        ],
      },
    ],
    check: "Cash and e-wallet totals match, or the difference and its reason are reported to a manager the same night.",
  },
  {
    no: 13,
    title: "Weekly review: dashboard and P&L",
    who: "Owner and manager together.",
    when: "Once a week, same day each week.",
    roles: MGR,
    parts: [
      {
        steps: [
          "Count the shelf for the products that sell most (SOP 5).",
          "Open Sales → Dashboard. Note net sales against the previous period, profit per piece, and still owed. Use the category filter to check each category.",
          "Look at Best sellers (how fast they sell, days of stock left) and Slowest movers. Plan a discount or stop reordering the slowest ones.",
          "Open Sales → P&L. For each batch, check net so far and “when sold out”. A batch still negative is still paying for itself.",
          "In Company funds, read gross sales, net sales, still owed and In the fund.",
          "Open Collectibles and follow up on everyone who owes (SOP 9).",
          "Check that every expense for the week is entered (SOP 11).",
        ],
      },
    ],
    check: "You both agree on what to reorder (SOP 14) and whether to release profit (SOP 15).",
  },
  {
    no: 14,
    title: "Plan the next restock and decide what the fund keeps",
    who: "Owner or manager.",
    when: "At the weekly review, when products show low stock, and right after a batch is received.",
    roles: MGR,
    parts: [
      {
        title: "Plan the order",
        steps: [
          "Go to Restock. Check the plan settings once: delivery days, buffer days, and how many days each order should last.",
          "Read the suggested order. It uses how fast each product sells, minus what's on the shelf and reserved.",
          "Adjust for what you know (a flavour being discontinued, a promo coming), then tap Copy order and send it to the supplier.",
          "If the alert levels look off, apply the suggested reorder points so the low-stock badge fires at the right time.",
        ],
      },
      {
        title: "Decide what the fund keeps",
        steps: [
          "Go to Sales → P&L → Next restock.",
          "Pick a quick amount (Same as the last batch, Everything in the fund, Nothing) or type the expected cost of the order, including shipping.",
          "Read “Leaves ₱X to release”, add a note (for example “Black TEO reorder”), and tap Keep this amount.",
          "When the order arrives, receive it with SOP 3. Its cost comes off what you kept, and the page asks you to decide again.",
        ],
      },
    ],
    check: "Kept for next restock shows your amount and the ask is gone.",
  },
  {
    no: 15,
    title: "Release profits (owner)",
    who: "Owner only.",
    when: "After the weekly review, once the next restock amount is decided.",
    roles: ["owner"],
    parts: [
      {
        steps: [
          "Make sure the week's expenses are entered (SOP 11) and the next restock amount is decided (SOP 14).",
          "Go to Sales → P&L and read Available to release. It is In the fund minus what you kept for the next restock.",
          "Tap Release profits and enter the amount, up to what's available.",
          "Check the split shown: owner 2/3, manager 1/3.",
          "Add a note (for example “Batch 1 profit, week of 10 Nov”) and confirm.",
          "Pay out the shares from the cash or bank the money is in, the same day.",
          "If a release was entered by mistake, tap undo next to it in the Released list.",
        ],
      },
    ],
    check: "Profit released so far went up by the amount, and In the fund went down by it. Releases are profit only; capital is not returned.",
  },
];

export const SCREENS: { screen: string; who: string; what: string; href: string; managers?: boolean }[] = [
  { screen: "Sell", who: "Everyone", href: "/", what: "Scan or tap products, take payment, or record a sale as Not paid yet." },
  {
    screen: "Sales",
    who: "Everyone; past days for owner and manager",
    href: "/sales",
    what: "Today's sales and totals by payment method. Open a sale to void or delete it. Export to CSV.",
  },
  {
    screen: "Sales → Dashboard",
    who: "Owner, manager",
    href: "/sales/dashboard",
    managers: true,
    what: "Net sales against the previous period, profit per piece, best sellers, slowest movers and busiest times, with a category filter.",
  },
  {
    screen: "Sales → P&L",
    who: "Owner, manager",
    href: "/sales/pnl",
    managers: true,
    what: "Profit for each batch, company funds, what to keep for the next restock, and profit release (owner).",
  },
  {
    screen: "Inventory",
    who: "Everyone; changes by owner and manager",
    href: "/inventory",
    what: "Products by category with their shelf count and a low-stock badge. A product's page holds stock changes, reservations, photo and history.",
  },
  {
    screen: "Restock",
    who: "Owner, manager",
    href: "/restock",
    managers: true,
    what: "The suggested order, Receive batch, the list of batches, and expenses.",
  },
  {
    screen: "Collectibles (Owed on a phone)",
    who: "Everyone",
    href: "/collectibles",
    what: "Who still owes and how much. Collect payments here.",
  },
  {
    screen: "Settings",
    who: "Everyone; shop and staff for the owner",
    href: "/settings",
    what: "Your profile and light or dark theme. The owner also sets the shop name, receipt details, minimum age, staff discount limit and staff accounts.",
  },
];

/** Annotated screenshots (public/help/*.webp, 780 × 1688). Red numbers match the steps. */
export const PICTURES: { id: string; title: string; sop: number; img: string; alt: string; managers?: boolean; steps: string[] }[] = [
  {
    id: "sell",
    title: "Sell a product",
    sop: 8,
    img: "/help/sell.webp",
    alt: "Sell screen: search, product, Charge",
    steps: ["Scan the barcode, or type to search.", "Tap the product to add it. Tap again for more pieces.", "Tap Charge."],
  },
  {
    id: "checkout",
    title: "Take payment",
    sop: 8,
    img: "/help/checkout.webp",
    alt: "Checkout: payment, cash received, age check, Charge",
    steps: [
      "Pick how they paid. Not paid yet needs the buyer's name.",
      "For cash, enter what they gave or tap a quick amount. Give the change shown.",
      "Check their ID, then tick the age box.",
      "Tap Charge and wait for the sale number.",
    ],
  },
  {
    id: "change-stock",
    title: "Change stock on a product",
    sop: 5,
    img: "/help/change-stock.webp",
    alt: "Change stock: kind, batch, pieces, Save",
    managers: true,
    steps: [
      "Pick Restock, Count or Damaged / lost.",
      "Pick the batch the pieces belong to.",
      "Enter the pieces. For a count, enter what's on the shelf now.",
      "Tap Save.",
    ],
  },
  {
    id: "reserve",
    title: "Reserve for a customer",
    sop: 7,
    img: "/help/reserve.webp",
    alt: "Reserved card and Reserve button",
    steps: [
      "Reserved shows the pieces held and how many are free to sell.",
      "Tap Reserve, then enter the customer's name, pieces and pickup date.",
    ],
  },
  {
    id: "receive-delivery",
    title: "Receive a batch: the delivery",
    sop: 3,
    img: "/help/receive-delivery.webp",
    alt: "Receive batch: supplier, date, paid from company funds",
    managers: true,
    steps: [
      "Enter the supplier.",
      "Set the date it arrived.",
      "Leave Paid from company funds ticked, unless the owners paid for this stock themselves.",
    ],
  },
  {
    id: "receive-pieces",
    title: "Receive a batch: the pieces",
    sop: 3,
    img: "/help/receive-pieces.webp",
    alt: "Receive batch: categories, pieces and cost, Receive batch",
    managers: true,
    steps: [
      "Tap a category to shorten the list.",
      "Enter the pieces received and the cost per piece for each product.",
      "Check the total, then tap Receive batch.",
    ],
  },
  {
    id: "batch-fix",
    title: "Fix a batch",
    sop: 4,
    img: "/help/batch-fix.webp",
    alt: "Batch page: product lines, Fix, Add a product to this batch",
    managers: true,
    steps: [
      "Each product lists what came in, plus any counts and losses.",
      "Tap Fix to correct the pieces or cost, or to remove the line.",
      "Tap Add a product to this batch for one that was left off.",
    ],
  },
  {
    id: "funds",
    title: "Company funds",
    sop: 13,
    img: "/help/funds.webp",
    alt: "Company funds: available, gross, net, in the fund, kept for next restock",
    managers: true,
    steps: [
      "Available to release, with the owner and manager shares.",
      "Gross sales, before discounts.",
      "Net sales, after discounts.",
      "In the fund, after stock, expenses and releases.",
      "Kept for the next restock. Tap it to decide.",
    ],
  },
  {
    id: "next-restock",
    title: "Keep for the next restock, then release",
    sop: 14,
    img: "/help/next-restock.webp",
    alt: "Next restock amount and Release profits",
    managers: true,
    steps: [
      "Tap a quick amount.",
      "Or type the amount. The line under it says what's left to release.",
      "Tap Keep this amount.",
      "Owner only: tap Release profits.",
    ],
  },
  {
    id: "collect",
    title: "Collect what's owed",
    sop: 9,
    img: "/help/collect.webp",
    alt: "Collectibles: buyer and Collect",
    steps: ["Each buyer and how much they owe.", "Tap Collect, then enter the amount and how they paid."],
  },
];

export const WORDS: { word: string; meaning: string; managers?: boolean }[] = [
  { word: "Batch", meaning: "One supplier delivery, numbered Batch 1, 2, 3. Every piece that comes in, and every count or loss, belongs to a batch." },
  { word: "On the shelf", meaning: "The pieces the app says are in the shop now. A sale lowers it; a restock raises it; a count resets it." },
  { word: "Reserved / Free to sell", meaning: "Pieces held for a named customer / pieces anyone can buy." },
  { word: "Low-stock alert at", meaning: "The shelf count that turns on the low-stock badge for a product." },
  {
    word: "First in, first out",
    meaning: "Sales are matched to a product's oldest pieces first. That's how each batch knows how much of it has sold.",
    managers: true,
  },
  {
    word: "Restock costs",
    meaning: "Shipping, tax, MOOE and other fees for a delivery, on top of the goods. MOOE = maintenance and other operating expenses.",
    managers: true,
  },
  {
    word: "Expenses",
    meaning: "Money paid out for things other than stock: salaries, rent, utilities, supplies. Charged to a batch or to the whole shop.",
    managers: true,
  },
  { word: "Gross / Net sales", meaning: "Sales before / after discounts." },
  {
    word: "Not paid yet / Still owed",
    meaning: "A sale whose buyer pays later. It counts as a sale but not as money in the fund until collected. Shown as “Floating” in the funds.",
  },
  {
    word: "Paid from company funds",
    meaning: "A batch bought with the shop's money. Batch 1 was paid by the owners, so it isn't.",
    managers: true,
  },
  {
    word: "In the fund",
    meaning: "Money collected, minus stock bought from the fund, restocking fees, expenses and profit already released.",
    managers: true,
  },
  {
    word: "Kept for next restock",
    meaning: "The amount you decided the fund holds for the next order. The next batch's cost comes out of it.",
    managers: true,
  },
  {
    word: "Available to release",
    meaning: "In the fund minus what's kept. Only the owner can release it, split 2/3 owner and 1/3 manager.",
    managers: true,
  },
  { word: "Void / Delete", meaning: "Void cancels a real sale and keeps it on record. Delete removes a test sale completely (owner only)." },
  { word: "Fix", meaning: "Corrects a restock, count or loss entered by mistake, or removes it.", managers: true },
];

export const PROBLEMS: { see: string; doThis: string; managers?: boolean }[] = [
  { see: "“Waiting for the owner” after signing up", doThis: "The owner turns your account on in Settings (SOP 1)." },
  { see: "No Restock tab, no costs", doThis: "You're logged in as Staff. Ask the owner if your role should change." },
  {
    see: "“Only N left” at Sell, but the shelf has more",
    doThis: "Sell what the app allows, then a manager counts it (SOP 5) or receives the missing delivery (SOP 3).",
  },
  { see: "Wrong flavour, price or quantity rung up", doThis: "Void the sale and ring it up again (SOP 10). Staff: ask a manager." },
  { see: "A delivery's pieces or cost entered wrong", doThis: "Batch page → Fix on that line (SOP 4).", managers: true },
  { see: "A product missing from a batch", doThis: "Batch page → Add a product to this batch (SOP 4).", managers: true },
  { see: "Change stock asks for a batch and none fits", doThis: "Receive the delivery as a batch first (SOP 3).", managers: true },
  { see: "The page reloaded mid-sale", doThis: "Carry on: the cart is kept on the phone until you charge or clear it." },
  { see: "Cash drawer doesn't match the app", doThis: "Check today's sales for a missed or wrong entry, then report it (SOP 12)." },
  {
    see: "Available to release is ₱0",
    doThis: "What you kept for the next restock is more than In the fund. Wait for sales, or lower the amount kept (SOP 14).",
    managers: true,
  },
  { see: "A release was entered by mistake", doThis: "Owner taps undo next to it in the Released list (SOP 15).", managers: true },
];
