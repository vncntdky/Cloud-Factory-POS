// Help: the app handbook and the shop's standard operating procedures (SOPs), shown on /help.
// Kept in step with the "Cloud Factory POS — Standard Operating Procedures" doc (link in CLAUDE.md). Change both
// together: `node docs/sop-doc.js` prints this file as the doc's markdown sections.
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
  "Wrong entry? Use Fix, Edit or Void on that entry (undo for a distribution). Don't enter an opposite entry to cancel it out.",
  "Money only leaves the business three ways, each entered in the app: a batch (the stock and its restock costs), an expense, or an owner distribution (owner only). Money the owners put in is recorded as owner capital, never as a sale.",
];

export const WHO_DOES_WHAT: { task: string; owner: boolean; manager: boolean; staff: boolean }[] = [
  { task: "Sell, reserve, collect what's owed", owner: true, manager: true, staff: true },
  { task: "Add or change a product photo", owner: true, manager: true, staff: true },
  { task: "Add products, change prices and costs", owner: true, manager: true, staff: false },
  { task: "Give a discount above the staff limit", owner: true, manager: true, staff: false },
  { task: "Receive batches, count, record losses, fix stock", owner: true, manager: true, staff: false },
  { task: "Void a sale, see past days", owner: true, manager: true, staff: false },
  { task: "Expenses, dashboard, Finance (view)", owner: true, manager: true, staff: false },
  { task: "Set the inventory reserve for the next restock", owner: true, manager: true, staff: false },
  { task: "Batch report, owner distributions, owner capital, tax rate, profit split", owner: true, manager: false, staff: false },
  { task: "Delete test sales or products, shop settings, staff accounts", owner: true, manager: false, staff: false },
];

