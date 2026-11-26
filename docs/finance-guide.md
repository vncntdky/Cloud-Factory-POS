# Finance guide

How the money screens (Sales → Finance) work. Amounts are worked out live from sales, payments, stock,
batches and what was paid to suppliers for them, expenses, owner capital and distributions. Pick **Since
opening** or any month at the top.

## The statements

### Profit & loss — Accrual (counted when sold, paid or not)

| Line | How it's worked out |
|---|---|
| Gross sales | Every completed sale in the period, before discounts |
| Discounts | Taken off at the till |
| **Net sales** | Gross sales − discounts |
| Cost of goods sold | Pieces sold × landed cost |
| **Gross profit** | Net sales − cost of goods sold; margin = ÷ net sales |
| Operating expenses | Salaries, rent, utilities, supplies, payment fees, other (not Taxes paid) |
| Stock count differences | Counts and losses at landed cost (shown only when there are any) |
| **Operating profit** | Gross profit + count differences − operating expenses |
| Percentage tax (est.) | Net sales × the owner's rate |
| **Net profit** | Operating profit − tax |

### Cash flow — Cash (counted when money moves)

| Line | Source |
|---|---|
| Opening cash | Closing cash of the day before the period |
| + Owner capital put in | Capital entries (Balance → Record capital put in) |
| + Customer receipts | Paid at the till, plus later collections, on the day collected |
| − Paid for stock | Payments to suppliers from the company fund, on the day paid (goods and restocking costs, before or after the stock arrives) |
| − Operating expenses | As in Profit & loss |
| − Taxes paid | Expenses recorded as Taxes paid |
| − Owner distributions | Distributions recorded by the owner |
| **Closing cash** | The result (the Overview draws it as a waterfall) |

Stock paid with the owner's money or an investment isn't cash: it is owner capital, on Balance.

### Balance — as of the period's last day

| What the business holds | | Owed + owners' share | |
|---|---|---|---|
| Cash | closing cash | Tax payable (est.) | tax estimated − taxes paid |
| Receivables | net sales − collected | Owed to suppliers | every batch's cost − what was paid for it |
| Inventory at cost | batches that arrived (goods + fees) − cost of goods sold ± count differences | Owner capital | cash put in + supplier payments with the owner's money or an investment |
| Stock on the way | orders not arrived yet, at cost | Profit earned | all net profit to date |
| | | Owner distributions | subtracted |
| **Total assets** | | **Owed + owners' share** | always equals total assets |

A batch's cost in full (its pieces at cost + shipping, tax, MOOE, other) counts from the day it was ordered, as
Stock on the way, and moves into Inventory the day it arrived. Each payment to the supplier counts on the day it
was paid. Under the balance, **Orders and suppliers** lists every order still on the way or not fully paid.

### In the register — Today (Overview)

| Line | Source |
|---|---|
| Cash sales and collections | Everything paid in cash since opening, at the till or collected later |
| + Owner capital put in | Capital entries |
| − Paid for stock | Supplier payments from the company fund |
| − Expenses, taxes paid, owner distributions | As in Cash flow, without payment fees (they come off the e-wallet or bank) |
| **Should be in the register** | Count the drawer against this |
| Received by GCash, Maya, card, bank | Everything that came in that way since opening; it never reached the drawer |

The app doesn't record which pocket paid for stock, fees or expenses, so it takes all of them as paid in
cash from the drawer. Count the drawer and compare; the card lists the same reasons. Your count is higher by
anything paid by GCash or bank (stock, restock costs, an expense, a tax or a distribution) and by a starting
float not recorded as owner capital. It is lower by cash taken out to keep or deposit, by drawer cash paid
to a supplier but not recorded yet (record each payment on its batch, the day it was paid), and by owner
capital put in by GCash or bank. For one day only, use Sales → Daily sales.

### Batches — Accrual, since opening

The running net profit lists every batch, oldest first, with its net profit so far, the owner's and the
manager's share of it, and the running total. Under it, each batch has its full statement:

