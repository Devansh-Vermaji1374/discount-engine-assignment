/**
 * pdfCartParser.js
 *
 * Client-side PDF parser for extracting cart items from uploaded PDF documents.
 * Extracts textual tables with columns: Product, Brand, Platform, Base Price.
 * Converts extracted rows into CartItem objects and validates thoroughly.
 */

import * as pdfjsLib from 'pdfjs-dist'

// Set worker source to CDN or local bundled worker for client-side rendering
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`
}

/**
 * Extracts plain text lines from an ArrayBuffer of a PDF document.
 */
export async function extractLinesFromPdf(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdfDocument = await loadingTask.promise
  const lines = []

  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum)
    const textContent = await page.getTextContent()

    // Group text items by roughly their vertical Y position
    const itemMap = new Map()

    for (const item of textContent.items) {
      if (!item.str || item.str.trim() === '') continue
      const y = Math.round(item.transform[5]) // Y coordinate
      if (!itemMap.has(y)) {
        itemMap.set(y, [])
      }
      itemMap.get(y).push({
        x: item.transform[4],
        str: item.str,
      })
    }

    // Sort lines from top of page to bottom (descending Y)
    const sortedY = Array.from(itemMap.keys()).sort((a, b) => b - a)

    for (const y of sortedY) {
      const rowItems = itemMap.get(y)
      // Sort left to right
      rowItems.sort((a, b) => a.x - b.x)
      const lineStr = rowItems.map((it) => it.str).join('   ').trim()
      if (lineStr) {
        lines.push(lineStr)
      }
    }
  }

  return lines
}

/**
 * Parses raw text lines (from a PDF or text dump) into structured CartItem objects.
 * Handles pipe '|', tabs, or multi-space columnar separations.
 */
export function parseCartTableLines(lines) {
  const items = []
  const errors = []
  let rowCount = 0

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim()
    if (!line) continue

    // Skip headers or order metadata rows
    if (
      /^order\s*#/i.test(line) ||
      /^date\s*:/i.test(line) ||
      /^[-\u2500\u2014_]{3,}/.test(line) ||
      /^product\b.*brand\b.*platform\b.*base\s*price/i.test(line) ||
      /item\s*id.*product/i.test(line)
    ) {
      continue
    }

    // Attempt splitting by pipe first
    let parts = []
    if (line.includes('|')) {
      parts = line.split('|').map((p) => p.trim()).filter(Boolean)
    } else if (line.includes('\t')) {
      parts = line.split('\t').map((p) => p.trim()).filter(Boolean)
    } else {
      // Split by 2 or more consecutive spaces
      parts = line.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean)
    }

    // If still not 4 parts, try regex pattern for known structure:
    // Product Brand Platform Rs.1,299
    if (parts.length < 4) {
      // Match price at end
      const priceMatch = line.match(/(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d+)?)$/i)
      if (priceMatch) {
        const priceStr = priceMatch[1]
        const beforePrice = line.slice(0, line.lastIndexOf(priceMatch[0])).trim()
        const subParts = beforePrice.split(/\s{2,}|\|/).map((p) => p.trim()).filter(Boolean)
        if (subParts.length >= 3) {
          parts = [subParts[0], subParts[1], subParts.slice(2).join(' '), priceStr]
        }
      }
    }

    if (parts.length < 4) {
      // Line is not a valid 4-column product row
      errors.push(`Line "${line}": expected 4 columns (Product, Brand, Platform, Base Price), found ${parts.length}`)
      continue
    }

    const [product, brand, platform, rawPrice] = parts
    const cleanPrice = rawPrice.replace(/[₹,$\s]/g, '').replace(/Rs\.?/gi, '')
    const basePrice = parseFloat(cleanPrice)

    if (isNaN(basePrice) || basePrice <= 0) {
      errors.push(`Row for "${product}": invalid price "${rawPrice}"`)
      continue
    }

    rowCount++
    items.push({
      itemId: `ITEM-${String(rowCount).padStart(2, '0')}`,
      product,
      brand,
      platform,
      basePrice: Math.round(basePrice),
    })
  }

  return { items, errors }
}

/**
 * High-level parser for PDF File or ArrayBuffer.
 */
export async function parseCartPDF(fileOrBuffer) {
  try {
    let arrayBuffer
    if (fileOrBuffer instanceof ArrayBuffer) {
      arrayBuffer = fileOrBuffer
    } else if (fileOrBuffer.arrayBuffer) {
      arrayBuffer = await fileOrBuffer.arrayBuffer()
    } else {
      throw new Error('Unsupported input format for PDF parsing')
    }

    const lines = await extractLinesFromPdf(arrayBuffer)
    if (!lines || lines.length === 0) {
      return {
        items: [],
        errors: ['The uploaded PDF appears empty or contains no extractable text.'],
      }
    }

    const result = parseCartTableLines(lines)
    if (result.items.length === 0 && result.errors.length === 0) {
      return {
        items: [],
        errors: ['No cart table rows found in the PDF. Please ensure the PDF contains columns: Product, Brand, Platform, Base Price.'],
      }
    }

    return result
  } catch (err) {
    return {
      items: [],
      errors: [`PDF parsing failed: ${err.message}`],
    }
  }
}