export const SOPS: Sop[] = [
  {
    no: 1,
    title: "Sign in and staff accounts",
    who: "Everyone. Adding and removing staff: owner.",
    when: "Start and end of every shift; when someone joins or leaves.",
    roles: ALL,
    parts: [
      {
        title: "Sign in",
        steps: [
          "Open the shop app on the shop phone or your own phone.",
          "Enter your email and password, then tap Sign in.",
          "Check your name and role at the bottom of the menu (Settings on a phone).",
          "Never sign in as someone else. Every sale, void and stock change is recorded under the person who made it.",
          "At the end of your shift on a shared phone, sign out: Settings → Sign out (on a computer, Sign out at the bottom of the menu).",
        ],
      },
      {
        title: "Add a new staff member (owner)",
        steps: [
          "The new person opens the app, taps Create a staff account on the sign-in screen, enters their name, email and a password (at least 8 characters), and taps Create account.",
          "If it says Check your email, they tap the link in that email. Until you let them in, they see “Waiting for the owner to activate your account”.",
          "Go to Settings & staff. Under Waiting for you, find them by name and email. Only let in people you know.",
          "Pick their Role (Staff, Manager or Owner), tick Can sign in, and tap Save. It applies the next time they open a page.",
        ],
      },
      {
        title: "When someone leaves (owner)",
        steps: [
          "Go to Settings & staff, untick Can sign in on their card and tap Save.",
          "Their past sales stay in the records. The shop always needs at least one active owner.",
        ],
      },
    ],
    check: "Staff do not see the Restock tab, costs, or the Dashboard and Finance tabs on Sales. If they do, their role is wrong.",
  },
  {
    no: 2,
    title: "Add or change a product",
    who: "Owner or manager. Photos: anyone. Deleting a test product: owner only.",
    when: "Before a new flavour or item is first sold, and when its price, cost or details change.",
    roles: MGR,
    parts: [
      {
        title: "Add a new product",
        steps: [
          "Go to Inventory and tap Add product.",
          "Add a photo (optional) so staff can spot it on the Sell screen.",
          "Fill in Brand, Product and Flavour / variant. Each flavour is its own product, for example Black TEO · Very Chill.",
          "Scan the box into Barcode, or leave it empty.",
          "Pick the Category, or choose + New category and type its name under New category.",
          "Enter the Selling price and the Cost per piece (what the supplier charges).",
          "Set Low-stock alert at, the number of pieces that should trigger a reorder.",
          {
            text: "Pieces on the shelf now:",
            sub: [
              "Arriving with a delivery? Leave it at 0, then receive the pieces with SOP 3.",
              "Already on the shelf? Enter the pieces and pick the Batch they came in.",
            ],
          },
          "Tap Add product. Or tap Add and enter another: the next flavour starts with the same brand, product, category, price, cost, low-stock alert and batch. Change the flavour and barcode.",
        ],
      },
      {
        title: "Add many products from a CSV file",
        steps: [
          "In Inventory, tap Import (next to Add product).",
          "Tap Download template and open it in Google Sheets or Excel. Type one row per product or flavour. Product and Selling price are needed; Category, Brand, Flavour / variant, Barcode, Cost per piece, Low-stock alert at (5 if empty) and For sale (yes if empty) are optional. Write each product the way it is in the app (Brand BLXCK Signature, Product Mango), so products already there are skipped. Type prices like 340 or 1,250.50. The two Example rows are skipped.",
          "In Excel, set the Barcode column to Text before typing barcodes (select the column, then Format Cells, Text). Otherwise Excel turns long barcodes into numbers like 4.8E+12 and drops leading zeros.",
          "Save or download the sheet as CSV, then tap Choose CSV file and pick it.",
          "Check the list. New rows will be added; Already in the app rows (same brand, product and flavour) are skipped and never changed; a Fix this row says what to fix. Fix those rows in the sheet and choose the file again: nothing is added until every row is right.",
          "Tap Add (it shows how many). They start with 0 pieces: receive their stock with SOP 3, and add photos on each product's page.",
        ],
      },
      {
        title: "Change a price, cost or details",
        steps: [
          "In Inventory, open the product and scroll to Product details.",
          "Change the Selling price, Cost per piece, Low-stock alert at, name, category or barcode, then tap Save changes.",
          "The new price is used from the next sale. Past sales keep the price they were sold at.",
          "A new Cost per piece is used for the next pieces received. Pieces already received keep their cost: fix those on the batch page (SOP 4).",
        ],
      },
      {
        title: "Stop selling it",
        steps: [
          "In Product details, untick For sale and tap Save changes.",
          "It leaves the Sell screen, the reorder plan and Receive batch. Its history and batches stay. Find it in Inventory under Not for sale.",
          "To sell it again, tick For sale and tap Save changes.",
        ],
      },
      {
        title: "Add or change the photo (anyone)",
        steps: [
          "In Inventory, open the product.",
          "Under Photo, tap Upload photo (Replace if it has one), then take or pick the picture. Tap Remove to take it off.",
        ],
      },
      {
        title: "Delete a test product (owner)",
        steps: [
          "Only for products made by mistake or for practice. For a real product, untick For sale instead.",
          "Open the product, scroll to the bottom and tap Delete product.",
          "Leave Also delete its sales unticked to keep its sales in Sales under its name. Tick it only when those were test sales too.",
          "Tap Delete product to confirm. It can't be undone: its stock history, cost and photo go, and what was paid for it leaves Finance.",
        ],
      },
    ],
    check: "The product shows in Inventory under its category with the right price and pieces. A product you stopped selling is under Not for sale, not on the Sell screen.",
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
          "Go to Restock and tap Receive batch. If you ordered the suggested order, tap Receive this order instead: each product starts at the pieces suggested. Change them to what really came.",
          "Enter the Supplier, Arrived on (the day it came, up to 60 days back) and a Note (for example the receipt number).",
          "Leave Paid from company funds ticked, unless the owners paid for this stock with their own money.",
          "For each product that came in, enter the pieces and the cost per piece. Use the category chips or Find a product to get to it faster. A new cost replaces the product's cost from now on.",
          "A product that isn't listed: if it's new, add it first with SOP 2 (0 pieces). If it's under Not for sale in Inventory, tick For sale on its page first (SOP 2).",
          "Under Restock costs, tap Add and enter shipping, tax, MOOE and any other fee for this delivery.",
          "Check the total at the bottom (pieces, and the cost with fees), then tap Receive batch.",
          "Record any damaged pieces from step 1 with SOP 6, in this batch.",
          "If it was paid from company funds, tap “decide what to keep for the next restock” on the batch page (or go to Sales → Finance) and set the inventory reserve for the next order (SOP 14).",
        ],
      },
    ],
    check: "The batch page shows every product with the right pieces, and the shelf count of each product went up by that number. In its Profit and loss, What the batch cost in full shows Goods, Shipping, Tax and MOOE that match the supplier's receipt.",
  },
  {
    no: 4,
    title: "Fix a batch entry or add a missed product",
    who: "Owner or manager.",
    when: "A batch has the wrong pieces or cost, a product was left off, shipping was missed, or its details are wrong.",
    roles: MGR,
    parts: [
      {
        title: "Wrong pieces or cost",
        steps: [
          "Go to Restock, tap Batches, and open the batch.",
          "Under By product, find the product and its line, for example “Received: 3 pcs at ₱165 each”.",
          "Tap Fix, enter the right pieces (and the cost per piece, for a Received line), then tap Save fix. Counted and Damaged / lost lines are fixed the same way. You can also tap Fix next to the change in the product's Stock history in Inventory.",
          "If the line should not exist at all (the product never came), tap Fix, then Remove it.",
          "A count or loss saved in the wrong batch: tap Fix, then Remove it, and record it again in the right batch (SOP 5 or SOP 6).",
        ],
      },
      {
        title: "A product left off the batch",
        steps: [
          "On the batch page, under By product, tap Add a product to this batch.",
          "Pick the product, enter the pieces and cost per piece, then tap Add to batch.",
        ],
      },
      {
        title: "Missed shipping, tax or MOOE",
        steps: [
          "On the batch page, in the Profit and loss card, tap Edit restock costs. Enter the Shipping, Tax, MOOE or Other amount, then tap Save costs.",
        ],
      },
      {
        title: "Paid from company funds ticked wrong",
        steps: [
          "On the batch page, in the Profit and loss card, read the line under Edit restock costs: “Paid from company funds” or “Not paid from company funds”.",
          "Tap Not from the fund if the owners paid for this stock themselves, or Paid from the fund if the shop's money paid. Not from the fund counts the batch's cost as owner capital (Finance → Balance).",
        ],
      },
      {
        title: "Wrong supplier, date or note",
        steps: [
          "On the batch page, under the date it arrived, tap Edit supplier, date or note. Change the Supplier, Arrived on or Note, then tap Save changes.",
          "Owner: the date can also be changed on the batch's report (Sales → Finance → Report): tap Change the date it arrived, pick the day, then Save changes. A batch can't have arrived after the day its pieces were recorded in the app.",
        ],
      },
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
        text: "Check first whether a delivery was never received. If so, record it with SOP 3 or SOP 4 instead of a count.",
      },
      {
        label: "If the count is lower than the app",
        text: "Check first for a sale not rung up or a damaged piece not recorded (SOP 6). Pieces missing in a count come off the profit at what they cost: they show as Stock count differences in Sales → Finance → Profit & loss and in the batch's Profit and loss.",
      },
      {
        label: "Entered the wrong number",
        text: "On the product page, under Stock history, tap Fix next to the count. Enter the right number and tap Save fix, or tap Remove it. The batch page has the same Fix (SOP 4).",
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
          "If the supplier will replace it, keep the piece and the note for the claim. When the replacement arrives, open the batch page, tap Fix on its “Damaged / lost” line and lower the pieces lost (or tap Remove it if all were replaced). The shelf count goes back up and the loss leaves the profit. If you counted that product after the loss, the shelf stays as counted: count it again now (SOP 5) so the replacement pieces show.",
        ],
      },
    ],
    notes: [
      {
        label: "Entered the wrong number",
        text: "On the product page, under Stock history, tap Fix next to the loss. Enter the right number and tap Save fix, or tap Remove it. The batch page has the same Fix (SOP 4).",
      },
    ],
    check: "On the shelf dropped by the pieces lost, and the batch's pieces left dropped too. Cash doesn't change, because those pieces were already paid for. Their cost comes off the profit: it shows as Stock count differences in Sales → Finance → Profit & loss and in the batch's Profit and loss, and lowers its Net profit so far.",
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
          "To see every reservation, go to Inventory and tap the Reserved filter. Open a product to see its reservations; one past its date shows Past hold date.",
          "After the Hold until date, call them once.",
          "If they cancel or don't answer, tap ✕ next to their name and confirm. The pieces are free to sell again.",
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
          "Check the customer's age. Ask for a valid ID unless they clearly look well over the age on the Checkout age box (25 when the minimum age is 18).",
          "On Sell, scan the barcode or tap the product to add one. Each scan adds one more. Tapping a product that's already in the cart takes it out (tap Undo to put it back).",
          "Tap Charge. Check the cart at the top of Checkout and use + / − to change how many.",
          "Add the Buyer (optional for paid sales) and any Discount in pesos off the whole sale. Staff can take off up to the limit shown under Discount; for more, an owner or manager rings up the sale on their own login.",
          {
            text: "Pick how they paid:",
            sub: [
              "Cash: enter Cash received or tap a quick amount, and give the change shown.",
              "GCash, Maya, card or bank: check the payment went through on your phone or terminal, then enter the Reference no.",
              "Not paid yet: the Buyer's name is required. Use SOP 9.",
            ],
          },
          "Tick Customer is 18 or older (the shop's minimum age).",
          "Tap Charge (or Save · owes for Not paid yet). Wait for “Sale #N done” before handing over the goods. Tap Receipt to print one, or Next sale. You can reprint it later: open the sale on Sales and tap Print receipt.",
        ],
      },
    ],
    notes: [
      {
        label: "If it says Not charged",
        text: "Read the reason. “Only N left” means the shelf count is wrong: sell what's there and ask a manager to count it (SOP 5).",
      },
      {
        label: "If it says free to sell or all reserved",
        text: "When you add a product, “Only N of … free to sell (M reserved)” or “… is all reserved” means the other pieces are held for customers. Open the product's Reserved card (SOP 7) before selling them to someone else.",
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
          "Go to Collectibles (Owed on a phone) and find the buyer. With several buyers, use Search a buyer.",
          "Tap Collect next to the sale they are paying. A buyer with several sales has a Collect on each. You can also tap Collect on the sale's own page.",
          "Amount received starts at the full amount owed. For a part payment, change it; the rest stays owed.",
          "Under Paid with, pick how they paid. For GCash, Maya, Card or Bank transfer, enter the Reference no.",
          "Tap Record ₱X (the amount you entered).",
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
          "Go to Sales, pick the day (Today, Yesterday, Last 7 days, This month, or Pick a date or range), and open the sale.",
          "Tap Void sale, enter the Reason (for example “wrong flavour”), and tap Void sale again to confirm.",
          "Give back the money the same way it was paid, then ring up the correct sale with SOP 8. A Not paid yet sale is no longer owed once voided: give back only what the buyer already paid.",
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
          "Go to Restock → Expenses and tap Add expense. (Add expense is also on a batch page, where the expense goes to that batch, and on Sales → Finance → Batches.)",
          {
            text: "Pick Charge to:",
            sub: [
              "A batch: costs for that delivery, such as the salary for the weeks it sells.",
              "General: shop costs not tied to one batch, such as rent.",
            ],
          },
          "Under For, pick what it was: Salaries, Rent, Utilities, Supplies, Payment fees (GCash, Maya, card, bank), Taxes paid or Other.",
          "Enter the Amount, the Paid on date (today, or up to 400 days back) and a Note (who or what, for example “Cara, Nov 1–15”).",
          "Tap Save expense. The app shows “Expense saved.”",
        ],
      },
    ],
    notes: [
      {
        label: "Not an expense",
        text: "A supplier's goods, shipping, tax and MOOE for a delivery. Enter those on the batch (SOP 3 or SOP 4).",
      },
      {
        label: "Taxes paid",
        text: "When you pay the percentage tax, record it under Taxes paid. It lowers the tax still owed, not the profit (the tax estimate already counts it).",
      },
    ],
    check: "The expense shows in the list, and Finance → Profit & loss shows it under its category (Taxes paid show under Cash flow). Wrong amount, type, date or note? Tap Edit on the expense. Wrong batch? Edit it on Restock → Expenses, where you can change Charge to. Entered by mistake? Tap the bin next to it.",
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
          "Go to Sales and read Money in by method for today: each way people paid, Not paid yet, and Collected on earlier unpaid sales.",
          "Count the cash drawer. Under Money in by method the app says “The cash drawer should have ₱X more than the opening float” (today's cash sales plus cash collected). The drawer should hold the opening float plus that amount, minus any cash paid out of it today.",
          "Write down every peso that left the drawer today and what it was for (an expense, a supplier, cash taken out to keep or deposit). Give the list to a manager; they enter the expenses with SOP 11.",
          "Check GCash, Maya, card and bank against today's amounts in the app, including what was collected by each.",
          "If something doesn't match, look through today's sales for a missing or wrong entry, for example a GCash payment rung up as Cash. Staff: tell a manager before you leave. Managers: fix it with SOP 10.",
          "Make sure every piece damaged or lost today is recorded (SOP 6). Staff: tell a manager so they record it.",
          "In Inventory, tap the Reserved filter. Check anyone due to pick up today, and call anyone past their hold date (SOP 7).",
        ],
      },
    ],
    check: "Cash and e-wallet totals match, or the difference and its reason are reported to a manager the same night.",
  },
  {
    no: 13,
    title: "Weekly review: Dashboard and Finance",
    who: "Owner and manager together.",
    when: "Once a week, same day each week.",
    roles: MGR,
    parts: [
      {
        steps: [
          "Count the shelf for the products that sell most (SOP 5).",
          "Open Sales → Dashboard. Note net sales against the previous period, profit per piece, and still owed. Use the category filter to check each category.",
          "Look at Best sellers (how fast they sell, days of stock left) and Slowest movers. Plan a discount or stop reordering the slowest ones.",
          "Open Sales → Finance → Profit & loss. Read net sales, gross margin and net profit, and compare with last month (pick the month at the top).",
          "Open Cash flow. Check where the cash went: stock bought, fees, expenses, taxes and distributions.",
          {
            text: "On Overview, read Should be in the register. Tap it to see how it's worked out. Then count the drawer. Your count should be that figure:",
            sub: [
              "plus anything you paid by GCash or bank,",
              "plus a starting float not recorded as owner capital,",
              "minus cash taken out to keep or deposit,",
              "minus cash from the drawer paid for stock that hasn't arrived,",
              "minus owner capital put in by GCash or bank.",
            ],
          },
          "Still a difference? Look through the week's sales and expenses for a missing or wrong entry.",
          "Open Balance. Total assets and Owed + owners' share must match. Check the inventory value looks right for what's on the shelf.",
          "Open Batches. It always covers since opening. Read the running net profit: each batch's net profit so far, the owner's and the manager's share of it, and the running total. After general expenses it ends at Shop net profit so far, the same as Net profit on Profit & loss with Since opening picked.",
          "Tap a batch to see every line: sales, discounts, what the pieces sold cost, each expense, how much of the batch's cost is still to earn back, and its owner / manager split. The shares are a guide, not a payout: what can be paid out is Safe to distribute.",
          "Owner: open Report (after Batches, or Report on a batch's page). It compares the newest batch with the one before: net profit, how fast it sold, the day it earned back its cost, where each peso went, who still owes and how each flavour sold. Pick another batch at the top; under Compare with, pick another batch, All batches (every batch on the charts and in the statement) or Nothing.",
          "Open Collectibles and follow up on everyone who owes (SOP 9).",
          "Check that every expense for the week is entered (SOP 11).",
        ],
      },
    ],
    check: "You both agree on what to reorder (SOP 14) and whether to distribute profit (SOP 15).",
  },
  {
    no: 14,
    title: "Plan the next restock and set the inventory reserve",
    who: "Owner or manager.",
    when: "At the weekly review, when products show low stock, and right after a batch is received.",
    roles: MGR,
    parts: [
      {
        title: "Plan the order",
        steps: [
          "Go to Restock. Check the plan once: tap Change these days and set Batch arrives in, Spare days and Each order lasts, then tap Save plan.",
          "Read the suggested order. It uses how fast each product sells, minus what's on the shelf and reserved.",
          "Adjust for what you know (a flavour being discontinued, a promo coming), then tap Copy order list and paste it in your message to the supplier.",
          "If you see Update low-stock alerts (with a number), tap it. It sets each selling product's low-stock alert to its reorder point, so the badge comes on at the right time.",
        ],
      },
      {
        title: "Set the inventory reserve",
        steps: [
          "Go to Sales → Finance. On the Overview, find the Inventory reserve card. If it isn't asking you, tap Change the amount.",
          "Pick a quick amount (Same as Batch N, All spare cash, Nothing) or type the expected cost of the order, including shipping. Restock shows the suggested order “about ₱X at cost” as a guide.",
          "Read “Leaves ₱X of spare cash”, add a note (for example “Black TEO reorder”), and tap Keep this amount.",
          "When the order arrives, receive it with SOP 3. If it is paid from company funds, its cost comes off the reserve, and Finance asks you to decide again.",
        ],
      },
    ],
    check: "The Inventory reserve shows your amount and the question is gone.",
  },
  {
    no: 15,
    title: "Owner distributions (owner)",
    who: "Owner only.",
    when: "After the weekly or monthly review, once the inventory reserve is set.",
    roles: ["owner"],
    parts: [
      {
        steps: [
          "Make sure the expenses are entered (SOP 11) and the inventory reserve is set (SOP 14).",
          "Go to Sales → Finance and read Safe to distribute. It is the lower of profit kept in the business and spare cash (cash minus the tax reserve and the inventory reserve).",
          "Tap Record distribution. The amount starts at the full safe amount. Change it if you pay out less. The app refuses more than Safe to distribute.",
          "Check the shares shown under the amount: “Owner gets ₱X, manager ₱Y”. They follow the profit split in Finance settings (SOP 16).",
          "Add a note (for example “Batch 1 profit, week of 10 Nov”), then tap Distribute ₱X. It is dated today (change the date with Edit, step 7).",
          "Pay out the shares from the cash or bank the money is in, the same day.",
          "Wrong amount, date or note? Tap Edit next to it in the Distributed list. Entered by mistake? Tap undo.",
        ],
      },
    ],
    check: "The distribution shows in the Distributed list, and Closing cash went down by it. Distributions are profit only; capital is not returned.",
  },
  {
    no: 16,
    title: "Owner capital, tax rate and profit split (owner)",
    who: "Owner only.",
    when: "When the owners put money or stock into the business; when the tax setup is confirmed; when the owners agree a new profit split.",
    roles: ["owner"],
    parts: [
      {
        title: "Money put in",
        steps: [
          "Go to Sales → Finance → Balance.",
          "Tap Record capital put in, enter the Amount put in, the Date and a Note, then tap Save capital. To correct one later, tap Edit next to it. Entered by mistake? Tap the bin next to it.",
          "Never ring it up as a sale or enter it as anything else: capital is not sales and not profit.",
        ],
      },
      {
        title: "Stock the owners paid for",
        steps: [
          "When receiving a batch the owners paid for themselves, untick Paid from company funds (SOP 3).",
          "Its cost then counts as owner capital automatically. It shows under Owner capital on Balance.",
          "Ticked wrong when receiving? Open the batch page and, on the Profit and loss card, tap Not from the fund (the owners paid) or Paid from the fund (the business paid).",
        ],
      },
      {
        title: "Tax rate",
        steps: [
          "Go to Sales → Finance. At the bottom of the Overview, Finance settings shows the rate in use next to Percentage tax on net sales. Tap Change tax rate. (It is also on Profit & loss.)",
          "Enter the percentage tax your accountant confirms (3% for most shops that aren't VAT-registered; 0 for no estimate), then tap Save rate.",
          "At 0% there is no tax estimate and no tax reserve, so more shows as Safe to distribute. Set the rate your accountant confirms before you distribute.",
        ],
      },
      {
        title: "Profit split",
        steps: [
          "Go to Sales → Finance. At the bottom of the Overview, under Finance settings, tap Change split. (Change split is also on Finance → Batches and on a batch page.)",
          "Enter Owner parts and Manager parts in whole numbers: 2 and 1 = owner two thirds, manager one third; 1 and 1 = half each.",
          "Tap Save split. The app shows “Profit split saved.”",
          "New distributions and every batch's owner and manager shares use the new split at once. Distributions already recorded keep their old shares; if you edit one, it is split again with the new split.",
        ],
      },
    ],
    check: "On Balance, Total assets and Owed + owners' share still match, and Owner capital includes what was put in.",
  },
  {
    no: 17,
    title: "Shop settings (owner)",
    who: "Owner only. Everyone else sees the shop name, minimum age and staff discount limit on Settings.",
    when: "When the shop opens, and whenever the receipt details, the age rule or the staff discount limit change.",
    roles: ["owner"],
    parts: [
      {
        steps: [
          "Go to Settings & staff. Under Shop, set the Shop name, Address on receipts and Receipt message. They print on every receipt.",
          "Minimum age: the age the cashier confirms on every sale (18 to 30; the Philippines' Vape Law sets 18).",
          "Staff discount limit: the most Staff can take off one sale, in pesos (0 = no discounts). Owners and managers have no limit.",
          "Leave “Let the register sell more than the stock count” unticked, so mistakes in the count show up. Tick it only while you're still entering stock, then untick it.",
          "Tap Save settings.",
        ],
      },
    ],
    check: "“Settings saved.” shows under Shop, and the next sale's age box shows the new minimum age.",
  },
];