| Line | How it's worked out |
|---|---|
| Gross sales, discounts, **net sales** | The batch's pieces sold, first in first out |
| Goods sold, restocking fees | What the pieces sold cost: unit cost + their share of the batch's fees |
| **Gross profit** | Net sales − the two lines above |
| Each expense charged to the batch | One line per expense (date, note) |
| Stock count differences, percentage tax (est.) | Shown when there are any |
| **Net profit so far** | What is left |
| Pieces left at today's prices, what they cost, **net profit when sold out** | For batches still selling |
| What the batch cost in full | Goods, shipping, tax, MOOE, other, expenses; how much its sales have covered |
| **Split**: owner, manager | Net profit so far divided by the profit split (2 : 1 now), and each share when the batch sells out |

The running total closes with general expenses and ends at the shop's net profit, the same figure as
Profit & loss since opening. Sales of a product since removed, or of pieces sold beyond the stock count,
belong to no batch and show as their own row ("Not in any batch"). Sold-out batches start folded.

A batch's owner and manager shares are before the shop's general expenses, and a batch at a loss shows
negative shares. They are a guide to how each batch is doing, not a payout: what can be paid out is
**Safe to distribute** on Overview. Restock → Batches shows the same net profit so far and shares on each
batch's row, and each batch's own page has the full statement.

## The rules

- **Landed cost.** A piece costs what was paid for it plus its share of its batch's shipping, tax, MOOE and
  other fees, split evenly over the pieces received.
- **Orders, then Arrived.** Stock is ordered in the app the day it is ordered (Restock → Order stock): its pieces
  wait off the shelf, on the way, until someone taps **Arrived**. Stock already here can be received in one step
  (Receive batch).
- **Paying suppliers.** Each payment for a batch is recorded with its day and whose money paid: **Company fund**
  (comes out of cash), **Owner's money** or **Investment** (both owner capital). An order can be paid in full, with a
  downpayment, or on pick-up; what isn't paid yet is Owed to suppliers. Payments can be added, edited or removed
  on the batch's page.
- **Owner capital is never sales or profit.** Money the owners put in is recorded on Balance. Stock paid with the
  owner's money or an investment (Batch 1) also counts as capital.
- **Tax is estimated, then settled.** The owner's rate × net sales is tax payable. Paying it = an expense
  under Taxes paid: it lowers tax payable and cash, not profit.
- **Reserves come before any payout.** Tax reserve = tax not yet paid. What is still owed to suppliers is held
  back too. Inventory reserve = what the owners keep for the next restock; the next order's cost that the
  company fund pays comes out of it, and Finance asks again.
- **Safe to distribute** = the lower of profit kept (profit earned − distributions) and spare cash (cash − tax
  reserve − owed to suppliers − inventory reserve). The app refuses more, so capital or a supplier's money can't
  be paid out as profit by mistake.
- **Split.** Distributions are split owner : manager by the profit split (2 : 1 now). Only the owner records
  distributions, capital, the tax rate and the split; managers see everything.

## What can be edited, and by whom

| Record | Where | Who |
|---|---|---|
| Tax rate, profit split | Finance → Overview → Finance settings | Owner |
| Distributions: amount, date, note (capped at safe to distribute) | Finance → Overview → Distributed → Edit | Owner |
| Owner capital: amount, date, note | Finance → Balance → Edit | Owner |
| Expenses: type, amount, date, note, batch | Restock → Expenses, or a batch page → Edit | Owner, manager |
| Batch supplier, order day, arrival day, note | Batch page → Edit supplier, dates or note (owner: also the batch's Report) | Owner, manager |
| Batch restocking costs | Batch page → Edit restock costs | Owner, manager |
| Payments to the supplier: amount, day, whose money, note | Batch page → Paid to the supplier | Owner, manager |
| Arrived by mistake, cancelled order | Batch page → Not here yet? / Order cancelled? | Owner, manager |
| Pieces and cost of each restock, count, loss | Batch or product page → Fix | Owner, manager |
| Inventory reserve | Finance → Overview | Owner, manager |

## Monthly routine

With last month picked at the top of Finance, owner and manager together:

1. Every expense entered, including payment fees and tax paid.
2. Profit & loss: net sales, gross margin, net profit vs the month before.
3. Cash flow: where the cash went.
4. Balance: the two totals match; inventory value looks right; Stock on the way and Owed to suppliers match the
   open orders.
5. Receivables: chase 8–30 days; decide on anything over 30.
6. Set the inventory reserve for the next order.
7. The owner records the distribution, up to Safe to distribute.

Tax figures are planning estimates. Confirm the rate and filings with an accountant.
