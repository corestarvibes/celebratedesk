// Content Security Policy — applied via session header rewrite. `file:` is
// allowed in img-src so user-uploaded logos load from userData. Fonts are
// bundled locally (src/renderer/public/fonts/*.woff2) so there's no need to
// whitelist external font hosts.

import { session } from 'electron'

const POLICY_PARTS = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: file: https: celeb-local:",
  "connect-src 'self'",
  "font-src 'self' data:"
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
