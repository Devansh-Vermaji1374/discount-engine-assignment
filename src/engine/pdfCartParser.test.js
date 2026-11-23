import { describe, it, expect } from 'vitest'
import { parseCartTableLines } from './pdfCartParser.js'

describe('pdfCartParser - parseCartTableLines', () => {
  it('parses formatted table lines as shown in assignment PDF sample', () => {
    const lines = [
      'Order #OP-9921 | Date: 15 Jan 2025',
      'Product Brand Platform Base Price',
      '──────────────────────────────────────────────────────────',
      'Cushion Cover | Natura Casa | Amazon India | Rs.1,299',
      'Bed Sheet Set | Natura Casa | Flipkart | Rs.849',
      'Wall Shelf | LivSpace Pro | Amazon India | Rs.599',
      'Ceramic Vase | LivSpace Pro | Noon | Rs.2,499',
      'Cutting Board | Nordic Basics | Amazon India | Rs.449',
      'Desk Organiser | Nordic Basics | Flipkart | Rs.899',
    ]

    const { items, errors } = parseCartTableLines(lines)
    expect(errors).toHaveLength(0)
    expect(items).toHaveLength(6)

    expect(items[0]).toEqual({
      itemId: 'ITEM-01',
      product: 'Cushion Cover',
      brand: 'Natura Casa',
      platform: 'Amazon India',
      basePrice: 1299,
    })

    expect(items[3]).toEqual({
      itemId: 'ITEM-04',
      product: 'Ceramic Vase',
      brand: 'LivSpace Pro',
      platform: 'Noon',
      basePrice: 2499,
    })
  })

  it('handles space-aligned columns without pipes', () => {
    const lines = [
      'Product   Brand   Platform   Base Price',
      'Cushion Cover   Natura Casa   Amazon India   1299',
      'Bed Sheet Set   Natura Casa   Flipkart   849',
    ]

    const { items, errors } = parseCartTableLines(lines)
    expect(errors).toHaveLength(0)
    expect(items).toHaveLength(2)
    expect(items[0].product).toBe('Cushion Cover')
    expect(items[0].basePrice).toBe(1299)
  })

  it('records errors for malformed or missing columns without discarding valid rows', () => {
    const lines = [
      'Cushion Cover | Natura Casa | Amazon India | 1299',
      'Broken Item Line without price',
      'Bed Sheet Set | Natura Casa | Flipkart | 849',
    ]

    const { items, errors } = parseCartTableLines(lines)
    expect(items).toHaveLength(2)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('expected 4 columns')
  })

  it('records errors for invalid price formats', () => {
    const lines = [
      'Cushion Cover | Natura Casa | Amazon India | INVALID_PRICE',
    ]

    const { items, errors } = parseCartTableLines(lines)
    expect(items).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('invalid price')
  })
})
