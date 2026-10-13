// This fork's build: upstream's files stay byte-identical to unrstuart/tacops (so syncing never
// conflicts) and this deployment's customizations are applied to the checkout right before building.
// Each patch must match exactly once - if upstream moves the code, the build fails loudly instead of
// silently shipping upstream's defaults. Fix the pattern here, never by editing upstream's files.
//
//   node fork/build.mjs          patch + `npm run build` + copy board assets into dist/
//   node fork/build.mjs --check  patch only (used by the sync workflow before testing)
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const DATABASE_ID = "b4e3ef6f-68c4-4622-b12b-93c90dc4c196";

const PATCHES = [
  {
    file: "wrangler.toml",
    what: "own D1 database for the DB binding",
    pattern: /(\[\[d1_databases\]\][^[]*?binding\s*=\s*"DB"[^[]*?database_id\s*=\s*")[^"]*(")/,
    replace: `$1${DATABASE_ID}$2`,
  },
  {
    file: "src/App.tsx",
    what: 'full app shown by default (no "8" needed)',
    pattern: /(const \[devModeEnabled, setDevModeEnabled\] = useState\()false(\))/,
    replace: "$1true$2",
  },
  {
    file: "src/components/EnvironmentToggle.tsx",
    what: "QA environment not offered in the UI",
    pattern: /\r?\n[ \t]*\{ value: "qa", label: "QA" \},/,
    replace: "",
  },
];

let failed = false;
for (const { file, what, pattern, replace } of PATCHES) {
  const source = readFileSync(file, "utf8");
  const count = source.match(new RegExp(pattern.source, "g"))?.length ?? 0;
  if (count !== 1) {
    console.error(`fork patch FAILED (${count} matches, expected 1): ${file} - ${what}`);
    failed = true;
    continue;
  }
  writeFileSync(file, source.replace(pattern, replace));
  console.log(`fork patch applied: ${file} - ${what}`);
}
if (failed) process.exit(1);

if (!process.argv.includes("--check")) {
  execSync("npm run build", { stdio: "inherit" });
  // See AGENTS.md's "Deploying the Worker" - board assets are kept out of dist/ by the build itself.
  cpSync("board-assets/boards", "dist/boards", { recursive: true });
  cpSync("board-assets/spawn-points.json", "dist/spawn-points.json");
  console.log("copied board-assets into dist/");
}
