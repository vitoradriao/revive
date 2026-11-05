import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScenarios, countCreates, countRelaunches, crashSignature, parseCrash, parseFontScale, parsePid, parseWmDensity, parseWmSize,
  sanitizeFrame, summarize, toMarkdown,
} from './lib.mjs';

const pkg = 'com.reviveapp.revive';
// Trecho sintético no formato do tombstone do Android 13 (endereços e BuildId fictícios).
const nativeCrash = `
--------- beginning of crash
10-13 10:00:00.000  1200  1234 F libc    : Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0000000000000008 in tid 1234 (mqt_native_modu), pid 1200 (${pkg})
10-13 10:00:00.100  1300  1300 F DEBUG   : Abort message: 'texto que pode conter dado de tela'
10-13 10:00:00.200  1300  1300 F DEBUG   :       #00 pc 00000000012abc34  /data/app/~~x/${pkg}-y/lib/arm64/libreactnative.so (facebook::react::MountingCoordinator::pullTransaction(bool) const+120) (BuildId: 0123abcd)
10-13 10:00:00.200  1300  1300 F DEBUG   :       #01 pc 00000000012abd00  /data/app/~~x/${pkg}-y/lib/arm64/libreactnative.so (facebook::react::FabricUIManagerBinding::schedulerDidFinishTransaction(std::__ndk1::shared_ptr<facebook::react::MountingCoordinator const> const&)+64) (BuildId: 0123abcd)
10-13 10:00:00.200  1300  1300 F DEBUG   :       #02 pc 0000000000123456  /apex/com.android.runtime/lib64/bionic/libc.so (__pthread_start(void*)+208) (BuildId: ffff)
`;
const javaCrash = `
10-13 10:00:00.000  1200  1200 E AndroidRuntime: FATAL EXCEPTION: main
10-13 10:00:00.000  1200  1200 E AndroidRuntime: Process: ${pkg}, PID: 1200
10-13 10:00:00.000  1200  1200 E AndroidRuntime: java.lang.IllegalStateException: mensagem com dado sensível
10-13 10:00:00.000  1200  1200 E AndroidRuntime: \tat com.facebook.react.fabric.FabricUIManager.dispatchMountItems(FabricUIManager.java:10)
10-13 10:00:00.000  1200  1200 E AndroidRuntime: \tat android.os.Handler.dispatchMessage(Handler.java:99)
`;

test('monta cenários isolados, combinados e em sequência', () => {
  const scenarios = buildScenarios({ density: '320', size: '720x1280' });
  assert.deepEqual(scenarios.map((scenario) => scenario.id), ['fonte-1.3', 'fonte-1.5', 'densidade-320', 'resolucao-720x1280',
    'combinado-simultaneo', 'sequencia-sem-reabrir', 'sequencia-com-reabertura']);
  assert.equal(scenarios.at(-1).reabrirEntrePassos, true);
  assert.deepEqual(buildScenarios().map((scenario) => scenario.id), ['fonte-1.3', 'fonte-1.5']);
});

test('interpreta wm, settings e pidof', () => {
  assert.deepEqual(parseWmSize('Physical size: 1080x2400\nOverride size: 720x1280\n'), { physical: '1080x2400', override: '720x1280' });
  assert.deepEqual(parseWmSize('Physical size: 1080x2400\n'), { physical: '1080x2400', override: null });
  assert.deepEqual(parseWmDensity('Physical density: 400\n'), { physical: '400', override: null });
  assert.equal(parseFontScale('1.3\n'), '1.3');
  assert.equal(parseFontScale('null\n'), null);
  assert.equal(parsePid('1200\n'), 1200);
  assert.equal(parsePid(''), null);
});

test('conta recriações e criações da activity do pacote', () => {
  const events = [
    `10-13 I wm_relaunch_resume_activity: [0,123,45,${pkg}/.MainActivity,1024]`,
    `10-13 I wm_relaunch_resume_activity: [0,124,45,com.outro/.Main,1024]`,
    `10-13 I wm_create_activity: [0,125,45,${pkg}/.MainActivity,android.intent.action.VIEW]`,
  ].join('\n');
  assert.equal(countRelaunches(events, pkg), 1);
  assert.equal(countCreates(events, pkg), 1);
});

test('sanitiza frames nativos sem endereços, caminhos ou BuildId', () => {
  assert.equal(sanitizeFrame(nativeCrash.split('\n')[4]), '#00 libreactnative.so (facebook::react::MountingCoordinator::pullTransaction(bool) const)');
  assert.equal(sanitizeFrame('sem frame'), null);
});

test('extrai assinatura de crash nativo sem a Abort message', () => {
  const crash = parseCrash(nativeCrash, pkg);
  assert.equal(crash.crashed, true);
  assert.equal(crash.tipo, 'nativo');
  assert.equal(crash.sinal, 'SIGSEGV');
  assert.equal(crash.frames.length, 3);
  assert.match(crash.frames[1], /FabricUIManagerBinding::schedulerDidFinishTransaction/);
  assert.ok(!JSON.stringify(crash).includes('dado de tela'));
  assert.ok(!JSON.stringify(crash).includes('/data/app'));
  assert.equal(crashSignature(crash), 'SIGSEGV @ #00 libreactnative.so (facebook::react::MountingCoordinator::pullTransaction(bool) const)');
});

test('extrai exceção Java sem a mensagem e ignora outros pacotes', () => {
  const crash = parseCrash(javaCrash, pkg);
  assert.equal(crash.tipo, 'java');
  assert.equal(crash.sinal, 'java.lang.IllegalStateException');
  assert.equal(crash.frames[0], '#00 com.facebook.react.fabric.FabricUIManager.dispatchMountItems');
  assert.ok(!JSON.stringify(crash).includes('sensível'));
  assert.equal(parseCrash(nativeCrash, 'com.outro').crashed, false);
  assert.equal(parseCrash('', pkg).crashed, false);
});

test('resume frequência por cenário e gera tabela Markdown', () => {
  const crash = parseCrash(nativeCrash, pkg);
  const summary = summarize([
    { cenario: 'fonte-1.3', grupo: 'isolado', recriacoes: 1, processoReiniciado: false, crash: { crashed: false } },
    { cenario: 'fonte-1.3', grupo: 'isolado', recriacoes: 1, processoReiniciado: false, crash: { crashed: false } },
    { cenario: 'combinado-simultaneo', grupo: 'combinado', recriacoes: 1, processoReiniciado: true, crash },
  ]);
  assert.deepEqual(summary[0], { cenario: 'fonte-1.3', grupo: 'isolado', repeticoes: 2, crashes: 0, processoReiniciado: 0, activityRecriada: 2, assinaturas: {} });
  assert.equal(summary[1].crashes, 1);
  const markdown = toMarkdown(summary, { build: 'release abc123', android: '13', pacote: pkg, data: '2026-11-03', base: { font: '1.0', density: '400', size: '1080x2400' } });
  assert.match(markdown, /\| fonte-1\.3 \| isolado \| 2 \| 2\/2 \| 0\/2 \| 0\/2 \| — \|/);
  assert.match(markdown, /1× SIGSEGV @ #00 libreactnative\.so/);
});
