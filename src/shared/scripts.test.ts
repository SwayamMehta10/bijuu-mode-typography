import { describe, it, expect } from 'vitest'
import { detectScripts, scriptOf, pickFontForScripts } from './scripts'

describe('detectScripts', () => {
  it('returns empty set for empty string', () => {
    expect(detectScripts('')).toEqual(new Set())
  })

  it('detects pure Latin', () => {
    const s = detectScripts('hello world')
    expect(s.has('Latn')).toBe(true)
    // Space is Common
    expect(s.has('Zyyy')).toBe(true)
  })

  it('detects pure Devanagari', () => {
    // नमस्ते = na + ma + sa + virama + te (multi-codepoint conjunct)
    const s = detectScripts('नमस्ते')
    expect(s.has('Deva')).toBe(true)
    // The conjunct includes the virama (U+094D) which is Inherited
    expect(s.size).toBeGreaterThanOrEqual(1)
  })

  it('detects pure Thai', () => {
    // นินจา includes a vowel mark above the first consonant
    const s = detectScripts('นินจา')
    expect(s.has('Thai')).toBe(true)
  })

  it('detects pure CJK kanji', () => {
    // 螺旋丸 = "rasengan" (spiral ball) in Japanese kanji
    const s = detectScripts('螺旋丸')
    expect(s.has('Hani')).toBe(true)
  })

  it('detects mixed Han + Latin', () => {
    const s = detectScripts('忍術 Naruto')
    expect(s.has('Hani')).toBe(true)
    expect(s.has('Latn')).toBe(true)
  })

  it('detects emoji as Common', () => {
    // 🔥 is U+1F525, in the Common script
    const s = detectScripts('🔥🥷')
    expect(s.has('Zyyy')).toBe(true)
  })

  it('detects Hiragana and Katakana separately', () => {
    // ナルト = Naruto in katakana
    expect(detectScripts('ナルト').has('Kana')).toBe(true)
    // ひらがな = "hiragana" in hiragana
    expect(detectScripts('ひらがな').has('Hira')).toBe(true)
  })
})

describe('scriptOf', () => {
  it('identifies single Latin char', () => {
    expect(scriptOf('a')).toBe('Latn')
  })

  it('identifies single Devanagari consonant', () => {
    expect(scriptOf('न')).toBe('Deva')
  })

  it('identifies single Thai consonant', () => {
    expect(scriptOf('น')).toBe('Thai')
  })

  it('identifies single kanji', () => {
    expect(scriptOf('螺')).toBe('Hani')
  })

  it('identifies space as Common', () => {
    expect(scriptOf(' ')).toBe('Zyyy')
  })
})

describe('pickFontForScripts', () => {
  it('returns Inter for empty input', () => {
    expect(pickFontForScripts(new Set())).toBe('Inter')
  })

  it('returns Inter for emoji-only', () => {
    expect(pickFontForScripts(new Set(['Zyyy']))).toBe('Inter')
  })

  it('returns Noto Sans Devanagari for pure Devanagari', () => {
    expect(pickFontForScripts(new Set(['Deva']))).toBe('Noto Sans Devanagari')
  })

  it('returns Noto Sans Thai for pure Thai', () => {
    expect(pickFontForScripts(new Set(['Thai']))).toBe('Noto Sans Thai')
  })

  it('returns Noto Sans JP for pure CJK', () => {
    expect(pickFontForScripts(new Set(['Hani']))).toBe('Noto Sans JP')
  })

  it('falls back to Noto Sans JP for mixed CJK + Latin', () => {
    expect(pickFontForScripts(new Set(['Hani', 'Latn']))).toBe('Noto Sans JP')
  })

  it('falls back to Noto Sans for mixed non-CJK scripts', () => {
    expect(pickFontForScripts(new Set(['Latn', 'Deva']))).toBe('Noto Sans')
  })

  it('ignores Common and Inherited when picking dominant script', () => {
    // "नमस्ते 🔥" → Deva + Zyyy + Zinh → should still pick Devanagari font
    expect(pickFontForScripts(new Set(['Deva', 'Zyyy', 'Zinh']))).toBe('Noto Sans Devanagari')
  })
})
