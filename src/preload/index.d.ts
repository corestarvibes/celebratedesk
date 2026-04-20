import type { CelebAPI } from './index'

declare global {
  interface Window {
    celebAPI: CelebAPI
  }
}

export {}
