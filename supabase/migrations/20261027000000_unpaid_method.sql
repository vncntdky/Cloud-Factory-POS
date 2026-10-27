-- Vape POS: "Not paid yet" (sold on credit, collected later). A new enum value has to be committed
-- before anything can use it, so it gets a migration of its own.
alter type public.payment_method add value if not exists 'unpaid';
