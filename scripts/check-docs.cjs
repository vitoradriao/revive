const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
// Use os caminhos versionados para detectar links que so funcionam nesta maquina
// e diferencas de maiusculas/minusculas que falhariam no GitHub/Linux.
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean);
const files = new Set(tracked);
const errors = [];
let checked = 0;

for (const file of tracked.filter(name => name.endsWith('.md'))) {
    const contents = readFileSync(path.join(root, file), 'utf8')
        .replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '')
        .replace(/`[^`\n]+`/g, '');
    const targets = [
        ...Array.from(contents.matchAll(/\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g), match => match[1]),
        ...Array.from(contents.matchAll(/(?:src|href)="([^"]+)"/g), match => match[1]),
    ];
    for (const raw of targets) {
        const target = raw.replace(/^<|>$/g, '');
        if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
        let decoded;
        try {
            decoded = decodeURIComponent(target.split(/[?#]/)[0]);
        } catch {
            errors.push(`${file}: URL invalida: ${target}`);
            continue;
        }
        if (!decoded) continue;
        const resolved = path.posix.normalize(decoded.startsWith('/')
            ? decoded.slice(1)
            : path.posix.join(path.posix.dirname(file), decoded));
        const directory = resolved.replace(/\/$/, '') + '/';
        checked += 1;
        if (!files.has(resolved) && !tracked.some(name => name.startsWith(directory))) {
            errors.push(`${file}: destino nao versionado ou inexistente: ${target}`);
        }
    }
}

if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
} else {
    console.log(`${checked} links locais verificados em arquivos Markdown versionados.`);
}
