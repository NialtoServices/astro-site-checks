import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectServerIslands, serverDirectoryOf, serverIslandNameOf } from '../src/server-islands.mjs'

/** A server build holding one manifest chunk with the given contents. */
async function serverBuildWithManifest(contents) {
  const serverDirectory = join(await mkdtemp(join(tmpdir(), 'site-checks-')), 'dist', 'server')
  await mkdir(join(serverDirectory, 'chunks'), { recursive: true })
  await writeFile(join(serverDirectory, 'chunks', '_virtual_astro_server-island-manifest_abc123.mjs'), contents)

  return serverDirectory
}

/** A manifest chunk as Astro writes it, declaring the given island map. */
function manifest(islandMap, nameMap = 'new Map([])') {
  return (
    'globalThis.process ??= {};\n' +
    '//#region \\0virtual:astro:server-island-manifest\n' +
    `var serverIslandMap = /* @__PURE__ */ ${islandMap};\n` +
    `var serverIslandNameMap = /* @__PURE__ */ ${nameMap};\n` +
    '//#endregion\n' +
    'export { serverIslandMap, serverIslandNameMap };\n'
  )
}

describe('serverIslandNameOf', () => {
  it('reads the island name from its route, with or without a trailing slash', () => {
    expect(serverIslandNameOf('/_server-islands/RecentPosts/')).toBe('RecentPosts')
    expect(serverIslandNameOf('/_server-islands/RecentPosts')).toBe('RecentPosts')
  })

  it('leaves other paths alone, including ones the island route does not match', () => {
    expect(serverIslandNameOf('/blog/')).toBeUndefined()
    expect(serverIslandNameOf('/_server-islands/')).toBeUndefined()
    expect(serverIslandNameOf('/_server-islands/RecentPosts/extra/')).toBeUndefined()
  })
})

describe('serverDirectoryOf', () => {
  it('finds the server build beside the client build', () => {
    expect(serverDirectoryOf(join('site', 'dist', 'client'))).toBe(join('site', 'dist', 'server'))
  })
})

describe('collectServerIslands', () => {
  it('reads every island name the manifest declares, including de-duplicated ones', async () => {
    const islands = await collectServerIslands(
      await serverBuildWithManifest(
        manifest(
          'new Map([["RecentPosts", () => import("../chunks/RecentPosts_a1.mjs")], ' +
            '["RecentPosts1", () => import("../chunks/RecentPosts_b2.mjs")]])',
          'new Map([["/src/components/RecentPosts.astro", "RecentPosts"], ' +
            '["/src/components/blog/RecentPosts.astro", "RecentPosts1"]])'
        )
      )
    )

    expect(islands).toEqual(new Set(['RecentPosts', 'RecentPosts1']))
  })

  it('reads a manifest with no islands as an empty set', async () => {
    expect(await collectServerIslands(await serverBuildWithManifest(manifest('new Map([])')))).toEqual(new Set())
  })

  it('cannot read a build with no server directory or no manifest chunk', async () => {
    const serverDirectory = join(await mkdtemp(join(tmpdir(), 'site-checks-')), 'dist', 'server')

    expect(await collectServerIslands(serverDirectory)).toBeUndefined()

    await mkdir(join(serverDirectory, 'chunks'), { recursive: true })
    await writeFile(join(serverDirectory, 'entry.mjs'), 'export default {}')

    expect(await collectServerIslands(serverDirectory)).toBeUndefined()
  })

  it('cannot read a manifest whose island map is in a shape it does not recognise', async () => {
    const islands = await collectServerIslands(
      await serverBuildWithManifest(manifest('new Map([["RecentPosts", __island_RecentPosts]])'))
    )

    expect(islands).toBeUndefined()
    expect(await collectServerIslands(await serverBuildWithManifest('export const islands = {}'))).toBeUndefined()
  })
})
