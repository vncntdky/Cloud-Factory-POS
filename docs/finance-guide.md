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
