#!/usr/bin/env node
/**
 * Matriz de mudanças de configuração no Android (#50).
 *
 * Executa, por adb, mudanças de fonte, densidade e resolução isoladas, combinadas e em
 * sequência sobre o app aberto, com repetições, e registra por repetição:
 * recriação da activity, reinício do processo e crash (assinatura sanitizada).
 * Ao final, SEMPRE restaura a configuração original do aparelho.
 *
 * Uso (na pasta revive-mobile, com um único aparelho autorizado no adb):
 *   node scripts/android-config-matrix/run.mjs --package com.reviveapp.revive --build release \
 *     --density 320 --size 720x1280 --reps 3 [--route sync] [--settle 4] [--out output/config-matrix]
 *
 * Não captura telas, textos, contas nem identificadores do aparelho. Use contas sintéticas.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildScenarios, countCreates, countRelaunches, parseCrash, parseFontScale, parsePid, parseWmDensity, parseWmSize, summarize, toMarkdown,
} from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, list) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), list[index + 1]?.startsWith('--') ? 'true' : list[index + 1] ?? 'true']);
  return pairs;
}, []));
const pkg = args.package || 'com.reviveapp.revive';
const reps = Number(args.reps || 3);
const settleMs = Number(args.settle || 4) * 1000;
const out = args.out || join('output', 'config-matrix');
const route = args.route || 'sync';
const scheme = args.scheme || 'revive';

const adb = (...command) => execFileSync('adb', command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const shell = (...command) => adb('shell', ...command);
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const readBase = () => ({
  font: parseFontScale(shell('settings', 'get', 'system', 'font_scale')) || '1.0',
  density: parseWmDensity(shell('wm', 'density')),
  size: parseWmSize(shell('wm', 'size')),
});

const restore = (base) => {
  shell('settings', 'put', 'system', 'font_scale', base.font);
  if (base.density.override) shell('wm', 'density', base.density.override); else shell('wm', 'density', 'reset');
  if (base.size.override) shell('wm', 'size', base.size.override); else shell('wm', 'size', 'reset');
};

const apply = (step) => {
  if (step.size) shell('wm', 'size', step.size);
  if (step.density) shell('wm', 'density', String(step.density));
  if (step.font) shell('settings', 'put', 'system', 'font_scale', String(step.font));
};

const open = () => {
  // Abre na rota escolhida para observar se a navegação é preservada após a mudança.
  shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `${scheme}://${route}`, '-p', pkg);
};

async function runScenario(scenario, rep, base) {
  restore(base);
  shell('am', 'force-stop', pkg);
  adb('logcat', '-c', '-b', 'crash', '-b', 'events');
  open();
  await sleep(settleMs);
  const pidBefore = parsePid(shell('pidof', pkg));
  for (const [index, step] of scenario.passos.entries()) {
    apply(step);
    await sleep(settleMs);
    if (scenario.reabrirEntrePassos && index < scenario.passos.length - 1) { open(); await sleep(settleMs); }
  }
  open(); // reabertura final: o crash do relato ocorreu após reabrir.
  await sleep(settleMs);
  const pidAfter = parsePid(shell('pidof', pkg));
  const events = adb('logcat', '-d', '-b', 'events');
  const crash = parseCrash(adb('logcat', '-d', '-b', 'crash'), pkg);
  return {
    cenario: scenario.id, grupo: scenario.grupo, repeticao: rep,
    processoReiniciado: pidBefore == null || pidAfter == null || pidBefore !== pidAfter,
    processoVivo: pidAfter != null,
    recriacoes: countRelaunches(events, pkg),
    criacoes: countCreates(events, pkg),
    crash,
  };
}

async function main() {
  const devices = adb('devices').split('\n').filter((line) => /\tdevice$/.test(line));
  if (devices.length !== 1) throw new Error(`Conecte exatamente um aparelho autorizado no adb (encontrados: ${devices.length}).`);
  const base = readBase();
  const scenarios = buildScenarios({ density: args.density, size: args.size });
  const meta = {
    build: args.build || 'não informado', pacote: pkg, data: new Date().toISOString(),
    android: shell('getprop', 'ro.build.version.release').trim(),
    base: { font: base.font, density: base.density.override || base.density.physical, size: base.size.override || base.size.physical },
  };
  const results = [];
  const interrupt = () => { try { restore(base); } finally { process.exit(130); } };
  process.once('SIGINT', interrupt);
  try {
    for (const scenario of scenarios) {
      for (let rep = 1; rep <= reps; rep += 1) {
        const result = await runScenario(scenario, rep, base);
        results.push(result);
        console.log(`${scenario.id} #${rep}: recriada=${result.recriacoes > 0} reinicio=${result.processoReiniciado} crash=${result.crash.crashed ? result.crash.sinal : 'não'}`);
      }
    }
  } finally {
    restore(base);
    shell('am', 'force-stop', pkg);
  }
  const summary = summarize(results);
  mkdirSync(out, { recursive: true });
  const stamp = meta.data.replace(/[:.]/g, '-');
  writeFileSync(join(out, `matriz-${stamp}.json`), `${JSON.stringify({ meta, results, summary }, null, 2)}\n`);
  writeFileSync(join(out, `matriz-${stamp}.md`), `${toMarkdown(summary, meta)}\n`);
  console.log(`\n${toMarkdown(summary, meta)}\n\nArquivos em ${out}. Configuração original restaurada.`);
}

main().catch((error) => { console.error(error.message); process.exit(1); });
