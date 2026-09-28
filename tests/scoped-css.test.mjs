import { describe, expect, it } from 'vitest'
import { extractStyleBlocks, findUnmatchedScopedRules } from '../src/scoped-css.mjs'

const page = (markup) => ({ source: '/', markup })

describe('findUnmatchedScopedRules', () => {
  it('passes a rule whose class renders with the scope it demands', () => {
    const pages = [page('<div class="card" data-astro-cid-abc123>…</div>')]
    const styleSheets = [{ source: 'a.css', css: '.card[data-astro-cid-abc123]{color:red}' }]

    expect(findUnmatchedScopedRules(pages, styleSheets).size).toBe(0)
  })

  it('reports a rule whose class only ever renders under another scope', () => {
    const pages = [page('<div class="card" data-astro-cid-child1>…</div>')]
    const styleSheets = [{ source: 'a.css', css: '.card[data-astro-cid-parent1]{color:red}' }]

    const unmatched = findUnmatchedScopedRules(pages, styleSheets)

    expect([...unmatched.keys()]).toEqual(['.card[data-astro-cid-parent1]'])
    expect([...unmatched.get('.card[data-astro-cid-parent1]').rendered]).toEqual(['child1'])
  })

  it('leaves a class that never renders alone, since it is applied at runtime or never rendered', () => {
    const pages = [page('<div class="card" data-astro-cid-abc123>…</div>')]
    const styleSheets = [{ source: 'a.css', css: '.is-open[data-astro-cid-abc123]{display:block}' }]

    expect(findUnmatchedScopedRules(pages, styleSheets).size).toBe(0)
  })

  it('names each stylesheet a repeated rule appears in', () => {
    const pages = [page('<div class="card" data-astro-cid-child1>…</div>')]
    const css = '.card[data-astro-cid-parent1]{color:red}'
    const styleSheets = [
      { source: 'a.css', css },
      { source: '/about/', css }
    ]

    const unmatched = findUnmatchedScopedRules(pages, styleSheets)

    expect([...unmatched.get('.card[data-astro-cid-parent1]').sources]).toEqual(['a.css', '/about/'])
  })
})

describe('extractStyleBlocks', () => {
  it('reads every inline style block in a page', () => {
    expect(extractStyleBlocks('<style>.a{}</style><p>x</p><style media="print">.b{}</style>')).toEqual(['.a{}', '.b{}'])
  })
})
