/**
 * PdfUploader.jsx
 *
 * Dedicated PDF cart upload component with drag-and-drop, validation,
 * parsing progress, extracted items preview, and user confirmation.
 */

import { useState, useRef } from 'react'
import { parseCartPDF } from '../engine/pdfCartParser.js'
import DataTable from './DataTable.jsx'
import ErrorBanner from './ErrorBanner.jsx'

const PREVIEW_COLUMNS = [
  { key: 'itemId',    label: 'Item ID' },
  { key: 'product',   label: 'Product' },
  { key: 'brand',     label: 'Brand' },
  { key: 'platform',  label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
]

export default function PdfUploader({ onConfirmCart }) {
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [isParsing, setIsParsing] = useState(false)
  const [extractedItems, setExtractedItems] = useState(null)
  const [parseErrors, setParseErrors] = useState([])
  const fileInputRef = useRef(null)

  async function handleFile(file) {
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setParseErrors(['Invalid file type. Please upload a PDF document (.pdf).'])
      setExtractedItems(null)
      return
    }

    // Limit size to 10MB
    if (file.size > 10 * 1024 * 1024) {
      setParseErrors(['File is too large. Maximum PDF size is 10 MB.'])
      setExtractedItems(null)
      return
    }

    setFileName(file.name)
    setFileSize(file.size)
    setIsParsing(true)
    setParseErrors([])
    setExtractedItems(null)

    try {
      const { items, errors } = await parseCartPDF(file)
      if (errors && errors.length > 0) {
        setParseErrors(errors)
      }
      if (items && items.length > 0) {
        setExtractedItems(items)
      } else if (!errors || errors.length === 0) {
        setParseErrors(['No valid cart item rows could be extracted from this PDF.'])
      }
    } catch (err) {
      setParseErrors([`Failed to read PDF: ${err.message}`])
    } finally {
      setIsParsing(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function handleConfirm() {
    if (extractedItems && extractedItems.length > 0) {
      onConfirmCart(extractedItems, fileName)
      setExtractedItems(null)
      setFileName('')
      setParseErrors([])
    }
  }

  function handleDiscard() {
    setExtractedItems(null)
    setFileName('')
    setParseErrors([])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? '#FF5800' : '#CECECE'}`,
          borderRadius: 6,
          padding: '1.2rem',
          textAlign: 'center',
          background: isDragging ? '#fff4ed' : '#fafafa',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
        <div style={{ fontSize: 28, marginBottom: 4 }}>📑</div>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#131A48' }}>
          {fileName ? fileName : 'Upload Shopping Cart PDF'}
        </div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          Drag & drop your order PDF or click to browse
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
          Accepts tables with Product, Brand, Platform, Base Price (up to 10MB)
        </div>
      </div>

      {isParsing && (
        <div style={{ fontSize: 12, color: '#FF5800', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>⏳ Extracting cart table from PDF...</span>
        </div>
      )}

      <ErrorBanner errors={parseErrors} />

      {/* Extracted preview confirmation modal / panel */}
      {extractedItems && extractedItems.length > 0 && (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            padding: '1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                Extracted Cart Preview ({extractedItems.length} items)
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Review extracted products before replacing active cart
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleDiscard}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: 4,
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                style={{
                  background: '#16a34a',
                  border: 'none',
                  borderRadius: 4,
                  padding: '5px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Confirm & Replace Cart
              </button>
            </div>
          </div>

          <DataTable columns={PREVIEW_COLUMNS} rows={extractedItems} />
        </div>
      )}
    </div>
  )
}
