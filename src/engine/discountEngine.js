/**
 * discountEngine.js
 *
 * Pure discount calculation logic. No UI, no side effects.
 * All functions take plain objects and return plain objects.
 *
 * Data shapes:
 *
 * DiscountRule {
 *   ruleId:        string       — e.g. "RULE-01"
 *   scope:         "brand" | "platform" | "cart"
 *   appliesTo:     string | null — e.g. "Natura Casa", "Amazon India", null for cart
 *   type:          "percentage" | "flat"
 *   value:         number       — percentage as integer (15 = 15%), flat in rupees
 *   stackable:     boolean
 *   minCartValue?: number | null
 * }
 *
 * CartItem {
 *   itemId:    string       — e.g. "ITEM-01"
 *   product:   string
 *   brand:     string
 *   platform:  string
 *   basePrice: number       — in rupees
 * }
 *
 * DiscountResult {
 *   itemId:        string
 *   product:       string
 *   brand:         string
 *   platform:      string
 *   basePrice:     number
 *   finalPrice:    number
 *   totalDiscount: number
 *   appliedRules:  string[]
 *   skippedRules:  string[]
 *   reasoning:     string   — customer-readable explanation
 * }
 *
 * CartDiscountOffer {
 *   triggered:       boolean
 *   ruleId:          string | null
 *   type:            "percentage" | "flat"
 *   value:           number
 *   threshold:       number
 *   discountAmount:  number
 *   reasoning:       string
 * }
 *
 * ProcessedCartSummary {
 *   itemResults:        DiscountResult[]
 *   originalTotal:      number
 *   itemDiscountTotal:  number
 *   subtotalAfterItems: number
 *   cartOffer:          CartDiscountOffer | null
 *   finalCartTotal:     number
 *   totalSavings:       number
 * }
 */

/**
 * Returns true if the rule applies to this cart item.
 */
export function ruleMatchesItem(item, rule) {
  if (!rule || !item) return false
  const normalise = (s) => (s ? s.toString().trim().toLowerCase() : '')
  if (rule.scope === 'brand') {
    return normalise(item.brand) === normalise(rule.appliesTo)
  }
  if (rule.scope === 'platform') {
    return normalise(item.platform) === normalise(rule.appliesTo)
  }
  return false
}

/**
 * Calculates the rupee discount a rule gives on a given price.
 * Uses the provided price, not the original base price — important for stacking.
 */
export function calculateDiscountAmount(price, rule) {
  if (!rule || price <= 0) return 0
  if (rule.type === 'percentage') {
    return Math.round((price * rule.value) / 100)
  }
  if (rule.type === 'flat') {
    return Math.min(price, Math.round(rule.value))
  }
  return 0
}

/**
 * Builds the customer-facing reasoning string for an applied rule.
 */
export function ruleToReasoning(rule) {
  const scopeLabel = rule.scope === 'brand' ? 'Brand' : rule.scope === 'platform' ? 'Platform' : 'Cart'
  if (rule.type === 'percentage') {
    return `${scopeLabel} offer: ${rule.value}% off`
  }
  if (rule.type === 'flat') {
    return `${scopeLabel} offer: Rs.${rule.value} off`
  }
  return `${scopeLabel} offer applied`
}

/**
 * Applies the active item-level discount rules to a single cart item.
 * Returns a DiscountResult.
 *
 * Logic:
 *   1. Find all rules that match this item (scope is brand or platform).
 *   2. Among non-stackable rules, pick the one giving the largest discount in rupees.
 *   3. Apply any stackable rules sequentially on top of that price.
 *   4. Build the customer reasoning string and record applied / skipped rule IDs.
 */
