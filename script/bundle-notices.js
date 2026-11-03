const fs = require("node:fs");
const path = require("node:path");

function updateBundleNotices(root, output, metafile, extraPackages = [], noticeReferences = {}) {
  const noticePath = path.join(root, "THIRD_PARTY_NOTICES");
  const current = fs.existsSync(noticePath) ? fs.readFileSync(noticePath, "utf8") : "";
  const packageRoots = new Set(extraPackages.map((name) => path.join(root, "node_modules", name)));
  for (const input of Object.keys(metafile.inputs)) {
    if (!input.replaceAll("\\", "/").includes("node_modules/")) continue;
    let directory = path.dirname(path.resolve(root, input));
    while (directory !== root && !fs.existsSync(path.join(directory, "package.json"))) {
      const parent = path.dirname(directory);
      if (parent === directory) throw new Error(`Cannot locate the package for ${input}`);
      directory = parent;
    }
    if (directory !== root) packageRoots.add(directory);
  }

  const sections = [];
  for (const directory of packageRoots) {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    const notices = fs
      .readdirSync(directory, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() && /^(licen[cs]e|notice|copying|copyright)(\.|$)/i.test(entry.name),
      )
      .map((entry) => entry.name)
      .sort();
    const reference = noticeReferences[manifest.name];
    if (
      notices.length === 0 &&
      (!reference || !current.includes(`----- BEGIN THIRD-PARTY LICENSE: ${reference} -----`))
    ) {
      throw new Error(`Missing bundled license for ${manifest.name}`);
    }
    const repository = manifest.repository?.url || manifest.repository;
    const source = typeof repository === "string" ? repository.replace(/^git\+/, "") : null;
    sections.push({
      id: `${manifest.name}@${manifest.version}`,
      text: [
        `Component: ${manifest.name}`,
        `Revision: ${manifest.version}`,
        `Source: https://www.npmjs.com/package/${manifest.name}/v/${manifest.version}`,
        ...(source ? [`Repository: ${source}`] : []),
        ...(notices.length === 0 ? [`License: See the ${reference} section in this file.`] : []),
        ...notices.flatMap((name) => [
          "",
          `Original file: ${name}`,
          "",
          fs.readFileSync(path.join(directory, name), "utf8").trim(),
        ]),
      ].join("\n"),
    });
  }
  sections.sort((left, right) => left.id.localeCompare(right.id, "en"));
  const start = `----- BEGIN BUNDLED LICENSES: ${output} -----`;
  const end = `----- END BUNDLED LICENSES: ${output} -----`;
  const generated = `${start}\nAffected component: ${output}\n\n${sections.map(({ text }) => text).join("\n\n---\n\n")}\n${end}`;
  const startAt = current.indexOf(start);
  const endAt = current.indexOf(end);
  if (startAt < 0 !== endAt < 0) throw new Error(`Incomplete bundled notices for ${output}`);
  const updated =
    startAt < 0
      ? `${current.trimEnd()}\n\n${generated}\n`
      : current.slice(0, startAt) + generated + current.slice(endAt + end.length);
  fs.writeFileSync(noticePath, updated);
}

module.exports = { updateBundleNotices };
