import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs", "cosgral", "ui-w1");
mkdirSync(outDir, { recursive: true });
mkdirSync(join(root, "docs", "cosgral-raporty"), { recursive: true });

function shell({ dark }) {
  const bg = dark ? "#0b0c10" : "#f4f6fa";
  const rail = dark ? "#12141a" : "#e8ecf4";
  const side = dark ? "#101218" : "#eef1f7";
  const panel = dark ? "#161922" : "#ffffff";
  const text = dark ? "#f2f4f8" : "#12141a";
  const muted = dark ? "#8b93a7" : "#6b7385";
  const stroke = dark ? "#3a4050" : "#d5dbe8";
  const needsBg = dark ? "#2a1d12" : "#fff8eb";
  const needsTx = dark ? "#e3b866" : "#9a6b12";
  const stickyBg = dark ? "#1a2233" : "#e8f0ff";
  const main = dark ? "#0b0c10" : "#f4f6fa";
  const accent = "#2f6fed";
  const theme = dark ? "dark" : "light";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900">
  <title>COSGRAL W1 shell - ${theme}</title>
  <rect width="1440" height="900" fill="${bg}"/>
  <rect x="0" y="0" width="56" height="900" fill="${rail}"/>
  <rect x="10" y="16" width="36" height="36" rx="10" fill="${accent}"/>
  <text x="28" y="40" text-anchor="middle" fill="#f4f8ff" font-family="Segoe UI, sans-serif" font-size="16" font-weight="700">C</text>
  <circle cx="28" cy="72" r="14" fill="${panel}" stroke="${stroke}"/>
  <circle cx="28" cy="108" r="14" fill="${panel}" stroke="${stroke}"/>
  <rect x="16" y="840" width="24" height="24" rx="6" fill="${panel}" stroke="${stroke}"/>
  <rect x="56" y="0" width="280" height="900" fill="${side}"/>
  <text x="76" y="36" fill="${text}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="600">COSGRAL Workspace</text>
  <rect x="72" y="52" width="248" height="28" rx="8" fill="${panel}" stroke="${stroke}"/>
  <text x="84" y="70" fill="${muted}" font-family="Segoe UI, sans-serif" font-size="12">Szukaj...</text>
  <rect x="72" y="96" width="248" height="54" rx="10" fill="${needsBg}" stroke="#e3b866"/>
  <text x="88" y="118" fill="${needsTx}" font-family="Segoe UI, sans-serif" font-size="11" font-weight="700">Needs you - 2</text>
  <text x="88" y="136" fill="${needsTx}" font-family="Segoe UI, sans-serif" font-size="11">Research - limity - decyzja w czacie</text>
  <text x="76" y="176" fill="${muted}" font-family="Segoe UI, sans-serif" font-size="11" font-weight="600">AGENTY</text>
  <rect x="72" y="188" width="248" height="44" rx="8" fill="${panel}" stroke="${stroke}"/>
  <circle cx="92" cy="210" r="8" fill="#61c985"/>
  <text x="110" y="206" fill="${text}" font-family="Segoe UI, sans-serif" font-size="12">Lider</text>
  <text x="110" y="222" fill="${muted}" font-family="Segoe UI, sans-serif" font-size="10">mysli...</text>
  <rect x="72" y="240" width="248" height="44" rx="8" fill="${needsBg}" stroke="#e3b866"/>
  <circle cx="92" cy="262" r="8" fill="#e3b866"/>
  <text x="110" y="258" fill="${text}" font-family="Segoe UI, sans-serif" font-size="12">Research</text>
  <text x="110" y="274" fill="${needsTx}" font-family="Segoe UI, sans-serif" font-size="10">czeka na Ciebie</text>
  <rect x="72" y="292" width="248" height="44" rx="8" fill="${panel}" stroke="${stroke}"/>
  <circle cx="92" cy="314" r="8" fill="#74b9ff"/>
  <text x="110" y="310" fill="${text}" font-family="Segoe UI, sans-serif" font-size="12">Writer</text>
  <text x="110" y="326" fill="${muted}" font-family="Segoe UI, sans-serif" font-size="10">limit - wznowi o 15:40</text>
  <rect x="72" y="344" width="248" height="44" rx="8" fill="${panel}" stroke="${stroke}"/>
  <circle cx="92" cy="366" r="8" fill="#e47d75"/>
  <text x="110" y="362" fill="${text}" font-family="Segoe UI, sans-serif" font-size="12">Browser</text>
  <text x="110" y="378" fill="#e47d75" font-family="Segoe UI, sans-serif" font-size="10">blad - otworz log</text>
  <text x="76" y="420" fill="${muted}" font-family="Segoe UI, sans-serif" font-size="11" font-weight="600">KANALY</text>
  <rect x="72" y="432" width="248" height="40" rx="8" fill="${stickyBg}" stroke="${accent}"/>
  <text x="88" y="456" fill="${text}" font-family="Segoe UI, sans-serif" font-size="12"># projekt-cosgral</text>
  <rect x="336" y="0" width="860" height="900" fill="${main}"/>
  <rect x="356" y="16" width="200" height="32" rx="8" fill="${panel}" stroke="${stroke}"/>
  <rect x="360" y="20" width="92" height="24" rx="6" fill="${accent}"/>
  <text x="406" y="36" text-anchor="middle" fill="#ffffff" font-family="Segoe UI, sans-serif" font-size="12" font-weight="600">Chat</text>
  <text x="502" y="36" text-anchor="middle" fill="${muted}" font-family="Segoe UI, sans-serif" font-size="12">Zadania</text>
  <text x="580" y="36" fill="${muted}" font-family="Segoe UI, sans-serif" font-size="12"># projekt-cosgral - Lider + 3</text>
  <rect x="356" y="64" width="820" height="64" rx="12" fill="${panel}" stroke="${stroke}"/>
  <text x="376" y="90" fill="${text}" font-family="Segoe UI, sans-serif" font-size="13">Lider: makiety W1 ${theme} - Needs you + sticky Decyzja.</text>
  <text x="376" y="110" fill="${muted}" font-family="Segoe UI, sans-serif" font-size="11">12:04</text>
  <rect x="356" y="144" width="420" height="120" rx="14" fill="${panel}" stroke="${stroke}"/>
  <text x="376" y="172" fill="${accent}" font-family="Segoe UI, sans-serif" font-size="11" font-weight="700">Pytanie</text>
  <text x="376" y="196" fill="${text}" font-family="Segoe UI, sans-serif" font-size="13">Ktory wariant A+B+C wchodzi do W1?</text>
  <rect x="376" y="214" width="88" height="28" rx="8" fill="${accent}"/>
  <text x="420" y="232" text-anchor="middle" fill="#ffffff" font-family="Segoe UI, sans-serif" font-size="12">Lepszy</text>
  <rect x="472" y="214" width="88" height="28" rx="8" fill="${panel}" stroke="${stroke}"/>
  <text x="516" y="232" text-anchor="middle" fill="${text}" font-family="Segoe UI, sans-serif" font-size="12">Pozniej</text>
  <rect x="356" y="280" width="420" height="100" rx="14" fill="${panel}" stroke="${stroke}"/>
  <text x="376" y="308" fill="${needsTx}" font-family="Segoe UI, sans-serif" font-size="11" font-weight="700">Zatwierdzenie</text>
  <text x="376" y="332" fill="${text}" font-family="Segoe UI, sans-serif" font-size="13">Uruchomic skrypt w ~/COSGRAL Workspace?</text>
  <rect x="376" y="348" width="72" height="24" rx="6" fill="#61c985"/>
  <text x="412" y="364" text-anchor="middle" fill="#07131f" font-family="Segoe UI, sans-serif" font-size="11" font-weight="600">Tak</text>
  <rect x="456" y="348" width="72" height="24" rx="6" fill="${panel}" stroke="${stroke}"/>
  <text x="492" y="364" text-anchor="middle" fill="${text}" font-family="Segoe UI, sans-serif" font-size="11">Nie</text>
  <rect x="790" y="144" width="386" height="160" rx="14" fill="${panel}" stroke="${stroke}"/>
  <text x="810" y="172" fill="#d98ac9" font-family="Segoe UI, sans-serif" font-size="11" font-weight="700">Podglad szkicu</text>
  <rect x="810" y="186" width="346" height="96" rx="8" fill="${bg}" stroke="${stroke}"/>
  <text x="830" y="230" fill="${muted}" font-family="Segoe UI, sans-serif" font-size="12">Draft wiadomosci do kanalu...</text>
  <rect x="790" y="320" width="386" height="100" rx="14" fill="${panel}" stroke="#74b9ff"/>
  <text x="810" y="348" fill="#74b9ff" font-family="Segoe UI, sans-serif" font-size="11" font-weight="700">Przejecie przegladarki</text>
  <text x="810" y="372" fill="${text}" font-family="Segoe UI, sans-serif" font-size="12">Agent prosi o Twoje klikniecie na checkout.</text>
  <rect x="810" y="388" width="110" height="24" rx="6" fill="${accent}"/>
  <text x="865" y="404" text-anchor="middle" fill="#ffffff" font-family="Segoe UI, sans-serif" font-size="11">Przejmij</text>
  <rect x="356" y="780" width="820" height="52" rx="12" fill="${stickyBg}" stroke="${accent}"/>
  <text x="376" y="802" fill="${accent}" font-family="Segoe UI, sans-serif" font-size="11" font-weight="700">Decyzja - przypieta</text>
  <text x="376" y="820" fill="${text}" font-family="Segoe UI, sans-serif" font-size="12">Akceptuj A+B+C jako Lepszy - wchodzi do planu W1.</text>
  <rect x="356" y="844" width="820" height="40" rx="12" fill="${panel}" stroke="${stroke}"/>
  <text x="376" y="868" fill="${muted}" font-family="Segoe UI, sans-serif" font-size="12">Napisz wiadomosc...</text>
  <rect x="1196" y="0" width="244" height="900" fill="${side}"/>
  <text x="1216" y="36" fill="${text}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="600">Panel</text>
  <text x="1216" y="64" fill="${muted}" font-family="Segoe UI, sans-serif" font-size="11">Pliki / Kontekst / Limity</text>
  <rect x="1216" y="84" width="204" height="72" rx="10" fill="${panel}" stroke="${stroke}"/>
  <text x="1232" y="112" fill="${text}" font-family="Segoe UI, sans-serif" font-size="12">ui-w1.md</text>
  <text x="1232" y="132" fill="${muted}" font-family="Segoe UI, sans-serif" font-size="11">makiety fali 1</text>
  <rect x="1216" y="172" width="204" height="72" rx="10" fill="${panel}" stroke="${stroke}"/>
  <text x="1232" y="200" fill="${text}" font-family="Segoe UI, sans-serif" font-size="12">Visual twin</text>
  <text x="1232" y="220" fill="${muted}" font-family="Segoe UI, sans-serif" font-size="11">baza 0.1.11 + Lepszy</text>
</svg>
`;
}

for (const dark of [true, false]) {
  const name = dark ? "shell-dark" : "shell-light";
  const svg = shell({ dark });
  writeFileSync(join(outDir, `${name}.svg`), svg, "utf8");
  const png = Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: 1440 } }).render().asPng());
  writeFileSync(join(outDir, `${name}.png`), png);
  console.log(name, png.length);
}

copyFileSync(
  join(root, "src/renderer/src/assets/cosgral-logo-production.png"),
  join(root, "docs/cosgral-raporty/ui-b3-brand-proof.png"),
);
copyFileSync(join(outDir, "shell-dark.png"), join(root, "docs/cosgral-raporty/ui-b3-w1-dark.png"));
console.log("done");
