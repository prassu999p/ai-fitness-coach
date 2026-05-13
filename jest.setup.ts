import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'util'

// Polyfill TextDecoder/TextEncoder in jsdom environment
Object.assign(global, { TextDecoder, TextEncoder })