export function applyDiscounts(item, rules) {
  const itemRules = (rules || []).filter((r) => r && (r.scope === 'brand' || r.scope === 'platform'))
  const matchingRules = itemRules.filter((r) => ruleMatchesItem(item, r))

  // No rules match — return base price with explanation
  if (matchingRules.length === 0) {
    return {
      itemId: item.itemId,
      product: item.product,
      brand: item.brand,
      platform: item.platform,
      basePrice: item.basePrice,
      finalPrice: item.basePrice,
      totalDiscount: 0,
      appliedRules: [],
      skippedRules: [],
      reasoning: 'No offers available',
    }
  }

  const nonStackable = matchingRules.filter((r) => !r.stackable)
  const stackable = matchingRules.filter((r) => r.stackable)

  // Pick the non-stackable rule that gives the largest saving
  let winner = null
  let skipped = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(item.basePrice, b) -
        calculateDiscountAmount(item.basePrice, a)
    )
    winner = sorted[0]
    skipped = sorted.slice(1)
  }

  // Apply winner first, then stack on top
  let price = item.basePrice
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    const winDiscount = calculateDiscountAmount(price, winner)
    price -= winDiscount
    appliedRules.push(winner.ruleId)
    reasoningParts.push(ruleToReasoning(winner))
  }

  for (const rule of stackable) {
    const stackDiscount = calculateDiscountAmount(price, rule)
    price -= stackDiscount
    appliedRules.push(rule.ruleId)
    reasoningParts.push(ruleToReasoning(rule))
  }

  const finalPrice = Math.max(0, Math.round(price))

  return {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
    finalPrice,
    totalDiscount: item.basePrice - finalPrice,
    appliedRules,
    skippedRules: skipped.map((r) => r.ruleId),
    reasoning: reasoningParts.join(' + '),
  }
}

/**
 * Runs applyDiscounts across every item in the cart.
 * Returns an array of DiscountResult objects.
 */
export function processCart(cartItems, rules) {
  return (cartItems || []).map((item) => applyDiscounts(item, rules))
}

/**
 * Sums the final prices across all results.
 */
export function cartTotal(results) {
  return (results || []).reduce((sum, r) => sum + r.finalPrice, 0)
}

/**
 * Evaluates cart-level discount rules against the subtotal of final item prices.
 * Cart rules only apply if scope === 'cart' and the subtotal meets minCartValue (if set).
 * When multiple cart rules exist, selects the one providing the greatest discount.
 */
export function evaluateCartOffer(subtotal, rules) {
  if (subtotal <= 0 || !rules || rules.length === 0) {
    return null
  }

  const cartRules = rules.filter((r) => r && r.scope === 'cart')
  if (cartRules.length === 0) {
    return null
  }

  // Find all cart rules whose threshold condition is met
  const eligibleRules = cartRules.filter((r) => {
    const threshold = r.minCartValue !== undefined && r.minCartValue !== null ? Number(r.minCartValue) : 0
    return subtotal >= threshold
  })

  if (eligibleRules.length === 0) {
    return null
  }

  // Calculate discount for each eligible cart rule and pick max saving
  let bestRule = null
  let maxDiscount = -1

  for (const rule of eligibleRules) {
    let discount = 0
    if (rule.type === 'percentage') {
      discount = Math.round((subtotal * rule.value) / 100)
    } else if (rule.type === 'flat') {
      discount = Math.min(subtotal, Math.round(rule.value))
    }

    if (discount > maxDiscount) {
      maxDiscount = discount
      bestRule = rule
    }
  }

  if (!bestRule || maxDiscount <= 0) {
    return null
  }

  const threshold = bestRule.minCartValue !== undefined && bestRule.minCartValue !== null ? Number(bestRule.minCartValue) : 0
  const reasoning = bestRule.type === 'percentage'
    ? `Cart offer: ${bestRule.value}% off — Rs.${maxDiscount.toLocaleString('en-IN')} saved`
    : `Cart offer: Rs.${bestRule.value} off — Rs.${maxDiscount.toLocaleString('en-IN')} saved`

  return {
    triggered: true,
    ruleId: bestRule.ruleId,
    type: bestRule.type,
    value: bestRule.value,
    threshold,
    discountAmount: maxDiscount,
    reasoning,
  }
}

/**
 * Calculates complete pricing breakdown for the entire cart:
 * item-level discounts, cart subtotal, cart-level offer (if met), and final cart total.
 */
export function calculateFullCart(cartItems, rules) {
  const itemResults = processCart(cartItems, rules)
  const originalTotal = (cartItems || []).reduce((sum, item) => sum + (Number(item.basePrice) || 0), 0)
  const subtotalAfterItems = cartTotal(itemResults)
  const itemDiscountTotal = originalTotal - subtotalAfterItems

  const cartOffer = evaluateCartOffer(subtotalAfterItems, rules)
  const cartDiscountAmount = cartOffer ? cartOffer.discountAmount : 0
  const finalCartTotal = Math.max(0, subtotalAfterItems - cartDiscountAmount)
  const totalSavings = originalTotal - finalCartTotal

  return {
    itemResults,
    originalTotal,
    itemDiscountTotal,
    subtotalAfterItems,
    cartOffer,
    finalCartTotal,
    totalSavings,
  }
}
