import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"


function findEntry(source, key) {
  const match = new RegExp(`<key>${key}</key>`).exec(source)
  if (!match) return null

  const valueStart = match.index + match[0].length + (source.slice(match.index + match[0].length).match(/^\s*/) ?? [""])[0].length
  const opening = source.slice(valueStart).match(/^<([\w-]+)\b[^>]*>/)
  if (!opening) throw new Error(`Invalid Info.plist value for ${key}`)

  const tag = opening[1]
  if (opening[0].endsWith("/>")) return { start: match.index, valueStart, end: valueStart + opening[0].length }

  const tags = new RegExp(`</?${tag}\\b[^>]*>`, "g")
  tags.lastIndex = valueStart
  let depth = 0
  for (let token; (token = tags.exec(source)); ) {
    depth += token[0].startsWith("</") ? -1 : token[0].endsWith("/>") ? 0 : 1
    if (depth === 0) return { start: match.index, valueStart, end: tags.lastIndex }
  }
  throw new Error(`Invalid Info.plist value for ${key}`)
}

function removeEntries(source, key) {
  for (let entry; (entry = findEntry(source, key)); ) source = source.slice(0, entry.start) + source.slice(entry.end)
  return source
}

export function updateInfoPlist(plist) {
  const atsEntry = findEntry(plist, "NSAppTransportSecurity")
  let ats = atsEntry && plist.startsWith("<dict>", atsEntry.valueStart)
    ? plist.slice(atsEntry.valueStart, atsEntry.end)
    : "<dict>\n\t</dict>"

  const atsCloseIndent = ats.slice(ats.lastIndexOf("\n", ats.lastIndexOf("</dict>")) + 1, ats.lastIndexOf("</dict>"))
  if (/^\s*$/.test(atsCloseIndent)) {
    ats = ats.split("\n").map((line, index) => index > 0 && line.startsWith(atsCloseIndent) ? line.slice(atsCloseIndent.length) : line).join("\n")
  }

  ats = removeEntries(removeEntries(ats, "NSAllowsArbitraryLoads"), "NSAllowsLocalNetworking")
  const atsClose = ats.lastIndexOf("</dict>")
  ats = `${ats.slice(0, atsClose).trimEnd()}\n\t<key>NSAllowsLocalNetworking</key>\n\t<true/>\n${ats.slice(atsClose)}`

  plist = removeEntries(removeEntries(plist, "NSAppTransportSecurity"), "NSLocalNetworkUsageDescription")
  const rootClose = plist.lastIndexOf("</dict>")
  const metadata = [
    "\t<key>NSLocalNetworkUsageDescription</key>",
    "\t<string>Connect to your Harness Remote bridge on your local network.</string>",
    "\t<key>NSAppTransportSecurity</key>",
    ...ats.split("\n").map((line) => `\t${line}`),
    ""
  ].join("\n")

  return `${plist.slice(0, rootClose).trimEnd()}\n${metadata}${plist.slice(rootClose)}`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ios = resolve(import.meta.dirname, "../ios")
  if (!existsSync(ios)) throw new Error("iOS project not found; run npx cap add ios first")

  await import("./sync-native-secure-storage.mjs")

  const plistPath = resolve(ios, "App/App/Info.plist")
  writeFileSync(plistPath, updateInfoPlist(readFileSync(plistPath, "utf8")))
  console.log("Synced iOS native sources and Info.plist")
}
