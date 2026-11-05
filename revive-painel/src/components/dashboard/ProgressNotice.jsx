import React from 'react';

export default function ProgressNotice({ progress }) {
    return (
        <aside aria-label="Cobertura do histórico" className="surface-muted rounded-2xl p-4 text-sm text-muted" role="status">
            {progress.loading && <p>Carregando histórico consolidado…</p>}
            {progress.error && <p>Não foi possível atualizar o histórico. A cópia disponível foi preservada.</p>}
            {progress.localOnly && <p>Offline: consulta da cópia local consolidada.</p>}
            {!progress.available && !progress.loading && <p>Histórico consolidado indisponível nesta conta.</p>}
            <p>{progress.scope}</p>
            {progress.updatedAt && <p>Consolidado em {new Date(progress.updatedAt).toLocaleString('pt-BR')}.</p>}
            {progress.stale && <p>Há alterações recebidas que ainda aguardam atualização do consolidado.</p>}
            <p>{progress.pendingCount} pendência(s) local(is), fora dos indicadores e conquistas consolidados.</p>
            {progress.conflictCount > 0 && <p>Há conflitos. Revise a tela de Sincronização.</p>}
        </aside>
    );
}
