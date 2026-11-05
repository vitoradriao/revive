/**
 * Matriz de mudanças de configuração no Android (#50): funções puras.
 *
 * Interpretam a saída do adb (wm, settings, logcat) e montam a matriz de cenários.
 * Não dependem de aparelho e são cobertas por lib.test.mjs (node --test).
 * Nada aqui guarda texto de tela, registros, contas ou identificadores do aparelho.
 */

/** Cenários da issue: mudanças isoladas, combinadas e em sequência, com e sem reabertura. */
export function buildScenarios({ fontScales = ['1.3', '1.5'], density, size } = {}) {
  const scenarios = fontScales.map((value) => ({ id: `fonte-${value}`, grupo: 'isolado', passos: [{ font: value }] }));
  if (density) scenarios.push({ id: `densidade-${density}`, grupo: 'isolado', passos: [{ density }] });
  if (size) scenarios.push({ id: `resolucao-${size}`, grupo: 'isolado', passos: [{ size }] });
  const max = fontScales.at(-1);
  if (density && size) {
    scenarios.push({ id: 'combinado-simultaneo', grupo: 'combinado', passos: [{ size, density, font: max }] });
    scenarios.push({ id: 'sequencia-sem-reabrir', grupo: 'sequencia', passos: [{ size }, { density }, { font: max }] });
    scenarios.push({ id: 'sequencia-com-reabertura', grupo: 'sequencia', passos: [{ size }, { density }, { font: max }], reabrirEntrePassos: true });
  }
  return scenarios;
}

/** `adb shell wm size` → { physical: '1080x2400', override: '720x1280' | null } */
export function parseWmSize(output) {
  const physical = /Physical size:\s*(\d+x\d+)/.exec(output)?.[1] ?? null;
  const override = /Override size:\s*(\d+x\d+)/.exec(output)?.[1] ?? null;
  return { physical, override };
}

/** `adb shell wm density` → { physical: '400', override: '320' | null } */
export function parseWmDensity(output) {
  const physical = /Physical density:\s*(\d+)/.exec(output)?.[1] ?? null;
  const override = /Override density:\s*(\d+)/.exec(output)?.[1] ?? null;
  return { physical, override };
}

/** `adb shell settings get system font_scale` → '1.0' (null quando ausente). */
export function parseFontScale(output) {
  const value = String(output).trim();
  return /^\d+(\.\d+)?$/.test(value) ? value : null;
}

/** `adb shell pidof <pacote>` → número ou null. */
export function parsePid(output) {
  const value = String(output).trim().split(/\s+/)[0];
  return /^\d+$/.test(value) ? Number(value) : null;
}

/**
 * Conta recriações da activity do pacote no buffer `events` do logcat
 * (wm_relaunch_resume_activity / wm_relaunch_activity; am_* em versões antigas).
 */
export function countRelaunches(eventsLog, pkg) {
  const pattern = /\b(?:wm|am)_relaunch(?:_resume)?_activity\b/;
  return String(eventsLog).split('\n').filter((line) => pattern.test(line) && line.includes(pkg)).length;
}

/** Conta criações de activity (am/wm_create_activity) do pacote: identifica recriação por reinício. */
export function countCreates(eventsLog, pkg) {
  const pattern = /\b(?:wm|am)_create_activity\b/;
  return String(eventsLog).split('\n').filter((line) => pattern.test(line) && line.includes(pkg)).length;
}

const FRAME = /#(\d{2,3})\s+pc\s+[0-9a-f]+\s+(\S+)(.*)$/i;

/**
 * Normaliza um frame nativo: mantém posição, biblioteca (basename) e símbolo sem offset.
 * Remove endereços, BuildId e caminhos do aparelho.
 */
export function sanitizeFrame(line) {
  const match = FRAME.exec(line);
  if (!match) return null;
  const library = match[2].split('/').pop();
  const rest = match[3].replace(/\s*\(BuildId:[^)]*\)\s*$/, '').trim();
  const symbol = /^\((.*)\)$/.exec(rest)?.[1].replace(/\+\d+$/, '').trim() || '';
  return `#${match[1]} ${library}${symbol ? ` (${symbol})` : ''}`;
}

