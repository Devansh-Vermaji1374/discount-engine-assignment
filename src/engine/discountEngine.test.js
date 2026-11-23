import { describe, it, expect } from 'vitest'
import {
  ruleMatchesItem,
  calculateDiscountAmount,
  applyDiscounts,
  processCart,
  cartTotal,
  evaluateCartOffer,
  calculateFullCart,
} from './discountEngine.js'

describe('discountEngine - Baseline & Rules Logic', () => {
  const sampleRules = [
    {
      ruleId: 'RULE-01',
      scope: 'platform',
      appliesTo: 'Amazon India',
      type: 'percentage',
      value: 15,
      stackable: false,
    },
    {
      ruleId: 'RULE-02',
      scope: 'brand',
      appliesTo: 'Natura Casa',
      type: 'flat',
      value: 150,
      stackable: false,
    },
    {
      ruleId: 'RULE-03',
      scope: 'platform',
      appliesTo: 'Flipkart',
      type: 'percentage',
      value: 10,
      stackable: true,
    },
    {
      ruleId: 'RULE-04',
      scope: 'cart',
      appliesTo: null,
      type: 'percentage',
      value: 10,
      stackable: false,
      minCartValue: 4000,
    },
  ]

  const sampleCart = [
    { itemId: 'ITEM-01', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299 },
    { itemId: 'ITEM-02', product: 'Bed Sheet Set', brand: 'Natura Casa', platform: 'Flipkart', basePrice: 849 },
    { itemId: 'ITEM-03', product: 'Wall Shelf', brand: 'LivSpace Pro', platform: 'Amazon India', basePrice: 599 },
    { itemId: 'ITEM-04', product: 'Ceramic Vase', brand: 'LivSpace Pro', platform: 'Noon', basePrice: 2499 },
    { itemId: 'ITEM-05', product: 'Cutting Board', brand: 'Nordic Basics', platform: 'Amazon India', basePrice: 449 },
    { itemId: 'ITEM-06', product: 'Desk Organiser', brand: 'Nordic Basics', platform: 'Flipkart', basePrice: 899 },
  ]

  it('selects maximum non-stackable discount for ITEM-01 (15% = 195 > 150)', () => {
    const res = applyDiscounts(sampleCart[0], sampleRules)
    expect(res.finalPrice).toBe(1104)
    expect(res.appliedRules).toEqual(['RULE-01'])
    expect(res.skippedRules).toEqual(['RULE-02'])
  })

  it('applies non-stackable then stackable sequentially for ITEM-02 (849 - 150 = 699, 699 - 10% = 629)', () => {
    const res = applyDiscounts(sampleCart[1], sampleRules)
    expect(res.finalPrice).toBe(629)
    expect(res.appliedRules).toEqual(['RULE-02', 'RULE-03'])
  })

  it('handles item with no matching rules (ITEM-04)', () => {
    const res = applyDiscounts(sampleCart[3], sampleRules)
    expect(res.finalPrice).toBe(2499)
    expect(res.reasoning).toBe('No offers available')
    expect(res.appliedRules).toEqual([])
  })

  it('verifies all expected prices for the official sample data', () => {
    const summary = calculateFullCart(sampleCart, sampleRules)
    const expected = [
      { itemId: 'ITEM-01', finalPrice: 1104 },
      { itemId: 'ITEM-02', finalPrice: 629 },
      { itemId: 'ITEM-03', finalPrice: 509 },
      { itemId: 'ITEM-04', finalPrice: 2499 },
      { itemId: 'ITEM-05', finalPrice: 382 },
      { itemId: 'ITEM-06', finalPrice: 809 },
    ]

    expected.forEach((exp, i) => {
      expect(summary.itemResults[i].itemId).toBe(exp.itemId)
      expect(summary.itemResults[i].finalPrice).toBe(exp.finalPrice)
    })

    expect(summary.subtotalAfterItems).toBe(5932)
    expect(summary.cartOffer).not.toBeNull()
    expect(summary.cartOffer.discountAmount).toBe(593)
    expect(summary.finalCartTotal).toBe(5339)
  })

  it('does not trigger cart offer when subtotal is below minCartValue threshold', () => {
    const smallCart = [
      { itemId: 'ITEM-01', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299 },
    ]
    const summary = calculateFullCart(smallCart, sampleRules)
    expect(summary.subtotalAfterItems).toBe(1104)
    expect(summary.cartOffer).toBeNull()
    expect(summary.finalCartTotal).toBe(1104)
  })

  it('triggers cart offer when subtotal is exactly at the threshold', () => {
    const exactCart = [
      { itemId: 'EXACT-01', product: 'Exact Item', brand: 'Generic', platform: 'Direct', basePrice: 4000 },
    ]
    const summary = calculateFullCart(exactCart, sampleRules)
    expect(summary.subtotalAfterItems).toBe(4000)
    expect(summary.cartOffer).not.toBeNull()
    expect(summary.cartOffer.discountAmount).toBe(400)
    expect(summary.finalCartTotal).toBe(3600)
  })

  it('handles empty cart gracefully', () => {
    const summary = calculateFullCart([], sampleRules)
    expect(summary.itemResults).toEqual([])
    expect(summary.originalTotal).toBe(0)
    expect(summary.subtotalAfterItems).toBe(0)
    expect(summary.cartOffer).toBeNull()
    expect(summary.finalCartTotal).toBe(0)
  })

  it('handles stackable-only rules without non-stackable matching', () => {
    const rules = [
      {
        ruleId: 'RULE-STACK-ONLY',
        scope: 'platform',
        appliesTo: 'Flipkart',
        type: 'percentage',
        value: 10,
        stackable: true,
      },
    ]
    const item = { itemId: 'TEST-01', product: 'P1', brand: 'B1', platform: 'Flipkart', basePrice: 1000 }
    const res = applyDiscounts(item, rules)
    expect(res.finalPrice).toBe(900)
    expect(res.totalDiscount).toBe(100)
    expect(res.appliedRules).toEqual(['RULE-STACK-ONLY'])
  })
})
