import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parseCartPDF } from './pdfCartParser.js'

describe('PDF Cart Upload - Comprehensive End-to-End Extraction', () => {
  const pdfPath = path.resolve('sample-data/cart.pdf')

  it('1. parses valid sample-data/cart.pdf and extracts all 6 cart items', async () => {
    const buffer = fs.readFileSync(pdfPath)
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

    const result = await parseCartPDF(arrayBuffer)
    expect(result.errors).toHaveLength(0)
    expect(result.items).toHaveLength(6)

    const expected = [
      { product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299 },
      { product: 'Bed Sheet Set', brand: 'Natura Casa', platform: 'Flipkart', basePrice: 849 },
      { product: 'Wall Shelf', brand: 'LivSpace Pro', platform: 'Amazon India', basePrice: 599 },
      { product: 'Ceramic Vase', brand: 'LivSpace Pro', platform: 'Noon', basePrice: 2499 },
      { product: 'Cutting Board', brand: 'Nordic Basics', platform: 'Amazon India', basePrice: 449 },
      { product: 'Desk Organiser', brand: 'Nordic Basics', platform: 'Flipkart', basePrice: 899 },
    ]

    expected.forEach((exp, i) => {
      expect(result.items[i].product).toBe(exp.product)
      expect(result.items[i].brand).toBe(exp.brand)
      expect(result.items[i].platform).toBe(exp.platform)
      expect(result.items[i].basePrice).toBe(exp.basePrice)
    })
  })

  it('2. handles corrupted PDF buffer gracefully with an error', async () => {
    const corruptBuffer = Buffer.from('NOT_A_REAL_PDF_DATA_HERE')
    const arrayBuffer = corruptBuffer.buffer.slice(corruptBuffer.byteOffset, corruptBuffer.byteOffset + corruptBuffer.byteLength)

    const result = await parseCartPDF(arrayBuffer)
    expect(result.items).toHaveLength(0)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('PDF parsing failed')
  })

  it('3. rejects unsupported input type gracefully', async () => {
    const result = await parseCartPDF(null)
    expect(result.items).toHaveLength(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
