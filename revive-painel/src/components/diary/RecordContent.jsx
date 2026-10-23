import React from 'react';
import { recordFields } from '../../utils/diary';

export default function RecordContent({ record }) {
    return <dl className="space-y-2 break-words">
        <dt className="font-semibold">Data do registro</dt><dd>{record.data_registro.slice(0, 10).split('-').reverse().join('/')}</dd>
        {Object.entries(recordFields).map(([key, label]) => <React.Fragment key={key}>
            <dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap">{record[key] || 'Não informado'}</dd>
        </React.Fragment>)}
    </dl>;
}
