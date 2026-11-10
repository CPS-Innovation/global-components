// ---------------------------------------------------------------------------
// cookie-utils.ts
// njs utility module for cookie merging and ASCII-to-Unicode compression.
// ---------------------------------------------------------------------------

/**
 * Parse a Cookie header string into a map of name → value.
 */
function _parseCookieHeader(cookieHeader: string): Map<string, string> {
  const result = new Map<string, string>()
  if (!cookieHeader) return result

  const pairs = cookieHeader.split(";")
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i].trim()
    const eqIdx = pair.indexOf("=")
    if (eqIdx === -1) continue
    const name = pair.substring(0, eqIdx).trim()
    const value = pair.substring(eqIdx + 1).trim()
    result.set(name, value)
  }
  return result
}

/**
 * Parse a single Set-Cookie header value, returning the cookie name and value
 * (ignoring attributes like path, expires, httponly, etc.)
 */
function _parseSetCookie(setCookieValue: string): { name: string; value: string } | null {
  const semiIdx = setCookieValue.indexOf(";")
  const nameValue = semiIdx === -1 ? setCookieValue : setCookieValue.substring(0, semiIdx)
  const eqIdx = nameValue.indexOf("=")
  if (eqIdx === -1) return null

  const name = nameValue.substring(0, eqIdx).trim()
  const value = nameValue.substring(eqIdx + 1).trim()
  return { name, value }
}

/**
 * Serialize a cookie map back into a Cookie header string.
 */
function _serializeCookieHeader(cookies: Map<string, string>): string {
  const parts: string[] = []
  cookies.forEach(function (value, name) {
    parts.push(name + "=" + value)
  })
  return parts.join("; ")
}

// ---------------------------------------------------------------------------
// applySetCookie
// ---------------------------------------------------------------------------

interface ApplySetCookieOptions {
  /** If provided, only these cookie names will be included in the result. */
  whitelist?: string[]
}

/**
 * Merges Set-Cookie response headers into the incoming Cookie request header,
 * producing the cookie jar that a browser would send on the next request.
 *
 * Cookies with an empty value and a past expiry are treated as deletions.
 *
 * @param incomingCookie  The Cookie request header string
 * @param setCookieHeaders  Array of Set-Cookie header values from the response
 * @param options  Optional whitelist to filter the result
 * @returns The merged Cookie header string
 */
function applySetCookie(
  incomingCookie: string,
  setCookieHeaders: string[],
  options?: ApplySetCookieOptions
): string {
  const cookies = _parseCookieHeader(incomingCookie)

  for (let i = 0; i < setCookieHeaders.length; i++) {
    const parsed = _parseSetCookie(setCookieHeaders[i])
    if (!parsed) continue

    // Detect deletion: empty value with expires in the past
    const lower = setCookieHeaders[i].toLowerCase()
    const isExpired = lower.indexOf("expires=") !== -1
      && _isExpiredDate(setCookieHeaders[i])

    if (parsed.value === "" && isExpired) {
      cookies.delete(parsed.name)
    } else {
      cookies.set(parsed.name, parsed.value)
    }
  }

  // Apply whitelist if provided
  if (options && options.whitelist) {
    const allowed = new Set(options.whitelist)
    const filtered = new Map<string, string>()
    cookies.forEach(function (value, name) {
      if (allowed.has(name)) {
        filtered.set(name, value)
      }
    })
    return _serializeCookieHeader(filtered)
  }

  return _serializeCookieHeader(cookies)
}

/**
 * Check whether a Set-Cookie header contains an expires date in the past.
 */
function _isExpiredDate(setCookieHeader: string): boolean {
  const match = setCookieHeader.match(/expires=([^;]+)/i)
  if (!match) return false
  const expires = new Date(match[1].trim())
  return expires.getTime() < Date.now()
}

// ---------------------------------------------------------------------------
// ASCII ↔ Unicode compression
// ---------------------------------------------------------------------------

/**
 * Pack an ASCII string into a Unicode string by combining each pair of ASCII
 * bytes into a single UTF-16 code point.
 *
 * Each Unicode character stores 2 ASCII characters:
 *   codePoint = (ascii1 << 8) | ascii2
 *
 * For odd-length input, the final character stores the last byte in the low
 * byte with 0x00 in the high byte, and a trailing marker character (U+FFFF)
 * is appended to signal odd length.
 *
 * Compression ratio: 2:1 (e.g. 264 ASCII chars → 132 Unicode chars)
 *
 * @param ascii  The ASCII string to compress
 * @returns A Unicode string approximately half the length
 */
function asciiToUnicode(ascii: string): string {
  const len = ascii.length
  const isOdd = len % 2 !== 0
  const pairCount = Math.floor(len / 2)
  let result = ""

  for (let i = 0; i < pairCount; i++) {
    const hi = ascii.charCodeAt(i * 2)
    const lo = ascii.charCodeAt(i * 2 + 1)
    result += String.fromCharCode((hi << 8) | lo)
  }

  if (isOdd) {
    // Store last byte in low position, mark with U+FFFF
    result += String.fromCharCode(ascii.charCodeAt(len - 1))
    result += String.fromCharCode(0xFFFF)
  }

  return result
}

/**
 * Unpack a Unicode string back into the original ASCII string.
 *
 * Reverses the operation of asciiToUnicode.
 *
 * @param packed  The Unicode-compressed string
 * @returns The original ASCII string
 */
function unicodeToAscii(packed: string): string {
  const len = packed.length
  let result = ""

  // Check for odd-length marker
  const isOdd = len >= 2 && packed.charCodeAt(len - 1) === 0xFFFF
  const pairCount = isOdd ? len - 2 : len

  for (let i = 0; i < pairCount; i++) {
    const code = packed.charCodeAt(i)
    result += String.fromCharCode((code >> 8) & 0xFF)
    result += String.fromCharCode(code & 0xFF)
  }

  if (isOdd) {
    // Last real character before the marker holds a single byte
    result += String.fromCharCode(packed.charCodeAt(len - 2) & 0xFF)
  }

  return result
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default {
  applySetCookie,
  asciiToUnicode,
  unicodeToAscii,
}
