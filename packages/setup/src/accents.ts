import type { Text } from './types'

/**
 * The institution's colour. A fixed set, each checked for readable text on it
 * in light and dark, rather than a free colour picker: an institution picks its
 * colour, it cannot pick an unreadable one (decision D6).
 */

type Pair = { primary: string; foreground: string }
export type Accent = { id: string; name: Text; light: Pair; dark: Pair }

export const ACCENTS: readonly Accent[] = [
  {
    id: 'gold',
    name: { en: 'Gold', sw: 'Dhahabu', de: 'Gold', fr: 'Or' },
    light: { primary: 'oklch(0.852 0.199 91.936)', foreground: 'oklch(0.421 0.095 57.708)' },
    dark: { primary: 'oklch(0.795 0.184 86.047)', foreground: 'oklch(0.421 0.095 57.708)' },
  },
  {
    id: 'green',
    name: { en: 'Green', sw: 'Kijani', de: 'Grün', fr: 'Vert' },
    light: { primary: 'oklch(0.527 0.137 150.069)', foreground: 'oklch(0.982 0.018 155.826)' },
    dark: { primary: 'oklch(0.627 0.17 149.214)', foreground: 'oklch(0.982 0.018 155.826)' },
  },
  {
    id: 'blue',
    name: { en: 'Blue', sw: 'Bluu', de: 'Blau', fr: 'Bleu' },
    light: { primary: 'oklch(0.488 0.217 264.376)', foreground: 'oklch(0.97 0.014 254.604)' },
    dark: { primary: 'oklch(0.623 0.188 259.815)', foreground: 'oklch(0.97 0.014 254.604)' },
  },
  {
    id: 'navy',
    name: { en: 'Navy', sw: 'Samawati iliyokolea', de: 'Marineblau', fr: 'Bleu marine' },
    light: { primary: 'oklch(0.379 0.146 265.522)', foreground: 'oklch(0.97 0.014 254.604)' },
    dark: { primary: 'oklch(0.546 0.215 262.881)', foreground: 'oklch(0.97 0.014 254.604)' },
  },
  {
    id: 'teal',
    name: { en: 'Teal', sw: 'Kijani-bahari', de: 'Petrol', fr: 'Sarcelle' },
    light: { primary: 'oklch(0.511 0.096 186.391)', foreground: 'oklch(0.984 0.014 180.72)' },
    dark: { primary: 'oklch(0.6 0.118 184.704)', foreground: 'oklch(0.984 0.014 180.72)' },
  },
  {
    id: 'maroon',
    name: { en: 'Maroon', sw: 'Nyekundu iliyokolea', de: 'Weinrot', fr: 'Bordeaux' },
    light: { primary: 'oklch(0.444 0.177 26.899)', foreground: 'oklch(0.971 0.013 17.38)' },
    dark: { primary: 'oklch(0.577 0.215 27.325)', foreground: 'oklch(0.971 0.013 17.38)' },
  },
  {
    id: 'purple',
    name: { en: 'Purple', sw: 'Zambarau', de: 'Violett', fr: 'Violet' },
    light: { primary: 'oklch(0.496 0.265 301.924)', foreground: 'oklch(0.977 0.014 308.299)' },
    dark: { primary: 'oklch(0.627 0.265 303.9)', foreground: 'oklch(0.977 0.014 308.299)' },
  },
  {
    id: 'slate',
    name: { en: 'Slate', sw: 'Kijivu', de: 'Schiefer', fr: 'Ardoise' },
    light: { primary: 'oklch(0.279 0.041 260.031)', foreground: 'oklch(0.984 0.003 247.858)' },
    dark: { primary: 'oklch(0.869 0.022 252.894)', foreground: 'oklch(0.208 0.042 265.755)' },
  },
]

export const findAccent = (id: string | null | undefined) => ACCENTS.find((a) => a.id === id)

const STYLE_ID = 'pleadli-accent'

/** Paints the whole app in an accent. `html:root` and `html.dark` outrank the
 * app's own `:root` and `.dark`, so this wins without `!important`. Passing
 * null (or an unknown id) goes back to the app's own palette. */
export function applyAccent(id: string | null | undefined) {
  if (typeof document === 'undefined') return
  const accent = findAccent(id)
  let style = document.getElementById(STYLE_ID)
  if (!accent) {
    style?.remove()
    return
  }
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  const vars = (p: Pair) =>
    `--primary:${p.primary};--primary-foreground:${p.foreground};--sidebar-primary:${p.primary};--sidebar-primary-foreground:${p.foreground};`
  style.textContent = `html:root{${vars(accent.light)}}html.dark{${vars(accent.dark)}}`
}
