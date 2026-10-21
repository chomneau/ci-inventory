// Copies the GitHub owner/repo from package.json ("ciInventory.github") into electron-builder.yml,
// so the release feed and the in-app "Download" link always point at the same repository.
import { readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const { owner, repo } = pkg.ciInventory.github
if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo) || owner === 'OWNER') {
  console.error('Set ciInventory.github.owner/repo in package.json first.')
  process.exit(1)
}
const yml = readFileSync('electron-builder.yml', 'utf8')
  .replace(/^(\s+owner:).*$/m, `$1 ${owner}`)
  .replace(/^(\s+repo:).*$/m, `$1 ${repo}`)
writeFileSync('electron-builder.yml', yml)
console.log(`Release feed: github.com/${owner}/${repo}`)
