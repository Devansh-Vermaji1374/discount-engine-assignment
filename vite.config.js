import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'https'

const LLM_RULE_PROMPT = `
You are an intelligent e-commerce discount rule parser.
Convert the user's natural language discount rule into a structured JSON object.

Allowed schema:
{
  "scope": "brand" | "platform" | "cart",
  "applies_to": string | null,     // Brand or platform name (e.g. "Natura Casa", "Flipkart", "Amazon India"). null for cart scope.
  "type": "percentage" | "flat",   // "percentage" for % off, "flat" for rupee amount off
  "value": number,                 // Positive number (e.g. 20, 150)
  "stackable": boolean,            // true if stackable/stacks, false otherwise
  "min_cart_value": number | null  // Positive threshold number for cart scope, null for item scope
}

Rules:
1. If the input does NOT provide sufficient details (e.g., missing discount value, missing condition for cart rule, or vague statements like "Give a discount for big orders"), return:
   { "error": "Unable to create a valid discount rule. Please specify the discount percentage or flat amount and the target brand/platform or minimum cart value." }
2. Scope must be one of: "brand", "platform", "cart".
3. For "cart" scope, applies_to must be null. min_cart_value must be provided if stated, or null.
4. For "brand" or "platform" scope, applies_to is mandatory, and min_cart_value must be null.
5. Return ONLY valid JSON with no markdown fences, no formatting, and no commentary.
`

function callGeminiWithRetry(apiKey, prompt, maxRetries = 2) {
  return new Promise((resolve, reject) => {
    let attempt = 0

    function execute() {
      attempt++
      const postData = JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${LLM_RULE_PROMPT}\n\nUser Input: "${prompt}"` }]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })

      const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 10000
      }

      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          if ((res.statusCode === 503 || res.statusCode === 429) && attempt <= maxRetries) {
            setTimeout(execute, 1000 * attempt)
            return
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            try {
              const errObj = JSON.parse(data)
              resolve({
                status: res.statusCode,
                error: errObj.error?.message || `Gemini API returned status ${res.statusCode}`
              })
            } catch {
              resolve({
                status: res.statusCode,
                error: `Gemini API returned status ${res.statusCode}: ${data}`
              })
            }
            return
          }

          try {
            const parsed = JSON.parse(data)
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text
            if (!text) {
              resolve({ status: 500, error: 'Empty response returned from Gemini' })
              return
            }
            const ruleJson = JSON.parse(text)
            resolve({ status: 200, data: ruleJson })
          } catch (err) {
            resolve({ status: 500, error: `Malformed JSON from Gemini: ${err.message}` })
          }
        })
      })

      req.on('timeout', () => {
        req.destroy()
        if (attempt <= maxRetries) {
          setTimeout(execute, 1000)
        } else {
          resolve({ status: 504, error: 'Gemini API request timed out' })
        }
      })

      req.on('error', (err) => {
        if (attempt <= maxRetries) {
          setTimeout(execute, 1000)
        } else {
          resolve({ status: 500, error: `Network error connecting to Gemini: ${err.message}` })
        }
      })

      req.write(postData)
      req.end()
    }

    execute()
  })
}

function geminiDevServerPlugin(apiKey) {
  return {
    name: 'gemini-dev-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/parse-rule' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json')
            let prompt = ''
            try {
              const parsedBody = JSON.parse(body || '{}')
              prompt = parsedBody.prompt
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON request body' }))
              return
            }

            if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Missing or empty prompt' }))
              return
            }

            const activeKey = apiKey || process.env.GEMINI_API_KEY
            if (!activeKey) {
              res.statusCode = 500
              res.end(JSON.stringify({
                error: 'GEMINI_API_KEY is not configured on the server. Please set it in .env'
              }))
              return
            }

            const result = await callGeminiWithRetry(activeKey, prompt)
            if (result.error) {
              res.statusCode = result.status || 500
              res.end(JSON.stringify({ error: result.error }))
            } else {
              res.statusCode = 200
              res.end(JSON.stringify(result.data))
            }
          })
          return
        }
        next()
      })
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''

  return {
    plugins: [
      react(),
      geminiDevServerPlugin(apiKey)
    ],
  }
})
