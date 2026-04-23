// Content Security Policy — applied via session header rewrite. `file:` is
// allowed in img-src so user-uploaded logos load from userData.

import { session } from 'electron'

const POLICY_PARTS = [
  "default-src 'self'",
  "script-src 'self'",
  // Google Fonts stylesheet lives at fonts.googleapis.com — allow it in style-src.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: file: https: celeb-local:",
  // connect-src kept as tight as possible; Google Fonts added to satisfy
  // the font-loader's preconnect hints.
  "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
  // Google Fonts serves the actual woff2 files from fonts.gstatic.com.
  "font-src 'self' data: https://fonts.gstatic.com"
]

export function installCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [POLICY_PARTS.join('; ')]
      }
    })
  })
}
