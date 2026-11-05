const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
// Inclui arquivos novos não ignorados para validar a entrega antes do commit,
// preservando a verificação de diferenças de maiúsculas/minúsculas no Linux.
async function checkDocs() {
    const { stdout } = await promisify(execFile)('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
    const tracked = stdout.split('\0').filter(Boolean);
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
        console.log(`${checked} links locais verificados em arquivos Markdown do repositório.`);
    }
}

checkDocs().catch(() => {
    console.error('Não foi possível listar os arquivos para verificar a documentação.');
    process.exitCode = 1;
});