export const SCREENS: { screen: string; who: string; what: string; href: string; managers?: boolean }[] = [
  { screen: "Sell", who: "Everyone", href: "/", what: "Scan or tap products, take payment, or record a sale as Not paid yet." },
  {
    screen: "Sales",
    who: "Everyone; past days for owner and manager",
    href: "/sales",
    what: "Today's sales, money in by method (with what was collected on earlier Not paid yet sales) and top sellers. Open a sale to print the receipt or collect what's owed. Owner and manager: other days, CSV export and Void sale. Owner: Delete sale.",
  },
  {
    screen: "Sales → Dashboard",
    who: "Owner, manager",
    href: "/sales/dashboard",
    managers: true,
    what: "Net sales against the previous period, profit per piece, best sellers, slowest movers and busiest times, with a category filter.",
  },
  {
    screen: "Sales → Finance",
    who: "Owner, manager",
    href: "/sales/pnl",
    managers: true,
    what: "Overview (safe to distribute, what should be in the register, where the cash went, distributions, inventory reserve, who owes, and Finance settings: the owner's tax rate and split), Profit & loss, Cash flow, Balance with owner capital, and Batches: the running net profit with each batch's owner and manager share, and each batch's full statement. Owner: Report compares one batch with another, with charts by day, where each peso went, who still owes, each flavour and the two statements side by side.",
  },
  {
    screen: "Inventory",
    who: "Everyone. Anyone can reserve pieces and add a photo; stock and product changes by owner and manager",
    href: "/inventory",
    what: "Products by category with their shelf count, a Low or Out badge, and filters: For sale, Low stock, Out, Not for sale, Reserved. Owners and managers also see each cost and the stock at cost, Add product, and Import to add many products from a CSV file. A product's page holds its photo, reservations, Change stock, Product details, Stock history with Fix, and Delete product (owner).",
  },
  {
    screen: "Restock",
    who: "Owner, manager",
    href: "/restock",
    managers: true,
    what: "Reorder: the suggested order, with Receive this order, Copy order list and Update low-stock alerts. Receive batch. Batches: each delivery's sales, what's still owed, and its net profit so far with the owner and manager shares; a batch's page has its profit and loss, restock costs, expenses, and Fix for each product line. Expenses.",
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
    what: "Your profile, Help & SOPs, light or dark theme and Sign out. Everyone sees the shop name, minimum age and staff discount limit. The owner changes them, the receipt details and whether the register may sell more than the stock count, and sets each staff member's role and whether they can sign in.",
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
    steps: [
      "Scan the barcode, or type to search.",
      "Tap the product to add it. Scan it again for another piece, or change how many in the cart. Tapping it again takes it out.",
      "Tap Charge.",
    ],
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
      "Tap Save restock, Save count or Save loss.",
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
    id: "finance",
    title: "Finance overview",
    sop: 13,
    img: "/help/finance.webp",
    alt: "Finance overview: safe to distribute, should be in the register, net sales, gross margin, net profit, closing cash",
    managers: true,
    steps: [
      "Safe to distribute today, with the owner and manager shares.",
      "Should be in the register: the cash the drawer should hold today. Tap it to see how it's worked out.",
      "Net sales for the period, after discounts.",
      "Gross margin: what's left after the landed cost of the pieces sold.",
      "Net profit after expenses and the tax estimate. Tap it for the full Profit & loss.",
      "Closing cash. Tap it for the Cash flow.",
    ],
  },
  {
    id: "distribute",
    title: "Owner distributions",
    sop: 15,
    img: "/help/distribute.webp",
    alt: "Owner distributions: profit kept, cash, reserves, spare cash, safe to distribute, Record distribution",
    managers: true,
    steps: [
      "Profit kept and spare cash (cash minus the tax and inventory reserves). Safe to distribute is the lower of the two.",
      "Owner only: tap Record distribution and enter up to the safe amount.",
    ],
  },
  {
    id: "reserve-fund",
    title: "Set the inventory reserve",
    sop: 14,
    img: "/help/reserve-fund.webp",
    alt: "Inventory reserve: quick amounts, amount, Keep this amount",
    managers: true,
    steps: [
      "Tap a quick amount: the last batch's cost, all spare cash, or nothing.",
      "Or type the amount. The line under it says how much spare cash is left.",
      "Tap Keep this amount.",
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
    word: "Restock costs / Restocking fees",
    meaning: "Shipping, tax, MOOE and other fees for a delivery, on top of the goods. Entered on the batch; Finance shows them as Restocking fees. MOOE = maintenance and other operating expenses.",
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
    meaning: "A sale whose buyer pays later. It counts as a sale the day it's rung up, but the money only comes in once it's collected. Collectibles shows who still owes. Finance shows it under Receivables.",
  },
  {
    word: "Paid from company funds",
    meaning: "A batch bought with the shop's money. Batch 1 was paid by the owners, so its cost counts as owner capital.",
    managers: true,
  },
  {
    word: "Accrual / Cash / Today",
    meaning: "Tags on the Finance cards. Accrual = counted when sold, paid or not (Profit & loss). Cash = counted when money moves (Cash flow, Where the cash went). Today = the position now, whatever month is picked (register, distributions, inventory reserve, receivables). As of a date = what the business holds on that day (Balance).",
    managers: true,
  },
  { word: "Cost of goods sold", meaning: "What the pieces sold cost, at landed cost: the goods plus their batch's shipping, tax, MOOE and other fees.", managers: true },
  { word: "Gross profit / margin", meaning: "Net sales minus cost of goods sold; the margin is that as a % of net sales.", managers: true },
  { word: "Operating expenses", meaning: "Salaries, rent, utilities, supplies, payment fees and other costs of running the shop.", managers: true },
  { word: "Percentage tax (est.)", meaning: "An estimate of the tax on net sales at the owner's rate (3% by default). Record the tax you pay under Taxes paid.", managers: true },
  { word: "Cash", meaning: "Money the business holds: drawer, e-wallets and bank. Collected sales and capital in, minus stock, fees, expenses, taxes and distributions out.", managers: true },
  {
    word: "Should be in the register",
    meaning: "The paper cash the shop should hold today: cash received and owner capital put in since opening, minus everything paid out (except payment fees, which come off the e-wallet or bank). The app takes every payment as cash from the drawer. So your count is higher by anything paid by GCash or bank and by a float not recorded as capital. It is lower by cash taken out to keep or deposit, by drawer cash paid for stock that hasn't arrived, and by capital put in by GCash or bank.",
    managers: true,
  },
  { word: "Net profit so far", meaning: "A batch's profit on the pieces sold so far: net sales, minus what those pieces cost with their share of restocking fees, minus the batch's expenses. All batches, minus general expenses, give the net profit in Profit & loss.", managers: true },
  {
    word: "Owner / Manager share (on a batch)",
    meaning: "A batch's net profit so far divided by the profit split in Finance settings, with what each share becomes when the batch sells out. It is before the shop's general expenses, so it is a guide, not a payout: what can be paid out is Safe to distribute.",
    managers: true,
  },
  { word: "Receivables", meaning: "Sales not paid yet. Shown by age: 0–7, 8–30 and over 30 days.", managers: true },
  { word: "Owner capital", meaning: "Money or stock the owners put into the business. Not a sale and not profit.", managers: true },
  { word: "Profit kept", meaning: "All profit earned so far minus what's been distributed (retained earnings).", managers: true },
  { word: "Tax reserve", meaning: "Estimated tax not yet paid. Held back from distributions.", managers: true },
  {
    word: "Inventory reserve",
    meaning: "The amount you decided to keep for the next restock. The cost of the next batch paid from company funds comes out of it; then Finance asks again.",
    managers: true,
  },
  {
    word: "Safe to distribute",
    meaning: "The lower of profit kept and spare cash (cash minus the tax and inventory reserves). Only the owner records distributions, shared by the profit split in Finance settings.",
    managers: true,
  },
  { word: "Void / Delete", meaning: "Void cancels a real sale and keeps it on record. Delete removes a test sale completely (owner only)." },
  {
    word: "Fix",
    meaning: "Corrects a restock, count or loss entered by mistake, or removes it. It sits next to each line on the batch page and in the product's Stock history.",
    managers: true,
  },
];

export const PROBLEMS: { see: string; doThis: string; managers?: boolean }[] = [
  {
    see: "“Waiting for the owner” after signing up",
    doThis: "If you were asked to check your email, tap the link first. Then tell the owner: they tick Can sign in for you in Settings & staff and tap Save (SOP 1).",
  },
  { see: "No Restock tab, no costs, no Dashboard or Finance", doThis: "You're signed in as Staff. Ask the owner if your role should change." },
  {
    see: "“Only N left” or “Only N of … free to sell” at Sell, but the shelf has more",
    doThis: "If it says (M reserved), those pieces are held for a customer: open the product and check Reserved (SOP 7). Otherwise sell what the app allows, then a manager counts it (SOP 5) or receives the missing delivery (SOP 3).",
  },
  { see: "Wrong flavour, price or quantity rung up", doThis: "Void the sale and ring it up again (SOP 10). Staff: ask a manager." },
  {
    see: "A piece leaks, breaks, expires or goes missing",
    doThis: "Set it aside. Don't sell it or throw it away. Tell the owner or a manager the same day so they record it as Damaged / lost (SOP 6).",
  },
  { see: "A delivery's pieces or cost entered wrong", doThis: "Batch page → Fix on that line (SOP 4).", managers: true },
  { see: "A product missing from a batch", doThis: "Batch page → Add a product to this batch (SOP 4).", managers: true },
  {
    see: "A delivery came more than 60 days ago and Arrived on won't go back that far",
    doThis: "Receive the batch with today's date, then on its page tap Edit supplier, date or note and set the real date, or change it on the batch's report (SOP 4). It can be earlier than the day the pieces were recorded, not later.",
    managers: true,
  },
  { see: "Change stock asks for a batch and none fits", doThis: "Receive the delivery as a batch first (SOP 3).", managers: true },
  {
    see: "Import says a row needs fixing, or Nothing was added",
    doThis: "Fix each row marked Fix this in your sheet, save it as CSV again and choose the file again. Nothing is added until every row is right. A barcode shown like 4.8E+12 was changed by Excel: set the Barcode column to Text and type it again (SOP 2).",
    managers: true,
  },
  {
    see: "The page reloaded mid-sale",
    doThis: "Carry on: the products in the cart stay on this phone until you charge or clear them. Enter the buyer, discount and payment again.",
  },
  {
    see: "A payment was recorded with the wrong amount or method",
    doThis: "It can't be changed in the app yet. Don't record another payment to even it out. Write down the buyer, the sale number and the right amount, and tell the owner the same day.",
  },
  {
    see: "Cash drawer doesn't match the app",
    doThis: "Check today's sales for a missed or wrong entry (for example GCash rung up as Cash), and list any cash paid out of the drawer today. Tell a manager the same night (SOP 12).",
  },
  {
    see: "Cash doesn't match Finance → Should be in the register",
    doThis: "That figure is all the paper cash since opening. Payments by GCash or bank, a float, cash taken out, drawer cash paid for stock before it arrived and capital put in by bank all make your count differ: follow SOP 13 step 6.",
    managers: true,
  },
  {
    see: "Safe to distribute is ₱0",
    doThis: "Profit kept or spare cash is ₱0 or less. Read the lines in the Owner distributions card to see which. Collect what's owed, wait for sales, or lower the inventory reserve (SOP 14).",
    managers: true,
  },
  { see: "A distribution was entered by mistake", doThis: "Owner taps undo next to it in the Distributed list (SOP 15).", managers: true },
  {
    see: "Balance totals don't match",
    doThis: "They always should. Write down both numbers and tell the developer the same day.",
    managers: true,
  },
];
