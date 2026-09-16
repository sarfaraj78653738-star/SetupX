/**
 * Payment abstraction layer — supports both Stripe and Razorpay.
 * Swap between them via STRIPE_ENABLED env var (true/false).
 * When Razorpay is enabled, STRIPE_* vars are ignored and Razorpay keys are used.
 *
 * Both providers use the same conceptual flow:
 *   1. Create a checkout session / order (server-side)
 *   2. Redirect user to payment page
 *   3. Webhook confirms payment → grant subscription
 */

import { kvRateLimit } from "./kv";
import { updateSubscription } from "./users";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type PaymentProvider = "stripe" | "razorpay";

export const getProvider = (): PaymentProvider => {
  // If Razorpay keys are set and Stripe is not, use Razorpay
  const hasRazorpay = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  const hasStripe = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
  if (hasRazorpay && !hasStripe) return "razorpay";
  if (hasStripe) return "stripe";
  return "stripe"; // default to stripe; fails gracefully if keys missing
};

export const isStripe = (): boolean => process.env.STRIPE_ENABLED !== "false" && !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
export const isRazorpay = (): boolean => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

// ---------------------------------------------------------------------------
// Pricing tiers
// ---------------------------------------------------------------------------

export const PLANS = {
  pro: {
    name: "Pro",
    description: "Unlimited scans, 15-minute refresh, CSV export, watchlist",
    priceInCents: 29900, // ₹299/month in cents (for Stripe) or rupees (for Razorpay)
    stripePriceId: process.env.STRIPE_PRICE_ID_PRO ?? "",
    razorpayPlanId: process.env.RAZORPAY_PLAN_ID_PRO ?? "plan_pro_monthly",
  },
  premium: {
    name: "Premium",
    description: "Pro + intraday broker scanning, priority support, early access",
    priceInCents: 59900, // ₹599/month
    stripePriceId: process.env.STRIPE_PRICE_ID_PREMIUM ?? "",
    razorpayPlanId: process.env.RAZORPAY_PLAN_ID_PREMIUM ?? "plan_premium_monthly",
  },
};

// ---------------------------------------------------------------------------
// Checkout session creation
// ---------------------------------------------------------------------------

export interface CheckoutResult {
  url: string; // redirect URL for the user
  sessionId: string; // for tracking/webhook matching
}

/**
 * Create a payment checkout session.
 * For Stripe: creates a Checkout Session and returns the URL.
 * For Razorpay: creates an Order and returns the Razorpay checkout URL (frontend opens Razorpay popup).
 */
export async function createCheckout(
  userId: string,
  planKey: keyof typeof PLANS,
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutResult> {
  const provider = getProvider();

  if (provider === "stripe" && isStripe()) {
    return createStripeCheckout(userId, planKey, successUrl, cancelUrl);
  } else if (provider === "razorpay" && isRazorpay()) {
    return createRazorpayOrder(userId, planKey, successUrl, cancelUrl);
  }

  throw new Error(`No payment provider configured. Set STRIPE_SECRET_KEY or RAZORPAY_KEY_ID.`);
}

// ---------------------------------------------------------------------------
// Stripe implementation
// ---------------------------------------------------------------------------

import Stripe from "stripe";

let _stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripeClient) {
    _stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2024-12-18.acacia",
    });
  }
  return _stripeClient;
}

