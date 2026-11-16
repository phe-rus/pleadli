import { expect, test } from 'bun:test'
import { previousFeed } from './previous-feed'
const mock = (responses: Response[]) => (async () => { const next = responses.shift(); if (!next) throw new Error('Unexpected request'); return next }) as typeof fetch
const json = (value: unknown, status = 200) => Response.json(value, { status })
test('Courts bootstrap requires an explicit flag, first version, empty public history and an actual 404', async () => {
  expect(await previousFeed('courts', '0.1.0', true, mock([json({},404), json([])]))).toEqual({ firstRelease: true, version: '0.1.0' })
  for (const [app, version, flag, status] of [['courts','0.1.0',false,404],['courts','0.1.1',true,404],['police','0.1.0',true,404],['courts','0.1.0',true,500],['courts','0.1.0',true,403]] as const) {
    await expect(previousFeed(app, version, flag, mock([json({},status)]))).rejects.toThrow('Previous')
  }
  await expect(previousFeed('courts','0.1.0',true,mock([json({},404),json([{tag_name:'courts-v0.1.0',draft:false}])]))).rejects.toThrow('history')
})
test('normal release validates its exact feed asset and refuses replacement or missing assets', async () => {
  const release = { draft: false, assets: [{name:'latest.json', browser_download_url:'https://github.com/phe-rus/pleadli-releases/releases/download/police-latest/latest.json'}] }
  expect(await previousFeed('police','0.1.3',false,mock([json(release),json({version:'0.1.2'})]))).toEqual({version:'0.1.2'})
  await expect(previousFeed('police','0.1.2',false,mock([json(release),json({version:'0.1.2'})]))).rejects.toThrow('newer')
  await expect(previousFeed('police','0.1.3',false,mock([json({assets:[]})]))).rejects.toThrow('asset')
})
