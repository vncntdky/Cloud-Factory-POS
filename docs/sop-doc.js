// The SOP doc ("Cloud Factory POS — Standard Operating Procedures") is built from lib/help.ts, the text the
// app shows under Help & SOPs, so the two always say the same. This prints that text as markdown sections.
//
//   node docs/sop-doc.js            all sections, one after another (to read or paste)
//   node docs/sop-doc.js out.json   { order, sections: { rules, who, sop1…, pictures, screens, words, problems }, pics }
//
// Each section is one block of the doc: the SOPs tab holds rules, who and every SOP; the App handbook tab
// holds pictures (the images are public/help/*.webp), screens, words and problems.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "lib/help.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { module: mod, exports: mod.exports, require: () => ({}) });
const H = mod.exports;

const forWho = (roles) => (roles.length === 3 ? "Everyone" : roles.length === 1 ? "Owner" : "Owner & manager");
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const steps = (list) =>
  list
    .map((s, i) => (typeof s === "string" ? `${i + 1}. ${s}` : `${i + 1}. ${s.text}\n${s.sub.map((x) => `    - ${x}`).join("\n")}`))
    .join("\n");

const sections = {};
sections.rules = `## Golden rules\n\n${H.GOLDEN_RULES.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
sections.who =
  "## Who does what\n\nStaff is the cashier role in the app.\n\n| Task | Owner | Manager | Staff |\n| --- | --- | --- | --- |\n" +
  H.WHO_DOES_WHAT.map((r) => `| ${cell(r.task)} | ${r.owner ? "Yes" : "–"} | ${r.manager ? "Yes" : "–"} | ${r.staff ? "Yes" : "–"} |`).join("\n");
for (const s of H.SOPS) {
  let md = `## SOP ${s.no}: ${s.title}\n\n**For:** ${forWho(s.roles)}. **Who:** ${s.who} **When:** ${s.when}`;
  for (const p of s.parts) md += `\n\n${p.title ? `### ${p.title}\n\n` : ""}${steps(p.steps)}`;
  for (const n of s.notes ?? []) md += `\n\n**${n.label}:** ${n.text}`;
  md += `\n\n**Check:** ${s.check}`;
  sections[`sop${s.no}`] = md;
}
sections.pictures =
  "## The app in pictures\n\nSample products shown. The red numbers match the steps.\n\n" +
  H.PICTURES.map((p) => `### ${p.title}\n\n**For:** ${p.managers ? "Owner & manager" : "Everyone"}. Full steps: SOP ${p.sop}.\n\n${steps(p.steps)}`).join("\n\n");
sections.screens =
  "## The screens\n\n| Screen | Who | What it's for |\n| --- | --- | --- |\n" +
  H.SCREENS.map((s) => `| ${cell(s.screen)} | ${cell(s.who)} | ${cell(s.what)} |`).join("\n");
sections.words =
  "## Words the app uses\n\n| Word | What it means | For |\n| --- | --- | --- |\n" +
  H.WORDS.map((w) => `| ${cell(w.word)} | ${cell(w.meaning)} | ${w.managers ? "Owner & manager" : "Everyone"} |`).join("\n");
sections.problems =
  "## When something looks wrong\n\n| You see | Do this | For |\n| --- | --- | --- |\n" +
  H.PROBLEMS.map((p) => `| ${cell(p.see)} | ${cell(p.doThis)} | ${p.managers ? "Owner & manager" : "Everyone"} |`).join("\n") +
  "\n\nAnything not covered here: write down what you tapped and what the screen said, and tell the owner the same day.";

const out = process.argv[2];
if (out) {
  const pics = H.PICTURES.map((p) => ({ id: p.id, title: p.title, img: p.img, alt: p.alt }));
  fs.writeFileSync(out, JSON.stringify({ order: Object.keys(sections), sections, pics }, null, 1));
  console.log(`${Object.keys(sections).length} sections, ${H.SOPS.length} SOPs, ${H.PICTURES.length} pictures → ${out}`);
} else {
  console.log(Object.values(sections).join("\n\n"));
}