async function createStripeCheckout(
  userId: string,
  planKey: keyof typeof PLANS,
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutResult> {
  const plan = PLANS[planKey];
  const stripe = getStripe();

  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXTAUTH_URL_DEV ?? "http://localhost:4000";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: plan.stripePriceId,
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}${cancelUrl}`,
    metadata: {
      userId,
      planKey,
      provider: "stripe",
    },
    // Customer info — we'll collect email during checkout
    customer_email: undefined, // let Stripe collect it, or pass if we have it
  });

  return {
    url: session.url!,
    sessionId: session.id,
  };
}

// ---------------------------------------------------------------------------
// Razorpay implementation
// ---------------------------------------------------------------------------

import crypto from "crypto";

async function createRazorpayOrder(
  userId: string,
  planKey: keyof typeof PLANS,
  successUrl: string,
  cancelUrl: string,
): Promise<CheckoutResult> {
  const plan = PLANS[planKey];
  const amount = plan.priceInCents; // in rupees (paise = amount * 100)
  const currency = "INR";
  const receiptId = `setupx_${userId}_${Date.now()}`;

  // Razorpay Order creation
  const orderData = {
    amount: amount * 100, // paise
    currency,
    receipt: receiptId,
    notes: {
      userId,
      planKey,
      provider: "razorpay",
    },
  };

  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(orderData),
  });

  if (!orderRes.ok) {
    const text = await orderRes.text();
    throw new Error(`Razorpay order creation failed: ${text}`);
  }

  const order = await orderRes.json();
  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXTAUTH_URL_DEV ?? "http://localhost:4000";

  // Return the order ID and amount — frontend will use these to open the Razorpay popup
  return {
    url: `${baseUrl}/payment/razorpay?order_id=${order.id}&amount=${amount}&currency=${currency}&plan_key=${planKey}&success_url=${encodeURIComponent(successUrl)}&cancel_url=${encodeURIComponent(cancelUrl)}`,
    sessionId: order.id,
  };
}

// ---------------------------------------------------------------------------
// Webhook handling
// ---------------------------------------------------------------------------

export async function handleWebhook(body: string, headers: Record<string, string>): Promise<{ received: boolean }> {
  const provider = getProvider();

  if (provider === "stripe" && isStripe()) {
    return handleStripeWebhook(body, headers);
  } else if (provider === "razorpay" && isRazorpay()) {
    return handleRazorpayWebhook(body, headers);
  }

  return { received: false };
}

async function handleStripeWebhook(body: string, headers: Record<string, string>): Promise<{ received: boolean }> {
  const stripe = getStripe();
  const signature = headers["stripe-signature"];

  if (!signature) {
    console.error("[payments] Missing stripe-signature header");
    return { received: false };
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[payments] Stripe webhook signature verification failed:", err);
    return { received: false };
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const planKey = session.metadata?.planKey as keyof typeof PLANS | undefined;
      if (!userId || !planKey) {
        console.error("[payments] Missing metadata in checkout session");
        break;
      }
      // Grant the subscription
      await updateSubscription(userId, planKey, "active", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      console.log(`[payments] Stripe: granted ${planKey} to user ${userId}`);
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (!userId) break;
      const status = sub.status as "active" | "canceled" | "past_due" | "incomplete" | "incomplete_expired" | "trialing" | "unpaid";
      const planKey = sub.metadata?.planKey as keyof typeof PLANS | undefined;
      const tier = planKey ? planKey : "pro";
      await updateSubscription(userId, tier, status, status === "active" ? new Date(sub.current_period_end * 1000) : null);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (!userId) break;
      await updateSubscription(userId, "free", "canceled", null);
      break;
    }
    default:
      break;
  }

  return { received: true };
}

async function handleRazorpayWebhook(body: string, headers: Record<string, string>): Promise<{ received: boolean }> {
  const signature = headers["x-razorpay-signature"];
  if (!signature) {
    console.error("[payments] Missing x-razorpay-signature header");
    return { received: false };
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("hex");

  if (signature !== expected) {
    console.error("[payments] Razorpay webhook signature mismatch");
    return { received: false };
  }

  const event = JSON.parse(body);
  const eventType = event.payload?.narrator;

  if (eventType === "order.paid") {
    const order = event.payload?.entity as { id: string; notes: Record<string, string>; amount_paid: number };
    const userId = order.notes?.userId;
    const planKey = order.notes?.planKey as keyof typeof PLANS | undefined;
    if (!userId || !planKey) {
      console.error("[payments] Missing notes in Razorpay order");
      return { received: true };
    }
    await updateSubscription(userId, planKey, "active", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    console.log(`[payments] Razorpay: granted ${planKey} to user ${userId}`);
  }

  return { received: true };
}

// ---------------------------------------------------------------------------
// Cancel / refund (admin action)
// ---------------------------------------------------------------------------

export async function cancelSubscription(userId: string): Promise<void> {
  const provider = getProvider();

  if (provider === "stripe" && isStripe()) {
    await cancelStripeSubscription(userId);
  } else if (provider === "razorpay" && isRazorpay()) {
    // Razorpay subscriptions are canceled via the subscription entity
    await cancelRazorpaySubscription(userId);
  }

  // Also update local state
  await updateSubscription(userId, "free", "canceled", null);
}

async function cancelStripeSubscription(userId: string): Promise<void> {
  const stripe = getStripe();
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:4000";

  // Find the subscription by metadata — we'd need to list subscriptions
  // This is simplified; in production you'd store the subscription ID on the user record
  const sessions = await stripe.checkout.sessions.list({ limit: 100, metadata: { userId } });
  for (const session of sessions.data) {
    if (session.subscription) {
      await stripe.subscriptions.update(session.subscription as string, { cancel_at_period_end: true });
    }
  }
}

async function cancelRazorpaySubscription(userId: string): Promise<void> {
  // Razorpay: find the subscription by notes and cancel
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  // List subscriptions — Razorpay API
  const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return;
  const data = await res.json();
  for (const sub of data.subscriptions ?? []) {
    if (sub.notes?.userId === userId) {
      await fetch(`https://api.razorpay.com/v1/subscriptions/${sub.id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}` },
      });
    }
  }
}
