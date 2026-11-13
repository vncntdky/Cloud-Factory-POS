# Finance guide

How the money screens (Sales → Finance) work. Amounts are worked out live from sales, payments, stock,
batches, expenses, owner capital and distributions. Pick **Since opening** or any month at the top.

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
| + Stock paid by the owners | A batch not paid from company funds; also in Stock bought, so it nets to zero |
| + Customer receipts | Paid at the till, plus later collections, on the day collected |
| − Stock bought | Every restock at its cost per piece |
| − Restocking fees | Shipping, tax, MOOE and other on each batch |
| − Operating expenses | As in Profit & loss |
| − Taxes paid | Expenses recorded as Taxes paid |
| − Owner distributions | Distributions recorded by the owner |
| **Closing cash** | The result (the Overview draws it as a waterfall) |

### Balance — as of the period's last day

| What the business holds | | Owed + owners' share | |
|---|---|---|---|
| Cash | closing cash | Tax payable (est.) | tax estimated − taxes paid |
| Receivables | net sales − collected | Owner capital | cash put in + stock paid by the owners |
| Inventory at cost | stock bought + fees − cost of goods sold ± count differences | Profit earned | all net profit to date |
| | | Owner distributions | subtracted |
| **Total assets** | | **Owed + owners' share** | always equals total assets |

### In the register — Today (Overview)

| Line | Source |
|---|---|
| Cash sales and collections | Everything paid in cash since opening, at the till or collected later |
| + Owner capital put in | Capital entries |
| − Stock bought, restocking fees | Batches paid from company funds |
| − Expenses, taxes paid, owner distributions | As in Cash flow, without payment fees (they come off the e-wallet or bank) |
| **Should be in the register** | Count the drawer against this |
| Received by GCash, Maya, card, bank | Everything that came in that way since opening; it never reached the drawer |

The app doesn't record which pocket paid for stock, fees or expenses, so it takes all of them as paid in
cash from the drawer. The count will differ, and the card says so, when something was paid by GCash or bank
(add it back), when a supplier was paid for stock that hasn't arrived (take it off: the app counts a batch
when it is received), when cash was taken out to keep or deposit (add it back), and when the drawer started
with a float that isn't recorded as owner capital (add it). For one day only, use Sales → Daily sales.

### Batches — Accrual, since opening

The running net profit lists every batch, oldest first, with its net profit so far and the running total.
Under it, each batch has its full statement:

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

The running total closes with general expenses and ends at the shop's net profit, the same figure as
Profit & loss since opening. Sales of a product since removed, or of pieces sold beyond the stock count,
belong to no batch and show as their own row ("Not in any batch"). Sold-out batches start folded.

## The rules

- **Landed cost.** A piece costs what was paid for it plus its share of its batch's shipping, tax, MOOE and
  other fees, split evenly over the pieces received.
- **Owner capital is never sales or profit.** Money the owners put in is recorded on Balance. A batch with
  *Paid from company funds* off (Batch 1) also counts as capital.
- **Tax is estimated, then settled.** The owner's rate × net sales is tax payable. Paying it = an expense
  under Taxes paid: it lowers tax payable and cash, not profit.
- **Two reserves come before any payout.** Tax reserve = tax not yet paid. Inventory reserve = what the
  owners keep for the next restock; the next fund-paid batch's cost comes out of it.
- **Safe to distribute** = the lower of profit kept (profit earned − distributions) and spare cash (cash −
  both reserves). The app refuses more, so capital can't be paid out as profit by mistake.
- **Split.** Distributions are split owner : manager by the profit split (2 : 1 now). Only the owner records
  distributions, capital, the tax rate and the split; managers see everything.

## What can be edited, and by whom

| Record | Where | Who |
|---|---|---|
| Tax rate, profit split | Finance → Overview → Finance settings | Owner |
| Distributions: amount, date, note (capped at safe to distribute) | Finance → Overview → Distributed → Edit | Owner |
| Owner capital: amount, date, note | Finance → Balance → Edit | Owner |
| Expenses: type, amount, date, note, batch | Restock → Expenses, or a batch page → Edit | Owner, manager |
| Batch supplier, date, note | Batch page → Edit supplier, date or note | Owner, manager |
| Batch restocking costs, paid from company funds | Batch page → P&L | Owner, manager |
| Pieces and cost of each restock, count, loss | Batch or product page → Fix | Owner, manager |
| Inventory reserve | Finance → Overview | Owner, manager |

## Monthly routine

With last month picked at the top of Finance, owner and manager together:

1. Every expense entered, including payment fees and tax paid.
2. Profit & loss: net sales, gross margin, net profit vs the month before.
3. Cash flow: where the cash went.
4. Balance: the two totals match; inventory value looks right.
5. Receivables: chase 8–30 days; decide on anything over 30.
6. Set the inventory reserve for the next order.
7. The owner records the distribution, up to Safe to distribute.

Tax figures are planning estimates. Confirm the rate and filings with an accountant.
