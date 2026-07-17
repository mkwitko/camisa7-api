-- User.stripeCustomerId: correlation to the Stripe customer. The only billing
-- state in our DB — entitlements are resolved live via the Stripe Entitlements
-- API + short in-memory cache, never persisted.
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;