/**
 * Lê o buffer `crash` do logcat e devolve uma assinatura sanitizada.
 * Mensagens de exceção e "Abort message" são descartadas: podem conter dados da tela.
 */
export function parseCrash(crashLog, pkg, maxFrames = 8) {
  const lines = String(crashLog).split('\n');
  const nativeStart = lines.findIndex((line) => /Fatal signal \d+ \((SIG\w+)\)/.test(line) && (!pkg || line.includes(pkg)));
  if (nativeStart >= 0) {
    const signal = /Fatal signal \d+ \((SIG\w+)\)/.exec(lines[nativeStart])[1];
    const frames = lines.slice(nativeStart).map(sanitizeFrame).filter(Boolean).slice(0, maxFrames);
    return { crashed: true, tipo: 'nativo', sinal: signal, frames };
  }
  const javaStart = lines.findIndex((line) => /FATAL EXCEPTION/.test(line));
  if (javaStart >= 0 && (!pkg || lines.slice(javaStart, javaStart + 4).some((line) => line.includes(pkg)))) {
    const exception = lines.slice(javaStart, javaStart + 6).map((line) => /\b((?:[a-z]\w*\.)+[A-Z]\w*(?:Exception|Error))\b/.exec(line)?.[1]).find(Boolean) || 'desconhecida';
    const frames = lines.slice(javaStart).map((line) => /\bat\s+([\w.$]+)\(/.exec(line)?.[1]).filter(Boolean).slice(0, maxFrames).map((frame, index) => `#${String(index).padStart(2, '0')} ${frame}`);
    return { crashed: true, tipo: 'java', sinal: exception, frames };
  }
  return { crashed: false, tipo: null, sinal: null, frames: [] };
}

/** Assinatura curta para agrupar crashes iguais na frequência. */
export const crashSignature = (crash) => (crash?.crashed ? `${crash.sinal} @ ${crash.frames[0] || 'sem frame'}` : null);

/** Agrupa as repetições por cenário: frequência de crash, morte de processo e recriação. */
export function summarize(results) {
  const byScenario = new Map();
  for (const result of results) {
    const row = byScenario.get(result.cenario) || { cenario: result.cenario, grupo: result.grupo, repeticoes: 0, crashes: 0,
      processoReiniciado: 0, activityRecriada: 0, assinaturas: new Map() };
    row.repeticoes += 1;
    if (result.crash?.crashed) {
      row.crashes += 1;
      const signature = crashSignature(result.crash);
      row.assinaturas.set(signature, (row.assinaturas.get(signature) || 0) + 1);
    }
    if (result.processoReiniciado) row.processoReiniciado += 1;
    if (result.recriacoes > 0) row.activityRecriada += 1;
    byScenario.set(result.cenario, row);
  }
  return [...byScenario.values()].map((row) => ({ ...row, assinaturas: Object.fromEntries(row.assinaturas) }));
}

/** Tabela Markdown para colar na #7/#50. */
export function toMarkdown(summary, meta) {
  const header = [
    `Build: ${meta.build} · Android ${meta.android} · pacote ${meta.pacote} · ${meta.data}`,
    `Base: fonte ${meta.base.font} · densidade ${meta.base.density} · resolução ${meta.base.size}`,
    '',
    '| Cenário | Grupo | Repetições | Activity recriada | Processo reiniciado | Crashes | Assinaturas |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  const rows = summary.map((row) => `| ${row.cenario} | ${row.grupo} | ${row.repeticoes} | ${row.activityRecriada}/${row.repeticoes} | ${row.processoReiniciado}/${row.repeticoes} | ${row.crashes}/${row.repeticoes} | ${Object.entries(row.assinaturas).map(([key, count]) => `${count}× ${key}`).join('<br>') || '—'} |`);
  return [...header, ...rows].join('\n');
}
